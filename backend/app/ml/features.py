"""MT-12 — build_features(): series_daily -> model feature matrix.

Pure function (no FastAPI imports). Implements 03_ALGORITHM_SPEC.md §3.1-§3.6 exactly:
canonical FEATURES order, category dtypes, strictly-backward (leakage-free) lag/rolling windows.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.config import TRAIN_END_D, TRAIN_START_D
from app.ml.calendar_features import add_event_distance, load_calendar

# ---------------------------------------------------------------------------
# 03_ALGORITHM_SPEC.md §3.6 — canonical ordered feature list (verbatim).
# ---------------------------------------------------------------------------
FEATURES = [
    "series_id", "wday", "month", "year", "day_of_month", "week_of_year",
    "is_weekend", "snap_count",
    "event_name_1", "event_type_1", "event_name_2", "event_type_2", "is_event",
    "days_to_next_event", "days_since_last_event", "sell_price", "price_rel",
    "lag_1", "lag_7", "lag_14", "lag_28",
    "roll_mean_7", "roll_mean_28", "roll_std_7", "roll_std_28",
    "roll_mean_7_by_wday",
]

# 03_ALGORITHM_SPEC.md §3.6 — categorical subset (verbatim).
CATEGORICAL_FEATURES = [
    "series_id", "wday", "month",
    "event_name_1", "event_type_1", "event_name_2", "event_type_2",
]

LAGS = [1, 7, 14, 28]
ROLL_WINDOWS = [7, 28]
WDAY_OCCURRENCES = 4  # roll_mean_7_by_wday: last 4 same-wday values (03 §3.5)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _add_calendar_derived(df: pd.DataFrame) -> pd.DataFrame:
    """day_of_month, week_of_year, is_weekend, is_event (03 §3.2/§3.3)."""
    out = df.copy()
    dt = pd.to_datetime(out["date"])
    out["day_of_month"] = dt.dt.day.astype("int16")
    out["week_of_year"] = dt.dt.isocalendar().week.astype("int16")
    out["is_weekend"] = out["wday"].isin([1, 2]).astype("int8")
    out["is_event"] = (out["event_name_1"].astype(str) != "none").astype("int8")
    return out


def _add_event_distance(df: pd.DataFrame) -> pd.DataFrame:
    """Join days_to_next_event / days_since_last_event by d_index (03 §3.3, MT-11).

    load_calendar() returns a DataFrame indexed by d_index; add_event_distance() resets it
    to a plain column DataFrame so we can merge on 'd_index'.
    """
    cal_indexed = load_calendar()
    # add_event_distance accepts either indexed or plain — normalises internally.
    cal_plain = add_event_distance(cal_indexed)
    dist = cal_plain[["d_index", "days_to_next_event", "days_since_last_event"]]
    out = df.merge(dist, on="d_index", how="left")
    out["days_to_next_event"] = out["days_to_next_event"].astype("int16")
    out["days_since_last_event"] = out["days_since_last_event"].astype("int16")
    return out


def _add_price_rel(df: pd.DataFrame) -> pd.DataFrame:
    """price_rel = sell_price / series TRAIN-mean price; 1.0 if mean is 0/NaN (03 §3.4)."""
    out = df.copy()
    # Cast to plain string so .map() returns a plain float Series (not categorical).
    sid_str = out["series_id"].astype(str)
    train_mask = (out["d_index"] >= TRAIN_START_D) & (out["d_index"] <= TRAIN_END_D)
    train_mean = (
        out.loc[train_mask]
        .assign(_sid=sid_str[train_mask])
        .groupby("_sid")["sell_price"]
        .mean()
        .astype("float64")
    )
    mean_map = sid_str.map(train_mean).astype("float64")
    sell = out["sell_price"].astype("float64")
    safe_mean = mean_map.where((mean_map.notna()) & (mean_map != 0.0))
    out["price_rel"] = (sell / safe_mean).fillna(1.0).astype("float32")
    return out


def _add_lags_and_rolls(df: pd.DataFrame) -> pd.DataFrame:
    """Strictly-backward lag/rolling features per series (03 §3.5). No same-day leakage."""
    out = df.sort_values(["series_id", "d_index"]).reset_index(drop=True).copy()

    # --- Lags: u.shift(k) per series ---
    for k in LAGS:
        out[f"lag_{k}"] = (
            out.groupby("series_id", observed=True)["units"]
            .shift(k)
            .astype("float32")
        )

    # --- Rolling mean/std: window ends at t-1, i.e. shift(1) then rolling(w) ---
    # We compute per-series using apply to keep correct group boundaries.
    for w in ROLL_WINDOWS:
        roll_mean = np.empty(len(out), dtype="float32")
        roll_std = np.empty(len(out), dtype="float32")
        roll_mean[:] = np.nan
        roll_std[:] = np.nan

        for sid, grp_idx in out.groupby("series_id", observed=True).groups.items():
            u = out.loc[grp_idx, "units"].values.astype("float64")
            n = len(u)
            m = np.empty(n, dtype="float32")
            s = np.empty(n, dtype="float32")
            m[:] = np.nan
            s[:] = np.nan
            for i in range(n):
                # window = u[max(0, i-w) .. i-1]  (strictly backward, min 1 element)
                if i == 0:
                    # no history at all
                    m[i] = np.nan
                    s[i] = np.nan
                else:
                    start = max(0, i - w)
                    window = u[start:i]
                    if len(window) >= 1:
                        m[i] = float(np.mean(window))
                        std_val = float(np.std(window))  # population std (ddof=0)
                        s[i] = std_val if not np.isnan(std_val) else 0.0
                    else:
                        m[i] = np.nan
                        s[i] = np.nan
            roll_mean[grp_idx] = m
            roll_std[grp_idx] = s

        out[f"roll_mean_{w}"] = roll_mean
        out[f"roll_std_{w}"] = roll_std

    # --- roll_mean_7_by_wday: mean of last WDAY_OCCURRENCES same-wday values before t ---
    # Per (series_id, wday): shift(1) then rolling(4).mean() on the sub-series.
    wday_roll = np.empty(len(out), dtype="float32")
    wday_roll[:] = np.nan

    for (sid, wd), grp_idx in out.groupby(
        ["series_id", "wday"], observed=True, sort=True
    ).groups.items():
        # grp_idx is sorted by the groupby; ensure d_index order within the group
        idx_sorted = out.loc[grp_idx].sort_values("d_index").index
        u = out.loc[idx_sorted, "units"].values.astype("float64")
        n = len(u)
        res = np.empty(n, dtype="float32")
        res[:] = np.nan
        for i in range(n):
            if i == 0:
                res[i] = np.nan  # no prior same-wday observation
            else:
                start = max(0, i - WDAY_OCCURRENCES)
                window = u[start:i]  # up to 4 values, strictly before t
                if len(window) >= 1:
                    res[i] = float(np.mean(window))
        # Map back to original positions in `out`
        for pos, orig_idx in enumerate(idx_sorted):
            wday_roll[orig_idx] = res[pos]

    out["roll_mean_7_by_wday"] = wday_roll
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Build the model feature matrix from series_daily (03_ALGORITHM_SPEC.md §3).

    Returns columns == FEATURES (in order) plus a trailing helper `d_index`. Categorical
    features are pandas `category` dtype. Lag/rolling windows are strictly backward (no
    leakage); early rows (d_index < 29) carry NaN windows and are filtered out by MT-13.
    """
    work = df.sort_values(["series_id", "d_index"]).reset_index(drop=True).copy()
    work = _add_calendar_derived(work)
    work = _add_event_distance(work)
    work = _add_price_rel(work)
    work = _add_lags_and_rolls(work)

    # Numeric dtype hygiene for non-categorical calendar features.
    work["year"] = work["year"].astype("int16")
    work["snap_count"] = work["snap_count"].astype("int8")
    work["sell_price"] = work["sell_price"].astype("float32")

    # Categorical dtypes (03 §3.6).
    for col in CATEGORICAL_FEATURES:
        work[col] = work[col].astype("category")

    out = work[FEATURES + ["d_index"]].reset_index(drop=True)
    return out


# ---------------------------------------------------------------------------
# CLI smoke-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    from app.ml.data_prep import OUTPUT_PARQUET

    _df = pd.read_parquet(OUTPUT_PARQUET, engine="pyarrow")
    _feat = build_features(_df)
    print(f"features: {len(_feat)} rows, {len(FEATURES)} feature cols (+ d_index)")
    print(list(_feat.columns))


# ---------------------------------------------------------------------------
# Single-row helpers for the recursive forecast (MT-15, forecast_engine.py).
# These are not part of the MT-12 batch contract but live here so that training
# and inference share the exact same feature definitions.
# ---------------------------------------------------------------------------

def build_single_row(series_id: str, d: int, units_hist: dict[int, float],
                     sell_price: float, train_mean_price: float,
                     neutralize_events: bool = False) -> dict:
    """One feature row for the recursive forecast.

    `units_hist` maps d_index -> units for days already known (actuals + previously
    predicted horizon days). Matches the rolling/lag logic in build_features.
    """
    cal = load_calendar()
    c = cal.loc[d]
    u = units_hist
    if neutralize_events:
        en1 = et1 = en2 = et2 = "none"
        isev = 0
        dtn = dsl = 28
    else:
        en1 = str(c["event_name_1"])
        et1 = str(c["event_type_1"])
        en2 = str(c["event_name_2"])
        et2 = str(c["event_type_2"])
        isev = int(c["is_event"])
        dtn = int(c["days_to_next_event"])
        dsl = int(c["days_since_last_event"])

    w7 = [u.get(d - i, 0.0) for i in range(1, 8)]
    w28 = [u.get(d - i, 0.0) for i in range(1, 29)]
    # roll_mean_7_by_wday: mean of last 4 occurrences of same wday strictly before t.
    wday = int(c["wday"])
    wday_vals = [u.get(d - 7 * k, 0.0) for k in range(1, WDAY_OCCURRENCES + 1)]
    return {
        "series_id": series_id,
        "wday": wday,
        "month": int(c["month"]),
        "year": int(c["year"]),
        "day_of_month": int(c["day_of_month"]),
        "week_of_year": int(c["week_of_year"]),
        "is_weekend": int(c["is_weekend"]),
        "snap_count": int(c["snap_count"]),
        "event_name_1": en1, "event_type_1": et1,
        "event_name_2": en2, "event_type_2": et2,
        "is_event": isev,
        "days_to_next_event": dtn,
        "days_since_last_event": dsl,
        "sell_price": float(sell_price),
        "price_rel": float(sell_price / train_mean_price) if train_mean_price else 1.0,
        "lag_1": u.get(d - 1, 0.0),
        "lag_7": u.get(d - 7, 0.0),
        "lag_14": u.get(d - 14, 0.0),
        "lag_28": u.get(d - 28, 0.0),
        "roll_mean_7": float(np.mean(w7)),
        "roll_mean_28": float(np.mean(w28)),
        "roll_std_7": float(np.std(w7)),       # population std (ddof=0)
        "roll_std_28": float(np.std(w28)),
        "roll_mean_7_by_wday": float(np.mean(wday_vals)),
    }


def row_to_frame(row: dict, categories: dict[str, list]) -> pd.DataFrame:
    """Single-row dict -> 1-row DataFrame with categorical dtypes matching training."""
    X = pd.DataFrame([row])[FEATURES]
    for c in CATEGORICAL_FEATURES:
        X[c] = pd.Categorical([str(row[c])], categories=[str(z) for z in categories[c]])
    return X
