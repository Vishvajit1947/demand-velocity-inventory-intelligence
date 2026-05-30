# MT-12 — Feature Engineering `build_features()` (`features.py`)

## 1. Context
Part of **Phase 1 — ML pipeline** (`MT-INDEX.md`); depends on MT-10 (`series_daily.parquet`) and
MT-11 (`calendar_features.py`). This module turns the long daily table into the model's feature
matrix in the **exact canonical column order** locked in `03_ALGORITHM_SPEC.md` §3.6, with the
right categorical dtypes. MT-13 (training) and MT-15 (forecast) both consume these columns, so the
order and dtypes are a hard contract. Every formula is already defined in `03_ALGORITHM_SPEC.md`
§3.1–§3.6 — this task implements them with **no new decisions**, computing all history windows
**strictly backward** (shifted) per series to avoid same-day leakage.

## 2. Prerequisites
- **Foundation docs:** `03_ALGORITHM_SPEC.md` (§3.1–§3.6 full feature list/formulas, the canonical
  `FEATURES` & `CATEGORICAL_FEATURES` lists, leakage rule), `02_DATA_SPEC.md` (§3 TRAIN range,
  §4 `series_daily` schema), `04_BACKEND_ARCHITECTURE.md` (§1 path, §2 purity, §6 deps),
  `07_TESTING_STRATEGY.md` (§2 conventions).
- **Tasks:** MT-10 done (`series_daily.parquet` columns available), MT-11 done
  (`calendar_features.add_event_distance` / `load_calendar` available).
- **Environment:** Python 3.11; `pandas==2.2.3`, `numpy==2.1.3`
  (`04_BACKEND_ARCHITECTURE.md` §6). Run from `backend/`.

## 3. Goal
Implement `backend/app/ml/features.py` exporting:
- Module constants `FEATURES` and `CATEGORICAL_FEATURES` **verbatim** from `03_ALGORITHM_SPEC.md`
  §3.6.
- `build_features(df: pd.DataFrame) -> pd.DataFrame` that returns a DataFrame whose columns are
  **exactly `FEATURES` in order**, with `CATEGORICAL_FEATURES` as pandas `category` dtype, and a
  retained `d_index` helper column for downstream filtering (see Design). Lag/rolling features are
  strictly backward (no same-day leakage); the target `units` is **not** a feature.

## 4. Design (locked decisions; cite foundation sections)
Cite `03_ALGORITHM_SPEC.md` §3 throughout; do not re-decide.

### 4.1 Input
`df` is `series_daily` (`02_DATA_SPEC.md` §4): one row per `(series_id, d_index)`, with `units`,
`sell_price`, `date`, `wday`, `month`, `year`, `snap_count`, the four event columns, etc.
`build_features` sorts by `["series_id", "d_index"]` and computes all per-series windows via
`groupby("series_id")`.

### 4.2 The canonical lists (verbatim — `03_ALGORITHM_SPEC.md` §3.6)
```python
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
```

### 4.3 Feature formulas (locked)
- **Identity:** `series_id` `[cat]` (`03` §3.1).
- **Calendar (`03` §3.2):** `wday` `[cat]`, `month` `[cat]`, `year` (int), `day_of_month` =
  `date.dt.day` (1–31), `week_of_year` = ISO week `date.dt.isocalendar().week` (1–53),
  `is_weekend` = 1 if `wday in {1,2}` else 0, `snap_count` (from `series_daily`). `wday`, `month`,
  `snap_count` are taken from `series_daily` (already correct); `day_of_month`/`week_of_year`/
  `is_weekend` derived from `date`.
- **Events (`03` §3.3):** `event_name_1/2`, `event_type_1/2` (already `"none"`-filled in
  `series_daily`), `is_event` = 1 if `event_name_1 != "none"` else 0, plus `days_to_next_event`
  and `days_since_last_event` joined from `calendar_features.add_event_distance(load_calendar())`
  by `d_index` (computed over the full calendar so values are consistent and capped at 28).
- **Price (`03` §3.4):** `sell_price` from `series_daily`. `price_rel` =
  `sell_price / mean(sell_price over that series' TRAIN days)` where TRAIN =
  `d_index in [TRAIN_START_D, TRAIN_END_D] = [1, 1095]` (`02_DATA_SPEC.md` §3). If the per-series
  TRAIN mean is 0 or NaN → `price_rel = 1.0` (`03` §3.4).
- **Lags (`03` §3.5), per series, strictly backward** — `u[t] = units`:
  - `lag_1 = u.shift(1)`, `lag_7 = u.shift(7)`, `lag_14 = u.shift(14)`, `lag_28 = u.shift(28)`.
- **Rolling (`03` §3.5), per series, strictly backward (window ends at `t-1`)** — implemented as
  `u.shift(1).rolling(w)`:
  - `roll_mean_7 = mean(u[t-7..t-1])`, `roll_mean_28 = mean(u[t-28..t-1])`.
  - `roll_std_7 = std(u[t-7..t-1])`, `roll_std_28 = std(u[t-28..t-1])` — **population** std
    (`ddof=0`); 0 if the window is constant (`03` §3.5 "population std; 0 if window all equal").
  - `roll_mean_7_by_wday` = mean of `u` on the **same `wday`** over the **last 4 occurrences before
    `t`** (`03` §3.5). Implemented per `(series_id, wday)` as `u.shift(1).rolling(4).mean()` on the
    wday-subseries (the 4 most recent same-wday days strictly before `t`).

### 4.4 Leakage rule (locked — `03` §3.5)
All lag/rolling windows use `t-1` and earlier (`.shift(1)` before any rolling). **No same-day
leakage.** For early TRAIN rows where a window extends before `d_1`, values are NaN; those rows
(`d_index < 29`) are excluded from **training** by MT-13 (`03` §2 split). `build_features` itself
does **not** drop rows — it returns NaN for those early windows and keeps every input row so MT-15
can index by `d_index`. The test asserts **no NaN for rows with `d_index >= 29`**.

### 4.5 Output shape (locked contract)
- Returned columns: **exactly `FEATURES` in order**, plus a trailing helper column **`d_index`**
  (and **`units`** is dropped — it is the target, not a feature). MT-13 selects `df[FEATURES]` and
  uses `d_index` to slice train/valid folds; keeping `d_index` is required so the leakage filter
  (`d_index >= 29`) and the fold split (`03` §2) can be applied downstream without re-joining.
- `CATEGORICAL_FEATURES` are `category` dtype; all other `FEATURES` are numeric.
- Determinism: pure function of `df`; no randomness.
- **Purity:** no FastAPI imports (`04` §2). Path `backend/app/ml/features.py` (`04` §1).

> NaN handling for categoricals: `wday`/`month` come straight from `series_daily` (no NaN). `month`
> is converted to category from its int values. The numeric lag/rolling NaNs in early rows are left
> as-is (LightGBM handles NaN natively; MT-13 filters `d_index >= 29` anyway).

## 5. Implementation (exact file paths from 04 §1; FULL runnable code)

### File: `backend/app/ml/features.py`
```python
"""MT-12 — build_features(): series_daily -> model feature matrix.

Pure function (no FastAPI imports). Implements 03_ALGORITHM_SPEC.md §3.1-§3.6 exactly:
canonical FEATURES order, category dtypes, strictly-backward (leakage-free) lag/rolling windows.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.config import TRAIN_END_D, TRAIN_START_D
from app.ml.calendar_features import add_event_distance, load_calendar

# 03_ALGORITHM_SPEC.md §3.6 — canonical ordered feature list (verbatim).
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
    """Join days_to_next_event / days_since_last_event by d_index (03 §3.3, MT-11)."""
    cal = add_event_distance(load_calendar())
    dist = cal[["d_index", "days_to_next_event", "days_since_last_event"]]
    out = df.merge(dist, on="d_index", how="left")
    out["days_to_next_event"] = out["days_to_next_event"].astype("int16")
    out["days_since_last_event"] = out["days_since_last_event"].astype("int16")
    return out


def _add_price_rel(df: pd.DataFrame) -> pd.DataFrame:
    """price_rel = sell_price / series TRAIN-mean price; 1.0 if mean is 0/NaN (03 §3.4)."""
    out = df.copy()
    train_mask = (out["d_index"] >= TRAIN_START_D) & (out["d_index"] <= TRAIN_END_D)
    train_mean = (
        out.loc[train_mask]
        .groupby("series_id", observed=True)["sell_price"]
        .mean()
    )
    mean_map = out["series_id"].map(train_mean)
    safe_mean = mean_map.where((mean_map.notna()) & (mean_map != 0.0))
    out["price_rel"] = (out["sell_price"] / safe_mean).fillna(1.0).astype("float32")
    return out


def _add_lags_and_rolls(df: pd.DataFrame) -> pd.DataFrame:
    """Strictly-backward lag/rolling features per series (03 §3.5). No same-day leakage."""
    out = df.sort_values(["series_id", "d_index"]).reset_index(drop=True).copy()
    g = out.groupby("series_id", observed=True)["units"]

    for k in LAGS:
        out[f"lag_{k}"] = g.shift(k).astype("float32")

    shifted = g.shift(1)  # window ends at t-1 -> strictly backward
    for w in ROLL_WINDOWS:
        roll = shifted.groupby(out["series_id"], observed=True).rolling(w, min_periods=1)
        out[f"roll_mean_{w}"] = roll.mean().reset_index(level=0, drop=True).astype("float32")
        # population std (ddof=0); 0 when the window is constant / single value.
        std = roll.std(ddof=0).reset_index(level=0, drop=True)
        out[f"roll_std_{w}"] = std.fillna(0.0).astype("float32")

    # roll_mean_7_by_wday: mean of last 4 same-wday values strictly before t (03 §3.5).
    by_wday = out.groupby(["series_id", "wday"], observed=True)["units"].shift(1)
    out["roll_mean_7_by_wday"] = (
        by_wday.groupby([out["series_id"], out["wday"]], observed=True)
        .rolling(WDAY_OCCURRENCES, min_periods=1)
        .mean()
        .reset_index(level=[0, 1], drop=True)
        .astype("float32")
    )
    return out


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Build the model feature matrix from series_daily (03_ALGORITHM_SPEC.md §3).

    Returns columns == FEATURES (in order) plus a trailing helper `d_index`. Categorical
    features are pandas `category` dtype. Lag/rolling windows are strictly backward (no leakage);
    early rows (d_index < 29) carry NaN windows and are filtered out by MT-13.
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


if __name__ == "__main__":
    from app.ml.data_prep import OUTPUT_PARQUET

    _df = pd.read_parquet(OUTPUT_PARQUET, engine="pyarrow")
    _feat = build_features(_df)
    print(f"features: {len(_feat)} rows, {len(FEATURES)} feature cols (+ d_index)")
    print(list(_feat.columns))
```

> `np` is part of the pinned environment (`04` §6) and available to maintainers extending this
> module; current logic uses pandas vector ops. The `roll().std(ddof=0)` of a single-element window
> yields NaN, which we map to 0.0 per `03` §3.5 ("0 if window all equal").

## 6. Tests / Verification (exact pytest tests + commands)

### File: `backend/tests/test_features.py`
Deterministic and offline — reads the **committed** `series_daily.parquet`
(`04_BACKEND_ARCHITECTURE.md` §7), so this test is **not** skipped.

```python
"""MT-12 tests — build_features() contract & leakage (03_ALGORITHM_SPEC §3)."""
import pandas as pd
import pytest

from app.ml.data_prep import OUTPUT_PARQUET
from app.ml.features import CATEGORICAL_FEATURES, FEATURES, build_features


@pytest.fixture(scope="module")
def series_daily() -> pd.DataFrame:
    return pd.read_parquet(OUTPUT_PARQUET, engine="pyarrow")


@pytest.fixture(scope="module")
def feats(series_daily: pd.DataFrame) -> pd.DataFrame:
    return build_features(series_daily)


def test_columns_exact_order(feats: pd.DataFrame):
    # FEATURES in exact order, with d_index helper trailing; units (target) not present.
    assert list(feats.columns) == FEATURES + ["d_index"]
    assert "units" not in feats.columns


def test_categoricals_are_category_dtype(feats: pd.DataFrame):
    for col in CATEGORICAL_FEATURES:
        assert str(feats[col].dtype) == "category", col


def test_non_categoricals_are_numeric(feats: pd.DataFrame):
    numeric = [c for c in FEATURES if c not in CATEGORICAL_FEATURES]
    for col in numeric:
        assert pd.api.types.is_numeric_dtype(feats[col]), col


def test_lag1_equals_prev_units_no_same_day_leakage(series_daily: pd.DataFrame,
                                                    feats: pd.DataFrame):
    # For a known series, lag_1 at day t must equal actual units at t-1 (strictly backward).
    sd = series_daily[series_daily["series_id"] == "turkey"].sort_values("d_index")
    units_by_d = dict(zip(sd["d_index"].tolist(), sd["units"].tolist()))

    f = feats.copy()
    f["series_id"] = f["series_id"].astype(str)
    ft = f[f["series_id"] == "turkey"].sort_values("d_index").reset_index(drop=True)

    # Re-attach d_index already present; check several interior days.
    for t in (30, 100, 500, 1300, 1941):
        row = ft[ft["d_index"] == t]
        if row.empty:
            continue
        expected = units_by_d.get(t - 1)
        got = float(row["lag_1"].iloc[0])
        assert got == pytest.approx(expected, abs=1e-6), f"lag_1 mismatch at d={t}"


def test_no_nan_for_rows_with_d_index_ge_29(feats: pd.DataFrame):
    rows = feats[feats["d_index"] >= 29]
    bad = rows[FEATURES].isna().sum()
    assert bad.sum() == 0, f"NaN present in d_index>=29 rows:\n{bad[bad > 0]}"


def test_early_rows_may_have_nan_windows(feats: pd.DataFrame):
    # Sanity: lag_28 at d_index==1 is undefined (no day -27) -> NaN. Confirms backward windows.
    early = feats[feats["d_index"] == 1]
    assert early["lag_28"].isna().all()


def test_roll_std_population_nonneg(feats: pd.DataFrame):
    rows = feats[feats["d_index"] >= 29]
    assert (rows["roll_std_7"] >= 0).all()
    assert (rows["roll_std_28"] >= 0).all()


def test_is_event_matches_event_name(feats: pd.DataFrame):
    en = feats["event_name_1"].astype(str)
    assert ((en != "none").astype(int) == feats["is_event"]).all()
```

### Commands
```bash
cd backend
pytest -q tests/test_features.py
```

## 7. Acceptance checklist
- [ ] `backend/app/ml/features.py` exists at the exact path (`04` §1), **no FastAPI imports**.
- [ ] `FEATURES` and `CATEGORICAL_FEATURES` match `03_ALGORITHM_SPEC.md` §3.6 **verbatim**.
- [ ] `build_features(df)` returns columns **exactly `FEATURES` in order** (+ trailing `d_index`);
      `units` (target) is not a feature.
- [ ] `CATEGORICAL_FEATURES` are `category` dtype; all other features numeric.
- [ ] `lag_1` at day `t` equals `units` at `t-1` for a known series (no same-day leakage);
      all lag/rolling windows are strictly backward (`.shift(1)` before rolling).
- [ ] `roll_std_7/28` use **population** std (`ddof=0`), 0 for constant windows.
- [ ] `roll_mean_7_by_wday` = mean of last 4 same-`wday` values strictly before `t`.
- [ ] `price_rel` uses the per-series **TRAIN** mean (`d_index ∈ [1, 1095]`), 1.0 if mean 0/NaN.
- [ ] No NaN in any `FEATURES` column for rows with `d_index >= 29`.
- [ ] `tests/test_features.py` passes (offline, deterministic, not skipped).
