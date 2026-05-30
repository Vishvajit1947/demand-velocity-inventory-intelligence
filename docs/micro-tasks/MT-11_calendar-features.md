# MT-11 — Calendar / Event Feature Helpers (`calendar_features.py`)

## 1. Context
Part of **Phase 1 — ML pipeline** (`MT-INDEX.md`). This module provides the pure, tested calendar
primitives that MT-12 (`build_features`) and MT-15 (`recursive_forecast`) rely on: day-index ↔ date
conversion, the loaded calendar, event-distance features (`days_to_next_event`,
`days_since_last_event`), the weekend flag, and `snap_count`. These are computed over the **full**
calendar (`d_1 … d_1969`) so that horizon days beyond the last sales day (`d_1941`) are also covered
(`03_ALGORITHM_SPEC.md` §3.3). No new decisions are made here — the formulas come from
`03_ALGORITHM_SPEC.md` §3.2 / §3.3 and `02_DATA_SPEC.md` §1.

## 2. Prerequisites
- **Foundation docs:** `02_DATA_SPEC.md` (§1 calendar shape & `d↔date` rule, §4 `snap_count`),
  `03_ALGORITHM_SPEC.md` (§3.2 calendar features, §3.3 events incl. event-distance over full
  calendar), `04_BACKEND_ARCHITECTURE.md` (§1 path, §2 purity, §6 deps),
  `07_TESTING_STRATEGY.md` (§2 conventions).
- **Tasks:** MT-01 done (`backend/app/config.py` exists; constants available if needed).
- **Data present at runtime:** `data/raw/calendar.csv` — committed (102 KB), needed at runtime
  (`04_BACKEND_ARCHITECTURE.md` §7). This file covers `d_1 … d_1969` (1,969 rows,
  `02_DATA_SPEC.md` §1).
- **Environment:** Python 3.11; `pandas==2.2.3`, `numpy==2.1.3`, `python-dateutil==2.9.0`
  (`04_BACKEND_ARCHITECTURE.md` §6). Run from `backend/`.

## 3. Goal
Implement `backend/app/ml/calendar_features.py` with these exact public functions:
- `d_to_date(d: int) -> datetime.date` — `d_1 == 2011-01-29`.
- `date_to_d(dt) -> int` — inverse of `d_to_date`.
- `load_calendar() -> pd.DataFrame` — full calendar `d_1 … d_1969`, events `"none"`-filled,
  with `snap_count`, `is_weekend`.
- `add_event_distance(cal: pd.DataFrame) -> pd.DataFrame` — adds `days_to_next_event` and
  `days_since_last_event`, capped at 28, computed over the **full** calendar.
- `is_weekend(wday: int) -> int` — 1 if `wday in {1, 2}` else 0.
- `snap_count(row) -> int` — `snap_CA + snap_TX + snap_WI` (0..3).

## 4. Design (locked decisions; cite foundation sections)
- **Anchor:** `d_1 = 2011-01-29` (Saturday); `d_n = 2011-01-29 + (n − 1) days`
  (`02_DATA_SPEC.md` §1). `d_to_date` / `date_to_d` are the **only** place dates are computed by
  hand, and they are tested (`02_DATA_SPEC.md` §1 "except in a tested helper").
- **Full calendar:** `load_calendar()` returns **all 1,969 rows** (`d_1 … d_1969`) so horizon days
  past `d_1941` are covered (`03_ALGORITHM_SPEC.md` §3.3). (Contrast with MT-10's `load_calendar`,
  which restricts to `d_1 … d_1941`; these are separate functions in separate modules.)
- **Weekend:** `is_weekend = 1 if wday in {1, 2} else 0`. M5 `wday`: 1 = Saturday, 2 = Sunday
  (`03_ALGORITHM_SPEC.md` §3.2; `02_DATA_SPEC.md` §1 "1=Saturday … 7=Friday").
- **`snap_count`:** `snap_CA + snap_TX + snap_WI`, integer 0..3 (`02_DATA_SPEC.md` §4;
  `03_ALGORITHM_SPEC.md` §3.2).
- **Event day definition:** a day is an "event day" iff `event_name_1` is **not** empty and **not**
  `"none"` (`03_ALGORITHM_SPEC.md` §3.3 uses `event_name_1`; the task brief states event day =
  `event_name_1 != "" / "none"`). Only `event_name_1` drives distances (secondary events are a
  subset of those days' calendar but the spec keys on `event_name_1`).
- **`days_to_next_event`:** for each day `t`, the number of days until the **next** day (`≥ t`,
  strictly forward search starting at the same day per "until the next calendar day with any event")
  whose `event_name_1` is an event; **capped at 28** (28 if none within 28)
  (`03_ALGORITHM_SPEC.md` §3.3). A day that is itself an event has `days_to_next_event = 0`.
- **`days_since_last_event`:** days since the **previous** event day (`≤ t`), capped at 28; a day
  that is itself an event has `days_since_last_event = 0` (`03_ALGORITHM_SPEC.md` §3.3).
- **Both distances are non-negative and ≤ 28** by construction — asserted by the tests
  (`07_TESTING_STRATEGY.md` §2).
- **Events `"none"`-filled:** empty event strings become `"none"` (`02_DATA_SPEC.md` §4) so the
  event-day mask is a clean string comparison.
- **Purity:** no FastAPI imports; pure functions (`04_BACKEND_ARCHITECTURE.md` §2).
- **Path:** `backend/app/ml/calendar_features.py` (`04_BACKEND_ARCHITECTURE.md` §1).

## 5. Implementation (exact file paths from 04 §1; FULL runnable code)

### File: `backend/app/ml/calendar_features.py`
```python
"""MT-11 — Calendar / event feature helpers (pure functions, no FastAPI imports).

Implements 03_ALGORITHM_SPEC.md §3.2 / §3.3 and 02_DATA_SPEC.md §1 / §4 over the FULL
calendar (d_1 .. d_1969) so horizon days beyond d_1941 are covered.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Mapping

import numpy as np
import pandas as pd

# This file lives at backend/app/ml/calendar_features.py
# parents[0]=ml  [1]=app  [2]=backend  [3]=repo root
REPO_ROOT = Path(__file__).resolve().parents[3]
CALENDAR_CSV = REPO_ROOT / "data" / "raw" / "calendar.csv"

# 02_DATA_SPEC.md §1: d_1 == 2011-01-29 (Saturday).
D1_DATE = date(2011, 1, 29)

# 03_ALGORITHM_SPEC.md §3.3: distances are capped at 28.
EVENT_DISTANCE_CAP = 28

EVENT_COLS = ["event_name_1", "event_type_1", "event_name_2", "event_type_2"]


def d_to_date(d: int) -> date:
    """Map a day index d (>=1) to its calendar date. d_1 == 2011-01-29 (02_DATA_SPEC §1)."""
    if d < 1:
        raise ValueError(f"d must be >= 1, got {d}")
    return D1_DATE + timedelta(days=d - 1)


def date_to_d(dt) -> int:
    """Inverse of d_to_date: map a date (date/datetime/str/Timestamp) to its day index.

    Raises ValueError if the date precedes d_1 (2011-01-29).
    """
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt).date()
    elif isinstance(dt, pd.Timestamp):
        dt = dt.date()
    elif isinstance(dt, datetime):
        dt = dt.date()
    elif isinstance(dt, date):
        pass
    else:
        raise TypeError(f"unsupported date type: {type(dt)!r}")
    delta = (dt - D1_DATE).days
    if delta < 0:
        raise ValueError(f"date {dt} precedes d_1 ({D1_DATE})")
    return delta + 1


def is_weekend(wday: int) -> int:
    """1 if Saturday(1) or Sunday(2) else 0 (03_ALGORITHM_SPEC §3.2; M5 wday convention)."""
    return 1 if int(wday) in (1, 2) else 0


def snap_count(row: Mapping) -> int:
    """snap_CA + snap_TX + snap_WI for one calendar row (0..3) (02_DATA_SPEC §4)."""
    return int(row["snap_CA"]) + int(row["snap_TX"]) + int(row["snap_WI"])


def load_calendar() -> pd.DataFrame:
    """Load the FULL calendar (d_1 .. d_1969) with derived helper columns.

    Columns returned: d_index, date, wm_yr_wk, wday, month, year, snap_count, is_weekend,
    event_name_1, event_type_1, event_name_2, event_type_2.
    Empty event strings are filled with the literal "none" (02_DATA_SPEC §4).
    """
    cal = pd.read_csv(CALENDAR_CSV)
    cal["d_index"] = cal["d"].str.replace("d_", "", regex=False).astype("int32")
    cal["date"] = pd.to_datetime(cal["date"]).dt.normalize()

    for col in EVENT_COLS:
        cal[col] = cal[col].fillna("none").replace("", "none")

    cal["snap_count"] = (
        cal["snap_CA"].astype("int16")
        + cal["snap_TX"].astype("int16")
        + cal["snap_WI"].astype("int16")
    ).astype("int8")
    cal["is_weekend"] = cal["wday"].apply(is_weekend).astype("int8")

    cal["wday"] = cal["wday"].astype("int8")
    cal["month"] = cal["month"].astype("int8")
    cal["year"] = cal["year"].astype("int16")
    cal["wm_yr_wk"] = cal["wm_yr_wk"].astype("int32")

    keep = [
        "d_index", "date", "wm_yr_wk", "wday", "month", "year",
        "snap_count", "is_weekend", *EVENT_COLS,
    ]
    cal = cal[keep].sort_values("d_index").reset_index(drop=True)
    return cal


def add_event_distance(cal: pd.DataFrame) -> pd.DataFrame:
    """Add days_to_next_event and days_since_last_event (capped at 28) over the full calendar.

    Event day := event_name_1 not in {"", "none"} (03_ALGORITHM_SPEC §3.3).
    A day that is itself an event gets distance 0. Distances are computed in d_index order.
    """
    out = cal.sort_values("d_index").reset_index(drop=True).copy()
    is_event = (~out["event_name_1"].isin(["", "none"])).to_numpy()
    n = len(out)
    cap = EVENT_DISTANCE_CAP

    # days_to_next_event[i] = min(j - i) for j >= i with is_event[j], capped at cap.
    to_next = np.full(n, cap, dtype=np.int64)
    dist = cap
    for i in range(n - 1, -1, -1):
        dist = 0 if is_event[i] else min(dist + 1, cap)
        to_next[i] = dist

    # days_since_last_event[i] = min(i - j) for j <= i with is_event[j], capped at cap.
    since_last = np.full(n, cap, dtype=np.int64)
    dist = cap
    for i in range(n):
        dist = 0 if is_event[i] else min(dist + 1, cap)
        since_last[i] = dist

    out["days_to_next_event"] = np.minimum(to_next, cap).astype("int16")
    out["days_since_last_event"] = np.minimum(since_last, cap).astype("int16")
    return out


if __name__ == "__main__":
    _cal = add_event_distance(load_calendar())
    print(f"Loaded calendar: {len(_cal)} rows (d_1..d_{int(_cal['d_index'].max())})")
    print(_cal[["d_index", "date", "event_name_1",
                "days_to_next_event", "days_since_last_event"]].head(10).to_string(index=False))
```

> Backward/forward single-pass loops over ~1,969 rows are trivially fast and exact; they guarantee
> the cap and non-negativity invariants. `python-dateutil` is in the pinned deps but is not required
> here (stdlib `datetime` suffices for the fixed `d_1` anchor); it remains available for callers.

## 6. Tests / Verification (exact pytest tests + commands)

### File: `backend/tests/test_calendar_features.py`
Deterministic and offline — uses the committed `data/raw/calendar.csv`
(`04_BACKEND_ARCHITECTURE.md` §7, so this test is **not** skipped).

```python
"""MT-11 tests — calendar helpers (03_ALGORITHM_SPEC §3.2/§3.3, 02_DATA_SPEC §1/§4)."""
from datetime import date

import pandas as pd
import pytest

from app.ml.calendar_features import (
    EVENT_DISTANCE_CAP,
    add_event_distance,
    date_to_d,
    d_to_date,
    is_weekend,
    load_calendar,
    snap_count,
)


def test_d1_is_anchor_date():
    assert d_to_date(1) == date(2011, 1, 29)


def test_d_to_date_progression():
    assert d_to_date(2) == date(2011, 1, 30)
    assert d_to_date(31) == date(2011, 2, 28)


def test_date_to_d_inverse():
    for d in (1, 2, 100, 1300, 1941, 1969):
        assert date_to_d(d_to_date(d)) == d


def test_date_to_d_accepts_str_and_timestamp():
    assert date_to_d("2011-01-29") == 1
    assert date_to_d(pd.Timestamp("2011-01-29")) == 1


def test_date_to_d_rejects_before_anchor():
    with pytest.raises(ValueError):
        date_to_d(date(2011, 1, 28))


def test_is_weekend():
    assert is_weekend(1) == 1  # Saturday
    assert is_weekend(2) == 1  # Sunday
    for w in (3, 4, 5, 6, 7):
        assert is_weekend(w) == 0


def test_snap_count_in_range():
    assert snap_count({"snap_CA": 1, "snap_TX": 0, "snap_WI": 1}) == 2
    assert snap_count({"snap_CA": 1, "snap_TX": 1, "snap_WI": 1}) == 3
    assert snap_count({"snap_CA": 0, "snap_TX": 0, "snap_WI": 0}) == 0


@pytest.fixture(scope="module")
def cal() -> pd.DataFrame:
    return add_event_distance(load_calendar())


def test_calendar_full_range(cal: pd.DataFrame):
    # 02_DATA_SPEC §1: calendar covers d_1 .. d_1969.
    assert int(cal["d_index"].min()) == 1
    assert int(cal["d_index"].max()) == 1969
    assert len(cal) == 1969


def test_events_none_filled(cal: pd.DataFrame):
    for col in ["event_name_1", "event_type_1", "event_name_2", "event_type_2"]:
        assert not cal[col].isna().any()


def test_snap_count_column_range(cal: pd.DataFrame):
    assert cal["snap_count"].between(0, 3).all()


def test_event_distances_nonneg_and_capped(cal: pd.DataFrame):
    for col in ("days_to_next_event", "days_since_last_event"):
        assert (cal[col] >= 0).all()
        assert (cal[col] <= EVENT_DISTANCE_CAP).all()


def test_event_day_has_zero_distance(cal: pd.DataFrame):
    event_rows = cal[~cal["event_name_1"].isin(["", "none"])]
    assert (event_rows["days_to_next_event"] == 0).all()
    assert (event_rows["days_since_last_event"] == 0).all()


def test_day_before_event_counts_down(cal: pd.DataFrame):
    # The day immediately before an event day must have days_to_next_event == 1.
    is_event = ~cal["event_name_1"].isin(["", "none"])
    next_is_event = is_event.shift(-1, fill_value=False)
    not_event_today = ~is_event
    mask = not_event_today & next_is_event
    assert (cal.loc[mask, "days_to_next_event"] == 1).all()
```

### Commands
```bash
cd backend
pytest -q tests/test_calendar_features.py
```

## 7. Acceptance checklist
- [ ] `backend/app/ml/calendar_features.py` exists at the exact path (`04` §1), **no FastAPI imports**.
- [ ] `d_to_date(1) == date(2011, 1, 29)` and `date_to_d(d_to_date(d)) == d` for all tested `d`.
- [ ] `load_calendar()` returns the **full** calendar `d_1 … d_1969` (1,969 rows) with events
      `"none"`-filled and `snap_count`, `is_weekend` columns.
- [ ] `add_event_distance` adds `days_to_next_event` and `days_since_last_event`, both **≥ 0** and
      **≤ 28**, with **0** on event days (`03` §3.3).
- [ ] `is_weekend(wday)` returns 1 for `wday ∈ {1, 2}`, else 0.
- [ ] `snap_count(row)` returns `snap_CA + snap_TX + snap_WI` ∈ 0..3.
- [ ] `tests/test_calendar_features.py` passes (offline, deterministic, not skipped).
