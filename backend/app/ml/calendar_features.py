"""Calendar & event helpers driven by data/raw/calendar.csv (covers d_1 .. d_1969).
docs/03_ALGORITHM_SPEC.md sec 3.2 / 3.3.
"""
from __future__ import annotations
from datetime import date, timedelta
import pandas as pd
import numpy as np
from app.config import CALENDAR_PATH, D1_DATE

_D1 = D1_DATE
_EVENT_COLS = ("event_name_1", "event_type_1", "event_name_2", "event_type_2")


def d_to_date(d: int) -> date:
    """d_1 -> 2011-01-29 ; d_n -> d_1 + (n-1) days."""
    return _D1 + timedelta(days=d - 1)


def date_to_d(value) -> int:
    """ISO string / date -> integer d_index."""
    dt = date.fromisoformat(value) if isinstance(value, str) else value
    return (dt - _D1).days + 1


_CACHE: pd.DataFrame | None = None


def load_calendar() -> pd.DataFrame:
    """Return the calendar indexed by d_index with all engineered calendar/event columns.
    Cached after first load."""
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    c = pd.read_csv(CALENDAR_PATH)
    c["d_index"] = c["d"].str.removeprefix("d_").astype(int)
    for k in _EVENT_COLS:
        c[k] = c[k].fillna("none").replace("", "none")
    c["snap_count"] = (c["snap_CA"] + c["snap_TX"] + c["snap_WI"]).astype("int8")
    c["date"] = pd.to_datetime(c["date"])
    c["day_of_month"] = c["date"].dt.day.astype("int16")
    c["week_of_year"] = c["date"].dt.isocalendar().week.astype("int16")
    c["is_weekend"] = c["wday"].isin([1, 2]).astype("int8")
    c["is_event"] = (c["event_name_1"] != "none").astype("int8")
    c = _add_event_distance(c)
    _CACHE = c.set_index("d_index")
    return _CACHE


def _add_event_distance(c: pd.DataFrame) -> pd.DataFrame:
    """days_to_next_event / days_since_last_event, capped at 28, 0 on event days."""
    ev = c["is_event"].to_numpy()
    n = len(c)
    to_next = np.full(n, 28, dtype="int16")
    since = np.full(n, 28, dtype="int16")
    nxt = 28
    for i in range(n - 1, -1, -1):
        if ev[i]:
            nxt = 0
        to_next[i] = min(nxt, 28)
        nxt = min(nxt + 1, 28)
    last = 28
    for i in range(n):
        if ev[i]:
            last = 0
        since[i] = min(last, 28)
        last = min(last + 1, 28)
    c["days_to_next_event"] = to_next
    c["days_since_last_event"] = since
    return c
