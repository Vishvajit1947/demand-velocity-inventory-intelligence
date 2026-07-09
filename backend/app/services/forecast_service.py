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

import logging
import time
from datetime import date

from app import config
from app.ml.forecast_engine import (
    _SeriesConfig,
    recursive_forecast_dicts as recursive_forecast,
    recursive_forecast_multi,
)
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

logger = logging.getLogger("demand_velocity")


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


def _build_result(
    store,
    series_id: str,
    start_d: int,
    forecast: list[float],
    forecast_no_event: list[float],
    u_by_d: dict[int, float],
    p_by_d: dict[int, float],
    cal_plain,                          # pre-reset calendar (passed in once per request)
) -> ForecastResult:
    """Assemble one ForecastResult given pre-computed main + counterfactual forecasts.

    cal_plain is passed in by run() to avoid reset_index() being called 8 times.
    u_by_d is used directly for actual/history/trailing windows — no further
    actual_units() calls needed since u_by_d already holds the full series.
    """
    t0 = time.perf_counter()

    meta    = config.PRODUCTS[series_id]
    name    = meta["name"]
    profile = store.profiles[series_id]

    H = config.HORIZON
    W = config.HISTORY_WINDOW
    horizon_lo, horizon_hi = start_d, start_d + H - 1
    hist_lo,    hist_hi    = start_d - W, start_d - 1
    prev_lo,    prev_hi    = start_d - 28, start_d - 1

    # Slice all unit windows directly from u_by_d — pure Python dict lookup,
    # no DataFrame mask needed since u_by_d already has the full series.
    t_slices = time.perf_counter()
    actual        = [float(u_by_d[d]) for d in range(horizon_lo, horizon_hi + 1) if d in u_by_d]
    history_units = [float(u_by_d[d]) for d in range(hist_lo,    hist_hi + 1)    if d in u_by_d]
    trailing_28   = [float(u_by_d[d]) for d in range(prev_lo,    prev_hi + 1)    if d in u_by_d]
    prev_28_sum   = float(sum(trailing_28))
    logger.info("[TIMING] %s unit slices from dict: %.3fs",
                series_id, time.perf_counter() - t_slices)

    history_dates = [store.d_to_date(d).isoformat() for d in range(hist_lo,    hist_hi + 1)]
    horizon_dates = [store.d_to_date(d).isoformat() for d in range(horizon_lo, horizon_hi + 1)]

    t_metrics = time.perf_counter()
    acc = compute_accuracy(actual, forecast)
    coh = compute_coherence(actual, forecast)
    vel = compute_velocity(prev_28_sum, forecast)
    inv = compute_inventory_risk(trailing_28, forecast)
    logger.info("[TIMING] %s metrics: %.3fs", series_id, time.perf_counter() - t_metrics)

    events_raw        = store.events_in_range(horizon_lo, horizon_hi)
    events_in_horizon = [EventInfo(**e) for e in events_raw]

    month        = store.d_to_date(start_d).month
    overall_mean = float(profile["overall_mean"])
    monthly_avg  = [float(x) for x in profile["monthly_avg"]]
    weekday_avg  = [float(x) for x in profile["weekday_avg"]]
    month_vs_avg_pct = (
        round((monthly_avg[month - 1] - overall_mean) / overall_mean * 100, 1)
        if overall_mean != 0 else 0.0
    )
    seasonal     = Seasonal(month=month, month_vs_avg_pct=month_vs_avg_pct,
                            monthly_avg=monthly_avg, weekday_avg=weekday_avg)
    event_uplift = {str(k): float(v) for k, v in profile.get("event_uplift", {}).items()}

    t_expl = time.perf_counter()
    expl = compute_explainability(
        series_id, start_d,
        f_no_event=forecast_no_event,
        calendar=cal_plain,
        profiles=store.profiles,
        velocity=vel,
        forecast=forecast,
    )
    logger.info("[TIMING] %s explainability (assembly only): %.3fs",
                series_id, time.perf_counter() - t_expl)
    logger.info("[TIMING] %s _build_result TOTAL: %.3fs",
                series_id, time.perf_counter() - t0)

    return ForecastResult(
        series_id=series_id,
        item_id=meta["item_id"],
        product_name=name,
        history=HistoryBlock(dates=history_dates, units=history_units),
        horizon_dates=horizon_dates,
        actual=actual,
        forecast=[round(x, 1) for x in forecast],
        metrics=Metrics(
            accuracy=acc["accuracy"], wape=acc["wape"],
            coherence=coh["coherence"], coherence_label=coh["coherence_label"],
            smape=acc["smape"], mae=acc["mae"], rmse=acc["rmse"],
        ),
        velocity=Velocity(value=vel["value"], status=vel["status"]),
        inventory=Inventory(
            on_hand=inv["on_hand"], safety_stock=inv["safety_stock"],
            reorder_point=inv["reorder_point"], horizon_demand=inv["horizon_demand"],
            cover_days=inv["cover_days"], stockout_risk=inv["stockout_risk"],
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
    """Build the full ForecastResponse for the request (04 §4).

    Multi-product path: builds one N-row feature batch per day for the main
    forecast pass (28 model.predict calls instead of 28×N), then runs the
    counterfactual and result assembly per-product sequentially.
    Single-product path: falls through to the same logic with N=1.
    """
    t_total = time.perf_counter()
    store   = get_store()
    logger.info("[TIMING] request start: products=%s start_date=%s model_loaded=%s",
                product_ids, start_date_str, store.model_loaded)

    if not store.model_loaded:
        raise RuntimeError("model artifacts not loaded; cannot forecast")

    start_d = _validate_start_d(store, start_date_str)

    for pid in product_ids:
        if pid not in config.SERIES_IDS:
            raise ForecastValidationError(f"unknown product_id '{pid}'.",
                                          field="product_ids")

    feature_meta = store.feature_meta
    series_scale = feature_meta.get("series_scale", {})
    train_mean_price_map = feature_meta.get("train_mean_price", {})

    # ── Step 1: extract per-series dicts (vectorized, shared across main + counterfactual) ──
    t_dicts = time.perf_counter()
    u_by_d_all = {pid: store.units_by_d(pid) for pid in product_ids}
    p_by_d_all = {pid: store.price_by_d(pid) for pid in product_ids}
    logger.info("[TIMING] dict extraction (%d products): %.3fs",
                len(product_ids), time.perf_counter() - t_dicts)

    # ── Step 2: batched main forecast pass — 28 predict() calls for all N products ──
    t_batch = time.perf_counter()

    def _last_price(pid: str) -> float:
        p_by_d = p_by_d_all[pid]
        tmp = next((p_by_d[d] for d in range(start_d - 1, 0, -1) if d in p_by_d), None)
        if tmp is not None:
            return float(tmp)
        return float(train_mean_price_map.get(pid, 1.0))

    series_configs = [
        _SeriesConfig(
            series_id        = pid,
            units_by_d       = u_by_d_all[pid],
            price_by_d       = p_by_d_all[pid],
            scale            = float(series_scale.get(pid, 1.0)),
            train_mean_price = float(train_mean_price_map.get(pid, 1.0)),
            last_price       = _last_price(pid),
        )
        for pid in product_ids
    ]

    batched_forecasts = recursive_forecast_multi(
        series_configs, start_d, store.model, feature_meta,
        neutralize_events=False,
    )
    logger.info("[TIMING] batched main forecast (%d products, 28 predict calls): %.3fs",
                len(product_ids), time.perf_counter() - t_batch)

    # ── Step 3: batched counterfactual pass — 28 predict() calls, neutralize_events=True ──
    t_cf = time.perf_counter()
    batched_no_event = recursive_forecast_multi(
        series_configs, start_d, store.model, feature_meta,
        neutralize_events=True,
    )
    logger.info("[TIMING] batched counterfactual (%d products, 28 predict calls): %.3fs",
                len(product_ids), time.perf_counter() - t_cf)

    # ── Step 4: pre-compute cal_plain once — avoids 8x reset_index() ──────────────
    cal_plain = store.calendar
    if cal_plain is not None and cal_plain.index.name == "d_index":
        cal_plain = cal_plain.reset_index()

    # ── Step 5: per-product result assembly (metrics + schema only) ─────────────
    results = []
    for i, pid in enumerate(product_ids):
        t_prod = time.perf_counter()
        result = _build_result(
            store, pid, start_d,
            forecast=batched_forecasts[i],
            forecast_no_event=batched_no_event[i],
            u_by_d=u_by_d_all[pid],
            p_by_d=p_by_d_all[pid],
            cal_plain=cal_plain,
        )
        results.append(result)
        logger.info("[TIMING] %s result assembly (metrics+schema): %.3fs",
                    pid, time.perf_counter() - t_prod)

    summary = _build_summary(results)
    logger.info("[TIMING] request TOTAL (%.3fs): %d product(s)",
                time.perf_counter() - t_total, len(product_ids))
    return ForecastResponse(
        start_date=start_date_str,
        horizon=config.HORIZON,
        summary=summary,
        results=results,
    )
