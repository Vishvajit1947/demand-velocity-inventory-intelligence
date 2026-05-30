"""Feature engineering — the SINGLE source of feature definitions, used by BOTH training
(batch) and the recursive forecast (single-row), so they can never drift.
docs/03_ALGORITHM_SPEC.md sec 3.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from app.ml.calendar_features import load_calendar

FEATURES = [
    "series_id", "wday", "month", "year", "day_of_month", "week_of_year", "is_weekend", "snap_count",
    "event_name_1", "event_type_1", "event_name_2", "event_type_2", "is_event",
    "days_to_next_event", "days_since_last_event", "sell_price", "price_rel",
    "lag_1", "lag_7", "lag_14", "lag_28",
    "roll_mean_7", "roll_mean_28", "roll_std_7", "roll_std_28", "roll_mean_7_by_wday",
]
CATEGORICAL_FEATURES = ["series_id", "wday", "month",
                        "event_name_1", "event_type_1", "event_name_2", "event_type_2"]

# calendar columns merged onto each (series, day)
_CAL_COLS = ["wday", "month", "year", "day_of_month", "week_of_year", "is_weekend", "snap_count",
             "event_name_1", "event_type_1", "event_name_2", "event_type_2", "is_event",
             "days_to_next_event", "days_since_last_event"]


def train_mean_prices(series_daily: pd.DataFrame, train_end_d: int) -> dict[str, float]:
    tm = (series_daily[series_daily["d_index"] <= train_end_d]
          .groupby("series_id", observed=True)["sell_price"].mean())
    return {s: (float(v) if v and not np.isnan(v) else 1.0) for s, v in tm.items()}


def build_feature_matrix(series_daily: pd.DataFrame, train_end_d: int) -> pd.DataFrame:
    """Batch feature matrix for ALL (series, day). Keeps `units` and `d_index` for the caller
    to filter/split. Calendar features come from calendar.csv via load_calendar()."""
    cal = load_calendar()
    df = series_daily.copy()
    df["series_id"] = df["series_id"].astype(str)
    df = df.sort_values(["series_id", "d_index"])
    tmean = train_mean_prices(series_daily, train_end_d)
    df["price_rel"] = df.apply(lambda r: r["sell_price"] / tmean[r["series_id"]], axis=1)

    df = df.drop(columns=[c for c in _CAL_COLS if c in df.columns]).merge(
        cal[_CAL_COLS], left_on="d_index", right_index=True, how="left")

    g = df.groupby("series_id", observed=True)["units"]
    for k in (1, 7, 14, 28):
        df[f"lag_{k}"] = g.shift(k)
    s1 = g.shift(1)
    df["roll_mean_7"] = s1.rolling(7).mean().reset_index(level=0, drop=True)
    df["roll_mean_28"] = s1.rolling(28).mean().reset_index(level=0, drop=True)
    df["roll_std_7"] = s1.rolling(7).std(ddof=0).reset_index(level=0, drop=True)
    df["roll_std_28"] = s1.rolling(28).std(ddof=0).reset_index(level=0, drop=True)
    df["roll_mean_7_by_wday"] = (g.shift(7) + g.shift(14) + g.shift(21) + g.shift(28)) / 4.0
    return df


def as_lgb_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Select FEATURES in canonical order with categorical dtype."""
    X = df[FEATURES].copy()
    for c in CATEGORICAL_FEATURES:
        X[c] = X[c].astype("category")
    return X


def build_single_row(series_id: str, d: int, units_hist: dict[int, float],
                     sell_price: float, train_mean_price: float,
                     neutralize_events: bool = False) -> dict:
    """One feature row for the recursive forecast. `units_hist` maps d_index -> units for days
    already known (actuals + previously predicted horizon days). Matches build_feature_matrix."""
    c = load_calendar().loc[d]
    u = units_hist
    if neutralize_events:
        en1 = et1 = en2 = et2 = "none"; isev = 0; dtn = dsl = 28
    else:
        en1, et1, en2, et2 = c["event_name_1"], c["event_type_1"], c["event_name_2"], c["event_type_2"]
        isev, dtn, dsl = int(c["is_event"]), int(c["days_to_next_event"]), int(c["days_since_last_event"])
    w7 = [u.get(d - i, 0.0) for i in range(1, 8)]
    w28 = [u.get(d - i, 0.0) for i in range(1, 29)]
    return {
        "series_id": series_id, "wday": int(c["wday"]), "month": int(c["month"]), "year": int(c["year"]),
        "day_of_month": int(c["day_of_month"]), "week_of_year": int(c["week_of_year"]),
        "is_weekend": int(c["is_weekend"]), "snap_count": int(c["snap_count"]),
        "event_name_1": en1, "event_type_1": et1, "event_name_2": en2, "event_type_2": et2,
        "is_event": isev, "days_to_next_event": dtn, "days_since_last_event": dsl,
        "sell_price": float(sell_price), "price_rel": float(sell_price / train_mean_price) if train_mean_price else 1.0,
        "lag_1": u.get(d - 1, 0.0), "lag_7": u.get(d - 7, 0.0),
        "lag_14": u.get(d - 14, 0.0), "lag_28": u.get(d - 28, 0.0),
        "roll_mean_7": float(np.mean(w7)), "roll_mean_28": float(np.mean(w28)),
        "roll_std_7": float(np.std(w7)), "roll_std_28": float(np.std(w28)),
        "roll_mean_7_by_wday": float(np.mean([u.get(d - 7, 0.0), u.get(d - 14, 0.0),
                                              u.get(d - 21, 0.0), u.get(d - 28, 0.0)])),
    }


def row_to_frame(row: dict, categories: dict[str, list]) -> pd.DataFrame:
    """Single-row dict -> 1-row DataFrame with categorical dtypes matching training categories."""
    X = pd.DataFrame([row])[FEATURES]
    for c in CATEGORICAL_FEATURES:
        X[c] = pd.Categorical([str(row[c])], categories=[str(z) for z in categories[c]])
    return X
