"""MT-23 — POST /api/forecast (04 §4, 05 §5).

The router only validates the body (ForecastRequest, MT-20) and delegates to
forecast_service.run. Errors (date range / bad product) raise from the service
and are mapped to 422 by MT-24; model-not-loaded raises 500 (04 §3, 05 §6).

Rate limit: 20 requests/minute per IP (enforced via SlowAPIMiddleware).

NOTE: `from __future__ import annotations` is intentionally omitted here so that
FastAPI can resolve the ForecastRequest annotation at decoration time without
Pydantic treating it as an unresolvable ForwardRef when combined with Body(...).
"""
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
    # ── stage timing ─────────────────────────────────────────────────────────
    # t0: function entered — body has already been read from the socket and
    #     parsed into `req` by FastAPI's dependency injection before this line.
    #     The gap between the middleware's start time and t0 is the time spent
    #     receiving the request body over the network + Pydantic validation.
    t0 = time.time()
    print(
        f"[STAGE_TIME] endpoint entered: t0={t0:.6f}"
        f" product_ids={req.product_ids} start_date={req.start_date}",
        flush=True,
    )

    # t1: immediately before handing off to the forecast engine
    t1 = time.time()
    print(
        f"[STAGE_TIME] body parsed / pre-compute: t1={t1:.6f}"
        f" delta_from_entry={t1 - t0:.3f}s",
        flush=True,
    )

    result = forecast_service.run(req.product_ids, req.start_date)

    # t2: computation finished, about to serialise and return
    t2 = time.time()
    print(
        f"[STAGE_TIME] computation complete: t2={t2:.6f}"
        f" delta_from_parse={t2 - t1:.3f}s"
        f" total_in_handler={t2 - t0:.3f}s",
        flush=True,
    )
    # ─────────────────────────────────────────────────────────────────────────

    return result
