"""backend/app/ml/metrics.py

Pure, deterministic metric functions for the 28-day forecast horizon.

This module is SHARED and ADDITIVE across micro-tasks:
  - MT-16: compute_accuracy, compute_coherence      (this file's initial content)
  - MT-17: compute_velocity
  - MT-18: compute_inventory_risk
  - MT-19: compute_explainability

All functions are pure (no FastAPI, no globals, no I/O) per 04_BACKEND_ARCHITECTURE.md §2.
Formulas are LOCKED in 03_ALGORITHM_SPEC.md §6 — implement verbatim, do not re-decide.
"""
from __future__ import annotations

import calendar as _pycal
import math
import numpy as np
from scipy.stats import pearsonr

from app.config import HORIZON, INITIAL_COVER_DAYS, LEAD_TIME_DAYS, SERVICE_Z

__all__ = [
    "compute_accuracy",
    "compute_coherence",
    "compute_velocity",
    "compute_inventory_risk",
    "compute_explainability",
]

def _as_float_array(x) -> np.ndarray:
    """Coerce an array-like to a 1-D float64 numpy array."""
    return np.asarray(x, dtype=np.float64).reshape(-1)


# ---------------------------------------------------------------------------
# MT-16 — 03_ALGORITHM_SPEC.md §6.1  Accuracy / WAPE + secondary sMAPE/MAE/RMSE
# ---------------------------------------------------------------------------
def compute_accuracy(actual, forecast) -> dict:
    """Accuracy headline (WAPE-based) + sMAPE/MAE/RMSE over the aligned horizon (03 §6.1).

    WAPE     = sum(|a-f|) / sum(|a|) * 100
               if sum(|a|)==0: accuracy=100 if sum(|f|)<1 else 0
    accuracy = round(max(0.0, 100.0 - WAPE), 1)

    sMAPE = mean over days where (|a|+|f|) > 0 of ( 2*|a-f| / (|a|+|f|) ) * 100
    mae   = mean(|a-f|),  rmse = sqrt(mean((a-f)^2))   [all days, rounded to 2 dp]

    Returns dict(accuracy, wape, smape, mae, rmse).
    """
    a = _as_float_array(actual)
    f = _as_float_array(forecast)
    if a.shape != f.shape:
        raise ValueError(
            f"actual and forecast must be the same length, got {a.shape} vs {f.shape}"
        )

    n = a.size
    if n == 0:
        return {"accuracy": 100.0, "wape": 0.0, "smape": 0.0, "mae": 0.0, "rmse": 0.0}

    abs_err = np.abs(a - f)

    # WAPE (03 §6.1 headline)
    sa = float(np.abs(a).sum())
    if sa == 0:
        accuracy = 100.0 if float(np.abs(f).sum()) < 1.0 else 0.0
        wape = 0.0 if accuracy == 100.0 else 100.0
    else:
        wape = float(abs_err.sum() / sa * 100.0)
        accuracy = max(0.0, 100.0 - wape)

    # sMAPE (03 §6.1 secondary) — excludes days where (|a|+|f|)==0
    denom = np.abs(a) + np.abs(f)
    mask = denom > 0.0
    if mask.any():
        smape = float(np.mean(2.0 * abs_err[mask] / denom[mask] * 100.0))
    else:
        smape = 0.0

    mae = round(float(np.mean(abs_err)), 2)
    rmse = round(float(np.sqrt(np.mean((a - f) ** 2))), 2)

    return {
        "accuracy": round(accuracy, 1),
        "wape": round(wape, 1),
        "smape": round(smape, 1),
        "mae": mae,
        "rmse": rmse,
    }


# ---------------------------------------------------------------------------
# MT-16 — 03_ALGORITHM_SPEC.md §6.2  Coherence (shape/trend agreement)
# ---------------------------------------------------------------------------
def _coherence_label(coherence: float) -> str:
    """UI interpretation band (03 §6.2 / 05 §5)."""
    if coherence >= 75.0:
        return "Strong"
    if coherence >= 50.0:
        return "Moderate"
    return "Weak"


def compute_coherence(actual, forecast) -> dict:
    """Coherence score 0-100 blending shape correlation + direction agreement (03 §6.2).

    shape_corr = Pearson corr(a, f)   # NaN if either array is constant
    direction  = fraction of t where sign(a_t - a_{t-1}) == sign(f_t - f_{t-1})
    if shape_corr is NaN: coherence = round(100 * direction, 1)
    else:                 coherence = round(100 * (0.5*max(0,shape_corr) + 0.5*direction), 1)

    Returns dict(coherence, coherence_label).
    """
    a = _as_float_array(actual)
    f = _as_float_array(forecast)
    if a.shape != f.shape:
        raise ValueError(
            f"actual and forecast must be the same length, got {a.shape} vs {f.shape}"
        )

    n = a.size

    # direction: agreement of consecutive first-difference signs
    if n < 2:
        direction = 0.0
    else:
        sa = np.sign(np.diff(a))
        sf = np.sign(np.diff(f))
        direction = float(np.mean(sa == sf))

    # shape_corr: NaN if either array is constant (zero peak-to-peak range)
    # Detect constant explicitly via np.ptp to avoid relying on pearsonr warning behaviour
    a_constant = (n < 2) or (np.ptp(a) == 0.0)
    f_constant = (n < 2) or (np.ptp(f) == 0.0)
    if a_constant or f_constant:
        coherence = round(100.0 * direction, 1)
    else:
        shape_corr = float(pearsonr(a, f)[0])
        if math.isnan(shape_corr):   # defensive: treat as constant branch
            coherence = round(100.0 * direction, 1)
        else:
            coherence = round(
                100.0 * (0.5 * max(0.0, shape_corr) + 0.5 * direction), 1
            )

    return {
        "coherence": coherence,
        "coherence_label": _coherence_label(coherence),
    }


# ---------------------------------------------------------------------------
# MT-17 — 03_ALGORITHM_SPEC.md §6.3  Velocity score + status
# ---------------------------------------------------------------------------
def _velocity_status(velocity: float) -> str:
    """Map a velocity % to its status bucket (03 §6.3, exact boundaries)."""
    if velocity < -50.0:
        return "Critical Decline"
    if velocity < -10.0:          # -50 <= v < -10
        return "Declining"
    if velocity <= 10.0:          # -10 <= v <= 10
        return "Stable"
    if velocity <= 40.0:          # 10 < v <= 40
        return "Growing"
    return "Accelerating"         # v > 40


def compute_velocity(prev_28_actual_sum, forecast) -> dict:
    """Demand velocity (% change of next-28 forecast vs prior-28 actual) + status (03 §6.3).

    prev_28   = prev_28_actual_sum   # caller-supplied sum of actual units [start-28 .. start-1]
    recent_28 = sum(forecast)
    if prev_28 == 0:  value = 0.0 if recent_28 == 0 else 999.0
    else:             value = round((recent_28 - prev_28) / prev_28 * 100, 1)

    Returns dict(value, status).
    """
    prev_28 = float(prev_28_actual_sum)
    recent_28 = float(np.sum(_as_float_array(forecast)))

    if prev_28 == 0.0:
        value = 0.0 if recent_28 == 0.0 else 999.0
    else:
        value = round((recent_28 - prev_28) / prev_28 * 100.0, 1)

    return {"value": value, "status": _velocity_status(value)}


# ---------------------------------------------------------------------------
# MT-18 — 03_ALGORITHM_SPEC.md §6.4  Inventory risk simulation
# ---------------------------------------------------------------------------
def compute_inventory_risk(trailing_28, forecast) -> dict:
    t = _as_float_array(trailing_28)
    f = _as_float_array(forecast)
    mean_d = float(t.mean()) if len(t) else 0.0
    std_d = float(t.std()) if len(t) else 0.0
    on_hand = round(mean_d * INITIAL_COVER_DAYS)
    safety_stock = SERVICE_Z * std_d * math.sqrt(LEAD_TIME_DAYS)
    reorder_point = mean_d * LEAD_TIME_DAYS + safety_stock
    horizon_demand = float(f.sum())

    stock = float(on_hand)
    cover_days = HORIZON + 1
    projected = []
    for i, d in enumerate(f):
        stock -= float(d)
        projected.append(round(stock, 1))
        if stock <= 0 and cover_days == HORIZON + 1:
            cover_days = i
    risk = "High" if cover_days <= LEAD_TIME_DAYS else "Medium" if cover_days <= HORIZON else "Low"
    overstock = on_hand > horizon_demand * 1.5
    rec = max(0, round(horizon_demand + safety_stock - on_hand))
    return {
        "on_hand": int(on_hand),
        "safety_stock": round(safety_stock, 1),
        "reorder_point": round(reorder_point, 1),
        "horizon_demand": round(horizon_demand, 1),
        "cover_days": int(cover_days),
        "stockout_risk": risk,
        "overstock": bool(overstock),
        "recommended_order_qty": int(rec),
        "projected_stock": projected,
    }


# ---------------------------------------------------------------------------
# MT-19 — 03_ALGORITHM_SPEC.md §6.5 Explainability (counterfactual + narrative)
# ---------------------------------------------------------------------------

def _month_for_start_d(start_d: int, calendar) -> int:
    """Return the 1-12 calendar month of the horizon start day (02 §1 join)."""
    row = calendar.loc[calendar["d_index"] == start_d]
    if len(row) == 0:
        raise ValueError(f"start_d {start_d} not found in calendar")
    return int(row["month"].iloc[0])


def _horizon_rows(start_d: int, calendar):
    """Calendar rows for d_index in [start_d .. start_d+HORIZON-1]."""
    lo, hi = start_d, start_d + HORIZON - 1
    return calendar.loc[(calendar["d_index"] >= lo) & (calendar["d_index"] <= hi)]


def compute_explainability(series_id: str, start_d: int,
                           f_no_event: "list[float] | None",
                           calendar, profiles: dict, velocity: dict,
                           forecast,
                           # Legacy keyword args kept for backward compat — ignored
                           model=None, feature_meta=None,
                           units_by_d=None, price_by_d=None) -> dict:
    """Event-contribution counterfactual + narrative + 3 factors (03 §6.5).

    Args:
        series_id:    Product slug.
        start_d:      Horizon start d_index.
        f_no_event:   Pre-computed neutralized counterfactual forecast (28 floats).
                      Computed by the caller via recursive_forecast_multi(neutralize_events=True).
                      If None, falls back to calling recursive_forecast_dicts internally
                      (single-product path or legacy callers).
        calendar:     Plain-column calendar DataFrame (d_index as column).
        profiles:     All series profiles dict.
        velocity:     Already-computed velocity dict {value, status}.
        forecast:     Already-computed normal forecast (28 floats).

    Returns dict(event_contribution_pct, snap_days_in_horizon, narrative, factors).
    """
    prof   = profiles[series_id]
    f_full = _as_float_array(forecast)

    # --- Event contribution via counterfactual (03 §6.5) ---
    if f_no_event is not None:
        # Fast path: counterfactual already computed by the batched multi-product pass.
        f_no_event_arr = _as_float_array(f_no_event)
    else:
        # Fallback for single-product path or legacy callers: run internally.
        from app.ml.forecast_engine import recursive_forecast_dicts
        f_no_event_arr = _as_float_array(
            recursive_forecast_dicts(
                series_id, start_d, model, feature_meta,
                units_by_d, price_by_d,
                neutralize_events=True,
            )
        )

    sum_full = float(np.sum(f_full))
    sum_none = float(np.sum(f_no_event_arr))
    event_contribution_pct = round(
        (sum_full - sum_none) / max(1e-6, sum_none) * 100.0, 1
    )

    # --- Seasonality (03 §6.5 / §5) ---
    month = _month_for_start_d(start_d, calendar)
    monthly_avg  = list(prof["monthly_avg"])
    overall_mean = float(prof.get("overall_mean", 0.0))
    if overall_mean > 0.0:
        month_vs_avg_pct = round(
            (float(monthly_avg[month - 1]) - overall_mean) / overall_mean * 100.0, 1
        )
    else:
        month_vs_avg_pct = 0.0
    month_name = _pycal.month_name[month]
    high_low   = "high" if month_vs_avg_pct >= 0.0 else "low"

    # --- Events in horizon + SNAP days (03 §6.5 / §3.3 / 02 §4) ---
    hrows            = _horizon_rows(start_d, calendar)
    event_uplift_map = prof.get("event_uplift", {})
    events_in_horizon: list[tuple[str, float]] = []
    for _, r in hrows.iterrows():
        for col in ("event_name_1", "event_name_2"):
            name = r[col] if col in r.index else "none"
            if isinstance(name, str) and name != "none":
                events_in_horizon.append(
                    (name, float(event_uplift_map.get(name, 0.0)))
                )
    snap_days_in_horizon = int((hrows["snap_count"] > 0).sum())

    # --- Product name from profile (03 §5) ---
    product = prof.get("name") or series_id

    # --- Narrative bullets (03 §6.5 templates, verbatim wording) ---
    status    = velocity["status"]
    vel_value = float(velocity["value"])
    narrative = [
        f"Demand is {status} ({vel_value:+.0f}% vs the prior 28 days).",
        f"{month_name} is a {high_low}-demand month for {product} "
        f"(~{month_vs_avg_pct:+.0f}% vs average).",
    ]
    if events_in_horizon:
        ev_name, ev_uplift = events_in_horizon[0]
        narrative.append(
            f"{ev_name} falls in this window — historically a {ev_uplift:+.0f}% swing."
        )
    narrative.append(
        f"Events account for ~{event_contribution_pct:+.0f}% of predicted demand in this window."
    )

    # --- Factors (03 §6.5 / 05 §5: exact 3 entries, order, kinds) ---
    factors = [
        {"label": "Event uplift", "value": event_contribution_pct, "kind": "event"},
        {"label": "Seasonality",  "value": month_vs_avg_pct,        "kind": "seasonal"},
        {"label": "Trend",        "value": vel_value,               "kind": "trend"},
    ]

    return {
        "event_contribution_pct": event_contribution_pct,
        "snap_days_in_horizon":   snap_days_in_horizon,
        "narrative":              narrative,
        "factors":                factors,
    }
