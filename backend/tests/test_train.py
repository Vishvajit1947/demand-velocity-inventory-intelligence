"""MT-13 — artifact + (optional) training tests.

Fast layer (default, -m "not slow"):
  - artifacts exist on disk
  - feature_meta.json schema matches FEATURES / CATEGORICAL_FEATURES from features.py
  - feature_meta.json contains all fields required by forecast_engine.py
  - tiny prediction runs (booster.predict on a hand-built row)

Slow layer (opt-in, -m slow, needs series_daily.parquet present):
  - full retrain writes artifacts and best_iteration > 0
"""
import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.ml.features import CATEGORICAL_FEATURES, FEATURES

# ── paths (resolved relative to this test file) ────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = REPO_ROOT / "backend" / "app" / "models" / "model.pkl"
META_PATH = REPO_ROOT / "backend" / "app" / "models" / "feature_meta.json"
SERIES_DAILY = REPO_ROOT / "data" / "processed" / "series_daily.parquet"


# ── primary verification: committed artifacts (fast, offline) ──────────────────

def test_artifacts_exist():
    assert MODEL_PATH.exists(), "model.pkl missing — run `python -m app.ml.train`"
    assert META_PATH.exists(), "feature_meta.json missing — run `python -m app.ml.train`"


def test_feature_meta_core_schema():
    """features / categorical_features / best_iteration match spec (MT-13 §3)."""
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    assert meta["features"] == list(FEATURES), "features list mismatch"
    assert meta["categorical_features"] == list(CATEGORICAL_FEATURES), \
        "categorical_features list mismatch"
    assert isinstance(meta["best_iteration"], int), "best_iteration must be int"
    assert meta["best_iteration"] > 0, "best_iteration must be > 0"


def test_feature_meta_forecast_engine_fields():
    """forecast_engine.py requires series_scale, train_mean_price, categories, lgbm_version.
    A missing key would raise KeyError at inference — guard it here."""
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))

    # series_scale: per-series positive float
    assert "series_scale" in meta, "series_scale missing from feature_meta.json"
    assert isinstance(meta["series_scale"], dict)
    for series_id, v in meta["series_scale"].items():
        assert isinstance(v, (int, float)) and v > 0, \
            f"series_scale[{series_id}] must be a positive number, got {v}"

    # train_mean_price: per-series positive float
    assert "train_mean_price" in meta, "train_mean_price missing from feature_meta.json"
    assert isinstance(meta["train_mean_price"], dict)
    for series_id, v in meta["train_mean_price"].items():
        assert isinstance(v, (int, float)) and v > 0, \
            f"train_mean_price[{series_id}] must be a positive number, got {v}"

    # categories: present for every categorical feature
    assert "categories" in meta, "categories missing from feature_meta.json"
    cats = meta["categories"]
    assert isinstance(cats, dict)
    for col in CATEGORICAL_FEATURES:
        assert col in cats, f"categories missing key: {col}"
        assert isinstance(cats[col], list) and len(cats[col]) > 0, \
            f"categories[{col}] must be a non-empty list"

    # lgbm_version: non-empty string
    assert "lgbm_version" in meta, "lgbm_version missing from feature_meta.json"
    assert isinstance(meta["lgbm_version"], str) and len(meta["lgbm_version"]) > 0


def test_feature_meta_series_coverage():
    """series_scale and train_mean_price must cover all 8 series."""
    from app.config import SERIES_IDS
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    for sid in SERIES_IDS:
        assert sid in meta["series_scale"], f"series_scale missing series: {sid}"
        assert sid in meta["train_mean_price"], f"train_mean_price missing series: {sid}"


def test_tiny_prediction_runs():
    """Load the booster and predict on a tiny hand-built frame in FEATURES order.
    This exercises the exact path forecast_engine.py uses: pickle.load -> booster.predict."""
    with open(MODEL_PATH, "rb") as fh:
        booster = pickle.load(fh)
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))

    # Hand-built row matching the feature contract (03_ALGORITHM_SPEC §3)
    row = {
        "series_id": "turkey", "wday": 1, "month": 11, "year": 2013,
        "day_of_month": 23, "week_of_year": 47, "is_weekend": 1, "snap_count": 1,
        "event_name_1": "none", "event_type_1": "none",
        "event_name_2": "none", "event_type_2": "none", "is_event": 0,
        "days_to_next_event": 5, "days_since_last_event": 10,
        "sell_price": 9.5, "price_rel": 1.0,
        "lag_1": 10.0, "lag_7": 12.0, "lag_14": 8.0, "lag_28": 9.0,
        "roll_mean_7": 11.0, "roll_mean_28": 10.0,
        "roll_std_7": 2.0, "roll_std_28": 3.0, "roll_mean_7_by_wday": 11.5,
    }
    X = pd.DataFrame([row])[FEATURES]
    # Set categorical dtypes using the committed categories (mirrors row_to_frame logic)
    cats = meta["categories"]
    for c in CATEGORICAL_FEATURES:
        X[c] = pd.Categorical([str(row[c])], categories=[str(z) for z in cats[c]])

    yhat = booster.predict(X, num_iteration=meta["best_iteration"])
    assert yhat.shape == (1,)
    assert np.isfinite(yhat[0]), f"prediction is not finite: {yhat[0]}"
    assert yhat[0] >= 0, f"raw booster output should be non-negative (Tweedie): {yhat[0]}"


def test_forecast_engine_compat_no_keyerror():
    """Simulate the exact key lookups forecast_engine.py performs to confirm no KeyError."""
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    series_id = "turkey"

    # Lines from forecast_engine.py (recursive_forecast):
    _ = meta["series_scale"][series_id]    # line: scale = feature_meta["series_scale"][series_id]
    _ = meta["train_mean_price"][series_id]  # line: tmean = feature_meta["train_mean_price"][series_id]
    _ = meta["categories"]                  # line: categories = feature_meta["categories"]
    _ = meta["best_iteration"]              # line: best = feature_meta["best_iteration"]
    # No KeyError means this test passes.


# ── slow: full retrain reproduces artifacts (opt-in, needs processed data) ─────

@pytest.mark.slow
@pytest.mark.skipif(not SERIES_DAILY.exists(), reason="series_daily.parquet not present")
def test_training_runs_and_writes_artifacts():
    """Re-run train() end-to-end; verify artifacts are updated correctly."""
    from app.ml import train as train_mod

    booster = train_mod.train()
    assert booster.best_iteration > 0

    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    assert meta["best_iteration"] == int(booster.best_iteration)
    assert meta["features"] == list(FEATURES)
    assert meta["categorical_features"] == list(CATEGORICAL_FEATURES)
    assert "series_scale" in meta
    assert "train_mean_price" in meta
    assert "categories" in meta
    assert "lgbm_version" in meta
