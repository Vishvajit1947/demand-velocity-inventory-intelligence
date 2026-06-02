"""
Shared pytest fixtures (07_TESTING_STRATEGY.md §2).

  - `store`  : a session-scoped, loaded Store (model + data + profiles). Provided by
               app.services.store.get_store() — implemented in MT-21.
  - `client` : a FastAPI TestClient over app.main:app — implemented in MT-24.

Both fixtures import their targets LAZILY (inside the fixture body) so this conftest is
valid and pytest collects with no import errors BEFORE MT-21 / MT-24 exist. Until those
tasks land, any test that requests these fixtures will skip with a clear reason.

This file also makes the `app` package importable when running `pytest` from the
`backend/` directory (it inserts `backend/` onto sys.path).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure `import app...` works when pytest is run from backend/ (or the repo root).
_BACKEND_DIR = Path(__file__).resolve().parents[1]  # <repo_root>/backend
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))


@pytest.fixture(scope="session")
def store():
    """
    Session-scoped loaded Store singleton (MT-21). Loads model/data/profiles once.

    Becomes usable once app/services/store.py (MT-21) lands. Until then the import
    fails and the test that requested this fixture is skipped (not errored).
    """
    try:
        from app.services.store import get_store
    except ImportError:
        pytest.skip("app.services.store not implemented yet (lands in MT-21)")
    return get_store()


@pytest.fixture(scope="session")
def client():
    """
    FastAPI TestClient over app.main:app (MT-24).

    Becomes usable once app/main.py (MT-24) lands. Until then the test that requested
    this fixture is skipped (not errored).
    """
    try:
        from fastapi.testclient import TestClient

        from app.main import app
    except ImportError:
        pytest.skip("app.main not implemented yet (lands in MT-24)")
    return TestClient(app)


# --- compatibility: skip marker + direct-artifact fixtures (skip when artifacts absent)
try:
    from app.config import SERIES_DAILY_PATH, MODEL_PATH, FEATURE_META_PATH, PROFILES_PATH
except Exception:
    SERIES_DAILY_PATH = MODEL_PATH = FEATURE_META_PATH = PROFILES_PATH = None

ARTIFACTS_PRESENT = all(p is not None and p.exists() for p in (SERIES_DAILY_PATH, MODEL_PATH, FEATURE_META_PATH, PROFILES_PATH))
needs_artifacts = pytest.mark.skipif(not ARTIFACTS_PRESENT, reason="model/data artifacts not built")


@pytest.fixture(scope="session")
def series_daily():
    if not ARTIFACTS_PRESENT:
        pytest.skip("model/data artifacts not present")
    import pandas as _pd

    df = _pd.read_parquet(SERIES_DAILY_PATH)
    df["series_id"] = df["series_id"].astype(str)
    return df


@pytest.fixture(scope="session")
def model():
    if not ARTIFACTS_PRESENT:
        pytest.skip("model/data artifacts not present")
    import pickle as _pickle

    return _pickle.load(open(MODEL_PATH, "rb"))


@pytest.fixture(scope="session")
def feature_meta():
    if not ARTIFACTS_PRESENT:
        pytest.skip("model/data artifacts not present")
    import json as _json

    return _json.loads(FEATURE_META_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def profiles():
    if not ARTIFACTS_PRESENT:
        pytest.skip("model/data artifacts not present")
    import json as _json

    return _json.loads(PROFILES_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def units_price_maps(series_daily):
    ubys = {s: dict(zip(g.d_index, g.units.astype(float))) for s, g in series_daily.groupby("series_id")}
    pbys = {s: dict(zip(g.d_index, g.sell_price.astype(float))) for s, g in series_daily.groupby("series_id")}
    return ubys, pbys


# --- MT-13: register the `slow` marker so pytest -m "not slow" works cleanly ---
def pytest_configure(config):
    config.addinivalue_line(
        "markers", "slow: long-running (e.g. full model retrain) — opt-in with -m slow"
    )
