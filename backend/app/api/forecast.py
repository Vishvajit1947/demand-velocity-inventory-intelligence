"""MT-23 — POST /api/forecast (04 §4, 05 §5).

The router only validates the body (ForecastRequest, MT-20) and delegates to
forecast_service.run. Errors (date range / bad product) raise from the service
and are mapped to 422 by MT-24; model-not-loaded raises 500 (04 §3, 05 §6).
"""
from __future__ import annotations

from fastapi import APIRouter

from app.schemas.contracts import ForecastRequest, ForecastResponse
from app.services import forecast_service

router = APIRouter()


@router.post("/forecast", response_model=ForecastResponse)
def post_forecast(req: ForecastRequest) -> ForecastResponse:
    """05 §5 — forecast the 28-day horizon for one or more products."""
    return forecast_service.run(req.product_ids, req.start_date)
