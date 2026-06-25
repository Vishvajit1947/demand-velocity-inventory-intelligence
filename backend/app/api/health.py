"""MT-22 — GET /api/health (05_API_CONTRACT §2).

Liveness + readiness. Reports model_loaded live from the store so a failed
artifact load (04 §3) is visible without crashing the process. Must never raise.
"""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import config
from app.schemas.contracts import HealthResponse
from app.services.store import get_store

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    """05 §2: {status:"ok", model_loaded: <bool>, version:"1.0.0"}."""
    return HealthResponse(
        status="ok",
        model_loaded=get_store().model_loaded,
        version=config.VERSION,
    )


@router.get("/health/debug")
def get_health_debug():
    """Temporary debug endpoint — shows artifact load errors and resolved paths."""
    import os
    store = get_store()
    return JSONResponse({
        "model_loaded": store.model_loaded,
        "load_errors": store.load_errors,
        "resolved_paths": {k: str(v) for k, v in config.PATHS.items()},
        "paths_exist": {k: os.path.exists(str(v)) for k, v in config.PATHS.items()},
        "repo_root": str(config.REPO_ROOT),
        "cwd": os.getcwd(),
    })
