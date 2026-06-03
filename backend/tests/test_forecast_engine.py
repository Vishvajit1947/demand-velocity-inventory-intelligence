"""MT-15 — recursive forecast engine + golden anti-drift test (03 §4, §7; 07 §2).

Tests the MT-15 spec interface:
    recursive_forecast(series_id, start_d, model, feature_meta, data, calendar) -> list[float]

Also tests the backward-compatible dict interface used by forecast_service.py.
"""
import json
from pathlib import Path

import numpy as np
import pytest

from app.config import HORIZON
from app.ml.forecast_engine import (
    forecast,
    load_calendar_features,
    load_feature_meta,
    load_model,
    load_series_daily,
    recursive_forecast,
    recursive_forecast_dicts,
)
from tests.conftest import needs_artifacts

REPO_ROOT = Path(__file__).resolve().parents[2]
GOLDEN_PATH = REPO_ROOT / "backend" / "tests" / "golden" / "expected_turkey_1300.json"

FIRST_SELECTABLE_D = 1096
LAST_SELECTABLE_D = 1914


# ── spec interface: recursive_forecast(series_id, start_d, model, feature_meta, data, calendar) ──

@needs_artifacts
def test_output_length_and_non_negative():
    """Output is exactly 28 non-negative floats (03 §4)."""
    model = load_model()
    meta = load_feature_meta()
    data = load_series_daily()
    data["series_id"] = data["series_id"].astype(str)
    calendar = load_calendar_features()
    preds = recursive_forecast("turkey", 1300, model, meta, data, calendar)
    assert len(preds) == HORIZON, f"expected 28 predictions, got {len(preds)}"
    assert all(p >= 0.0 for p in preds), "some predictions are negative"
    assert all(isinstance(p, float) for p in preds), "predictions must be floats"


@needs_artifacts
def test_output_contract(model, feature_meta, units_price_maps):
    """Backward-compat dict interface: output contract (length 28, non-negative)."""
    ubys, pbys = units_price_maps
    f = recursive_forecast_dicts(
        "turkey", 1300, model, feature_meta, ubys["turkey"], pbys["turkey"]
    )
    assert len(f) == HORIZON
    assert all(x >= 0 for x in f)


@needs_artifacts
def test_start_d_out_of_range_raises():
    """Precondition check: start_d outside [1096, 1914] raises ValueError (02 §3)."""
    model = load_model()
    meta = load_feature_meta()
    data = load_series_daily()
    data["series_id"] = data["series_id"].astype(str)
    calendar = load_calendar_features()

    with pytest.raises(ValueError, match="out of range"):
        recursive_forecast("turkey", FIRST_SELECTABLE_D - 1, model, meta, data, calendar)
    with pytest.raises(ValueError, match="out of range"):
        recursive_forecast("turkey", LAST_SELECTABLE_D + 1, model, meta, data, calendar)


@needs_artifacts
def test_start_d_out_of_range_raises_dicts(model, feature_meta, units_price_maps):
    """Dict interface also raises ValueError for out-of-range start_d."""
    ubys, pbys = units_price_maps
    with pytest.raises(ValueError):
        recursive_forecast_dicts(
            "turkey", FIRST_SELECTABLE_D - 1, model, feature_meta,
            ubys["turkey"], pbys["turkey"]
        )
    with pytest.raises(ValueError):
        recursive_forecast_dicts(
            "turkey", LAST_SELECTABLE_D + 1, model, feature_meta,
            ubys["turkey"], pbys["turkey"]
        )


@needs_artifacts
def test_determinism():
    """Same (series_id, start_d) always produces the same forecast (03 §4, §7)."""
    model = load_model()
    meta = load_feature_meta()
    data = load_series_daily()
    data["series_id"] = data["series_id"].astype(str)
    calendar = load_calendar_features()
    preds1 = recursive_forecast("turkey", 1300, model, meta, data, calendar)
    preds2 = recursive_forecast("turkey", 1300, model, meta, data, calendar)
    assert preds1 == preds2, "forecast is not deterministic"


@needs_artifacts
def test_boundary_start_d():
    """First and last selectable start days run without error (02 §3)."""
    model = load_model()
    meta = load_feature_meta()
    data = load_series_daily()
    data["series_id"] = data["series_id"].astype(str)
    calendar = load_calendar_features()
    for d in (FIRST_SELECTABLE_D, LAST_SELECTABLE_D):
        preds = recursive_forecast("turkey", d, model, meta, data, calendar)
        assert len(preds) == HORIZON
        assert all(p >= 0.0 for p in preds)


# ── golden anti-drift test (03 §7; 07 §2) ─────────────────────────────────────

@needs_artifacts
def test_golden_turkey_1300():
    """Anti-drift: recursive_forecast('turkey', 1300) matches the committed vector (03 §7).

    The golden file expected_turkey_1300.json was generated once by
        python -m app.ml.forecast_engine --generate-golden
    and committed. Any unintentional algorithm change will break this test.
    """
    assert GOLDEN_PATH.exists(), (
        "expected_turkey_1300.json missing — run: "
        "python -m app.ml.forecast_engine --generate-golden"
    )
    expected = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
    preds = forecast("turkey", 1300)   # convenience wrapper loads all artifacts
    assert len(preds) == len(expected) == HORIZON
    for i, (got, exp) in enumerate(zip(preds, expected)):
        assert got == pytest.approx(exp, abs=1e-6), (
            f"day {i}: got {got:.8f}, expected {exp:.8f} — golden drift detected"
        )


@needs_artifacts
def test_golden_no_drift(model, feature_meta, units_price_maps):
    """Dict interface golden test — also must match within 1e-6 (07 §2)."""
    assert GOLDEN_PATH.exists(), "expected_turkey_1300.json missing"
    ubys, pbys = units_price_maps
    f = recursive_forecast_dicts(
        "turkey", 1300, model, feature_meta, ubys["turkey"], pbys["turkey"]
    )
    expected = json.loads(GOLDEN_PATH.read_text())
    assert np.allclose(f, expected, atol=1e-6), "forecast drifted from golden fixture"


# ── portfolio accuracy sanity check (07 §2) ───────────────────────────────────

@needs_artifacts
def test_portfolio_accuracy_target(model, feature_meta, units_price_maps):
    """Volume-weighted portfolio accuracy across all 8 products should clear 70 on a fixed date."""
    from app.config import SERIES_IDS
    from app.ml.calendar_features import date_to_d

    ubys, pbys = units_price_maps
    d = date_to_d("2015-06-15")
    num = den = 0.0
    for s in SERIES_IDS:
        f = np.array(
            recursive_forecast_dicts(s, d, model, feature_meta, ubys[s], pbys[s])
        )
        a = np.array([ubys[s].get(d + i, 0.0) for i in range(HORIZON)])
        num += np.abs(a - f).sum()
        den += a.sum()
    portfolio_acc = max(0.0, 100 - num / den * 100)
    assert portfolio_acc >= 70.0, f"portfolio accuracy {portfolio_acc:.1f} below 70"
