"""Pytest setup: make the `app` package importable and provide shared fixtures."""
import sys
from pathlib import Path
import json, pickle
import pandas as pd
import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.config import SERIES_DAILY_PATH, MODEL_PATH, FEATURE_META_PATH, PROFILES_PATH  # noqa: E402

ARTIFACTS_PRESENT = all(p.exists() for p in (SERIES_DAILY_PATH, MODEL_PATH, FEATURE_META_PATH, PROFILES_PATH))
needs_artifacts = pytest.mark.skipif(not ARTIFACTS_PRESENT, reason="model/data artifacts not built")


@pytest.fixture(scope="session")
def series_daily():
    df = pd.read_parquet(SERIES_DAILY_PATH)
    df["series_id"] = df["series_id"].astype(str)
    return df


@pytest.fixture(scope="session")
def model():
    return pickle.load(open(MODEL_PATH, "rb"))


@pytest.fixture(scope="session")
def feature_meta():
    return json.loads(FEATURE_META_PATH.read_text())


@pytest.fixture(scope="session")
def profiles():
    return json.loads(PROFILES_PATH.read_text())


@pytest.fixture(scope="session")
def units_price_maps(series_daily):
    ubys = {s: dict(zip(g.d_index, g.units.astype(float))) for s, g in series_daily.groupby("series_id")}
    pbys = {s: dict(zip(g.d_index, g.sell_price.astype(float))) for s, g in series_daily.groupby("series_id")}
    return ubys, pbys
