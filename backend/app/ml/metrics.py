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

_MONTHS = ["January", "February", "March", "April", "May", "June",
           "July", "August", "September", "October", "November", "December"]


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
def compute_velocity(prev_28_sum: float, forecast) -> dict:
    recent = float(_as_float_array(forecast).sum())
    if prev_28_sum == 0:
        value = 0.0 if recent == 0 else 999.0
    else:
        value = round((recent - prev_28_sum) / prev_28_sum * 100, 1)
    if value < -50:
        status = "Critical Decline"
    elif value < -10:
        status = "Declining"
    elif value <= 10:
        status = "Stable"
    elif value <= 40:
        status = "Growing"
    else:
        status = "Accelerating"
    return {"value": value, "status": status}


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
# MT-19 — 03_ALGORITHM_SPEC.md §6.5  Explainability
# ---------------------------------------------------------------------------
def compute_explainability(series_id: str, product_name: str, month: int,
                           forecast_full, forecast_no_event,
                           profile: dict, velocity: dict,
                           events_in_horizon: list[dict],
                           snap_days_in_horizon: int) -> dict:
    full = float(_as_float_array(forecast_full).sum())
    base = float(_as_float_array(forecast_no_event).sum())
    event_contribution_pct = round((full - base) / max(1e-6, base) * 100, 1)

    overall = profile.get("overall_mean", 0.0) or 1e-6
    month_avg = profile.get("monthly_avg", [overall] * 12)[month - 1]
    month_vs_avg_pct = round((month_avg - overall) / overall * 100, 1)

    narrative = [
        f"Demand is {velocity['status']} ({velocity['value']:+.0f}% vs the prior 28 days)."
    ]
    hl = "high" if month_vs_avg_pct >= 0 else "low"
    narrative.append(
        f"{_MONTHS[month - 1]} is a {hl}-demand month for {product_name} "
        f"(~{month_vs_avg_pct:+.0f}% vs average)."
    )
    uplift = profile.get("event_uplift", {})
    for ev in events_in_horizon:
        if ev["name"] in uplift:
            narrative.append(
                f"{ev['name']} falls in this window — historically a "
                f"{uplift[ev['name']]:+.0f}% swing."
            )
            break
    narrative.append(
        f"Events account for ~{event_contribution_pct:+.0f}% of predicted demand in this window."
    )
    if snap_days_in_horizon:
        narrative.append(
            f"{snap_days_in_horizon} SNAP payout day(s) fall in this window."
        )

    factors = [
        {"label": "Event uplift", "value": event_contribution_pct, "kind": "event"},
        {"label": "Seasonality",  "value": month_vs_avg_pct,        "kind": "seasonal"},
        {"label": "Trend",        "value": velocity["value"],        "kind": "trend"},
    ]
    return {
        "event_contribution_pct": event_contribution_pct,
        "snap_days_in_horizon": int(snap_days_in_horizon),
        "narrative": narrative,
        "factors": factors,
    }
