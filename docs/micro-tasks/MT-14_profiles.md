# MT-14 — Per-Series Profiles (`profiles.json`)

## 1. Context
Phase 1 of the ML pipeline (`MT-INDEX.md`, depends on **MT-10**). Builds the committed
`backend/app/models/profiles.json` defined in `03_ALGORITHM_SPEC.md` §5: per-series precomputed
statistics (monthly/weekday averages, yearly totals, event uplifts, overall mean, seasonal CV)
used by the dashboard panels (Seasonal Trend, Event Impact) and by explainability (`03` §6.5).

Like `model.pkl`, this is a **one-time dev-PC artifact** committed to git (`04` §7) so students
never recompute it. It is loaded once by `services/store.py` (MT-21).

## 2. Prerequisites
- Read and obey: `03_ALGORITHM_SPEC.md` §5 (profiles schema + formulas), `02_DATA_SPEC.md` §3
  (TRAIN split), §4 (`series_daily.parquet` schema), §6 (`PRODUCTS` / `SERIES_IDS`);
  `04_BACKEND_ARCHITECTURE.md` §1 (paths), §6 (deps); `07_TESTING_STRATEGY.md` §2.
- **MT-10** has produced `data/processed/series_daily.parquet` (15,528 rows, 8 series).
- Python **3.11**, `pandas==2.2.3`, `numpy==2.1.3`, `pyarrow==18.1.0` (`04` §6). Run from
  `backend/`.

## 3. Goal
Write `backend/app/models/profiles.json` containing **8 keys** (one per `series_id`), each an
object with the exact fields from `03` §5:
- `monthly_avg`: `list[12]` — mean units/day by calendar month 1..12 over TRAIN.
- `weekday_avg`: `list[7]` — mean units/day by `wday` 1..7 over TRAIN.
- `yearly_total`: `{year_str: sum_units}` — sum per TRAIN year (only years present in TRAIN).
- `event_uplift`: `{event_name: pct}` — mean % uplift on each event's days vs the no-event
  baseline, rounded to 1 decimal; only events that occur for that series in TRAIN.
- `overall_mean`: float — mean units/day across TRAIN.
- `seasonal_cv`: float — `std(monthly_avg) / mean(monthly_avg)`.

CLI: `python -m app.ml.profiles` (run from `backend/`).

## 4. Design (locked decisions; cite foundation sections)
- **TRAIN period only** — rows with `d_index <= TRAIN_END_D` (`= 1095`, `02` §3). All statistics
  use this slice exclusively; TEST rows are ignored.
- **`monthly_avg[i]`** = `mean(units)` over TRAIN rows where `month == i+1`, for `i in 0..11`
  (index 0 → month 1). A month with no TRAIN rows (cannot happen with 3 full train years) →
  `0.0`.
- **`weekday_avg[i]`** = `mean(units)` over TRAIN rows where `wday == i+1`, for `i in 0..6`
  (index 0 → `wday` 1 = Saturday, per `02` §1 M5 convention).
- **`yearly_total`** = `sum(units)` grouped by `year`, keys are year strings, **only TRAIN years
  actually present** (`02` §3: TRAIN ends 2014-01-27, so 2014 contributes a few January days —
  included because those rows are in TRAIN). Sorted ascending by year.
- **`event_uplift[E]`** (`03` §5): let `baseline = mean(units on TRAIN days with no event)`
  where "no event" means `event_name_1 == "none"` (`02` §4 fills empties with the literal
  `"none"`). For each distinct event name `E` appearing in `event_name_1` **or** `event_name_2`
  on this series' TRAIN days (excluding `"none"`):
  `uplift = (mean(units on days where E appears) − baseline) / baseline * 100`, rounded to 1
  decimal. A day counts toward `E` if `event_name_1 == E or event_name_2 == E`. If
  `baseline == 0` → skip uplift (avoid divide-by-zero; baselines are non-zero in practice for
  all 8 series).
- **`overall_mean`** = `mean(units)` over all TRAIN rows for the series (round to 1 decimal to
  match the `18.6` style in `03` §5).
- **`seasonal_cv`** = `std(monthly_avg) / mean(monthly_avg)` using **population** std
  (`np.std`, ddof=0) over the 12 monthly means; if `mean(monthly_avg) == 0` → `0.0`. Round to 2
  decimals (matches the `1.25` style in `03` §5).
- **Determinism** — pure aggregation, no randomness; identical input ⇒ identical JSON.
- **Path** — exactly `backend/app/models/profiles.json` (`04` §1).
- **Series order** — iterate `SERIES_IDS` from `config.py` (`02` §6) for stable key order.

## 5. Implementation (exact file paths from 04 §1; FULL runnable code)

### `backend/app/ml/profiles.py`
```python
"""MT-14 — Build per-series profiles (03_ALGORITHM_SPEC §5) -> profiles.json.

One-time dev-PC step. Reads data/processed/series_daily.parquet over the TRAIN
period (d_index <= 1095) and writes backend/app/models/profiles.json.

Run from backend/:  python -m app.ml.profiles
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from app.config import SERIES_IDS, TRAIN_END_D

# ── paths (04 §1) ──────────────────────────────────────────────────────────────
_REPO_ROOT = Path(__file__).resolve().parents[3]
SERIES_DAILY_PATH = _REPO_ROOT / "data" / "processed" / "series_daily.parquet"
MODELS_DIR = _REPO_ROOT / "backend" / "app" / "models"
PROFILES_PATH = MODELS_DIR / "profiles.json"

NO_EVENT = "none"  # 02 §4: empty events stored as the literal string "none"


def load_train_rows() -> pd.DataFrame:
    """Load series_daily and keep TRAIN rows only (d_index <= TRAIN_END_D, 02 §3)."""
    if not SERIES_DAILY_PATH.exists():
        raise FileNotFoundError(
            f"missing {SERIES_DAILY_PATH}; run MT-10 (data_prep) first"
        )
    df = pd.read_parquet(SERIES_DAILY_PATH)
    return df.loc[df["d_index"] <= TRAIN_END_D].copy()


def _monthly_avg(g: pd.DataFrame) -> list[float]:
    """Mean units/day by month 1..12 -> list index 0..11 (03 §5)."""
    means = g.groupby("month")["units"].mean()
    return [float(means.get(m, 0.0)) for m in range(1, 13)]


def _weekday_avg(g: pd.DataFrame) -> list[float]:
    """Mean units/day by wday 1..7 -> list index 0..6 (03 §5)."""
    means = g.groupby("wday")["units"].mean()
    return [float(means.get(w, 0.0)) for w in range(1, 8)]


def _yearly_total(g: pd.DataFrame) -> dict[str, float]:
    """Sum units per TRAIN year, year-string keys, ascending (03 §5)."""
    totals = g.groupby("year")["units"].sum().sort_index()
    return {str(int(y)): float(v) for y, v in totals.items()}


def _event_uplift(g: pd.DataFrame) -> dict[str, float]:
    """Mean % uplift on each event's days vs the no-event baseline (03 §5)."""
    no_event_mask = g["event_name_1"] == NO_EVENT
    baseline = float(g.loc[no_event_mask, "units"].mean())
    if not np.isfinite(baseline) or baseline == 0.0:
        return {}

    # distinct event names appearing in either slot (excluding "none")
    names = pd.unique(
        pd.concat([g["event_name_1"], g["event_name_2"]], ignore_index=True)
    )
    out: dict[str, float] = {}
    for name in names:
        if name == NO_EVENT:
            continue
        day_mask = (g["event_name_1"] == name) | (g["event_name_2"] == name)
        if not day_mask.any():
            continue
        mean_on = float(g.loc[day_mask, "units"].mean())
        out[str(name)] = round((mean_on - baseline) / baseline * 100.0, 1)
    return out


def build_profile(g: pd.DataFrame) -> dict:
    """Assemble one series' profile object (03 §5)."""
    monthly = _monthly_avg(g)
    m_mean = float(np.mean(monthly))
    seasonal_cv = round(float(np.std(monthly)) / m_mean, 2) if m_mean != 0.0 else 0.0
    return {
        "monthly_avg": [round(x, 4) for x in monthly],
        "weekday_avg": [round(x, 4) for x in _weekday_avg(g)],
        "yearly_total": _yearly_total(g),
        "event_uplift": _event_uplift(g),
        "overall_mean": round(float(g["units"].mean()), 1),
        "seasonal_cv": seasonal_cv,
    }


def build_profiles() -> dict:
    """Build the full {series_id: profile} dict and write profiles.json (03 §5)."""
    train = load_train_rows()
    profiles: dict[str, dict] = {}
    for sid in SERIES_IDS:
        g = train.loc[train["series_id"] == sid]
        if g.empty:
            raise ValueError(f"no TRAIN rows for series '{sid}'")
        profiles[sid] = build_profile(g)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROFILES_PATH, "w", encoding="utf-8") as fh:
        json.dump(profiles, fh, indent=2)
    print(f"[MT-14] wrote {PROFILES_PATH} ({len(profiles)} series)")
    return profiles


if __name__ == "__main__":
    build_profiles()
```

> **Config dependency:** `app.config` must define `SERIES_IDS` and `TRAIN_END_D = 1095`
> (`02` §3, §6). These are authored in MT-01 and are not redefined here.

## 6. Tests / Verification (exact pytest tests + commands)

### `backend/tests/test_profiles.py`
```python
"""MT-14 — profiles.json structure + finiteness tests."""
import json
import math
from pathlib import Path

from app.config import SERIES_IDS

REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILES_PATH = REPO_ROOT / "backend" / "app" / "models" / "profiles.json"


def _load():
    assert PROFILES_PATH.exists(), "profiles.json missing — run `python -m app.ml.profiles`"
    return json.loads(PROFILES_PATH.read_text(encoding="utf-8"))


def test_has_eight_keys():
    profiles = _load()
    assert len(profiles) == 8
    assert set(profiles.keys()) == set(SERIES_IDS)


def test_each_series_required_fields_and_lengths():
    profiles = _load()
    required = {
        "monthly_avg", "weekday_avg", "yearly_total",
        "event_uplift", "overall_mean", "seasonal_cv",
    }
    for sid, p in profiles.items():
        assert required.issubset(p.keys()), f"{sid} missing fields"
        assert len(p["monthly_avg"]) == 12, f"{sid} monthly_avg != 12"
        assert len(p["weekday_avg"]) == 7, f"{sid} weekday_avg != 7"
        assert isinstance(p["yearly_total"], dict) and p["yearly_total"]
        assert isinstance(p["event_uplift"], dict)


def test_all_values_finite():
    profiles = _load()
    for sid, p in profiles.items():
        for v in p["monthly_avg"] + p["weekday_avg"]:
            assert math.isfinite(v), f"{sid} non-finite monthly/weekday value"
        for v in p["yearly_total"].values():
            assert math.isfinite(v)
        for v in p["event_uplift"].values():
            assert math.isfinite(v)
        assert math.isfinite(p["overall_mean"])
        assert math.isfinite(p["seasonal_cv"])
```

### Commands (from `backend/`)
```bash
# one-time dev-PC build (needs data/processed/series_daily.parquet)
python -m app.ml.profiles

# verify structure (fast, offline, uses the committed profiles.json)
pytest -q tests/test_profiles.py
```

## 7. Acceptance checklist
- [ ] `backend/app/ml/profiles.py` exists at the exact path (`04` §1).
- [ ] Statistics computed over TRAIN only (`d_index <= 1095`, `02` §3).
- [ ] `profiles.json` has **8 keys** == `SERIES_IDS` (`02` §6).
- [ ] Each profile has `monthly_avg` (len 12), `weekday_avg` (len 7), `yearly_total` (dict),
      `event_uplift` (dict, rounded 1dp), `overall_mean`, `seasonal_cv` (`03` §5).
- [ ] `event_uplift[E] = (mean_on_E − baseline)/baseline*100` with `baseline = mean(no-event
      days)`; only events occurring for that series; rounded to 1 decimal (`03` §5).
- [ ] `seasonal_cv = std(monthly_avg)/mean(monthly_avg)` (population std) (`03` §5).
- [ ] All values finite; written to `backend/app/models/profiles.json` and committed (`04` §7).
- [ ] `python -m app.ml.profiles` runs from `backend/`; `pytest -q tests/test_profiles.py` green.
- [ ] No new runtime deps beyond `04` §6.
