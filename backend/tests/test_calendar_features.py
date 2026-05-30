"""Tests for app.ml.calendar_features."""
from datetime import date
from app.ml.calendar_features import d_to_date, date_to_d, load_calendar


def test_d_to_date_anchor():
    assert d_to_date(1) == date(2011, 1, 29)
    assert d_to_date(1096) == date(2014, 1, 28)


def test_date_to_d_inverse():
    for d in (1, 500, 1095, 1096, 1914, 1941):
        assert date_to_d(d_to_date(d)) == d


def test_calendar_columns_and_ranges():
    cal = load_calendar()
    for col in ("days_to_next_event", "days_since_last_event", "snap_count", "is_event"):
        assert col in cal.columns
    assert cal["days_to_next_event"].between(0, 28).all()
    assert cal["days_since_last_event"].between(0, 28).all()
    assert cal["snap_count"].between(0, 3).all()
    assert set(cal["is_event"].unique()) <= {0, 1}
    # event days have distance 0
    ev = cal[cal["is_event"] == 1]
    assert (ev["days_to_next_event"] == 0).all()
