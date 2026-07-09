"""MT-15 — Recursive 28-day forecast engine (03_ALGORITHM_SPEC §4).

Pure functions (04 §2): no FastAPI, no globals. The single-day feature row is
built directly here using the exact §3 formulas (same definitions as features.py).

Target scaling (03 §2): the model was trained on per-series scaled targets
(target = units / series_scale). Predictions are rescaled back:
    raw_output * series_scale = units

Interfaces provided:
  1. MT-15 spec:   recursive_forecast(series_id, start_d, model, feature_meta, data, calendar)
  2. Service dict: recursive_forecast_dicts(series_id, start_d, model, feature_meta,
                                             units_by_d, price_by_d, neutralize_events)
  3. Multi-product batch: recursive_forecast_multi(series_configs, start_d, model, feature_meta,
                                                    neutralize_events)
     Batches all N products into one model.predict(N-row DataFrame) call per day,
     reducing 28*N individual predict() calls to 28 batched calls.

Run the golden-fixture generator from backend/:
    python -m app.ml.forecast_engine --generate-golden
"""
from __future__ import annotations

import argparse
import json
import pickle
from pathlib import Path
from typing import NamedTuple

import numpy as np
import pandas as pd

from app.config import (
    FIRST_SELECTABLE_D,
    LAST_SELECTABLE_D,
    HORIZON,
    TRAIN_END_D,
)

# Canonical feature order (03 §3.6). feature_meta["features"] is authoritative at runtime.
FEATURES = [
    "series_id", "wday", "month", "year", "day_of_month", "week_of_year",
    "is_weekend", "snap_count",
    "event_name_1", "event_type_1", "event_name_2", "event_type_2", "is_event",
    "days_to_next_event", "days_since_last_event", "sell_price", "price_rel",
    "lag_1", "lag_7", "lag_14", "lag_28",
    "roll_mean_7", "roll_mean_28", "roll_std_7", "roll_std_28",
    "roll_mean_7_by_wday",
]
CATEGORICAL_FEATURES = [
    "series_id", "wday", "month",
    "event_name_1", "event_type_1", "event_name_2", "event_type_2",
]

NO_EVENT = "none"   # 02 §4

# ── paths (04 §1, §7) ──────────────────────────────────────────────────────────
_REPO_ROOT = Path(__file__).resolve().parents[3]
MODEL_PATH = _REPO_ROOT / "backend" / "app" / "models" / "model.pkl"
FEATURE_META_PATH = _REPO_ROOT / "backend" / "app" / "models" / "feature_meta.json"
SERIES_DAILY_PATH = _REPO_ROOT / "data" / "processed" / "series_daily.parquet"
CALENDAR_CSV_PATH = _REPO_ROOT / "data" / "raw" / "calendar.csv"
GOLDEN_PATH = _REPO_ROOT / "backend" / "tests" / "golden" / "expected_turkey_1300.json"


# ── loaders ────────────────────────────────────────────────────────────────────

def load_model():
    """Load the pickled LightGBM Booster from model.pkl."""
    with open(MODEL_PATH, "rb") as fh:
        return pickle.load(fh)


def load_feature_meta() -> dict:
    """Load feature_meta.json with features, categorical_features, best_iteration, etc."""
    return json.loads(FEATURE_META_PATH.read_text(encoding="utf-8"))


def load_series_daily() -> pd.DataFrame:
    """Load the processed long-format daily table (02 §4)."""
    return pd.read_parquet(SERIES_DAILY_PATH)


def load_calendar_features() -> pd.DataFrame:
    """Per-day calendar/event feature table for d_1..d_1969 (03 §3.2/§3.3).

    Delegates to MT-11's load_calendar + add_event_distance (which returns an
    indexed DataFrame), then converts to a plain-column DataFrame with all columns
    needed by the engine: d_index, wday, month, year, day_of_month, week_of_year,
    is_weekend, snap_count, event_name_1..2, event_type_1..2, is_event,
    days_to_next_event, days_since_last_event.

    Falls back to building from data/raw/calendar.csv if MT-11 is unavailable.
    """
    try:
        from app.ml.calendar_features import load_calendar, add_event_distance  # MT-11
        cal_indexed = load_calendar()
        cal = add_event_distance(cal_indexed)  # returns plain-column df
        # Ensure d_index is a column (not just the index)
        if "d_index" not in cal.columns:
            cal = cal.reset_index()
        # Ensure all required derived columns exist
        if "day_of_month" not in cal.columns:
            cal["date"] = pd.to_datetime(cal["date"])
            cal["day_of_month"] = cal["date"].dt.day.astype("int64")
        if "week_of_year" not in cal.columns:
            cal["date"] = pd.to_datetime(cal["date"])
            cal["week_of_year"] = cal["date"].dt.isocalendar().week.astype("int64")
        if "is_event" not in cal.columns:
            cal["is_event"] = (cal["event_name_1"] != NO_EVENT).astype("int64")
        return cal.sort_values("d_index").reset_index(drop=True)
    except Exception:
        return _build_calendar_features_from_csv()


def _build_calendar_features_from_csv() -> pd.DataFrame:
    """Fallback per-day calendar/event features per 03 §3.2/§3.3 from calendar.csv."""
    cal = pd.read_csv(CALENDAR_CSV_PATH)
    cal["d_index"] = cal["d"].str.replace("d_", "", regex=False).astype("int64")
    cal["date"] = pd.to_datetime(cal["date"])
    cal = cal.sort_values("d_index").reset_index(drop=True)

    for col in ["event_name_1", "event_type_1", "event_name_2", "event_type_2"]:
        cal[col] = cal[col].fillna(NO_EVENT).replace("", NO_EVENT)

    iso = cal["date"].dt.isocalendar()
    out = pd.DataFrame({
        "d_index": cal["d_index"].astype("int64"),
        "wday": cal["wday"].astype("int64"),
        "month": cal["month"].astype("int64"),
        "year": cal["year"].astype("int64"),
        "day_of_month": cal["date"].dt.day.astype("int64"),
        "week_of_year": iso["week"].astype("int64"),
        "is_weekend": cal["wday"].isin([1, 2]).astype("int64"),  # 1=Sat, 2=Sun (02 §1)
        "snap_count": (cal["snap_CA"] + cal["snap_TX"] + cal["snap_WI"]).astype("int64"),
        "event_name_1": cal["event_name_1"].astype(str),
        "event_type_1": cal["event_type_1"].astype(str),
        "event_name_2": cal["event_name_2"].astype(str),
        "event_type_2": cal["event_type_2"].astype(str),
    })
    out["is_event"] = (out["event_name_1"] != NO_EVENT).astype("int64")

    # days_to_next_event / days_since_last_event over the full calendar, capped at 28 (03 §3.3)
    has_event = out["is_event"].to_numpy().astype(bool)
    n = len(out)
    days_to = np.full(n, HORIZON, dtype="int64")
    days_since = np.full(n, HORIZON, dtype="int64")

    next_evt = None
    for i in range(n - 1, -1, -1):
        if next_evt is not None:
            days_to[i] = min(HORIZON, next_evt - i)
        if has_event[i]:
            next_evt = i
            days_to[i] = 0
    prev_evt = None
    for i in range(n):
        if prev_evt is not None:
            days_since[i] = min(HORIZON, i - prev_evt)
        if has_event[i]:
            prev_evt = i
            days_since[i] = 0

    out["days_to_next_event"] = days_to
    out["days_since_last_event"] = days_since
    return out


# ── lag/rolling helpers (03 §3.5) ─────────────────────────────────────────────

def _pop_std(vals: list[float]) -> float:
    """Population std (ddof=0); 0.0 if empty (03 §3.5)."""
    if not vals:
        return 0.0
    return float(np.std(np.asarray(vals, dtype="float64")))


def _same_wday_mean(u: dict[int, float], t: int, wday_t: int,
                    cal_indexed: "pd.DataFrame") -> float:
    """Mean of u on the same wday as day t over the last 4 occurrences before t (03 §3.5).

    cal_indexed must be indexed by d_index so cal_indexed.loc[k]['wday'] works.
    Kept for the DataFrame-based recursive_forecast (MT-15 spec interface).
    """
    same_wday: list[float] = []
    k = t - 1
    while k >= 1 and len(same_wday) < 4:
        if int(cal_indexed.loc[k]["wday"]) == wday_t:
            same_wday.append(float(u[k]))
        k -= 1
    return float(np.mean(same_wday)) if same_wday else 0.0


def _same_wday_mean_fast(u: dict[int, float], t: int, wday_t: int,
                         wday_map: dict[int, int]) -> float:
    """Fast variant of _same_wday_mean using a precomputed {d_index: wday} dict.

    Replaces cal_indexed.loc[k] (pandas label lookup) with a plain dict access,
    eliminating pandas overhead inside the tight 28-step loop.
    """
    same_wday: list[float] = []
    k = t - 1
    while k >= 1 and len(same_wday) < 4:
        if wday_map.get(k) == wday_t:
            same_wday.append(float(u[k]))
        k -= 1
    return float(np.mean(same_wday)) if same_wday else 0.0


def _build_row(series_id: str, t: int, cal_row: "pd.Series",
               last_price: float, train_mean_price: float,
               u: dict[int, float], cal_indexed: "pd.DataFrame",
               neutralize_events: bool = False) -> dict:
    """Single-day feature dict in FEATURES order (03 §3).

    neutralize_events: if True, force all event features to 'none'/0 and
    days_to/since to 28 (used for counterfactual explainability, 03 §6.5).
    """
    # Price features (03 §3.4)
    price_rel = 1.0
    if (train_mean_price and np.isfinite(train_mean_price) and
            float(train_mean_price) != 0.0):
        price_rel = float(last_price) / float(train_mean_price)

    # Lag/rolling (03 §3.5) — strictly backward
    win7 = [u[t - k] for k in range(1, 8)]
    win28 = [u[t - k] for k in range(1, 29)]
    wday_t = int(cal_row["wday"])
    roll_wday = _same_wday_mean(u, t, wday_t, cal_indexed)

    # Event features (03 §3.3)
    if neutralize_events:
        en1 = et1 = en2 = et2 = NO_EVENT
        is_event = 0
        days_to_next = days_since_last = HORIZON
    else:
        en1 = str(cal_row["event_name_1"])
        et1 = str(cal_row["event_type_1"])
        en2 = str(cal_row["event_name_2"])
        et2 = str(cal_row["event_type_2"])
        is_event = int(cal_row["is_event"])
        days_to_next = int(cal_row["days_to_next_event"])
        days_since_last = int(cal_row["days_since_last_event"])

    return {
        "series_id": series_id,
        "wday": int(cal_row["wday"]),
        "month": int(cal_row["month"]),
        "year": int(cal_row["year"]),
        "day_of_month": int(cal_row["day_of_month"]),
        "week_of_year": int(cal_row["week_of_year"]),
        "is_weekend": int(cal_row["is_weekend"]),
        "snap_count": int(cal_row["snap_count"]),
        "event_name_1": en1,
        "event_type_1": et1,
        "event_name_2": en2,
        "event_type_2": et2,
        "is_event": is_event,
        "days_to_next_event": days_to_next,
        "days_since_last_event": days_since_last,
        "sell_price": float(last_price),
        "price_rel": float(price_rel),
        "lag_1": float(u[t - 1]),
        "lag_7": float(u[t - 7]),
        "lag_14": float(u[t - 14]),
        "lag_28": float(u[t - 28]),
        "roll_mean_7": float(np.mean(win7)),
        "roll_mean_28": float(np.mean(win28)),
        "roll_std_7": _pop_std(win7),
        "roll_std_28": _pop_std(win28),
        "roll_mean_7_by_wday": roll_wday,
    }


def _frame_from_row(row: dict, features: list[str],
                    categoricals: list[str],
                    categories: dict | None = None) -> pd.DataFrame:
    """Build a 1-row DataFrame in the canonical feature order with category dtypes."""
    x = pd.DataFrame([row])[features]
    if categories:
        # Use training-aligned categories from feature_meta for correct LightGBM mapping
        for c in categoricals:
            x[c] = pd.Categorical(
                [str(row[c])],
                categories=[str(z) for z in categories[c]],
            )
    else:
        for c in categoricals:
            x[c] = x[c].astype("category")
    return x


# ── the engine — MT-15 spec interface (03 §4) ─────────────────────────────────

def recursive_forecast(
    series_id: str,
    start_d: int,
    model,
    feature_meta: dict,
    data: pd.DataFrame,
    calendar: pd.DataFrame,
    neutralize_events: bool = False,
) -> list[float]:
    """Return 28 daily predictions for days [start_d .. start_d+27] (03 §4).

    Args:
        series_id:      Product slug (e.g. 'turkey').
        start_d:        First day of the 28-day horizon (d_index, FIRST_SELECTABLE_D..LAST_SELECTABLE_D).
        model:          Loaded LightGBM Booster (from model.pkl).
        feature_meta:   Dict with 'features', 'categorical_features', 'best_iteration',
                        'categories', 'series_scale', 'train_mean_price' (from feature_meta.json).
        data:           series_daily DataFrame (02 §4) — source of actual units + sell_price.
        calendar:       Plain-column calendar DataFrame covering d_1..d_1969 with columns:
                        d_index, wday, month, year, day_of_month, week_of_year, is_weekend,
                        snap_count, event_name_{1,2}, event_type_{1,2}, is_event,
                        days_to_next_event, days_since_last_event.
        neutralize_events: If True, zero out event features (counterfactual, 03 §6.5).

    Returns:
        List of 28 non-negative floats.
    """
    # Precondition (02 §3)
    if not (FIRST_SELECTABLE_D <= start_d <= LAST_SELECTABLE_D):
        raise ValueError(
            f"start_d={start_d} out of range "
            f"[{FIRST_SELECTABLE_D}, {LAST_SELECTABLE_D}] (02 §3)"
        )

    features = feature_meta["features"]
    categoricals = feature_meta["categorical_features"]
    best_iteration = feature_meta.get("best_iteration")
    categories = feature_meta.get("categories")  # training-aligned category values
    series_scale = feature_meta.get("series_scale", {})
    train_mean_price_map = feature_meta.get("train_mean_price", {})

    # Series-specific scale and train mean price (03 §2, §3.4)
    scale = float(series_scale.get(series_id, 1.0))
    train_mean_price = float(train_mean_price_map.get(series_id, 1.0))

    # Filter to this series
    data_str = data.copy()
    data_str["series_id"] = data_str["series_id"].astype(str)
    s = data_str[data_str["series_id"] == series_id].sort_values("d_index")
    if s.empty:
        raise ValueError(f"unknown series_id '{series_id}'")

    # Step 1: seed u with actuals for d_index < start_d (03 §4 step 1)
    hist = s[s["d_index"] < start_d]
    u: dict[int, float] = dict(
        zip(hist["d_index"].astype(int), hist["units"].astype(float))
    )

    # Step 2: forward-fill last known price at <= start_d-1 (03 §3.4, §4 step 2)
    price_hist = s[(s["d_index"] <= start_d - 1) & s["sell_price"].notna()]
    if not price_hist.empty:
        last_price = float(price_hist["sell_price"].iloc[-1])
    else:
        last_price = float(train_mean_price) if train_mean_price else 0.0

    # Index the calendar by d_index for fast per-day lookup
    # calendar is a plain-column df; set_index creates a view for .loc[t]
    cal_indexed = calendar.set_index("d_index")

    preds: list[float] = []
    for t in range(start_d, start_d + HORIZON):
        cal_row = cal_indexed.loc[t]

        # Build single-day feature row (03 §3)
        row = _build_row(
            series_id, t, cal_row, last_price, train_mean_price,
            u, cal_indexed, neutralize_events,
        )

        # Assemble DataFrame in canonical feature order with categoricals
        x = _frame_from_row(row, features, categoricals, categories)

        # Predict and rescale (03 §2: raw output is scaled; multiply by series_scale)
        if best_iteration:
            raw_yhat = float(model.predict(x, num_iteration=best_iteration)[0])
        else:
            raw_yhat = float(model.predict(x)[0])

        yhat = max(0.0, raw_yhat * scale)   # rescale + clip negatives (03 §4)
        u[t] = yhat                          # feed back for next day's lags (03 §4)
        preds.append(yhat)

    return preds


# ── backward-compatible dict interface (used by services/forecast_service.py) ──

# Module-level calendar caches — built once on first call, reused every request.
_CAL_INDEXED_CACHE: "pd.DataFrame | None" = None
_WDAY_MAP_CACHE: "dict[int, int] | None" = None   # {d_index: wday} — fast lookup


def _get_cal_indexed() -> "pd.DataFrame":
    """Return the calendar indexed by d_index, building it once and caching it."""
    global _CAL_INDEXED_CACHE, _WDAY_MAP_CACHE
    if _CAL_INDEXED_CACHE is not None:
        return _CAL_INDEXED_CACHE
    try:
        from app.ml.calendar_features import load_calendar, add_event_distance
        cal_plain = add_event_distance(load_calendar())
        if "d_index" not in cal_plain.columns:
            cal_plain = cal_plain.reset_index()
    except Exception:
        cal_plain = load_calendar_features()
    _CAL_INDEXED_CACHE = cal_plain.set_index("d_index")
    # Build the wday map at the same time — one vectorized pass
    _WDAY_MAP_CACHE = dict(zip(
        cal_plain["d_index"].to_numpy().astype(int),
        cal_plain["wday"].to_numpy().astype(int),
    ))
    return _CAL_INDEXED_CACHE


def _get_wday_map() -> "dict[int, int]":
    """Return the precomputed {d_index: wday} dict, building it if needed."""
    if _WDAY_MAP_CACHE is None:
        _get_cal_indexed()   # populates both caches
    return _WDAY_MAP_CACHE  # type: ignore[return-value]


def _build_row_fast(series_id: str, t: int, cal_row: "pd.Series",
                    last_price: float, train_mean_price: float,
                    u: dict[int, float], wday_map: dict[int, int],
                    neutralize_events: bool = False) -> dict:
    """_build_row variant using precomputed wday_map for the same-wday rolling mean.

    Identical output to _build_row; differs only in the _same_wday_mean call,
    which uses dict lookup instead of cal_indexed.loc[k].
    """
    price_rel = 1.0
    if (train_mean_price and np.isfinite(train_mean_price) and
            float(train_mean_price) != 0.0):
        price_rel = float(last_price) / float(train_mean_price)

    win7  = [u[t - k] for k in range(1, 8)]
    win28 = [u[t - k] for k in range(1, 29)]
    wday_t = int(cal_row["wday"])
    roll_wday = _same_wday_mean_fast(u, t, wday_t, wday_map)

    if neutralize_events:
        en1 = et1 = en2 = et2 = NO_EVENT
        is_event = 0
        days_to_next = days_since_last = HORIZON
    else:
        en1 = str(cal_row["event_name_1"])
        et1 = str(cal_row["event_type_1"])
        en2 = str(cal_row["event_name_2"])
        et2 = str(cal_row["event_type_2"])
        is_event = int(cal_row["is_event"])
        days_to_next = int(cal_row["days_to_next_event"])
        days_since_last = int(cal_row["days_since_last_event"])

    return {
        "series_id":              series_id,
        "wday":                   wday_t,
        "month":                  int(cal_row["month"]),
        "year":                   int(cal_row["year"]),
        "day_of_month":           int(cal_row["day_of_month"]),
        "week_of_year":           int(cal_row["week_of_year"]),
        "is_weekend":             int(cal_row["is_weekend"]),
        "snap_count":             int(cal_row["snap_count"]),
        "event_name_1":           en1,
        "event_type_1":           et1,
        "event_name_2":           en2,
        "event_type_2":           et2,
        "is_event":               is_event,
        "days_to_next_event":     days_to_next,
        "days_since_last_event":  days_since_last,
        "sell_price":             float(last_price),
        "price_rel":              float(price_rel),
        "lag_1":                  float(u[t - 1]),
        "lag_7":                  float(u[t - 7]),
        "lag_14":                 float(u[t - 14]),
        "lag_28":                 float(u[t - 28]),
        "roll_mean_7":            float(np.mean(win7)),
        "roll_mean_28":           float(np.mean(win28)),
        "roll_std_7":             _pop_std(win7),
        "roll_std_28":            _pop_std(win28),
        "roll_mean_7_by_wday":    roll_wday,
    }


def recursive_forecast_dicts(
    series_id: str,
    start_d: int,
    model,
    feature_meta: dict,
    units_by_d: dict[int, float],
    price_by_d: dict[int, float],
    neutralize_events: bool = False,
) -> list[float]:
    """Dict-based single-series interface for services/forecast_service.py.

    Used for single-product requests and for the counterfactual pass inside
    compute_explainability. Uses _build_row_fast + precomputed wday_map.
    """
    if not (FIRST_SELECTABLE_D <= start_d <= LAST_SELECTABLE_D):
        raise ValueError(
            f"start_d={start_d} out of range "
            f"[{FIRST_SELECTABLE_D}, {LAST_SELECTABLE_D}] (02 §3)"
        )

    features      = feature_meta["features"]
    categoricals  = feature_meta["categorical_features"]
    best_iteration = feature_meta.get("best_iteration")
    categories    = feature_meta.get("categories")
    series_scale  = feature_meta.get("series_scale", {})
    train_mean_price_map = feature_meta.get("train_mean_price", {})

    scale            = float(series_scale.get(series_id, 1.0))
    train_mean_price = float(train_mean_price_map.get(series_id, 1.0))

    cal_indexed = _get_cal_indexed()
    wday_map    = _get_wday_map()

    u: dict[int, float] = {d: v for d, v in units_by_d.items() if d < start_d}
    last_price = next(
        (price_by_d[d] for d in range(start_d - 1, 0, -1) if d in price_by_d),
        train_mean_price,
    )

    preds: list[float] = []
    for t in range(start_d, start_d + HORIZON):
        cal_row = cal_indexed.loc[t]
        row = _build_row_fast(
            series_id, t, cal_row, last_price, train_mean_price,
            u, wday_map, neutralize_events,
        )
        x = _frame_from_row(row, features, categoricals, categories)
        if best_iteration:
            raw_yhat = float(model.predict(x, num_iteration=best_iteration)[0])
        else:
            raw_yhat = float(model.predict(x)[0])
        yhat = max(0.0, raw_yhat * scale)
        u[t] = yhat
        preds.append(yhat)

    return preds


# ── multi-product batched interface — the fast path for N > 1 products ─────────

class _SeriesConfig(NamedTuple):
    """Per-series state needed by recursive_forecast_multi."""
    series_id:        str
    units_by_d:       dict   # {d_index: float}
    price_by_d:       dict   # {d_index: float}
    scale:            float
    train_mean_price: float
    last_price:       float


def recursive_forecast_multi(
    series_configs: "list[_SeriesConfig]",
    start_d: int,
    model,
    feature_meta: dict,
    neutralize_events: bool = False,
) -> "list[list[float]]":
    """Batch-predict all N products together for each of the 28 days.

    Because the forecast is autoregressive (each day's lag features include the
    previous day's *predicted* value), we cannot batch within a single product's
    28-step pass. We CAN batch across products for a given day, because products
    are independent of each other.

    This reduces model.predict() calls from 28 × N (one per day per product)
    to 28 (one per day, N-row batch), cutting fixed Python↔LightGBM overhead
    by a factor of N.

    Args:
        series_configs:   List of _SeriesConfig named-tuples, one per product.
        start_d:          First d_index of the 28-day horizon.
        model:            LightGBM Booster.
        feature_meta:     feature_meta.json dict.
        neutralize_events: If True, zero out all event features (counterfactual).

    Returns:
        List of N lists, each containing 28 predicted floats, in the same order
        as series_configs.
    """
    if not (FIRST_SELECTABLE_D <= start_d <= LAST_SELECTABLE_D):
        raise ValueError(
            f"start_d={start_d} out of range "
            f"[{FIRST_SELECTABLE_D}, {LAST_SELECTABLE_D}] (02 §3)"
        )

    features      = feature_meta["features"]
    categoricals  = feature_meta["categorical_features"]
    best_iteration = feature_meta.get("best_iteration")
    categories    = feature_meta.get("categories")

    cal_indexed = _get_cal_indexed()
    wday_map    = _get_wday_map()

    n = len(series_configs)

    # Per-product running state: u dict (seeded with actuals < start_d)
    u_list: list[dict[int, float]] = [
        {d: v for d, v in sc.units_by_d.items() if d < start_d}
        for sc in series_configs
    ]

    # Collect 28 predictions per product
    all_preds: list[list[float]] = [[] for _ in range(n)]

    for t in range(start_d, start_d + HORIZON):
        cal_row = cal_indexed.loc[t]

        # Build one feature row per product for this day
        rows = [
            _build_row_fast(
                sc.series_id, t, cal_row,
                sc.last_price, sc.train_mean_price,
                u_list[i], wday_map, neutralize_events,
            )
            for i, sc in enumerate(series_configs)
        ]

        # Assemble N-row DataFrame and predict in one call
        x = pd.DataFrame(rows)[features]
        if categories:
            for c in categoricals:
                x[c] = pd.Categorical(
                    [str(r[c]) for r in rows],
                    categories=[str(z) for z in categories[c]],
                )
        else:
            for c in categoricals:
                x[c] = x[c].astype("category")

        if best_iteration:
            raw_yhats = model.predict(x, num_iteration=best_iteration)
        else:
            raw_yhats = model.predict(x)

        # Write predictions back into each product's u dict for next day's lags
        for i, sc in enumerate(series_configs):
            yhat = max(0.0, float(raw_yhats[i]) * sc.scale)
            u_list[i][t] = yhat
            all_preds[i].append(yhat)

    return all_preds


# ── convenience loaders (so callers run with just (series_id, start_d)) ────────

def forecast(series_id: str, start_d: int) -> list[float]:
    """Convenience wrapper: load all artifacts and run recursive_forecast."""
    model = load_model()
    feature_meta = load_feature_meta()
    data = load_series_daily()
    data["series_id"] = data["series_id"].astype(str)
    calendar = load_calendar_features()
    return recursive_forecast(series_id, start_d, model, feature_meta, data, calendar)


# ── golden fixture generator (03 §7, 07 §2) ───────────────────────────────────

def generate_golden() -> list[float]:
    """Generate backend/tests/golden/expected_turkey_1300.json ONCE (03 §7).

    Run from backend/:  python -m app.ml.forecast_engine --generate-golden
    Then commit the file.
    """
    preds = forecast("turkey", 1300)
    rounded = [round(v, 6) for v in preds]
    GOLDEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(GOLDEN_PATH, "w", encoding="utf-8") as fh:
        json.dump(rounded, fh, indent=2)
    print(f"[MT-15] wrote {GOLDEN_PATH} (len={len(rounded)})")
    return preds


if __name__ == "__main__":
    ap = argparse.ArgumentParser(
        description="MT-15 recursive forecast engine (03_ALGORITHM_SPEC §4)"
    )
    ap.add_argument(
        "--generate-golden", action="store_true",
        help="write expected_turkey_1300.json (run once, then commit)",
    )
    args = ap.parse_args()
    if args.generate_golden:
        generate_golden()
    else:
        result = forecast("turkey", 1300)
        print(result)
