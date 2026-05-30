# MT-13 — Model Training (`model.pkl` + `feature_meta.json`)

## 1. Context
Phase 1 of the ML pipeline (`MT-INDEX.md`, depends on **MT-12**). This task trains the single
global LightGBM forecaster defined in `03_ALGORITHM_SPEC.md` §2 and writes the two committed
artifacts that every downstream task (MT-15 forecast engine, MT-21 store loader) loads:
`backend/app/models/model.pkl` and `backend/app/models/feature_meta.json`.

Training is a **one-time dev-PC step** (`04_BACKEND_ARCHITECTURE.md` §7): the outputs are
committed to git so students never retrain. Re-running on the same data + pinned versions
(`04` §6) reproduces byte-identical artifacts because everything is seeded (`seed=42`,
`03` §7).

## 2. Prerequisites
- Read and obey: `03_ALGORITHM_SPEC.md` §2 (model + hyperparameters + split), §3 (features),
  §6 ordering; `02_DATA_SPEC.md` §3 (train split), §4 (`series_daily.parquet` schema);
  `04_BACKEND_ARCHITECTURE.md` §1 (paths), §6 (pinned deps); `07_TESTING_STRATEGY.md` §2.
- **MT-10** has produced `data/processed/series_daily.parquet`.
- **MT-12** has produced `backend/app/ml/features.py` exposing:
  ```python
  FEATURES: list[str]              # exact order from 03 §3.6
  CATEGORICAL_FEATURES: list[str]  # exact subset from 03 §3.6
  def build_features(df: pd.DataFrame) -> pd.DataFrame:
      """Return df with all 26 FEATURES columns (03 §3) + 'd_index' + 'units' + 'series_id'.
      Categorical features are pandas 'category' dtype. No same-day leakage."""
  ```
- Python **3.11**, `lightgbm==4.5.0`, `pandas==2.2.3`, `numpy==2.1.3`, `pyarrow==18.1.0`
  (`04` §6). Run all commands from `backend/`.

> If `features.py` is not yet present, MT-12 must be completed first; this task does **not**
> redefine features — it imports them.

## 3. Goal
Produce, from `series_daily.parquet`:
1. `backend/app/models/model.pkl` — a pickled LightGBM `Booster` at `best_iteration`.
2. `backend/app/models/feature_meta.json` —
   `{"features": FEATURES, "categorical_features": CATEGORICAL_FEATURES, "best_iteration": N}`
   (`N > 0`).

Exposed as a CLI: `python -m app.ml.train` (run from `backend/`).

## 4. Design (locked decisions; cite foundation sections)
- **Model & hyperparameters** — verbatim `LGBM_PARAMS`, `NUM_BOOST_ROUND=2000`,
  `EARLY_STOPPING_ROUNDS=100` from `03` §2. Do **not** tune.
- **Split for early stopping** (`03` §2):
  - Train fold: TRAIN rows with `d_index ∈ [29, 1011]`.
  - Valid fold: TRAIN rows with `d_index ∈ [1012, 1095]`.
  - First 28 days are excluded because lag windows are undefined (`03` §3.5).
  - The validation fold is **not** folded back into training after early stopping (`03` §2).
- **Training call** — `lgb.train(LGBM_PARAMS, train_set, num_boost_round=2000,
  valid_sets=[valid], callbacks=[early_stopping(100), log_evaluation(0)])`, passing
  `categorical_feature=CATEGORICAL_FEATURES`. `best_iteration` is recorded.
- **Feature order** — `build_features()` already emits columns in `FEATURES` order (`03` §3.6);
  `train.py` selects `X = df[FEATURES]` to be explicit and stable.
- **Categoricals** — passed as pandas `category` dtype (already set by `build_features`) **and**
  named in `categorical_feature=` so LightGBM uses native categorical splits (`03` §3).
- **Artifact format (locked here):** **pickle of the `Booster`** (`pickle.dump(booster, ...)`),
  *not* `booster.save_model()`. Rationale: a single round-trippable Python object is the simplest
  thing for `services/store.py` (MT-21) to load with `pickle.load`, and `best_iteration` /
  `predict(num_iteration=...)` semantics are preserved. `feature_meta.json` carries
  `best_iteration` so callers can pass `num_iteration=best_iteration` to `predict`.
- **Determinism** — `seed=42` is inside `LGBM_PARAMS`; we also seed numpy. `n_jobs=-1` is
  deterministic for LightGBM given the seed.
- **Paths** — exactly `backend/app/models/model.pkl` and
  `backend/app/models/feature_meta.json` (`04` §1).

## 5. Implementation (exact file paths from 04 §1; FULL runnable code)

### `backend/app/ml/train.py`
```python
"""MT-13 — Train the global LightGBM forecaster (03_ALGORITHM_SPEC §2).

One-time dev-PC step. Reads data/processed/series_daily.parquet, builds features
(MT-12), trains LightGBM with early stopping, and writes the committed artifacts:
    backend/app/models/model.pkl          (pickled lightgbm.Booster @ best_iteration)
    backend/app/models/feature_meta.json  (feature order + categoricals + best_iteration)

Run from backend/:  python -m app.ml.train
"""
from __future__ import annotations

import json
import pickle
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from app.ml.features import FEATURES, CATEGORICAL_FEATURES, build_features

# ── locked from 03_ALGORITHM_SPEC §2 ───────────────────────────────────────────
LGBM_PARAMS = {
    "objective": "tweedie",
    "tweedie_variance_power": 1.1,
    "metric": "rmse",
    "learning_rate": 0.03,
    "num_leaves": 63,
    "min_child_samples": 50,
    "subsample": 0.8,
    "subsample_freq": 1,
    "colsample_bytree": 0.8,
    "reg_alpha": 0.1,
    "reg_lambda": 0.1,
    "max_depth": -1,
    "n_jobs": -1,
    "seed": 42,
    "verbosity": -1,
}
NUM_BOOST_ROUND = 2000
EARLY_STOPPING_ROUNDS = 100

# train/valid split for early stopping (03 §2)
TRAIN_FOLD_LO, TRAIN_FOLD_HI = 29, 1011
VALID_FOLD_LO, VALID_FOLD_HI = 1012, 1095

# ── paths (04 §1) ──────────────────────────────────────────────────────────────
# train.py lives at backend/app/ml/train.py -> repo root is parents[3]
_REPO_ROOT = Path(__file__).resolve().parents[3]
SERIES_DAILY_PATH = _REPO_ROOT / "data" / "processed" / "series_daily.parquet"
MODELS_DIR = _REPO_ROOT / "backend" / "app" / "models"
MODEL_PATH = MODELS_DIR / "model.pkl"
FEATURE_META_PATH = MODELS_DIR / "feature_meta.json"


def load_series_daily() -> pd.DataFrame:
    """Load the processed long-format daily table (02 §4)."""
    if not SERIES_DAILY_PATH.exists():
        raise FileNotFoundError(
            f"missing {SERIES_DAILY_PATH}; run MT-10 (data_prep) first"
        )
    return pd.read_parquet(SERIES_DAILY_PATH)


def _make_dataset(feat: pd.DataFrame, lo: int, hi: int) -> tuple[pd.DataFrame, pd.Series]:
    """Slice the feature frame to d_index in [lo, hi] and split X / y (03 §2)."""
    mask = (feat["d_index"] >= lo) & (feat["d_index"] <= hi)
    sub = feat.loc[mask]
    X = sub[FEATURES].copy()
    y = sub["units"].astype("float64").copy()
    return X, y


def train() -> lgb.Booster:
    """Train the booster and write model.pkl + feature_meta.json (03 §2)."""
    np.random.seed(42)

    raw = load_series_daily()
    feat = build_features(raw)

    X_tr, y_tr = _make_dataset(feat, TRAIN_FOLD_LO, TRAIN_FOLD_HI)
    X_va, y_va = _make_dataset(feat, VALID_FOLD_LO, VALID_FOLD_HI)

    train_set = lgb.Dataset(
        X_tr, label=y_tr, categorical_feature=CATEGORICAL_FEATURES, free_raw_data=False
    )
    valid_set = lgb.Dataset(
        X_va, label=y_va, categorical_feature=CATEGORICAL_FEATURES,
        reference=train_set, free_raw_data=False,
    )

    booster = lgb.train(
        LGBM_PARAMS,
        train_set,
        num_boost_round=NUM_BOOST_ROUND,
        valid_sets=[valid_set],
        categorical_feature=CATEGORICAL_FEATURES,
        callbacks=[
            lgb.early_stopping(EARLY_STOPPING_ROUNDS),
            lgb.log_evaluation(0),
        ],
    )

    best_iteration = int(booster.best_iteration)
    if best_iteration <= 0:
        raise RuntimeError(f"best_iteration must be > 0, got {best_iteration}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    with open(MODEL_PATH, "wb") as fh:
        pickle.dump(booster, fh)

    meta = {
        "features": list(FEATURES),
        "categorical_features": list(CATEGORICAL_FEATURES),
        "best_iteration": best_iteration,
    }
    with open(FEATURE_META_PATH, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)

    print(f"[MT-13] wrote {MODEL_PATH} (best_iteration={best_iteration})")
    print(f"[MT-13] wrote {FEATURE_META_PATH}")
    return booster


if __name__ == "__main__":
    train()
```

> **How to predict with the saved model** (used by MT-15): load with `pickle.load`, then
> `booster.predict(X, num_iteration=feature_meta["best_iteration"])`. `feature_meta["features"]`
> gives the exact column order to build `X`.

## 6. Tests / Verification (exact pytest tests + commands)

Two layers. The **primary** verification (always runs on a cloned repo with committed artifacts,
no raw CSVs, no retraining) checks that the artifacts exist, that `feature_meta` is correct, and
that a tiny prediction runs. The **slow** training test (regenerates the artifacts) is marked
`slow` and skipped unless `series_daily.parquet` is present and the user opts in.

### `backend/tests/test_train.py`
```python
"""MT-13 — artifact + (optional) training tests."""
import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.ml.features import FEATURES, CATEGORICAL_FEATURES
from app.ml import train as train_mod

REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = REPO_ROOT / "backend" / "app" / "models" / "model.pkl"
META_PATH = REPO_ROOT / "backend" / "app" / "models" / "feature_meta.json"
SERIES_DAILY = REPO_ROOT / "data" / "processed" / "series_daily.parquet"


# ── primary verification: committed artifacts (fast, offline) ──────────────────
def test_artifacts_exist():
    assert MODEL_PATH.exists(), "model.pkl missing — run `python -m app.ml.train`"
    assert META_PATH.exists(), "feature_meta.json missing — run `python -m app.ml.train`"


def test_feature_meta_matches_spec():
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    assert meta["features"] == list(FEATURES)
    assert meta["categorical_features"] == list(CATEGORICAL_FEATURES)
    assert isinstance(meta["best_iteration"], int) and meta["best_iteration"] > 0


def test_tiny_prediction_runs():
    """Load the booster and predict on a tiny hand-built frame in FEATURES order."""
    with open(MODEL_PATH, "rb") as fh:
        booster = pickle.load(fh)
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))

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
    for c in CATEGORICAL_FEATURES:
        X[c] = X[c].astype("category")

    yhat = booster.predict(X, num_iteration=meta["best_iteration"])
    assert yhat.shape == (1,)
    assert np.isfinite(yhat[0])


# ── slow: full retrain reproduces artifacts (opt-in, needs processed data) ─────
@pytest.mark.slow
@pytest.mark.skipif(not SERIES_DAILY.exists(), reason="series_daily.parquet not present")
def test_training_runs_and_writes_artifacts(tmp_path, monkeypatch):
    booster = train_mod.train()
    assert booster.best_iteration > 0
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    assert meta["best_iteration"] == int(booster.best_iteration)
    assert meta["features"] == list(FEATURES)
```

### `backend/conftest.py` (add once, project-wide) — register the `slow` marker
```python
def pytest_configure(config):
    config.addinivalue_line("markers", "slow: long-running (e.g. full model retrain)")
```

### Commands (from `backend/`)
```bash
# one-time dev-PC training (needs data/processed/series_daily.parquet)
python -m app.ml.train

# fast verification (default; skips the slow retrain test)
pytest -q tests/test_train.py -m "not slow"

# full retrain test (opt-in, dev PC only)
pytest -q tests/test_train.py -m slow
```

## 7. Acceptance checklist
- [ ] `backend/app/ml/train.py` exists at the exact path (`04` §1) and imports `FEATURES`,
      `CATEGORICAL_FEATURES`, `build_features` from `app.ml.features` (MT-12).
- [ ] `LGBM_PARAMS`, `NUM_BOOST_ROUND=2000`, `EARLY_STOPPING_ROUNDS=100` match `03` §2 verbatim.
- [ ] Train fold `d_index ∈ [29, 1011]`, valid fold `d_index ∈ [1012, 1095]` (`03` §2);
      validation fold is **not** retrained on.
- [ ] `lgb.train(...)` uses `valid_sets=[valid]`, `categorical_feature=CATEGORICAL_FEATURES`,
      `callbacks=[early_stopping(100), log_evaluation(0)]`.
- [ ] `model.pkl` is a pickled `Booster`; `feature_meta.json` =
      `{"features": FEATURES, "categorical_features": CATEGORICAL_FEATURES, "best_iteration": N>0}`.
- [ ] Both artifacts written to `backend/app/models/` (`04` §1) and committed (`04` §7).
- [ ] `python -m app.ml.train` runs from `backend/`.
- [ ] `pytest -q tests/test_train.py -m "not slow"` is green: artifacts exist,
      `feature_meta.features == FEATURES`, `best_iteration > 0`, tiny prediction runs.
- [ ] `seed=42` everywhere; no tuning; no new runtime deps beyond `04` §6.
