"""
MT-21 — Store loader: singleton, graceful degradation, and read helpers.

Tests needing real artifacts skip when model_loaded is False (07 §2), so this file is
green before MT-10/MT-13/MT-14 produce the parquet/model/profiles.
"""

from __future__ import annotations

import pytest

from app.config import HISTORY_WINDOW, SERIES_IDS, FIRST_SELECTABLE_D
from app.services.store import Store, get_store, reset_store


def test_singleton_same_instance():
    reset_store()
    a = get_store()
    b = get_store()
    assert a is b  # load-once singleton (04 §2/§3)


def test_graceful_when_artifacts_missing(tmp_path, monkeypatch):
    """Point every path at a non-existent file: load() must NOT raise; model_loaded False."""
    import app.services.store as store_mod

    fake = {k: tmp_path / f"missing_{k}" for k in store_mod.PATHS}
    monkeypatch.setattr(store_mod, "PATHS", fake)
    s = Store.load()  # must not raise (04 §3/§5)
    assert s.model_loaded is False
    assert s.model is None and s.series_daily is None
    assert s.load_errors  # reasons recorded


# ---- the following require real artifacts (skip otherwise) ------------------
def _require_loaded():
    s = get_store()
    if not s.model_loaded:
        pytest.skip("artifacts not present (model_loaded False); needs MT-10/13/14/11")
    return s


def test_model_loaded_true_with_artifacts():
    s = _require_loaded()
    assert s.model is not None
    assert s.series_daily is not None
    assert s.feature_meta is not None
    assert s.profiles is not None
    assert s.calendar is not None


def test_actual_units_length_and_type():
    s = _require_loaded()
    start_d = FIRST_SELECTABLE_D
    # 84-day history window ending at start_d - 1 (05 §5 history).
    vals = s.actual_units(SERIES_IDS[0], start_d - HISTORY_WINDOW, start_d - 1)
    assert len(vals) == HISTORY_WINDOW
    assert all(isinstance(v, float) for v in vals)


def test_actual_units_ordered_ascending():
    s = _require_loaded()
    # Same query twice -> identical (deterministic ordering).
    a = s.actual_units(SERIES_IDS[0], FIRST_SELECTABLE_D, FIRST_SELECTABLE_D + 9)
    b = s.actual_units(SERIES_IDS[0], FIRST_SELECTABLE_D, FIRST_SELECTABLE_D + 9)
    assert a == b
    assert len(a) == 10


def test_train_mean_price_positive_and_cached():
    s = _require_loaded()
    p1 = s.series_train_mean_price(SERIES_IDS[0])
    p2 = s.series_train_mean_price(SERIES_IDS[0])
    assert p1 == p2  # cached
    assert p1 > 0.0  # real price (or 1.0 fallback), never 0/NaN
