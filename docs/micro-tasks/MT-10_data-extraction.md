# MT-10 — Data Extraction → `series_daily.parquet`

## 1. Context
This is the first task in **Phase 1 — ML pipeline** (`MT-INDEX.md`). It transforms the raw
wide-format M5 / Walmart CSVs into the single long-format daily table that **every** downstream
ML step (MT-12 features, MT-13 training, MT-14 profiles, MT-15 forecast) reads. The output
artifact, its exact schema, row count, and every transformation rule are already locked in
`02_DATA_SPEC.md` §1, §2, §3, §4, §5. This task implements that spec verbatim — it makes **no new
decisions**.

The script runs **once** on the dev PC that has the large raw CSVs; its output
(`data/processed/series_daily.parquet`, < 1 MB) is committed to git so cloned repos never need the
raw data (`04_BACKEND_ARCHITECTURE.md` §7).

## 2. Prerequisites
- **Foundation docs:** `02_DATA_SPEC.md` (§1 raw files, §2 the 8 products, §3 split, §4 schema,
  §5 data-quality notes, §6 `PRODUCTS` config), `04_BACKEND_ARCHITECTURE.md` (§1 repo tree, §6 deps),
  `07_TESTING_STRATEGY.md` (§2 conventions, skip-if-raw-absent rule).
- **Tasks:** MT-01 done — `backend/app/config.py` exists and defines `PRODUCTS`, `SERIES_IDS`
  (`02_DATA_SPEC.md` §6).
- **Raw files present on dev PC** (`02_DATA_SPEC.md` §1, relative to repo root):
  - `data/raw/sales_train_evaluation.csv` (30,490 rows; `d_1 … d_1941`)
  - `data/raw/sell_prices.csv` (6,841,121 rows)
  - `data/raw/calendar.csv` (1,969 rows)
- **Environment:** Python 3.11; `pandas==2.2.3`, `numpy==2.1.3`, `pyarrow==18.1.0`
  (`04_BACKEND_ARCHITECTURE.md` §6). Run from `backend/`.

## 3. Goal
Produce `data/processed/series_daily.parquet` with **exactly 15,528 rows** (8 series × 1,941 days),
the **exact columns and dtypes** of `02_DATA_SPEC.md` §4, by:
1. Reading the three raw CSVs.
2. Filtering sales to the 8 `item_id`s from `config.PRODUCTS`.
3. Melting wide `d_1 … d_1941` to long and **summing** units across the 10 stores per
   `(item_id, d)`.
4. Joining `calendar.csv` for `date, wm_yr_wk, wday, month, year`, events, and
   `snap_count = snap_CA + snap_TX + snap_WI`.
5. Computing `sell_price` as the **mean across stores** per `(item_id, wm_yr_wk)`, merging onto days,
   then **forward-fill then back-fill within each series**.
6. Filling empty event strings with the literal `"none"`.
7. Mapping `item_id → series_id / product_name / dept_id` via `config.PRODUCTS`.
8. Writing the parquet via pyarrow and providing a `python -m app.ml.data_prep` CLI.

## 4. Design (locked decisions; cite foundation sections)
Every rule below is **already decided** — do not re-decide.

- **Source file:** use `sales_train_evaluation.csv` (full `d_1 … d_1941`); ignore
  `sales_train_validation.csv`, `sample_submission.csv` (`02_DATA_SPEC.md` §1).
- **The 8 products & identity mapping:** `series_id ↔ item_id ↔ product_name ↔ dept_id` comes
  **only** from `config.PRODUCTS` (`02_DATA_SPEC.md` §2, §6). Order follows `config.SERIES_IDS`.
- **`units`:** SUM of that item's `d_n` across all 10 stores. Intermittent zero days are **kept**
  (`02_DATA_SPEC.md` §4 rules, §5). dtype `float32`.
- **Day index:** `d_index` is the integer parsed from `d_n` (1 … 1941); dtype `int32`.
- **Date join:** always join through `calendar.csv` for `date, wm_yr_wk, wday, month, year`
  (`02_DATA_SPEC.md` §1 "Always join through it"). We restrict calendar to `d_1 … d_1941`
  (the days present in sales evaluation).
- **`snap_count`:** `snap_CA + snap_TX + snap_WI` (0–3), each product sells in all 3 states
  (`02_DATA_SPEC.md` §4). dtype `int8`.
- **`sell_price`:** MEAN of `sell_price` across the (up to 10) stores selling the item that
  `wm_yr_wk`; merged onto each day by `(item_id, wm_yr_wk)`; gaps filled by **forward-fill then
  back-fill within that series only** (`02_DATA_SPEC.md` §4 rules, §5). dtype `float32`. After
  fill there must be **no NaN** (every one of the 8 items has at least one priced week).
- **Events:** empty `event_name_1/2`, `event_type_1/2` become the literal string `"none"`
  (never NaN) (`02_DATA_SPEC.md` §4 rules). All four are `category` dtype.
- **Output schema (EXACT — `02_DATA_SPEC.md` §4):** column order and dtypes:

  | column | dtype |
  |---|---|
  | `series_id` | category |
  | `item_id` | category |
  | `product_name` | category |
  | `dept_id` | category |
  | `d_index` | int32 |
  | `date` | date (stored as `datetime64[ns]`, date-only) |
  | `units` | float32 |
  | `sell_price` | float32 |
  | `wm_yr_wk` | int32 |
  | `wday` | int8 |
  | `month` | int8 |
  | `year` | int16 |
  | `snap_count` | int8 |
  | `event_name_1` | category |
  | `event_type_1` | category |
  | `event_name_2` | category |
  | `event_type_2` | category |

- **Row count:** exactly **15,528** = 8 × 1,941 (`02_DATA_SPEC.md` §4).
- **Output path:** `data/processed/series_daily.parquet`, engine `pyarrow`
  (`04_BACKEND_ARCHITECTURE.md` §1, §6).
- **Purity:** no FastAPI imports; pure data functions + a `__main__` CLI
  (`04_BACKEND_ARCHITECTURE.md` §2).

> The `date` column is stated as logical "date" in `02_DATA_SPEC.md` §4. Parquet/pandas store it
> as `datetime64[ns]` normalized to midnight (date-only). The test asserts it is a datetime dtype.

## 5. Implementation (exact file paths from 04 §1; FULL runnable code)

### File: `backend/app/ml/data_prep.py`
```python
"""MT-10 — Raw M5 CSVs -> data/processed/series_daily.parquet.

Pure data-prep (no FastAPI imports). Implements 02_DATA_SPEC.md sections 1-6 exactly.
Run once on the dev PC that holds the large raw CSVs:

    cd backend
    python -m app.ml.data_prep

Outputs (relative to repo root): data/processed/series_daily.parquet  (15,528 rows).
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from app.config import PRODUCTS, SERIES_IDS

# --- Repo-root-relative paths (this file lives at backend/app/ml/data_prep.py) ---
# parents[0]=ml  [1]=app  [2]=backend  [3]=repo root
REPO_ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = REPO_ROOT / "data" / "raw"
PROCESSED_DIR = REPO_ROOT / "data" / "processed"

SALES_CSV = RAW_DIR / "sales_train_evaluation.csv"
PRICES_CSV = RAW_DIR / "sell_prices.csv"
CALENDAR_CSV = RAW_DIR / "calendar.csv"
OUTPUT_PARQUET = PROCESSED_DIR / "series_daily.parquet"

# 02_DATA_SPEC.md §3: sales_train_evaluation covers d_1 .. d_1941.
N_DAYS = 1941
EXPECTED_ROWS = len(SERIES_IDS) * N_DAYS  # 8 * 1941 = 15528

EVENT_COLS = ["event_name_1", "event_type_1", "event_name_2", "event_type_2"]

# 02_DATA_SPEC.md §4: exact final column order.
OUTPUT_COLUMNS = [
    "series_id", "item_id", "product_name", "dept_id",
    "d_index", "date", "units", "sell_price",
    "wm_yr_wk", "wday", "month", "year", "snap_count",
    "event_name_1", "event_type_1", "event_name_2", "event_type_2",
]


def _item_to_meta() -> pd.DataFrame:
    """Identity mapping item_id -> series_id/product_name/dept_id from config.PRODUCTS.

    02_DATA_SPEC.md §2, §6. Row order follows config.SERIES_IDS (stable).
    """
    rows = []
    for series_id in SERIES_IDS:
        meta = PRODUCTS[series_id]
        rows.append(
            {
                "series_id": series_id,
                "item_id": meta["item_id"],
                "product_name": meta["name"],
                "dept_id": meta["dept_id"],
            }
        )
    return pd.DataFrame(rows, columns=["series_id", "item_id", "product_name", "dept_id"])


def load_calendar() -> pd.DataFrame:
    """Read calendar.csv restricted to d_1..d_1941, with snap_count and 'none'-filled events.

    Returns columns: d_index, date, wm_yr_wk, wday, month, year, snap_count,
    event_name_1, event_type_1, event_name_2, event_type_2.
    """
    cal = pd.read_csv(CALENDAR_CSV)
    cal["d_index"] = cal["d"].str.replace("d_", "", regex=False).astype("int32")
    cal = cal[cal["d_index"] <= N_DAYS].copy()

    cal["date"] = pd.to_datetime(cal["date"]).dt.normalize()
    cal["snap_count"] = (
        cal["snap_CA"].astype("int16")
        + cal["snap_TX"].astype("int16")
        + cal["snap_WI"].astype("int16")
    ).astype("int8")

    # 02_DATA_SPEC.md §4: empty event strings -> literal "none" (never NaN).
    for col in EVENT_COLS:
        cal[col] = cal[col].fillna("none").replace("", "none")

    keep = [
        "d_index", "date", "wm_yr_wk", "wday", "month", "year", "snap_count", *EVENT_COLS,
    ]
    return cal[keep].reset_index(drop=True)


def load_sales_long(item_ids: list[str]) -> pd.DataFrame:
    """Read sales_train_evaluation, filter to item_ids, melt wide d_* to long, SUM over stores.

    Returns columns: item_id, d_index, units (float32). 8 items * 1941 days = 15,528 rows.
    02_DATA_SPEC.md §4: units = SUM across the 10 stores; zeros kept.
    """
    sales = pd.read_csv(SALES_CSV)
    sales = sales[sales["item_id"].isin(item_ids)].copy()

    day_cols = [c for c in sales.columns if c.startswith("d_")]
    long = sales.melt(
        id_vars=["item_id"],
        value_vars=day_cols,
        var_name="d",
        value_name="units",
    )
    long["d_index"] = long["d"].str.replace("d_", "", regex=False).astype("int32")
    # SUM units across the 10 store rows per (item_id, d).
    agg = (
        long.groupby(["item_id", "d_index"], as_index=False)["units"]
        .sum()
    )
    agg["units"] = agg["units"].astype("float32")
    return agg[["item_id", "d_index", "units"]]


def load_prices_mean(item_ids: list[str]) -> pd.DataFrame:
    """Read sell_prices, filter to item_ids, MEAN sell_price across stores per (item_id, wm_yr_wk).

    Returns columns: item_id, wm_yr_wk, sell_price (float32).
    02_DATA_SPEC.md §4: sell_price = MEAN across the up-to-10 stores for that week.
    """
    prices = pd.read_csv(PRICES_CSV)
    prices = prices[prices["item_id"].isin(item_ids)].copy()
    mean_price = (
        prices.groupby(["item_id", "wm_yr_wk"], as_index=False)["sell_price"]
        .mean()
    )
    mean_price["wm_yr_wk"] = mean_price["wm_yr_wk"].astype("int32")
    mean_price["sell_price"] = mean_price["sell_price"].astype("float32")
    return mean_price[["item_id", "wm_yr_wk", "sell_price"]]


def build_series_daily() -> pd.DataFrame:
    """Build the full series_daily table per 02_DATA_SPEC.md §4 (15,528 rows, exact schema)."""
    meta = _item_to_meta()
    item_ids = meta["item_id"].tolist()

    calendar = load_calendar()
    sales = load_sales_long(item_ids)
    prices = load_prices_mean(item_ids)

    # Attach identity (series_id/product_name/dept_id) to each (item_id, d_index).
    df = sales.merge(meta, on="item_id", how="left")

    # Attach calendar by d_index (date, wm_yr_wk, wday, month, year, snap, events).
    df = df.merge(calendar, on="d_index", how="left")

    # Attach mean sell_price by (item_id, wm_yr_wk); ffill then bfill within each series.
    df = df.merge(prices, on=["item_id", "wm_yr_wk"], how="left")
    df = df.sort_values(["series_id", "d_index"]).reset_index(drop=True)
    df["sell_price"] = (
        df.groupby("series_id", observed=True)["sell_price"]
        .transform(lambda s: s.ffill().bfill())
        .astype("float32")
    )

    # Enforce exact dtypes (02_DATA_SPEC.md §4).
    df["d_index"] = df["d_index"].astype("int32")
    df["units"] = df["units"].astype("float32")
    df["wm_yr_wk"] = df["wm_yr_wk"].astype("int32")
    df["wday"] = df["wday"].astype("int8")
    df["month"] = df["month"].astype("int8")
    df["year"] = df["year"].astype("int16")
    df["snap_count"] = df["snap_count"].astype("int8")
    df["date"] = pd.to_datetime(df["date"]).dt.normalize()

    cat_cols = ["series_id", "item_id", "product_name", "dept_id", *EVENT_COLS]
    for col in cat_cols:
        df[col] = df[col].astype("category")

    df = df[OUTPUT_COLUMNS].reset_index(drop=True)
    _validate(df)
    return df


def _validate(df: pd.DataFrame) -> None:
    """Hard invariants from 02_DATA_SPEC.md §4. Raise on any violation."""
    assert list(df.columns) == OUTPUT_COLUMNS, f"column mismatch: {list(df.columns)}"
    assert len(df) == EXPECTED_ROWS, f"expected {EXPECTED_ROWS} rows, got {len(df)}"
    assert df["series_id"].nunique() == len(SERIES_IDS), "expected 8 series"
    assert (df["units"] >= 0).all(), "units must be non-negative"
    assert not df["units"].isna().any(), "units has NaN"
    assert not df["sell_price"].isna().any(), "sell_price has NaN after ffill/bfill"
    assert df["snap_count"].between(0, 3).all(), "snap_count out of 0..3"
    for col in EVENT_COLS:
        assert not df[col].isna().any(), f"{col} has NaN (should be 'none')"


def write_parquet(df: pd.DataFrame, path: Path = OUTPUT_PARQUET) -> Path:
    """Write the table to parquet via pyarrow (04_BACKEND_ARCHITECTURE.md §6)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, engine="pyarrow", index=False)
    return path


def main() -> None:
    """CLI entry point: build and write series_daily.parquet."""
    df = build_series_daily()
    out = write_parquet(df)
    print(f"Wrote {len(df)} rows x {len(df.columns)} cols -> {out}")


if __name__ == "__main__":
    main()
```

> `np` is imported because `pandas` dtype operations and downstream maintainers commonly rely on it;
> it is part of the pinned deps (`04` §6). If a linter flags it as unused, it may be removed, but the
> pinned environment guarantees it is available.

## 6. Tests / Verification (exact pytest tests + commands)

### File: `backend/tests/test_data_prep.py`
This test is **skipped on a cloned repo** because the raw CSVs are gitignored
(`07_TESTING_STRATEGY.md` §2). It reads the **committed** `series_daily.parquet` and asserts the
locked invariants, and (if raw present) rebuilds to confirm reproducibility.

```python
"""MT-10 tests — series_daily.parquet schema & invariants (02_DATA_SPEC.md §4)."""
from pathlib import Path

import pandas as pd
import pytest

from app.ml.data_prep import (
    EXPECTED_ROWS,
    OUTPUT_COLUMNS,
    OUTPUT_PARQUET,
    SALES_CSV,
    build_series_daily,
)

RAW_PRESENT = SALES_CSV.exists()

# 07 §2: the whole module is skipped when raw M5 data is absent.
pytestmark = pytest.mark.skipif(not RAW_PRESENT, reason="raw M5 data not present")


@pytest.fixture(scope="module")
def df() -> pd.DataFrame:
    # Rebuild from raw so the test exercises the full pipeline deterministically.
    return build_series_daily()


def test_row_count(df: pd.DataFrame):
    assert len(df) == EXPECTED_ROWS == 15528


def test_eight_series(df: pd.DataFrame):
    assert df["series_id"].nunique() == 8


def test_columns_exact_order(df: pd.DataFrame):
    assert list(df.columns) == OUTPUT_COLUMNS


def test_dtypes(df: pd.DataFrame):
    assert str(df["series_id"].dtype) == "category"
    assert str(df["item_id"].dtype) == "category"
    assert str(df["product_name"].dtype) == "category"
    assert str(df["dept_id"].dtype) == "category"
    assert str(df["d_index"].dtype) == "int32"
    assert pd.api.types.is_datetime64_any_dtype(df["date"])
    assert str(df["units"].dtype) == "float32"
    assert str(df["sell_price"].dtype) == "float32"
    assert str(df["wm_yr_wk"].dtype) == "int32"
    assert str(df["wday"].dtype) == "int8"
    assert str(df["month"].dtype) == "int8"
    assert str(df["year"].dtype) == "int16"
    assert str(df["snap_count"].dtype) == "int8"
    for col in ["event_name_1", "event_type_1", "event_name_2", "event_type_2"]:
        assert str(df[col].dtype) == "category"


def test_units_nonneg_no_nan(df: pd.DataFrame):
    assert (df["units"] >= 0).all()
    assert not df["units"].isna().any()


def test_sell_price_no_nan(df: pd.DataFrame):
    assert not df["sell_price"].isna().any()


def test_snap_count_range(df: pd.DataFrame):
    assert df["snap_count"].between(0, 3).all()


def test_events_no_nan_none_filled(df: pd.DataFrame):
    for col in ["event_name_1", "event_type_1", "event_name_2", "event_type_2"]:
        assert not df[col].isna().any()
    # Most days have no event -> "none" must be a present category value.
    assert "none" in set(df["event_name_1"].astype(str))


def test_per_series_full_day_coverage(df: pd.DataFrame):
    counts = df.groupby("series_id", observed=True)["d_index"].nunique()
    assert (counts == 1941).all()


def test_committed_parquet_matches_if_present():
    """If the committed artifact exists, its row count & columns match the spec."""
    if not Path(OUTPUT_PARQUET).exists():
        pytest.skip("committed parquet not present in this checkout")
    committed = pd.read_parquet(OUTPUT_PARQUET, engine="pyarrow")
    assert len(committed) == EXPECTED_ROWS
    assert list(committed.columns) == OUTPUT_COLUMNS
```

### Commands
```bash
cd backend
# Build the artifact (dev PC with raw CSVs):
python -m app.ml.data_prep
# Run the tests (skipped automatically if raw CSVs absent):
pytest -q tests/test_data_prep.py
```

Expected build output:
```
Wrote 15528 rows x 17 cols -> .../data/processed/series_daily.parquet
```

## 7. Acceptance checklist
- [ ] `backend/app/ml/data_prep.py` exists at the exact path (`04` §1) with **no FastAPI imports**.
- [ ] `python -m app.ml.data_prep` runs and writes `data/processed/series_daily.parquet` via pyarrow.
- [ ] Output has **exactly 15,528 rows** and **8 distinct `series_id`s**.
- [ ] Columns and dtypes match `02_DATA_SPEC.md` §4 exactly (`OUTPUT_COLUMNS` order).
- [ ] `units` = SUM across 10 stores, `float32`, all ≥ 0, no NaN, zeros kept.
- [ ] `sell_price` = MEAN across stores per `(item_id, wm_yr_wk)`, ffill→bfill within series, no NaN.
- [ ] `snap_count = snap_CA + snap_TX + snap_WI` ∈ 0..3.
- [ ] Empty event strings stored as literal `"none"` (no NaN) in all four event columns.
- [ ] `item_id → series_id/product_name/dept_id` taken from `config.PRODUCTS` only.
- [ ] `tests/test_data_prep.py` passes (or is **skipped** on a checkout without raw CSVs).
