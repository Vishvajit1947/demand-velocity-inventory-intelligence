"""
MT-20 — contracts.py mirrors 05_API_CONTRACT.md exactly.

Builds each model from the literal example JSON in 05 and asserts round-trip
(model_validate -> model_dump == original). Also checks validators: dedup, max-8,
non-empty, bad slug, bad date, and array-length guards.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import contracts as c


def _horizon_floats(n=28):
    return [float(i) for i in range(n)]


def _history_floats(n=84):
    return [float(i) for i in range(n)]


# ----- §2 health ------------------------------------------------------------
def test_health_roundtrip():
    data = {"status": "ok", "model_loaded": True, "version": "1.0.0"}
    m = c.HealthResponse.model_validate(data)
    assert m.model_dump() == data


# ----- §3 products ----------------------------------------------------------
def test_products_roundtrip():
    data = {
        "products": [
            {
                "series_id": "turkey",
                "item_id": "FOODS_3_069",
                "name": "Fresh Whole Turkey",
                "dept_id": "FOODS_3",
                "archetype": "Event-driven",
                "overall_mean": 18.6,
                "seasonal_cv": 1.25,
            }
        ]
    }
    m = c.ProductsResponse.model_validate(data)
    assert m.model_dump() == data


# ----- §4 bounds ------------------------------------------------------------
def test_bounds_roundtrip():
    data = {
        "train_start": "2011-01-29",
        "train_end": "2014-01-27",
        "test_start": "2014-01-28",
        "test_end": "2016-05-22",
        "first_selectable_date": "2014-01-28",
        "last_selectable_date": "2016-04-25",
        "horizon": 28,
        "history_window": 84,
    }
    m = c.BoundsResponse.model_validate(data)
    assert m.model_dump() == data


# ----- §5 request validators ------------------------------------------------
def test_request_roundtrip_and_dedup():
    m = c.ForecastRequest.model_validate(
        {"product_ids": ["turkey", "milk", "turkey"], "start_date": "2015-11-01"}
    )
    assert m.product_ids == ["turkey", "milk"]  # dedup, order preserved
    assert m.start_date == "2015-11-01"


def test_request_empty_rejected():
    with pytest.raises(ValidationError):
        c.ForecastRequest.model_validate({"product_ids": [], "start_date": "2015-11-01"})


def test_request_bad_slug_rejected():
    with pytest.raises(ValidationError):
        c.ForecastRequest.model_validate(
            {"product_ids": ["banana"], "start_date": "2015-11-01"}
        )


def test_request_max_8():
    eight = ["turkey", "candy", "strawberries", "icecream", "cocoa", "chips", "milk", "bread"]
    # all 8 fine
    c.ForecastRequest.model_validate({"product_ids": eight, "start_date": "2015-11-01"})


def test_request_bad_date_rejected():
    with pytest.raises(ValidationError):
        c.ForecastRequest.model_validate(
            {"product_ids": ["turkey"], "start_date": "2015-13-99"}
        )


# ----- §5 full ForecastResult / ForecastResponse round-trip -----------------
def _forecast_result_example():
    return {
        "series_id": "turkey",
        "item_id": "FOODS_3_069",
        "product_name": "Fresh Whole Turkey",
        "history": {"dates": [f"d{i}" for i in range(84)], "units": _history_floats()},
        "horizon_dates": [f"h{i}" for i in range(28)],
        "actual": _horizon_floats(),
        "forecast": _horizon_floats(),
        "metrics": {
            "accuracy": 78.4,
            "coherence": 71.0,
            "coherence_label": "Moderate",
            "smape": 21.6,
            "mae": 3.21,
            "rmse": 4.87,
        },
        "velocity": {"value": 412.0, "status": "Accelerating"},
        "inventory": {
            "on_hand": 260,
            "safety_stock": 41.0,
            "reorder_point": 171.0,
            "horizon_demand": 520.0,
            "cover_days": 9,
            "stockout_risk": "Medium",
            "overstock": False,
            "recommended_order_qty": 301,
            "projected_stock": _horizon_floats(),
        },
        "explainability": {
            "event_contribution_pct": 280.5,
            "snap_days_in_horizon": 8,
            "narrative": ["Demand is Accelerating (+412% vs the prior 28 days)."],
            "factors": [
                {"label": "Event uplift", "value": 280.5, "kind": "event"},
                {"label": "Seasonality", "value": 220.0, "kind": "seasonal"},
                {"label": "Trend", "value": 412.0, "kind": "trend"},
            ],
        },
        "events_in_horizon": [
            {"date": "2015-11-26", "name": "Thanksgiving", "type": "National"}
        ],
        "seasonal": {
            "month": 11,
            "month_vs_avg_pct": 220.0,
            "monthly_avg": [15.0, 13.0, 9.0, 10.0, 8.0, 7.0, 8.0, 8.0, 7.0, 12.0, 57.0, 92.0],
            "weekday_avg": [22.1, 18.0, 16.4, 15.9, 17.2, 19.8, 24.0],
        },
        "event_uplift": {"Thanksgiving": 517.0, "ValentinesDay": 92.0},
    }


def test_forecast_result_roundtrip():
    data = _forecast_result_example()
    m = c.ForecastResult.model_validate(data)
    assert m.model_dump() == data


def test_forecast_response_roundtrip():
    data = {
        "start_date": "2015-11-01",
        "horizon": 28,
        "summary": {
            "total_predicted_demand": 1234.5,
            "high_risk_count": 1,
            "avg_velocity": 12.3,
            "avg_accuracy": 78.4,
            "active_events": [
                {"date": "2015-11-26", "name": "Thanksgiving", "type": "National"}
            ],
        },
        "results": [_forecast_result_example()],
    }
    m = c.ForecastResponse.model_validate(data)
    assert m.model_dump() == data


# ----- §5 array-length guards ----------------------------------------------
def test_wrong_length_horizon_rejected():
    bad = _forecast_result_example()
    bad["forecast"] = _horizon_floats(27)  # too short
    with pytest.raises(ValidationError):
        c.ForecastResult.model_validate(bad)


def test_wrong_length_history_rejected():
    with pytest.raises(ValidationError):
        c.History.model_validate({"dates": ["a"], "units": [1.0]})


# ----- §7 error shape -------------------------------------------------------
def test_error_with_field_roundtrip():
    data = {
        "error": "validation_error",
        "message": "start_date 2016-12-01 is outside the selectable range [2014-01-28, 2016-04-25].",
        "field": "start_date",
    }
    m = c.ErrorResponse.model_validate(data)
    assert m.model_dump() == data


def test_error_omits_field_for_500():
    m = c.ErrorResponse(error="server_error", message="boom")
    assert m.model_dump_api() == {"error": "server_error", "message": "boom"}
