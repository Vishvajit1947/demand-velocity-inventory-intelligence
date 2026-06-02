"""raw M5 CSVs -> data/processed/series_daily.parquet  (docs/02_DATA_SPEC.md sec 4).
Run once on the dev PC (which has the large raw CSVs):  python -m app.ml.data_prep
The output parquet is committed; students never need the raw CSVs.
"""
from __future__ import annotations
import pandas as pd
from app.config import (DATA_RAW, SERIES_DAILY_PATH, PRODUCTS, TEST_END_D)

# Derived from PRODUCTS: item_id -> series_id mapping.
ITEM_TO_SERIES = {meta["item_id"]: sid for sid, meta in PRODUCTS.items()}

# MT-12 tests import OUTPUT_PARQUET from this module (04_BACKEND_ARCHITECTURE §1).
OUTPUT_PARQUET = SERIES_DAILY_PATH

ITEM_IDS = list(ITEM_TO_SERIES.keys())



def build_series_daily() -> pd.DataFrame:
    cal = pd.read_csv(DATA_RAW / "calendar.csv")
    cal["d_index"] = cal["d"].str.removeprefix("d_").astype(int)
    cal = cal[cal["d_index"] <= TEST_END_D].copy()
    for c in ("event_name_1", "event_type_1", "event_name_2", "event_type_2"):
        cal[c] = cal[c].fillna("none").replace("", "none")
    cal["snap_count"] = cal["snap_CA"] + cal["snap_TX"] + cal["snap_WI"]
    cal_keep = cal[["d", "d_index", "date", "wm_yr_wk", "wday", "month", "year",
                    "snap_count", "event_name_1", "event_type_1",
                    "event_name_2", "event_type_2"]]

    sales = pd.read_csv(DATA_RAW / "sales_train_evaluation.csv")
    sales = sales[sales["item_id"].isin(ITEM_IDS)]
    d_cols = [f"d_{i}" for i in range(1, TEST_END_D + 1)]
    long = sales.melt(id_vars=["item_id"], value_vars=d_cols, var_name="d", value_name="units")
    long = long.groupby(["item_id", "d"], as_index=False)["units"].sum()   # SUM across stores

    parts = []
    for chunk in pd.read_csv(DATA_RAW / "sell_prices.csv", chunksize=1_000_000):
        parts.append(chunk[chunk["item_id"].isin(ITEM_IDS)])
    prices = pd.concat(parts, ignore_index=True)
    price_wk = prices.groupby(["item_id", "wm_yr_wk"], as_index=False)["sell_price"].mean()  # MEAN across stores

    df = long.merge(cal_keep, on="d", how="left").merge(price_wk, on=["item_id", "wm_yr_wk"], how="left")
    df["series_id"] = df["item_id"].map(ITEM_TO_SERIES)
    df["product_name"] = df["series_id"].map(lambda s: PRODUCTS[s]["name"])
    df["dept_id"] = df["series_id"].map(lambda s: PRODUCTS[s]["dept_id"])
    df = df.sort_values(["series_id", "d_index"]).reset_index(drop=True)
    df["sell_price"] = df.groupby("series_id")["sell_price"].transform(lambda s: s.ffill().bfill())

    out = pd.DataFrame({
        "series_id": df["series_id"].astype("category"),
        "item_id": df["item_id"].astype("category"),
        "product_name": df["product_name"].astype("category"),
        "dept_id": df["dept_id"].astype("category"),
        "d_index": df["d_index"].astype("int32"),
        "date": pd.to_datetime(df["date"]).dt.date,
        "units": df["units"].astype("float32"),
        "sell_price": df["sell_price"].astype("float32"),
        "wm_yr_wk": df["wm_yr_wk"].astype("int32"),
        "wday": df["wday"].astype("int8"),
        "month": df["month"].astype("int8"),
        "year": df["year"].astype("int16"),
        "snap_count": df["snap_count"].astype("int8"),
        "event_name_1": df["event_name_1"].astype("category"),
        "event_type_1": df["event_type_1"].astype("category"),
        "event_name_2": df["event_name_2"].astype("category"),
        "event_type_2": df["event_type_2"].astype("category"),
    })
    return out


def main() -> None:
    out = build_series_daily()
    assert len(out) == len(PRODUCTS) * TEST_END_D, f"expected {len(PRODUCTS)*TEST_END_D} rows, got {len(out)}"
    assert out["units"].isna().sum() == 0 and (out["units"] >= 0).all()
    assert out["sell_price"].isna().sum() == 0
    SERIES_DAILY_PATH.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(SERIES_DAILY_PATH, engine="pyarrow", index=False)
    print(f"OK -> {SERIES_DAILY_PATH}  rows={len(out)}  series={out['series_id'].nunique()}")


if __name__ == "__main__":
    main()
