"""Tests for app.ml.forecast_engine — output contract + golden anti-drift + accuracy sanity."""
import json
from pathlib import Path
import numpy as np
from app.config import HORIZON, SERIES_IDS
from app.ml.calendar_features import date_to_d
from app.ml.forecast_engine import recursive_forecast
from app.ml.metrics import compute_accuracy
from tests.conftest import needs_artifacts

GOLDEN = Path(__file__).resolve().parent / "golden" / "expected_turkey_1300.json"


@needs_artifacts
def test_output_contract(model, feature_meta, units_price_maps):
    ubys, pbys = units_price_maps
    f = recursive_forecast("turkey", 1300, model, feature_meta, ubys["turkey"], pbys["turkey"])
    assert len(f) == HORIZON
    assert all(x >= 0 for x in f)


@needs_artifacts
def test_golden_no_drift(model, feature_meta, units_price_maps):
    ubys, pbys = units_price_maps
    f = recursive_forecast("turkey", 1300, model, feature_meta, ubys["turkey"], pbys["turkey"])
    expected = json.loads(GOLDEN.read_text())
    assert np.allclose(f, expected, atol=1e-6), "forecast drifted from golden fixture"


@needs_artifacts
def test_portfolio_accuracy_target(model, feature_meta, units_price_maps):
    """Volume-weighted (portfolio) accuracy across all 8 products should clear 70 on a fixed date."""
    ubys, pbys = units_price_maps
    d = date_to_d("2015-06-15")
    num = den = 0.0
    for s in SERIES_IDS:
        f = np.array(recursive_forecast(s, d, model, feature_meta, ubys[s], pbys[s]))
        a = np.array([ubys[s].get(d + i, 0.0) for i in range(HORIZON)])
        num += np.abs(a - f).sum()
        den += a.sum()
    portfolio_acc = max(0.0, 100 - num / den * 100)
    assert portfolio_acc >= 70.0, f"portfolio accuracy {portfolio_acc:.1f} below 70"
