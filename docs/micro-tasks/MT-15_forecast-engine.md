# MT-15 — Recursive Forecast Engine + Golden Test

## 1. Context
Phase 1 of the ML pipeline (`MT-INDEX.md`, depends on **MT-13**). Implements the locked
recursive 28-day forecast of `03_ALGORITHM_SPEC.md` §4: starting from a user-chosen day
`start_d`, seed lags from real history, predict day-by-day, feed each prediction back so the
next day's lag/rolling features see it, clip negatives at 0, and return 28 floats.

This is the engine every metric (MT-16..19) and the API (MT-23) sits on. It is guarded by the
**golden anti-drift test** (`03` §7, `07` §2): `recursive_forecast("turkey", 1300)` must match a
committed `expected_turkey_1300.json` within `1e-6`.

## 2. Prerequisites
- Read and obey: `03_ALGORITHM_SPEC.md` §3 (feature formulas), §4 (recursive pseudocode — the
  spine of this task), §6.5 (a counterfactual variant uses this engine); `02_DATA_SPEC.md` §3
  (selectable range), §4 (`series_daily.parquet` schema), §1 (`d_1 = 2011-01-29`, `wday`
  convention); `04_BACKEND_ARCHITECTURE.md` §1 (paths), §2 (ml/* are pure functions), §6 (deps);
  `07_TESTING_STRATEGY.md` §2 (golden test).
- **MT-13** produced `backend/app/models/model.pkl` (pickled `Booster`) and
  `feature_meta.json` (`{"features", "categorical_features", "best_iteration"}`).
- **MT-11** produced `backend/app/ml/calendar_features.py` exposing `load_calendar()` +
  `add_event_distance()` (full `d_1..d_1969` table with `d_index, date, wday, month, year,
  snap_count, is_weekend, event_name_1/2, event_type_1/2, days_to_next_event,
  days_since_last_event`). The loader below wraps it and derives the three remaining `§3.2/§3.3`
  columns (`day_of_month`, `week_of_year`, `is_event`). If MT-11 is absent, it builds the whole
  table directly from `data/raw/calendar.csv` (committed, always available — `04` §7).
- Python **3.11**, `lightgbm==4.5.0`, `pandas==2.2.3`, `numpy==2.1.3`, `pyarrow==18.1.0`
  (`04` §6). Run from `backend/`.

## 3. Goal
Implement, in `backend/app/ml/forecast_engine.py`:
```python
def recursive_forecast(series_id, start_d, model, feature_meta, data, calendar) -> list[float]
```
returning **28** non-negative floats for days `[start_d .. start_d+27]`, following `03` §4
exactly. Provide loader/build helpers so callers (and the golden generator) can run it with just
`(series_id, start_d)`. Provide a script that generates the committed golden fixture
`backend/tests/golden/expected_turkey_1300.json` **once**.

## 4. Design (locked decisions; cite foundation sections)

### 4.1 Inputs (kept pure — `04` §2)
- `model`: a LightGBM `Booster` (from `model.pkl`).
- `feature_meta`: dict with `features` (= `FEATURES` order, `03` §3.6),
  `categorical_features`, `best_iteration` (used as `num_iteration` in `predict`, MT-13).
- `data`: the `series_daily` DataFrame (`02` §4) — source of **actual `units`** and historical
  `sell_price`.
- `calendar`: per-day calendar/event feature table covering all of `d_1 … d_1969`
  (`03` §3.2/§3.3), so horizon days are fully covered. Columns:
  `d_index, wday, month, year, day_of_month, week_of_year, is_weekend, snap_count,
  event_name_1, event_type_1, event_name_2, event_type_2, is_event,
  days_to_next_event, days_since_last_event`.

### 4.2 Precondition (`03` §4, `02` §3)
`FIRST_SELECTABLE_D (=1096) <= start_d <= LAST_SELECTABLE_D (=1914)`. Raise `ValueError`
otherwise.

### 4.3 Seeding & price (`03` §4 steps 1–2, §3.4)
- `u` = dict `{d_index: float(units)}` of **actuals** for this series at all `d_index < start_d`.
- `last_price` = `sell_price` at the largest `d_index <= start_d-1` that has a (non-NaN) price
  (forward fill of last known price). The series' processed `sell_price` is already fill-handled
  (`02` §4), so this is just the value at `start_d-1`.
- `series_train_mean_price` = mean of `sell_price` over the series' **TRAIN** days
  (`d_index <= 1095`, `02` §3). Used for `price_rel` (`03` §3.4). If `0`/NaN → `price_rel = 1.0`.

### 4.4 Per-day feature row (`03` §3 — computed directly; explicitly allowed by the task)
For each day `t` in `[start_d .. start_d+27]` build a single-row frame in `FEATURES` order:
- **Identity** (`§3.1`): `series_id`.
- **Calendar** (`§3.2`) and **Events** (`§3.3`): copied from `calendar` for day `t` (covers the
  horizon; `days_to/since_event` precomputed over the full calendar).
- **Price** (`§3.4`): `sell_price = last_price`; `price_rel = last_price /
  series_train_mean_price` (or `1.0`).
- **Lags/rolling** (`§3.5`) from `u`, looking **strictly backward** (`t-1` and earlier;
  predictions already written to `u` participate):
  - `lag_1=u[t-1]`, `lag_7=u[t-7]`, `lag_14=u[t-14]`, `lag_28=u[t-28]`.
  - `roll_mean_7 = mean(u[t-7..t-1])`, `roll_mean_28 = mean(u[t-28..t-1])`.
  - `roll_std_7 = std(u[t-7..t-1])`, `roll_std_28 = std(u[t-28..t-1])` — **population** std
    (`ddof=0`); `0.0` if window all equal (`03` §3.5).
  - `roll_mean_7_by_wday` = mean of `u` on the **same `wday`** as day `t` over the **last 4
    occurrences before `t`** (`03` §3.5).
  - Because `start_d >= 1096` all windows reference defined values (`03` §3.5 note); `u` always
    holds the needed actuals/preds. `lag_k = u[t-k]` directly (no missing keys).

> The formulas above are byte-for-byte the same definitions `features.py` (MT-12) uses for the
> training matrix; computing the per-day row directly avoids recomputing the whole frame while
> matching `§3` exactly (the task permits this, provided the formulas match).

### 4.5 Predict loop (`03` §4 steps 3–5)
```
preds = []
for t in start_d .. start_d+27:
    x = ordered FEATURES row (categoricals as 'category' dtype)
    yhat = float(model.predict(x, num_iteration=best_iteration)[0])
    yhat = max(0.0, yhat)        # clip negatives
    u[t] = yhat                  # feed back for next day's lags
    preds.append(yhat)
return preds                     # length 28, floats
```
- Determinism (`03` §4, §7): `predict` is deterministic ⇒ same `(series_id, start_d)` ⇒ same
  vector. No randomness here.
- Christmas inside the horizon is **not** special-cased (`03` §4 note).

### 4.6 Categorical dtype alignment
Cast the categorical columns (`feature_meta["categorical_features"]`) to pandas `category`
dtype on the single-row frame. LightGBM matches categories by their string/code value, so a
single-row category column is sufficient for deterministic prediction (the same values seen in
training map identically).

### 4.7 Convenience loaders (so callers run with just `(series_id, start_d)`)
- `load_model()` → `pickle.load(model.pkl)`; `load_feature_meta()` → json.
- `load_series_daily()` → parquet (`02` §4).
- `load_calendar_features()` → MT-11's table if importable, else built here from
  `data/raw/calendar.csv` per `03` §3.2/§3.3 (full `d_1..d_1969`).
- `forecast(series_id, start_d)` → wires all five and calls `recursive_forecast`.

### 4.8 Golden fixture (`03` §7, `07` §2)
A generator script writes `backend/tests/golden/expected_turkey_1300.json` =
`recursive_forecast("turkey", 1300)` **once**, then it is committed. The golden test re-runs the
engine and asserts equality within `abs=1e-6`.

## 5. Implementation (exact file paths from 04 §1; FULL runnable code)

### `backend/app/ml/forecast_engine.py`
```python
"""MT-15 — Recursive 28-day forecast engine (03_ALGORITHM_SPEC §4).

Pure functions (04 §2): no FastAPI, no globals. The single-day feature row is
built directly here using the exact §3 formulas (same definitions as features.py).

Run the golden-fixture generator from backend/:
    python -m app.ml.forecast_engine --generate-golden
"""
from __future__ import annotations

import argparse
import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from app.config import (
    FIRST_SELECTABLE_D,
    LAST_SELECTABLE_D,
    HORIZON,
    TRAIN_END_D,
)

# Canonical feature order (03 §3.6). feature_meta["features"] is authoritative at
# runtime; this constant documents the expected layout and is used as a fallback.
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

NO_EVENT = "none"  # 02 §4

# ── paths (04 §1, §7) ──────────────────────────────────────────────────────────
_REPO_ROOT = Path(__file__).resolve().parents[3]
MODEL_PATH = _REPO_ROOT / "backend" / "app" / "models" / "model.pkl"
FEATURE_META_PATH = _REPO_ROOT / "backend" / "app" / "models" / "feature_meta.json"
SERIES_DAILY_PATH = _REPO_ROOT / "data" / "processed" / "series_daily.parquet"
CALENDAR_CSV_PATH = _REPO_ROOT / "data" / "raw" / "calendar.csv"
GOLDEN_PATH = _REPO_ROOT / "backend" / "tests" / "golden" / "expected_turkey_1300.json"

D1_DATE = pd.Timestamp("2011-01-29")  # 02 §1: d_1


# ── loaders ────────────────────────────────────────────────────────────────────
def load_model():
    with open(MODEL_PATH, "rb") as fh:
        return pickle.load(fh)


def load_feature_meta() -> dict:
    return json.loads(FEATURE_META_PATH.read_text(encoding="utf-8"))


def load_series_daily() -> pd.DataFrame:
    return pd.read_parquet(SERIES_DAILY_PATH)


def load_calendar_features() -> pd.DataFrame:
    """Per-day calendar/event feature table for d_1..d_1969 (03 §3.2/§3.3).

    Prefer MT-11 (load_calendar + add_event_distance); derive the three remaining
    §3.2/§3.3 columns (day_of_month, week_of_year, is_event). Otherwise build the
    whole table from data/raw/calendar.csv (committed, 04 §7) so horizon days are
    covered.
    """
    try:
        from app.ml.calendar_features import load_calendar, add_event_distance  # MT-11
        cal = add_event_distance(load_calendar()).copy()
        cal["date"] = pd.to_datetime(cal["date"])
        iso = cal["date"].dt.isocalendar()
        cal["day_of_month"] = cal["date"].dt.day.astype("int64")
        cal["week_of_year"] = iso["week"].astype("int64")
        cal["is_event"] = (cal["event_name_1"] != NO_EVENT).astype("int64")
        return cal
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
        "is_weekend": cal["wday"].isin([1, 2]).astype("int64"),  # 1=Sat,2=Sun (02 §1)
        "snap_count": (cal["snap_CA"] + cal["snap_TX"] + cal["snap_WI"]).astype("int64"),
        "event_name_1": cal["event_name_1"].astype(str),
        "event_type_1": cal["event_type_1"].astype(str),
        "event_name_2": cal["event_name_2"].astype(str),
        "event_type_2": cal["event_type_2"].astype(str),
    })
    out["is_event"] = (out["event_name_1"] != NO_EVENT).astype("int64")

    # days_to_next_event / days_since_last_event over the full calendar, capped 28 (03 §3.3)
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


# ── per-day feature row (03 §3) ────────────────────────────────────────────────
def _wday_of(d_index: int) -> int:
    """wday 1..7 (1=Sat) for a d_index (02 §1)."""
    return int(((D1_DATE + pd.Timedelta(days=d_index - 1)).dayofweek + 2 - 1) % 7 + 1)


def _pop_std(vals: list[float]) -> float:
    """Population std (ddof=0); 0.0 if all equal / empty (03 §3.5)."""
    if not vals:
        return 0.0
    return float(np.std(np.asarray(vals, dtype="float64")))


def _lag_features(u: dict[int, float], t: int, cal_row: pd.Series) -> dict[str, float]:
    """Lag/rolling features for day t from u (03 §3.5), strictly backward."""
    win7 = [u[t - k] for k in range(1, 8)]
    win28 = [u[t - k] for k in range(1, 29)]

    # same-wday last 4 occurrences strictly before t
    wday_t = int(cal_row["wday"])
    same_wday: list[float] = []
    k = t - 1
    while k >= 1 and len(same_wday) < 4:
        if _wday_of(k) == wday_t:
            same_wday.append(u[k])
        k -= 1
    roll_wday = float(np.mean(same_wday)) if same_wday else 0.0

    return {
        "lag_1": u[t - 1], "lag_7": u[t - 7], "lag_14": u[t - 14], "lag_28": u[t - 28],
        "roll_mean_7": float(np.mean(win7)), "roll_mean_28": float(np.mean(win28)),
        "roll_std_7": _pop_std(win7), "roll_std_28": _pop_std(win28),
        "roll_mean_7_by_wday": roll_wday,
    }


def _build_row(series_id: str, t: int, cal_row: pd.Series,
               last_price: float, train_mean_price: float,
               u: dict[int, float]) -> dict:
    """Single-day feature dict in FEATURES semantics (03 §3)."""
    price_rel = 1.0
    if train_mean_price and np.isfinite(train_mean_price) and train_mean_price != 0.0:
        price_rel = float(last_price) / float(train_mean_price)

    row = {
        "series_id": series_id,
        "wday": int(cal_row["wday"]),
        "month": int(cal_row["month"]),
        "year": int(cal_row["year"]),
        "day_of_month": int(cal_row["day_of_month"]),
        "week_of_year": int(cal_row["week_of_year"]),
        "is_weekend": int(cal_row["is_weekend"]),
        "snap_count": int(cal_row["snap_count"]),
        "event_name_1": str(cal_row["event_name_1"]),
        "event_type_1": str(cal_row["event_type_1"]),
        "event_name_2": str(cal_row["event_name_2"]),
        "event_type_2": str(cal_row["event_type_2"]),
        "is_event": int(cal_row["is_event"]),
        "days_to_next_event": int(cal_row["days_to_next_event"]),
        "days_since_last_event": int(cal_row["days_since_last_event"]),
        "sell_price": float(last_price),
        "price_rel": float(price_rel),
    }
    row.update(_lag_features(u, t, cal_row))
    return row


# ── the engine (03 §4) ─────────────────────────────────────────────────────────
def recursive_forecast(series_id: str, start_d: int, model, feature_meta: dict,
                       data: pd.DataFrame, calendar: pd.DataFrame) -> list[float]:
    """Return 28 daily predictions for days [start_d .. start_d+27] (03 §4)."""
    if not (FIRST_SELECTABLE_D <= start_d <= LAST_SELECTABLE_D):
        raise ValueError(
            f"start_d={start_d} out of range "
            f"[{FIRST_SELECTABLE_D}, {LAST_SELECTABLE_D}] (02 §3)"
        )

    features = feature_meta["features"]
    categoricals = feature_meta["categorical_features"]
    best_iteration = feature_meta.get("best_iteration")

    s = data.loc[data["series_id"] == series_id].sort_values("d_index")
    if s.empty:
        raise ValueError(f"unknown series_id '{series_id}'")

    # step 1: actuals for d_index < start_d
    hist = s.loc[s["d_index"] < start_d]
    u: dict[int, float] = dict(
        zip(hist["d_index"].astype(int), hist["units"].astype(float))
    )

    # step 2: last known price <= start_d-1 (forward fill)
    price_hist = s.loc[(s["d_index"] <= start_d - 1) & s["sell_price"].notna()]
    last_price = float(price_hist["sell_price"].iloc[-1]) if not price_hist.empty else 0.0

    # series TRAIN-mean price for price_rel (03 §3.4)
    train_price = s.loc[s["d_index"] <= TRAIN_END_D, "sell_price"]
    train_mean_price = float(train_price.mean()) if not train_price.empty else float("nan")

    cal = calendar.set_index("d_index")

    preds: list[float] = []
    for t in range(start_d, start_d + HORIZON):
        cal_row = cal.loc[t]
        row = _build_row(series_id, t, cal_row, last_price, train_mean_price, u)

        x = pd.DataFrame([row])[features]
        for c in categoricals:
            x[c] = x[c].astype("category")

        if best_iteration:
            yhat = float(model.predict(x, num_iteration=best_iteration)[0])
        else:
            yhat = float(model.predict(x)[0])
        yhat = max(0.0, yhat)        # clip negatives (03 §4)
        u[t] = yhat                  # feed back for next day's lags
        preds.append(yhat)

    return preds


def forecast(series_id: str, start_d: int) -> list[float]:
    """Convenience wrapper: load all artifacts and run recursive_forecast."""
    return recursive_forecast(
        series_id, start_d,
        model=load_model(),
        feature_meta=load_feature_meta(),
        data=load_series_daily(),
        calendar=load_calendar_features(),
    )


def generate_golden() -> list[float]:
    """Generate backend/tests/golden/expected_turkey_1300.json ONCE (03 §7)."""
    preds = forecast("turkey", 1300)
    GOLDEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(GOLDEN_PATH, "w", encoding="utf-8") as fh:
        json.dump(preds, fh, indent=2)
    print(f"[MT-15] wrote {GOLDEN_PATH} (len={len(preds)})")
    return preds


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--generate-golden", action="store_true",
                    help="write expected_turkey_1300.json (run once, then commit)")
    args = ap.parse_args()
    if args.generate_golden:
        generate_golden()
    else:
        print(forecast("turkey", 1300))
```

> **Config dependency (MT-01):** `app.config` provides `FIRST_SELECTABLE_D=1096`,
> `LAST_SELECTABLE_D=1914`, `HORIZON=28`, `TRAIN_END_D=1095` (`02` §3).

### Generate the golden fixture (run ONCE on the dev PC, then commit)
```bash
cd backend
python -m app.ml.forecast_engine --generate-golden
git add tests/golden/expected_turkey_1300.json
```

## 6. Tests / Verification (exact pytest tests + commands)

### `backend/tests/test_forecast_engine.py`
```python
"""MT-15 — recursive forecast engine + golden anti-drift test (03 §4, §7; 07 §2)."""
import json
from pathlib import Path

import pytest

from app.ml.forecast_engine import (
    forecast,
    recursive_forecast,
    load_model,
    load_feature_meta,
    load_series_daily,
    load_calendar_features,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
GOLDEN_PATH = REPO_ROOT / "backend" / "tests" / "golden" / "expected_turkey_1300.json"


def test_output_length_and_non_negative():
    preds = forecast("turkey", 1300)
    assert len(preds) == 28
    assert all(p >= 0.0 for p in preds)
    assert all(isinstance(p, float) for p in preds)


def test_start_d_out_of_range_raises():
    model = load_model()
    meta = load_feature_meta()
    data = load_series_daily()
    cal = load_calendar_features()
    with pytest.raises(ValueError):
        recursive_forecast("turkey", 1095, model, meta, data, cal)   # < FIRST_SELECTABLE_D
    with pytest.raises(ValueError):
        recursive_forecast("turkey", 1915, model, meta, data, cal)   # > LAST_SELECTABLE_D


def test_golden_turkey_1300():
    """Anti-drift: recursive_forecast('turkey', 1300) matches the committed vector (03 §7)."""
    assert GOLDEN_PATH.exists(), "expected_turkey_1300.json missing — generate it once"
    expected = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
    preds = forecast("turkey", 1300)
    assert len(preds) == len(expected) == 28
    for got, exp in zip(preds, expected):
        assert got == pytest.approx(exp, abs=1e-6)
```

### Commands (from `backend/`)
```bash
# one-time: generate + commit the golden fixture (after the engine is verified correct)
python -m app.ml.forecast_engine --generate-golden

# run the engine tests (fast, offline; needs committed model.pkl + series_daily + calendar.csv)
pytest -q tests/test_forecast_engine.py
```

## 7. Acceptance checklist
- [ ] `backend/app/ml/forecast_engine.py` exists at the exact path (`04` §1); ml/* stays pure
      (no FastAPI imports) (`04` §2).
- [ ] `recursive_forecast(series_id, start_d, model, feature_meta, data, calendar)` follows the
      `03` §4 pseudocode: precondition check, seed actuals for `d < start_d`, forward-fill last
      price, per-day `§3` features (incl. recursively-updated lags), `predict`, clip at 0, feed
      back, return **28 floats**.
- [ ] Per-day lag/rolling formulas match `03` §3.5 exactly (population std; `roll_mean_7_by_wday`
      = mean over last 4 same-`wday` occurrences before `t`).
- [ ] `price_rel = last_price / series_train_mean_price`, `1.0` if mean is 0/NaN (`03` §3.4);
      price forward-filled (`03` §3.4, §4).
- [ ] Calendar/event features for the horizon come from the full-calendar table (`03` §3.2/§3.3),
      `days_to/since_event` capped at 28.
- [ ] Precondition `1096 <= start_d <= 1914` enforced (`02` §3); out-of-range → `ValueError`.
- [ ] Golden generator writes `backend/tests/golden/expected_turkey_1300.json`; file committed.
- [ ] `pytest -q tests/test_forecast_engine.py` green: length 28, all ≥ 0, **golden matches
      within `abs=1e-6`** (`03` §7, `07` §2).
- [ ] Deterministic (`seed=42` baked into the model; `predict` deterministic); no new runtime
      deps beyond `04` §6.
