"""MT-12 tests — build_features() contract & leakage (03_ALGORITHM_SPEC §3)."""
import pandas as pd
import pytest

from app.ml.data_prep import OUTPUT_PARQUET
from app.ml.features import CATEGORICAL_FEATURES, FEATURES, build_features


@pytest.fixture(scope="module")
def series_daily() -> pd.DataFrame:
    return pd.read_parquet(OUTPUT_PARQUET, engine="pyarrow")


@pytest.fixture(scope="module")
def feats(series_daily: pd.DataFrame) -> pd.DataFrame:
    return build_features(series_daily)


def test_columns_exact_order(feats: pd.DataFrame):
    # FEATURES in exact order, with d_index helper trailing; units (target) not present.
    assert list(feats.columns) == FEATURES + ["d_index"]
    assert "units" not in feats.columns


def test_categoricals_are_category_dtype(feats: pd.DataFrame):
    for col in CATEGORICAL_FEATURES:
        assert str(feats[col].dtype) == "category", col


def test_non_categoricals_are_numeric(feats: pd.DataFrame):
    numeric = [c for c in FEATURES if c not in CATEGORICAL_FEATURES]
    for col in numeric:
        assert pd.api.types.is_numeric_dtype(feats[col]), col


def test_lag1_equals_prev_units_no_same_day_leakage(series_daily: pd.DataFrame,
                                                    feats: pd.DataFrame):
    # For a known series, lag_1 at day t must equal actual units at t-1 (strictly backward).
    sd = series_daily[series_daily["series_id"] == "turkey"].sort_values("d_index")
    units_by_d = dict(zip(sd["d_index"].tolist(), sd["units"].tolist()))

    f = feats.copy()
    f["series_id"] = f["series_id"].astype(str)
    ft = f[f["series_id"] == "turkey"].sort_values("d_index").reset_index(drop=True)

    # Re-attach d_index already present; check several interior days.
    for t in (30, 100, 500, 1300, 1941):
        row = ft[ft["d_index"] == t]
        if row.empty:
            continue
        expected = units_by_d.get(t - 1)
        got = float(row["lag_1"].iloc[0])
        assert got == pytest.approx(expected, abs=1e-6), f"lag_1 mismatch at d={t}"


def test_no_nan_for_rows_with_d_index_ge_29(feats: pd.DataFrame):
    rows = feats[feats["d_index"] >= 29]
    bad = rows[FEATURES].isna().sum()
    assert bad.sum() == 0, f"NaN present in d_index>=29 rows:\n{bad[bad > 0]}"


def test_early_rows_may_have_nan_windows(feats: pd.DataFrame):
    # Sanity: lag_28 at d_index==1 is undefined (no day -27) -> NaN. Confirms backward windows.
    early = feats[feats["d_index"] == 1]
    assert early["lag_28"].isna().all()


def test_roll_std_population_nonneg(feats: pd.DataFrame):
    rows = feats[feats["d_index"] >= 29]
    assert (rows["roll_std_7"] >= 0).all()
    assert (rows["roll_std_28"] >= 0).all()


def test_is_event_matches_event_name(feats: pd.DataFrame):
    en = feats["event_name_1"].astype(str)
    assert ((en != "none").astype(int) == feats["is_event"]).all()
