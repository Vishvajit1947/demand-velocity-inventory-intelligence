"""MT-24 — FastAPI app wiring (04 §3 startup, §4 lifecycle, §5 errors; 05 §7).

Builds the application: loads the artifact store once at startup, enables CORS
for the Vite dev origin, mounts the /api routers (MT-22/23), and maps errors to
the locked 05 §7 shape. Run from backend/:
    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api import forecast as forecast_api
from app.api import health as health_api
from app.api import products as products_api
from app.limiter import limiter
from app.services.forecast_service import ForecastValidationError
from app.services.store import get_store

logger = logging.getLogger("demand_velocity")


def _get_cors_origins() -> list[str]:
    """
    Read allowed CORS origins from the environment variable CORS_ORIGINS.

    The variable accepts a comma-separated list of origins, e.g.:
      CORS_ORIGINS=http://localhost:5173
      CORS_ORIGINS=https://your-app.vercel.app,https://staging.your-app.vercel.app

    Falls back to the local Vite dev-server origin when the variable is not set,
    so local development works without any extra configuration.
    """
    default = "http://localhost:5173,https://demand-velocity-inventory-intellige.vercel.app"
    raw = os.getenv("CORS_ORIGINS", default)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: load artifacts once (04 §3). App still starts if they are missing."""
    store = get_store()
    if store.model_loaded:
        logger.info("startup: artifacts loaded (model_loaded=True)")
    else:
        # 04 §3 — do not crash; /api/health reports model_loaded:false,
        # /api/forecast returns a clear 500.
        logger.warning("startup: artifacts NOT loaded (model_loaded=False)")
    yield
    # no teardown needed (in-memory singletons)


def _field_from_request_validation(exc: RequestValidationError) -> str | None:
    """Best-effort field name from the first pydantic error loc (05 §7)."""
    errors = exc.errors()
    if not errors:
        return None
    loc = [str(p) for p in errors[0].get("loc", []) if str(p) != "body"]
    return loc[-1] if loc else None


def create_app() -> FastAPI:
    app = FastAPI(title="Demand Velocity & Inventory Intelligence", lifespan=lifespan)

    # ── request timing middleware ────────────────────────────────────────────────
    @app.middleware("http")
    async def log_request_time(request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        duration = time.time() - start
        print(
            f"[REQ_TIME] {request.method} {request.url.path}"
            f" status={response.status_code} took={duration:.3f}s",
            flush=True,
        )
        return response

    # Rate limiter state & middleware
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)

    # Custom 429 handler — matches existing 05 §7 error shape
    @app.exception_handler(RateLimitExceeded)
    async def _on_rate_limit(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limit_exceeded",
                "message": f"Too many requests. Limit: {exc.detail}. Please slow down and try again shortly.",
                "field": None,
            },
            headers={"Retry-After": "60"},
        )

    # CORS — origins read from CORS_ORIGINS env var (falls back to explicit list)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_get_cors_origins(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "Accept"],
    )

    # routers under /api (04 §1, §4)
    app.include_router(health_api.router, prefix="/api")
    app.include_router(products_api.router, prefix="/api")
    app.include_router(forecast_api.router, prefix="/api")

    # ── exception handlers (04 §5, 05 §7) ──────────────────────────────────────
    @app.exception_handler(ForecastValidationError)
    async def _on_forecast_validation(request: Request, exc: ForecastValidationError):
        """Service-raised validation error -> 422 with field (05 §7)."""
        return JSONResponse(
            status_code=422,
            content={
                "error": "validation_error",
                "message": exc.message,
                "field": exc.field,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def _on_request_validation(request: Request, exc: RequestValidationError):
        """Pydantic body validation -> 422 (05 §7). e.g. invalid SeriesId / bad JSON."""
        errors = exc.errors()
        message = errors[0]["msg"] if errors else "Invalid request body."
        return JSONResponse(
            status_code=422,
            content={
                "error": "validation_error",
                "message": message,
                "field": _field_from_request_validation(exc),
            },
        )

    @app.exception_handler(ValueError)
    async def _on_value_error(request: Request, exc: ValueError):
        """Any other ValueError -> 422 (04 §5). No field unless it carries one."""
        field = getattr(exc, "field", None)
        message = getattr(exc, "message", str(exc))
        return JSONResponse(
            status_code=422,
            content={"error": "validation_error", "message": message, "field": field},
        )

    @app.exception_handler(Exception)
    async def _on_unhandled(request: Request, exc: Exception):
        """Anything else -> 500, no field (04 §5, 05 §6/§7). Log, never leak trace."""
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"error": "server_error", "message": str(exc)},
        )

    return app


app = create_app()
