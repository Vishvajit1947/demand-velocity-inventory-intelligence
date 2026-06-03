"""MT-23 — Orchestrate a full ForecastResponse (05_API_CONTRACT §5).

Per 04 §4: validate the date, then for each requested product run the recursive
forecast (MT-15), look up actuals/history (MT-21 store), compute metrics
(MT-16..19), read profiles (MT-14), and assemble the locked ForecastResult.
Finally build the summary aggregate. No ad-hoc math beyond rounding + summary.

NOTE on actual ML interface (from the committed forecast_engine.py):
  recursive_forecast(series_id, start_d, model, feature_meta, units_by_d, price_by_d,
                     neutralize_events=False)
  — takes per-series {d_index: value} dicts, not store.series_daily directly.

NOTE on compute_explainability signature (from metrics.py):
  compute_explainability(series_id, product_name, month,
                         forecast_full, forecast_no_event,
                         profile, velocity, events_in_horizon, snap_days_in_horizon)
"""
from __future__ import annotations

from datetime import date

from app import config
from app.ml.forecast_engine import recursive_forecast_dicts as recursive_forecast
from app.ml.metrics import (
    compute_accuracy,
    compute_coherence,
    compute_explainability,
    compute_inventory_risk,
    compute_velocity,
)
from app.schemas.contracts import (
    EventInfo,
    Explainability,
    Factor,
    ForecastResponse,
    ForecastResult,
    HistoryBlock,
    Inventory,
    Metrics,
    Seasonal,
    Summary,
    Velocity,
)
from app.services.store import get_store


class ForecastValidationError(ValueError):
    """Raised on invalid forecast input. MT-24 maps it to 422 (05 §7).

    Carries the contract `field` so the error body includes it.
    """

    def __init__(self, message: str, field: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.field = field


def _validate_start_d(store, start_date_str: str) -> int:
    """Parse + range-check the start date; return its d_index (04 §4, 05 §7)."""
    first_iso = store.d_to_date(config.FIRST_SELECTABLE_D).isoformat()
    last_iso = store.d_to_date(config.LAST_SELECTABLE_D).isoformat()
    out_of_range_msg = (
        f"start_date {start_date_str} is outside the selectable range "
        f"[{first_iso}, {last_iso}]."
    )
    try:
        day = date.fromisoformat(start_date_str)
    except ValueError:
        raise ForecastValidationError(out_of_range_msg, field="start_date")
    try:
        start_d = store.date_to_d(day)
    except (KeyError, ValueError):
        raise ForecastValidationError(out_of_range_msg, field="start_date")
    if not (config.FIRST_SELECTABLE_D <= start_d <= config.LAST_SELECTABLE_D):
        raise ForecastValidationError(out_of_range_msg, field="start_date")
    return start_d


def _build_result(store, series_id: str, start_d: int) -> ForecastResult:
    """Assemble one ForecastResult for a product (05 §5)."""
    meta = config.PRODUCTS[series_id]
    name = meta["name"]
    profile = store.profiles[series_id]

    H = config.HORIZON                    # 28
    W = config.HISTORY_WINDOW             # 84
    horizon_lo, horizon_hi = start_d, start_d + H - 1
    hist_lo, hist_hi = start_d - W, start_d - 1
    prev_lo, prev_hi = start_d - 28, start_d - 1

    # Build per-series dicts for the recursive forecast engine (03 §4, actual ML interface)
    u_by_d = store.units_by_d(series_id)
    p_by_d = store.price_by_d(series_id)

    # 03 §4 forecast (float)
    forecast = recursive_forecast(
        series_id, start_d, store.model, store.feature_meta,
        u_by_d, p_by_d, neutralize_events=False,
    )

    # actuals + history (02 §4, 05 §5)
    actual = store.actual_units(series_id, horizon_lo, horizon_hi)          # len 28
    history_units = store.actual_units(series_id, hist_lo, hist_hi)         # len 84
    history_dates = [store.d_to_date(d).isoformat() for d in range(hist_lo, hist_hi + 1)]
    horizon_dates = [store.d_to_date(d).isoformat() for d in range(horizon_lo, horizon_hi + 1)]

    # metrics (03 §6)
    acc = compute_accuracy(actual, forecast)               # accuracy/smape/mae/rmse
    coh = compute_coherence(actual, forecast)              # coherence/coherence_label
    prev_28_sum = float(sum(store.actual_units(series_id, prev_lo, prev_hi)))
    vel = compute_velocity(prev_28_sum, forecast)          # value/status (03 §6.3)
    trailing_28 = store.actual_units(series_id, prev_lo, prev_hi)
    inv = compute_inventory_risk(trailing_28, forecast)    # 03 §6.4 (+ projected_stock)

    # calendar / seasonal / uplift (05 §5, 03 §5)
    events_raw = store.events_in_range(horizon_lo, horizon_hi)
    events_in_horizon = [EventInfo(**e) for e in events_raw]
    snap_days = store.snap_days_in_range(horizon_lo, horizon_hi)

    month = store.d_to_date(start_d).month
    overall_mean = float(profile["overall_mean"])
    monthly_avg = [float(x) for x in profile["monthly_avg"]]   # len 12
    weekday_avg = [float(x) for x in profile["weekday_avg"]]   # len 7
    if overall_mean != 0:
        month_vs_avg_pct = round(
            (monthly_avg[month - 1] - overall_mean) / overall_mean * 100, 1
        )
    else:
        month_vs_avg_pct = 0.0
    seasonal = Seasonal(
        month=month,
        month_vs_avg_pct=month_vs_avg_pct,
        monthly_avg=monthly_avg,
        weekday_avg=weekday_avg,
    )
    event_uplift = {str(k): float(v) for k, v in profile.get("event_uplift", {}).items()}

    # explainability (03 §6.5 via MT-19) — new spec signature: internally runs counterfactual
    # compute_explainability uses the DataFrame-based recursive_forecast from forecast_engine
    # (not the dict-based alias used above). Pass store.series_daily + plain-column calendar.
    cal_plain = store.calendar
    if cal_plain is not None and cal_plain.index.name == "d_index":
        cal_plain = cal_plain.reset_index()
    expl = compute_explainability(
        series_id,
        start_d,
        store.model,
        store.feature_meta,
        store.series_daily,
        cal_plain,
        store.profiles,
        vel,
        forecast,
    )

    return ForecastResult(
        series_id=series_id,
        item_id=meta["item_id"],
        product_name=name,
        history=HistoryBlock(dates=history_dates, units=history_units),
        horizon_dates=horizon_dates,
        actual=actual,
        forecast=[round(x, 1) for x in forecast],          # 1 dp for display (05 §5)
        metrics=Metrics(
            accuracy=acc["accuracy"],
            wape=acc["wape"],
            coherence=coh["coherence"],
            coherence_label=coh["coherence_label"],
            smape=acc["smape"],
            mae=acc["mae"],
            rmse=acc["rmse"],
        ),
        velocity=Velocity(value=vel["value"], status=vel["status"]),
        inventory=Inventory(
            on_hand=inv["on_hand"],
            safety_stock=inv["safety_stock"],
            reorder_point=inv["reorder_point"],
            horizon_demand=inv["horizon_demand"],
            cover_days=inv["cover_days"],
            stockout_risk=inv["stockout_risk"],
            overstock=inv["overstock"],
            recommended_order_qty=inv["recommended_order_qty"],
            projected_stock=inv["projected_stock"],
        ),
        explainability=Explainability(
            event_contribution_pct=expl["event_contribution_pct"],
            snap_days_in_horizon=expl["snap_days_in_horizon"],
            narrative=expl["narrative"],
            factors=[Factor(**f) for f in expl["factors"]],
        ),
        events_in_horizon=events_in_horizon,
        seasonal=seasonal,
        event_uplift=event_uplift,
    )


def _build_summary(results: list[ForecastResult]) -> Summary:
    """Aggregate across results (05 §5 rules)."""
    total_predicted_demand = round(sum(r.inventory.horizon_demand for r in results), 1)
    high_risk_count = sum(1 for r in results if r.inventory.stockout_risk == "High")
    avg_velocity = round(
        sum(min(r.velocity.value, 999.0) for r in results) / len(results), 1
    )                                                       # cap each at 999 (05 §5)
    avg_accuracy = round(sum(r.metrics.accuracy for r in results) / len(results), 1)

    # union of events, deduped by (date, name), sorted by date (05 §5)
    seen: set[tuple[str, str]] = set()
    active: list[EventInfo] = []
    for r in results:
        for ev in r.events_in_horizon:
            key = (ev.date, ev.name)
            if key not in seen:
                seen.add(key)
                active.append(ev)
    active.sort(key=lambda e: e.date)

    return Summary(
        total_predicted_demand=total_predicted_demand,
        high_risk_count=high_risk_count,
        avg_velocity=avg_velocity,
        avg_accuracy=avg_accuracy,
        active_events=active,
    )


def run(product_ids: list[str], start_date_str: str) -> ForecastResponse:
    """Build the full ForecastResponse for the request (04 §4)."""
    store = get_store()
    if not store.model_loaded:
        # surfaces as 500 via MT-24's generic handler (04 §3, 05 §6)
        raise RuntimeError("model artifacts not loaded; cannot forecast")

    start_d = _validate_start_d(store, start_date_str)

    # defense in depth — MT-20's ForecastRequest already enforces valid SeriesIds
    for pid in product_ids:
        if pid not in config.SERIES_IDS:
            raise ForecastValidationError(
                f"unknown product_id '{pid}'.", field="product_ids"
            )

    results = [_build_result(store, pid, start_d) for pid in product_ids]
    summary = _build_summary(results)

    return ForecastResponse(
        start_date=start_date_str,
        horizon=config.HORIZON,
        summary=summary,
        results=results,
    )
