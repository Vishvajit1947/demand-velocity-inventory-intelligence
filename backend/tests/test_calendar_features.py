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
