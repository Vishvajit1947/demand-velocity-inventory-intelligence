"""Metrics & derived intelligence (docs/03_ALGORITHM_SPEC.md sec 6).
Headline accuracy = WAPE-based (docs decision). All functions are pure.
"""
from __future__ import annotations
import math
import numpy as np
from app.config import HORIZON, INITIAL_COVER_DAYS, LEAD_TIME_DAYS, SERVICE_Z

_MONTHS = ["January", "February", "March", "April", "May", "June",
           "July", "August", "September", "October", "November", "December"]


def _arr(x):
    return np.asarray(x, dtype=float)


# ---------- accuracy (headline WAPE) + secondary errors (sec 6.1) ----------
def compute_accuracy(actual, forecast) -> dict:
    a, f = _arr(actual), _arr(forecast)
    sa = np.abs(a).sum()
    if sa == 0:
        accuracy = 100.0 if np.abs(f).sum() < 1 else 0.0
        wape = 0.0 if accuracy == 100.0 else 100.0
    else:
        wape = float(np.abs(a - f).sum() / sa * 100)
        accuracy = max(0.0, 100.0 - wape)
    denom = np.abs(a) + np.abs(f)
    m = denom > 0
    smape = float(np.mean(2 * np.abs(a - f)[m] / denom[m]) * 100) if m.any() else 0.0
    return {
        "accuracy": round(accuracy, 1),
        "wape": round(wape, 1),
        "smape": round(smape, 1),
        "mae": round(float(np.mean(np.abs(a - f))), 2),
        "rmse": round(float(np.sqrt(np.mean((a - f) ** 2))), 2),
    }


# ---------- coherence: shape + direction agreement (sec 6.2) ----------
def compute_coherence(actual, forecast) -> dict:
    a, f = _arr(actual), _arr(forecast)
    if a.std() == 0 or f.std() == 0:
        shape_corr = float("nan")
    else:
        shape_corr = float(np.corrcoef(a, f)[0, 1])
    da, df = np.sign(np.diff(a)), np.sign(np.diff(f))
    direction = float(np.mean(da == df)) if len(da) else 0.0
    if math.isnan(shape_corr):
        coherence = round(100 * direction, 1)
    else:
        coherence = round(100 * (0.5 * max(0.0, shape_corr) + 0.5 * direction), 1)
    label = "Strong" if coherence >= 75 else "Moderate" if coherence >= 50 else "Weak"
    return {"coherence": coherence, "coherence_label": label}


# ---------- velocity (sec 6.3) ----------
def compute_velocity(prev_28_sum: float, forecast) -> dict:
    recent = float(_arr(forecast).sum())
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


# ---------- inventory risk simulation (sec 6.4) ----------
def compute_inventory_risk(trailing_28, forecast) -> dict:
    t = _arr(trailing_28)
    f = _arr(forecast)
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


# ---------- explainability (sec 6.5) ----------
def compute_explainability(series_id: str, product_name: str, month: int,
                           forecast_full, forecast_no_event,
                           profile: dict, velocity: dict,
                           events_in_horizon: list[dict], snap_days_in_horizon: int) -> dict:
    full = float(_arr(forecast_full).sum())
    base = float(_arr(forecast_no_event).sum())
    event_contribution_pct = round((full - base) / max(1e-6, base) * 100, 1)

    overall = profile.get("overall_mean", 0.0) or 1e-6
    month_avg = profile.get("monthly_avg", [overall] * 12)[month - 1]
    month_vs_avg_pct = round((month_avg - overall) / overall * 100, 1)

    narrative = [f"Demand is {velocity['status']} ({velocity['value']:+.0f}% vs the prior 28 days)."]
    hl = "high" if month_vs_avg_pct >= 0 else "low"
    narrative.append(f"{_MONTHS[month - 1]} is a {hl}-demand month for {product_name} "
                     f"(~{month_vs_avg_pct:+.0f}% vs average).")
    uplift = profile.get("event_uplift", {})
    for ev in events_in_horizon:
        if ev["name"] in uplift:
            narrative.append(f"{ev['name']} falls in this window — historically a "
                             f"{uplift[ev['name']]:+.0f}% swing.")
            break
    narrative.append(f"Events account for ~{event_contribution_pct:+.0f}% of predicted demand in this window.")
    if snap_days_in_horizon:
        narrative.append(f"{snap_days_in_horizon} SNAP payout day(s) fall in this window.")

    factors = [
        {"label": "Event uplift", "value": event_contribution_pct, "kind": "event"},
        {"label": "Seasonality", "value": month_vs_avg_pct, "kind": "seasonal"},
        {"label": "Trend", "value": velocity["value"], "kind": "trend"},
    ]
    return {"event_contribution_pct": event_contribution_pct,
            "snap_days_in_horizon": int(snap_days_in_horizon),
            "narrative": narrative, "factors": factors}
