"""Train the forecasting model -> backend/app/models/{model.pkl, feature_meta.json}.
docs/03_ALGORITHM_SPEC.md sec 2. Single global LightGBM (Tweedie) on a per-series mean-SCALED
target so high-volume series (milk) don't drown out low-volume ones (cocoa).
Run once on the dev PC:  python -m app.ml.train
"""
from __future__ import annotations
import json, pickle
import numpy as np
import pandas as pd
import lightgbm as lgb
from app.config import (SERIES_DAILY_PATH, MODEL_PATH, FEATURE_META_PATH, TRAIN_END_D,
                        FIT_START_D, FIT_END_D, VALID_START_D, VALID_END_D)
from app.ml.features import (FEATURES, CATEGORICAL_FEATURES, build_feature_matrix,
                             as_lgb_frame, train_mean_prices)

LGBM_PARAMS = {
    "objective": "tweedie", "tweedie_variance_power": 1.1, "metric": "rmse",
    "learning_rate": 0.03, "num_leaves": 63, "min_child_samples": 50,
    "subsample": 0.8, "subsample_freq": 1, "colsample_bytree": 0.8,
    "reg_alpha": 0.1, "reg_lambda": 0.1, "max_depth": -1, "n_jobs": -1,
    "seed": 42, "verbosity": -1,
}
NUM_BOOST_ROUND = 2000
EARLY_STOPPING_ROUNDS = 100


def series_scale(series_daily: pd.DataFrame, train_end_d: int) -> dict[str, float]:
    """Per-series scale = mean of POSITIVE units over the train period (active-period mean)."""
    out = {}
    for s, g in series_daily.assign(series_id=series_daily["series_id"].astype(str)).groupby("series_id"):
        act = g[(g["d_index"] <= train_end_d) & (g["units"] > 0)]["units"]
        out[s] = max(1e-6, float(act.mean())) if len(act) else 1.0
    return out


def train() -> lgb.Booster:
    sd = pd.read_parquet(SERIES_DAILY_PATH)
    df = build_feature_matrix(sd, TRAIN_END_D)
    scale = series_scale(sd, TRAIN_END_D)
    tmean = train_mean_prices(sd, TRAIN_END_D)
    df["_scale"] = df["series_id"].map(scale)

    fit = df[(df["d_index"] >= FIT_START_D) & (df["d_index"] <= FIT_END_D)]
    val = df[(df["d_index"] >= VALID_START_D) & (df["d_index"] <= VALID_END_D)]
    Xfit, yfit = as_lgb_frame(fit), (fit["units"] / fit["_scale"]).to_numpy()
    Xval, yval = as_lgb_frame(val), (val["units"] / val["_scale"]).to_numpy()

    categories = {c: [str(x) for x in Xfit[c].cat.categories] for c in CATEGORICAL_FEATURES}
    dtrain = lgb.Dataset(Xfit, yfit, categorical_feature=CATEGORICAL_FEATURES, free_raw_data=False)
    dvalid = lgb.Dataset(Xval, yval, reference=dtrain, categorical_feature=CATEGORICAL_FEATURES, free_raw_data=False)
    booster = lgb.train(LGBM_PARAMS, dtrain, NUM_BOOST_ROUND, valid_sets=[dvalid],
                        callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS), lgb.log_evaluation(0)])
    best = int(booster.best_iteration or booster.current_iteration())

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(booster, f)
    meta = {"features": FEATURES, "categorical_features": CATEGORICAL_FEATURES,
            "best_iteration": best, "categories": categories,
            "series_scale": scale, "train_mean_price": tmean,
            "lgbm_version": lgb.__version__}
    FEATURE_META_PATH.write_text(json.dumps(meta, indent=2))
    print(f"OK -> {MODEL_PATH}  best_iteration={best}")
    return booster


if __name__ == "__main__":
    train()
