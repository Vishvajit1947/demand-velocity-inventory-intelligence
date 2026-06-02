"""MT-13 — Train the global LightGBM forecaster (03_ALGORITHM_SPEC.md §2).

One-time dev-PC step. Reads data/processed/series_daily.parquet, builds features
(MT-12), trains LightGBM with early stopping on a per-series mean-scaled target
(03 §2 — prevents high-volume series from dominating the Tweedie loss), and writes
the committed artifacts:
    backend/app/models/model.pkl          (pickled lightgbm.Booster @ best_iteration)
    backend/app/models/feature_meta.json  (feature order + categoricals + best_iteration
                                           + series_scale + train_mean_price + categories
                                           + lgbm_version)

Run from backend/:  python -m app.ml.train

The extra metadata fields (series_scale, train_mean_price, categories, lgbm_version) are
required by forecast_engine.py (MT-15) and must always be present.
"""
from __future__ import annotations

import json
import pickle

import lightgbm as lgb
import numpy as np
import pandas as pd

from app.config import (
    FEATURE_META_PATH,
    MODEL_PATH,
    SERIES_DAILY_PATH,
    TRAIN_END_D,
    TRAIN_START_D,
    FIT_START_D,
    FIT_END_D,
    VALID_START_D,
    VALID_END_D,
)
from app.ml.features import CATEGORICAL_FEATURES, FEATURES, build_features

# ── locked from 03_ALGORITHM_SPEC.md §2 ────────────────────────────────────────
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

# train/valid split for early stopping — from config.py (sourced from 03 §2)
# FIT_START_D=29, FIT_END_D=1011, VALID_START_D=1012, VALID_END_D=1095
TRAIN_FOLD_LO = FIT_START_D     # 29
TRAIN_FOLD_HI = FIT_END_D       # 1011
VALID_FOLD_LO = VALID_START_D   # 1012
VALID_FOLD_HI = VALID_END_D     # 1095


# ── helpers ────────────────────────────────────────────────────────────────────

def _compute_series_scale(series_daily: pd.DataFrame) -> dict[str, float]:
    """Per-series scale = mean of POSITIVE units over TRAIN period (active-period mean).

    03_ALGORITHM_SPEC.md §2 — prevents high-volume series (milk ~507 u/day) from dominating
    the Tweedie loss versus low-volume series (cocoa ~7 u/day).
    Minimum value clamped to 1e-6 to guard against division by zero at inference.
    """
    out: dict[str, float] = {}
    for s, g in series_daily.assign(
        series_id=series_daily["series_id"].astype(str)
    ).groupby("series_id"):
        train_pos = g[(g["d_index"] <= TRAIN_END_D) & (g["units"] > 0)]["units"]
        out[s] = max(1e-6, float(train_pos.mean())) if len(train_pos) else 1.0
    return out


def _compute_train_mean_price(series_daily: pd.DataFrame) -> dict[str, float]:
    """Per-series mean sell_price over TRAIN days [TRAIN_START_D, TRAIN_END_D].

    Used by forecast_engine.py to compute price_rel at inference (03 §3.4).
    Returns 1.0 if the mean is 0 or NaN (safe default matching features.py logic).
    """
    out: dict[str, float] = {}
    for s, g in series_daily.assign(
        series_id=series_daily["series_id"].astype(str)
    ).groupby("series_id"):
        train = g[(g["d_index"] >= TRAIN_START_D) & (g["d_index"] <= TRAIN_END_D)]
        mean_p = train["sell_price"].mean()
        out[s] = float(mean_p) if (not np.isnan(mean_p) and mean_p != 0.0) else 1.0
    return out


def _make_lgb_dataset(
    feat: pd.DataFrame,
    series_daily: pd.DataFrame,
    scale: dict[str, float],
    lo: int,
    hi: int,
    reference: lgb.Dataset | None = None,
) -> lgb.Dataset:
    """Slice feat to d_index ∈ [lo, hi], build scaled target, return lgb.Dataset."""
    mask = (feat["d_index"] >= lo) & (feat["d_index"] <= hi)
    sub = feat.loc[mask].reset_index(drop=True)

    # Re-attach units for scaling: join on positional alignment (feat keeps all rows from
    # series_daily after build_features sorts by series_id, d_index).
    # Safer: re-join from series_daily on (series_id string, d_index).
    sd_map = (
        series_daily[["series_id", "d_index", "units"]]
        .assign(series_id=series_daily["series_id"].astype(str))
        .set_index(["series_id", "d_index"])["units"]
    )
    sid_str = sub["series_id"].astype(str)
    raw_units = pd.Series(
        [float(sd_map.get((str(sid_str.iloc[i]), int(sub["d_index"].iloc[i])), 0.0))
         for i in range(len(sub))],
        dtype="float64",
    )
    scale_vec = sid_str.map(scale).astype("float64")
    y = (raw_units / scale_vec).to_numpy()

    X = sub[FEATURES].copy()
    # Ensure categorical dtypes are preserved (already set by build_features, but be explicit)
    for c in CATEGORICAL_FEATURES:
        X[c] = X[c].astype("category")

    return lgb.Dataset(
        X,
        label=y,
        categorical_feature=CATEGORICAL_FEATURES,
        reference=reference,
        free_raw_data=False,
    )


def load_series_daily() -> pd.DataFrame:
    """Load series_daily.parquet (02_DATA_SPEC.md §4)."""
    if not SERIES_DAILY_PATH.exists():
        raise FileNotFoundError(
            f"Missing {SERIES_DAILY_PATH} — run MT-10 (data_prep) first."
        )
    return pd.read_parquet(SERIES_DAILY_PATH)


# ── main training entry point ──────────────────────────────────────────────────

def train() -> lgb.Booster:
    """Train the booster and write model.pkl + feature_meta.json (03_ALGORITHM_SPEC §2)."""
    np.random.seed(42)

    # 1. Load data
    series_daily = load_series_daily()

    # 2. Build feature matrix (MT-12) — returns FEATURES cols + d_index helper
    feat = build_features(series_daily)

    # 3. Compute per-series metadata required by forecast_engine.py (03 §2 / §3.4)
    scale = _compute_series_scale(series_daily)
    tmean = _compute_train_mean_price(series_daily)

    # 4. Build LightGBM datasets with scaled target
    train_set = _make_lgb_dataset(feat, series_daily, scale, TRAIN_FOLD_LO, TRAIN_FOLD_HI)
    valid_set = _make_lgb_dataset(
        feat, series_daily, scale, VALID_FOLD_LO, VALID_FOLD_HI, reference=train_set
    )

    # 5. Extract category lists from training data (required by row_to_frame at inference)
    train_mask = (feat["d_index"] >= TRAIN_FOLD_LO) & (feat["d_index"] <= TRAIN_FOLD_HI)
    X_train = feat.loc[train_mask, FEATURES].copy()
    for c in CATEGORICAL_FEATURES:
        X_train[c] = X_train[c].astype("category")
    categories = {
        c: [str(x) for x in X_train[c].cat.categories]
        for c in CATEGORICAL_FEATURES
    }

    # 6. Train
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

    # 7. Write artifacts
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(MODEL_PATH, "wb") as fh:
        pickle.dump(booster, fh)

    meta = {
        "features": list(FEATURES),
        "categorical_features": list(CATEGORICAL_FEATURES),
        "best_iteration": best_iteration,
        "categories": categories,
        "series_scale": scale,
        "train_mean_price": tmean,
        "lgbm_version": lgb.__version__,
    }
    with open(FEATURE_META_PATH, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)

    print(f"[MT-13] wrote {MODEL_PATH} (best_iteration={best_iteration})")
    print(f"[MT-13] wrote {FEATURE_META_PATH}")
    return booster


if __name__ == "__main__":
    train()
