"""Tests for app.ml.features — column contract, no leakage, batch/single-row consistency."""
import numpy as np
from app.config import TRAIN_END_D
from app.ml.features import (FEATURES, CATEGORICAL_FEATURES, build_feature_matrix,
                             build_single_row, train_mean_prices)
from tests.conftest import needs_artifacts


@needs_artifacts
def test_feature_columns_and_dtypes(series_daily):
    df = build_feature_matrix(series_daily, TRAIN_END_D)
    for c in FEATURES:
        assert c in df.columns
    # no NaN in features for rows with full history
    rows = df[df["d_index"] >= 29]
    assert rows[FEATURES].isna().sum().sum() == 0


@needs_artifacts
def test_no_leakage_lag1(series_daily):
    df = build_feature_matrix(series_daily, TRAIN_END_D)
    one = df[(df["series_id"] == "milk")].sort_values("d_index")
    # lag_1 at day t equals units at day t-1
    u = dict(zip(one["d_index"], one["units"]))
    sample = one[one["d_index"] == 800].iloc[0]
    assert abs(sample["lag_1"] - u[799]) < 1e-6


@needs_artifacts
def test_batch_single_row_consistency(series_daily):
    """build_single_row must reproduce the batch features for an all-actual day."""
    df = build_feature_matrix(series_daily, TRAIN_END_D)
    tmean = train_mean_prices(series_daily, TRAIN_END_D)
    s, d = "turkey", 1300
    g = series_daily[series_daily["series_id"] == s]
    u = dict(zip(g["d_index"], g["units"].astype(float)))
    price = dict(zip(g["d_index"], g["sell_price"].astype(float)))
    last_price = price[d]
    row = build_single_row(s, d, {k: v for k, v in u.items() if k < d}, last_price, tmean[s])
    batch = df[(df["series_id"] == s) & (df["d_index"] == d)].iloc[0]
    for f in ("lag_1", "lag_7", "lag_28", "roll_mean_7", "roll_mean_28", "roll_std_7",
              "roll_mean_7_by_wday", "snap_count", "days_to_next_event"):
        assert abs(float(row[f]) - float(batch[f])) < 1e-5, f"{f} mismatch"
