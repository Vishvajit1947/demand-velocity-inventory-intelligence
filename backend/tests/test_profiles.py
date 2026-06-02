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


def test_key_order_matches_series_ids():
    """Keys must appear in SERIES_IDS order (stable, as produced by iterating SERIES_IDS)."""
    profiles = _load()
    assert list(profiles.keys()) == SERIES_IDS


def test_train_years_only():
    """yearly_total must only contain years present in the TRAIN period (2011-2014)."""
    profiles = _load()
    allowed_years = {"2011", "2012", "2013", "2014"}
    for sid, p in profiles.items():
        for y in p["yearly_total"].keys():
            assert y in allowed_years, f"{sid} yearly_total has unexpected year {y}"


def test_overall_mean_positive():
    """All 8 series have sales in TRAIN so overall_mean must be > 0."""
    profiles = _load()
    for sid, p in profiles.items():
        assert p["overall_mean"] > 0, f"{sid} overall_mean is not positive"


def test_seasonal_cv_non_negative():
    profiles = _load()
    for sid, p in profiles.items():
        assert p["seasonal_cv"] >= 0, f"{sid} seasonal_cv negative"


def test_event_uplift_rounded_to_one_decimal():
    """Event uplift values must be rounded to exactly 1 decimal place."""
    profiles = _load()
    for sid, p in profiles.items():
        for ev, val in p["event_uplift"].items():
            # round-trip: re-rounding to 1dp should not change the value
            assert round(val, 1) == val, (
                f"{sid} event_uplift['{ev}']={val} is not rounded to 1dp"
            )


def test_no_none_event_in_uplift():
    """'none' must never appear as an event key in event_uplift."""
    profiles = _load()
    for sid, p in profiles.items():
        assert "none" not in p["event_uplift"], f"{sid} has 'none' in event_uplift"
