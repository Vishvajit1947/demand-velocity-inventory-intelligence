"""MT-23 — POST /api/forecast (04 §4, 05 §5).

The router only validates the body (ForecastRequest, MT-20) and delegates to
forecast_service.run. Errors (date range / bad product) raise from the service
and are mapped to 422 by MT-24; model-not-loaded raises 500 (04 §3, 05 §6).

Rate limit: 20 requests/minute per IP (enforced via SlowAPIMiddleware).

NOTE: `from __future__ import annotations` is intentionally omitted here so that
FastAPI can resolve the ForecastRequest annotation at decoration time without
Pydantic treating it as an unresolvable ForwardRef when combined with Body(...).
"""
import asyncio
import time
from typing import Annotated

from fastapi import APIRouter, Body, Request

from app.limiter import limiter
from app.schemas.contracts import ForecastRequest, ForecastResponse
from app.services import forecast_service

router = APIRouter()


@router.post("/forecast", response_model=ForecastResponse)
@limiter.limit("20/minute")
async def post_forecast(
    request: Request,
    req: Annotated[ForecastRequest, Body()],
) -> ForecastResponse:
    """05 §5 — forecast the 28-day horizon for one or more products."""
    t0 = time.time()
    print(
        f"[STAGE_TIME] endpoint entered: t0={t0:.6f}"
        f" product_ids={req.product_ids} start_date={req.start_date}",
        flush=True,
    )

    # Offload the CPU-bound forecast to a thread so the event loop stays free.
    # asyncio.to_thread() runs the callable in the default ThreadPoolExecutor,
    # which prevents blocking other in-flight requests on Railway's single vCPU.
    t1 = time.time()
    result = await asyncio.to_thread(
        forecast_service.run, req.product_ids, req.start_date
    )

    t2 = time.time()
    print(
        f"[STAGE_TIME] computation complete: t2={t2:.6f}"
        f" delta_from_parse={t2 - t1:.3f}s"
        f" total_in_handler={t2 - t0:.3f}s",
        flush=True,
    )

    return result
