"""MT-11 — Calendar / event feature helpers (pure functions, no FastAPI imports).

Implements 03_ALGORITHM_SPEC.md §3.2 / §3.3 and 02_DATA_SPEC.md §1 / §4 over the FULL
calendar (d_1 .. d_1969) so horizon days beyond d_1941 are covered.

Backward-compatibility contract (required by features.py):
  - load_calendar() returns a DataFrame **indexed by d_index** so that
    cal.loc[d] and cal[cols] with right_index=True both work.
  - The returned DataFrame includes ALL columns that features.py/_CAL_COLS needs:
    wday, month, year, day_of_month, week_of_year, is_weekend, snap_count,
    event_name_1, event_type_1, event_name_2, event_type_2,
    is_event, days_to_next_event, days_since_last_event.

MT-11 public API (new additions):
  - EVENT_DISTANCE_CAP  constant
  - is_weekend(wday)    standalone function
  - snap_count(row)     standalone function
  - add_event_distance(cal)  public function (operates on plain-column DataFrames)
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


# ---------------------------------------------------------------------------
# Date ↔ d-index helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Standalone scalar helpers (MT-11 public API)
# ---------------------------------------------------------------------------

def is_weekend(wday: int) -> int:
    """1 if Saturday(1) or Sunday(2) else 0 (03_ALGORITHM_SPEC §3.2; M5 wday convention)."""
    return 1 if int(wday) in (1, 2) else 0


def snap_count(row: Mapping) -> int:
    """snap_CA + snap_TX + snap_WI for one calendar row (0..3) (02_DATA_SPEC §4)."""
    return int(row["snap_CA"]) + int(row["snap_TX"]) + int(row["snap_WI"])


# ---------------------------------------------------------------------------
# add_event_distance — public MT-11 function
# Operates on a plain-column DataFrame (d_index must be a column, not the index).
# ---------------------------------------------------------------------------

def add_event_distance(cal: pd.DataFrame) -> pd.DataFrame:
    """Add days_to_next_event and days_since_last_event (capped at 28) over the full calendar.

    Event day := event_name_1 not in {"", "none"} (03_ALGORITHM_SPEC §3.3).
    A day that is itself an event gets distance 0. Distances are computed in d_index order.

    Accepts either:
      - A plain-column DataFrame where d_index is a regular column, OR
      - An indexed DataFrame where d_index is the index (as returned by load_calendar()).
    Always returns a plain-column DataFrame with d_index as a regular column.
    """
    # Normalise: if d_index is the index, reset it to a column first.
    if cal.index.name == "d_index" or (
        isinstance(cal.index, pd.Index) and "d_index" not in cal.columns
        and cal.index.name is not None and cal.index.name == "d_index"
    ):
        out = cal.reset_index().copy()
    else:
        out = cal.copy()
    out = out.sort_values("d_index").reset_index(drop=True)
    is_event_arr = (~out["event_name_1"].isin(["", "none"])).to_numpy()
    n = len(out)
    cap = EVENT_DISTANCE_CAP

    # days_to_next_event[i]: forward distance to nearest event day (>=i), capped at cap.
    to_next = np.full(n, cap, dtype=np.int64)
    dist = cap
    for i in range(n - 1, -1, -1):
        dist = 0 if is_event_arr[i] else min(dist + 1, cap)
        to_next[i] = dist

    # days_since_last_event[i]: backward distance to nearest event day (<=i), capped at cap.
    since_last = np.full(n, cap, dtype=np.int64)
    dist = cap
    for i in range(n):
        dist = 0 if is_event_arr[i] else min(dist + 1, cap)
        since_last[i] = dist

    out["days_to_next_event"] = np.minimum(to_next, cap).astype("int16")
    out["days_since_last_event"] = np.minimum(since_last, cap).astype("int16")
    return out


# ---------------------------------------------------------------------------
# Internal helper: build the full enriched calendar as a plain-column DataFrame
# ---------------------------------------------------------------------------

def _build_calendar_plain() -> pd.DataFrame:
    """Read calendar.csv and return a plain-column DataFrame (d_index is a column).

    Includes ALL columns needed by features.py (_CAL_COLS) plus the MT-11 columns.
    """
    cal = pd.read_csv(CALENDAR_CSV)
    cal["d_index"] = cal["d"].str.replace("d_", "", regex=False).astype("int32")
    cal["date"] = pd.to_datetime(cal["date"]).dt.normalize()

    # 02_DATA_SPEC §4: empty event strings -> literal "none".
    for col in EVENT_COLS:
        cal[col] = cal[col].fillna("none").replace("", "none")

    # snap_count (02_DATA_SPEC §4)
    cal["snap_count"] = (
        cal["snap_CA"].astype("int16")
        + cal["snap_TX"].astype("int16")
        + cal["snap_WI"].astype("int16")
    ).astype("int8")

    # is_weekend (03_ALGORITHM_SPEC §3.2)
    cal["is_weekend"] = cal["wday"].apply(is_weekend).astype("int8")

    # Extra columns required by features.py
    cal["day_of_month"] = cal["date"].dt.day.astype("int16")
    cal["week_of_year"] = cal["date"].dt.isocalendar().week.astype("int16")

    # is_event flag (event_name_1 != "none")
    cal["is_event"] = (cal["event_name_1"] != "none").astype("int8")

    # Cast remaining calendar columns
    cal["wday"] = cal["wday"].astype("int8")
    cal["month"] = cal["month"].astype("int8")
    cal["year"] = cal["year"].astype("int16")
    cal["wm_yr_wk"] = cal["wm_yr_wk"].astype("int32")

    cal = cal.sort_values("d_index").reset_index(drop=True)

    # Add event-distance columns (add_event_distance expects d_index as a column — it is here)
    cal = add_event_distance(cal)

    return cal


# ---------------------------------------------------------------------------
# load_calendar — primary public function
#
# Returns a DataFrame INDEXED by d_index (backward-compatible with features.py).
# All MT-11 columns are present; the index name is "d_index" so cal.loc[d] works.
# ---------------------------------------------------------------------------

_CACHE: pd.DataFrame | None = None


def load_calendar() -> pd.DataFrame:
    """Load the FULL calendar (d_1 .. d_1969) indexed by d_index.

    Backward-compatible contract (required by features.py):
      - DataFrame is indexed by d_index → cal.loc[d] and right_index=True merges work.
      - Includes all _CAL_COLS: wday, month, year, day_of_month, week_of_year,
        is_weekend, snap_count, event_name_1..2, event_type_1..2,
        is_event, days_to_next_event, days_since_last_event.

    MT-11 tests access cal["d_index"] via add_event_distance(load_calendar()) —
    add_event_distance resets the index so d_index becomes a column again there.
    """
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    plain = _build_calendar_plain()
    _CACHE = plain.set_index("d_index")
    return _CACHE


# ---------------------------------------------------------------------------
# CLI smoke-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    plain = _build_calendar_plain()
    enriched = add_event_distance(plain)
    print(f"Loaded calendar: {len(enriched)} rows (d_1..d_{int(enriched['d_index'].max())})")
    print(enriched[["d_index", "date", "event_name_1",
                    "days_to_next_event", "days_since_last_event"]].head(10).to_string(index=False))
