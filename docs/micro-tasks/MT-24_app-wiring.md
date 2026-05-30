# MT-24 — App wiring: `main.py`, CORS, error handlers

## 1. Context
Phase 2 backend assembly (`MT-INDEX.md`, depends on **MT-22** routers and **MT-23** forecast
router/service). This task creates the FastAPI application object: it loads the artifact store
once at startup (`04` §3), mounts the three routers under `/api`, enables CORS for the Vite dev
origin, and registers the exception handlers that turn validation/unknown errors into the locked
`05` §7 error shape. After this task the backend runs end-to-end via
`uvicorn app.main:app --reload --port 8000` (`04` §8). This task owns **only** `backend/app/main.py`
and imports — never redefines — `store.py`, the routers, and the service's error type.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `04_BACKEND_ARCHITECTURE.md` §1 (paths), §3 (startup), §4 (lifecycle), §5 (error handling),
  §6 (deps), §8 (run), §9 (determinism).
- `05_API_CONTRACT.md` intro (base URL, CORS origin), §6 (status codes), §7 (error shape).
- `07_TESTING_STRATEGY.md` §2.

**Prior MT modules that must already exist (do NOT redefine — import them):**
- **MT-21 → `app/services/store.py`**: `get_store() -> Store` (lazy singleton; first call loads
  all artifacts, `04` §3). `Store.model_loaded: bool`.
- **MT-22 → `app/api/health.py`, `app/api/products.py`**: each exposes `router: APIRouter`.
- **MT-23 → `app/api/forecast.py`**: exposes `router: APIRouter`; and
  `app/services/forecast_service.py` exposes `ForecastValidationError(ValueError)` with
  `.message: str` and `.field: str | None`.
- **MT-01 → `app/config.py`**: `VERSION` (and other constants, indirectly via routers).
- Python **3.11**, `fastapi==0.115.6`, `uvicorn[standard]==0.34.0`, `pydantic==2.10.4` (`04` §6).
  Run from `backend/`.

> This task **owns** `backend/app/main.py`. The routers, store, schemas, and service already exist.

## 3. Goal
`backend/app/main.py` exposing a module-level `app` (FastAPI) that:
1. **On startup** calls `get_store()` so artifacts load once (`04` §3); never crashes if artifacts
   are missing (health then reports `model_loaded:false`, `04` §3).
2. Adds `CORSMiddleware` allowing origin `http://localhost:5173` (`05` intro, `04` §3).
3. Includes the health/products/forecast routers under `prefix="/api"`.
4. Registers exception handlers mapping `ForecastValidationError`/`ValueError` and
   `RequestValidationError` → **422** with `{error,message,field?}` (`05` §7); any other
   `Exception` → **500** with `{error:"server_error", message}` (`04` §5, `05` §6). Stack traces
   are logged, never returned (`04` §5).

## 4. Design (locked decisions; cite foundation sections)
- **App factory style** — build a module-level `app = create_app()` so `uvicorn app.main:app`
  resolves (`04` §8) and `TestClient(app)` works in tests.
- **Startup (`04` §3)** — use FastAPI's `lifespan` async context manager (the modern replacement
  for `@app.on_event("startup")`, fully supported in fastapi 0.115.6). It calls `get_store()` to
  trigger the one-time load, then logs whether `model_loaded`. Per `04` §3 the app **still starts**
  if artifacts are missing — we log a warning rather than raise, so `/api/health` can report
  `model_loaded:false` and `/api/forecast` returns a clear 500 (`04` §3, `05` §6).
- **CORS (`05` intro, `04` §3)** — `CORSMiddleware` with
  `allow_origins=["http://localhost:5173"]`, `allow_methods=["*"]`, `allow_headers=["*"]`. This
  makes preflight `OPTIONS` return the `access-control-allow-origin` header.
- **Routers under `/api` (`04` §1, §4)** — `include_router(<router>, prefix="/api")` for health,
  products, forecast. Combined with the routers' own paths this yields `/api/health`,
  `/api/products`, `/api/calendar/bounds`, `/api/forecast` (`05` §2–§5). Unknown routes fall
  through to FastAPI's default **404** (`05` §6 implies non-listed paths are not 200).
- **Error mapping (`04` §5, `05` §7)** — three handlers:
  1. `ForecastValidationError` → 422 `{error:"validation_error", message:e.message, field:e.field}`
     (`field` present because the service set it, e.g. `"start_date"`).
  2. `RequestValidationError` (Pydantic body validation, e.g. invalid `SeriesId`, missing field,
     malformed JSON) → 422 `{error:"validation_error", message:<first error msg>, field:<first
     loc leaf>}`. We extract the most relevant field name from `exc.errors()[0]["loc"]` (skipping
     the leading `"body"`), so a bad `product_ids` reports `field="product_ids"`.
  3. Catch-all `Exception` → 500 `{error:"server_error", message:str(e)}`, **no `field`** (`05`
     §7: "field is omitted for 500s"). The full traceback is logged via `logging.exception` (`04`
     §5: never leak stack traces in the body).
  > A plain `ValueError` (not our subclass) is also mapped to 422 per `04` §5 ("ValueError → 422").
  > Order matters: register the specific `ForecastValidationError` handler; FastAPI dispatches to
  > the most specific registered exception type, and `ValueError` covers the rest.
- **Error body shape is exact** (`05` §7): keys `error`, `message`, and optional `field`. Returned
  via `JSONResponse(status_code=..., content={...})` so it is not wrapped in FastAPI's default
  `{"detail": ...}` envelope.

## 5. Implementation (exact file path from 04 §1; FULL runnable code)

### `backend/app/main.py`
```python
"""MT-24 — FastAPI app wiring (04 §3 startup, §4 lifecycle, §5 errors; 05 §7).

Builds the application: loads the artifact store once at startup, enables CORS
for the Vite dev origin, mounts the /api routers (MT-22/23), and maps errors to
the locked 05 §7 shape. Run from backend/:
    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import forecast as forecast_api
from app.api import health as health_api
from app.api import products as products_api
from app.services.forecast_service import ForecastValidationError
from app.services.store import get_store

logger = logging.getLogger("demand_velocity")

# Vite dev server origin — the only allowed CORS origin (05 intro, 04 §3)
ALLOWED_ORIGIN = "http://localhost:5173"


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

    # CORS — allow the Vite dev server (05 intro, 04 §3)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[ALLOWED_ORIGIN],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
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
```

> **Why `field` may be `null`:** `05` §7 says `field` is *omitted* for 500s — the 500 handler
> never sets it. For 422s the contract example always includes `field`; when a pydantic error has
> no meaningful leaf we emit `field: null`, which the frontend treats the same as absent (it only
> reads `message` for the toast, `05` §7 / MT-42).

## 6. Tests / Verification (exact pytest tests + commands)
Add to `backend/tests/test_api.py`. Uses the `client` fixture (`07` §2,
`TestClient(app)` from `conftest.py`).

### `backend/tests/test_api.py` (MT-24 additions)
```python
"""MT-24 — wiring / CORS / error-handler tests (04 §5, 05 §7; 07 §2)."""


def test_out_of_range_date_422_field_start_date(client):
    """05 §7 — date outside selectable range -> 422 with field=='start_date'."""
    r = client.post(
        "/api/forecast",
        json={"product_ids": ["turkey"], "start_date": "2016-12-01"},
    )
    assert r.status_code == 422
    body = r.json()
    assert body["error"] == "validation_error"
    assert body["field"] == "start_date"
    assert "outside the selectable range" in body["message"]
    # exact 05 §7 message
    assert body["message"] == (
        "start_date 2016-12-01 is outside the selectable range "
        "[2014-01-28, 2016-04-25]."
    )


def test_invalid_product_id_422(client):
    """Invalid SeriesId rejected by ForecastRequest (MT-20) -> 422."""
    r = client.post(
        "/api/forecast",
        json={"product_ids": ["banana"], "start_date": "2015-11-01"},
    )
    assert r.status_code == 422
    body = r.json()
    assert body["error"] == "validation_error"
    assert "message" in body
    # error body uses the 05 §7 shape (not FastAPI's default {"detail": ...})
    assert "detail" not in body


def test_unknown_route_404(client):
    r = client.get("/api/does-not-exist")
    assert r.status_code == 404


def test_cors_header_present_on_options(client):
    """Preflight from the Vite origin returns the allow-origin header (05 intro)."""
    r = client.options(
        "/api/forecast",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code in (200, 204)
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
```

### Manual / run verification (from `backend/`)
```bash
uvicorn app.main:app --port 8000           # 04 §8
curl http://localhost:8000/api/health      # -> {"status":"ok","model_loaded":true,"version":"1.0.0"}
pytest -q tests/test_api.py                 # all MT-22..24 API tests
```

## 7. Acceptance checklist
- [ ] `backend/app/main.py` exists at the exact path (`04` §1) and exposes module-level `app` (so `uvicorn app.main:app` and `TestClient(app)` work).
- [ ] Startup (`lifespan`) calls `get_store()` once (`04` §3); the app starts even if artifacts are missing (logs a warning, does not crash).
- [ ] `CORSMiddleware` allows origin `http://localhost:5173` (`05` intro, `04` §3); `OPTIONS` preflight returns `access-control-allow-origin: http://localhost:5173`.
- [ ] Health, products, forecast routers included with `prefix="/api"` → `/api/health`, `/api/products`, `/api/calendar/bounds`, `/api/forecast` (`04` §1).
- [ ] `ForecastValidationError`/`ValueError` and `RequestValidationError` → 422 with `{error:"validation_error", message, field?}`; out-of-range date reports `field=="start_date"` (`05` §7).
- [ ] Generic `Exception` → 500 `{error:"server_error", message}` with **no** `field`; traceback logged, not returned (`04` §5, `05` §6/§7).
- [ ] Error bodies use the `05` §7 shape, not FastAPI's default `{"detail": ...}`.
- [ ] Unknown route → 404.
- [ ] All MT-24 tests green (out-of-range 422 + field; invalid product 422; unknown route 404; CORS header on OPTIONS). No new runtime deps beyond `04` §6; only `main.py` changed.
