# 02 — Data Specification (SOURCE OF TRUTH)

> Every ML and backend task depends on this file. If a number or column name is needed
> anywhere, it is defined **here** and nowhere else. Dates are derived from `calendar.csv`
> and are exact (verified against the dataset).

---

## 1. Raw dataset (the M5 / Walmart files)

Location (relative to repo root): `data/raw/`. These are the **original** files, copied
unchanged from `Walmart Dataset/`.

| File | Rows | Shape / key columns |
|---|---|---|
| `calendar.csv` | 1,969 | `date, wm_yr_wk, weekday, wday, month, year, d, event_name_1, event_type_1, event_name_2, event_type_2, snap_CA, snap_TX, snap_WI` |
| `sales_train_evaluation.csv` | 30,490 | `id, item_id, dept_id, cat_id, store_id, state_id, d_1 … d_1941` (daily unit sales, wide format) |
| `sell_prices.csv` | 6,841,121 | `store_id, item_id, wm_yr_wk, sell_price` |
| `sales_train_validation.csv` | 30,490 | Same as evaluation but only `d_1 … d_1913`. **We do NOT use this file.** |
| `sample_submission.csv` | 60,981 | M5 competition format. **We do NOT use this file.** |

**Use `sales_train_evaluation.csv`** (it has the full `d_1 … d_1941`). Ignore the other two.

### Day index ↔ date
- `d_1` = **2011-01-29** (Saturday).
- `d_n` date = `2011-01-29 + (n − 1) days`.
- `calendar.csv` is the authoritative map (`d` column ↔ `date`). Always join through it; never
  compute dates by hand in code except in a tested helper.
- `wday`: 1=Saturday … 7=Friday (M5 convention). `weekday` is the text name.

### Stores & states (for reference; we aggregate over all of them)
- 10 stores: `CA_1, CA_2, CA_3, CA_4, TX_1, TX_2, TX_3, WI_1, WI_2, WI_3`.
- 3 states: `CA` (4 stores), `TX` (3), `WI` (3).
- SNAP flags are **per state**: `snap_CA`, `snap_TX`, `snap_WI` ∈ {0,1}.

---

## 2. The 8 finalized products (LOCKED)

We forecast these 8 items **only**. Each is summed across all 10 stores → one series each.
All are in category `FOODS`. Verified: each `item_id` has exactly 10 store rows in the data.

| series_id | item_id | Product name | dept_id | Archetype / story |
|---|---|---|---|---|
| `turkey` | `FOODS_3_069` | Fresh Whole Turkey | FOODS_3 | Event spike — Thanksgiving, highest seasonality. |
| `candy` | `FOODS_1_206` | Halloween Candy | FOODS_1 | Single-event — Halloween spike. |
| `strawberries` | `FOODS_1_123` | Fresh Strawberries | FOODS_1 | Perishable, dual-trigger (Valentine's + winter season). |
| `icecream` | `FOODS_3_660` | Vanilla Ice Cream | FOODS_3 | Summer seasonal (June peak). |
| `cocoa` | `FOODS_1_116` | Hot Cocoa Mix | FOODS_1 | Winter seasonal (February peak). |
| `chips` | `FOODS_2_022` | Tortilla Chips (Party Size) | FOODS_2 | Pure one-day event — Super Bowl. |
| `milk` | `FOODS_3_586` | Fresh Whole Milk | FOODS_3 | Stable baseline, very high volume, CV ≈ 0.10. |
| `bread` | `FOODS_3_080` | Sliced White Bread | FOODS_3 | Flattest baseline (CV ≈ 0.08), slow long-term decline. |

> **⚠️ `icecream` and `cocoa` were re-mapped** from the original `FOODS_3_008` / `FOODS_3_073`
> to `FOODS_3_660` / `FOODS_1_116` because the originals had **no sales during most of the
> training window** (late-introduced products — unforecastable). The names/archetypes are
> unchanged. Full rationale + evidence: see **`08_DECISIONS_AND_DATA_NOTES.md` §D1**.

> **`series_id`** is our own short slug. It is the canonical key used in the API and frontend.
> The mapping `series_id ↔ item_id ↔ product_name` is fixed and must live in
> `backend/app/config.py` as `PRODUCTS` (see §6) — the single place it is defined in code.

---

## 3. Train / test split (LOCKED, exact)

| Segment | d-range | Date range | # days |
|---|---|---|---|
| **TRAIN** | `d_1` … `d_1095` | 2011-01-29 … 2014-01-27 | 1,095 |
| **TEST** | `d_1096` … `d_1941` | 2014-01-28 … 2016-05-22 | 846 |
| **Selectable forecast start** | `d_1096` … `d_1914` | 2014-01-28 … 2016-04-25 | 819 |

- The model is trained **only** on TRAIN rows (features may look back into earlier TRAIN days).
- A user may pick any start date `s` in the **selectable** range. The horizon is `s … s+27`.
- Last selectable start is `d_1914` because `d_1914 + 27 = d_1941` — the last day with actuals,
  so accuracy/coherence can always be computed against real data.
- Forecasting **uses actual history up to the day before `s`** to seed lags/rolling features,
  even though that history is in the TEST period. This is allowed: the *model parameters* were
  fixed on TRAIN; we only feed it known past observations at inference. (No future leakage:
  features for day `t` use only data from `< t`.)

Constants (must appear verbatim in `backend/app/config.py`):
```python
TRAIN_START_D = 1
TRAIN_END_D   = 1095
TEST_START_D  = 1096
TEST_END_D    = 1941
HORIZON       = 28
FIRST_SELECTABLE_D = 1096   # 2014-01-28
LAST_SELECTABLE_D  = 1914   # 2016-04-25  (LAST_SELECTABLE_D + HORIZON - 1 == TEST_END_D)
```

---

## 4. Processed data artifact (built by MT-01)

MT-01 transforms the raw wide files into one **long-format daily table**, saved to
`data/processed/series_daily.parquet`. This is the table every downstream ML step reads.

### `series_daily.parquet` schema — one row per (series_id, day)
Total rows = 8 series × 1,941 days = **15,528**.

| column | type | definition |
|---|---|---|
| `series_id` | category | one of the 8 slugs in §2 |
| `item_id` | category | the M5 item id (e.g. `FOODS_3_069`) |
| `product_name` | category | human name |
| `dept_id` | category | e.g. `FOODS_3` |
| `d_index` | int32 | 1 … 1941 (the integer from `d_n`) |
| `date` | date | from calendar |
| `units` | float32 | **sum** of that item's `d_n` sales across all 10 stores |
| `sell_price` | float32 | **mean** `sell_price` across the (up to 10) stores selling it that `wm_yr_wk`; forward-filled then back-filled within the series for any gaps |
| `wm_yr_wk` | int32 | from calendar |
| `wday` | int8 | 1–7 |
| `month` | int8 | 1–12 |
| `year` | int16 | 2011–2016 |
| `snap_count` | int8 | `snap_CA + snap_TX + snap_WI` (0–3) for that date |
| `event_name_1` | category | from calendar, `"none"` if empty |
| `event_type_1` | category | from calendar, `"none"` if empty |
| `event_name_2` | category | from calendar, `"none"` if empty |
| `event_type_2` | category | from calendar, `"none"` if empty |

Rules:
- `units` = SUM across stores (intermittent zero days are kept as 0, not dropped).
- `sell_price` = MEAN across stores for the week; if a product had no price in a week
  (not sold anywhere), fill via forward-fill then back-fill **within that series only**.
- Empty event strings in the raw CSV become the literal string `"none"` (never NaN) so the
  model treats "no event" as its own category.
- `snap_count` uses all three states because each product sells in CA, TX, and WI.

### Derived calendar table (optional helper) `data/processed/calendar_features.parquet`
A per-day table (1,941 rows) with `d_index, date, wday, month, year, snap_count,
event_name_1, event_type_1, event_name_2, event_type_2, is_weekend, days_to_next_event,
days_since_last_event`. MT-02 may compute these on the fly instead; either is acceptable as
long as the **feature definitions in `03_ALGORITHM_SPEC.md` §3 are met exactly**.

---

## 5. Data quality notes (known facts — do not "fix" these)
- Sales are **intermittent**: many zero-sales days, especially for turkey (3.5% zero) and ice
  cream (48% zero). Zeros are real signal, keep them.
- `d_331` (and same day each year) = **Christmas**: all stores closed → sales are 0 for every
  product. Expected.
- `sell_price` exists only from the week a product first appears in a store; early weeks for
  some store/item combos have no price. The mean-across-stores + fill rule handles this.
- The dataset is from **2011–2016**; "today" in the product narrative is irrelevant to the model.

---

## 6. Canonical product config (must exist in code exactly like this)

`backend/app/config.py` must define:

```python
# series_id -> metadata. THE single source of product identity in code.
PRODUCTS = {
    "turkey":       {"item_id": "FOODS_3_069", "name": "Fresh Whole Turkey",        "dept_id": "FOODS_3"},
    "candy":        {"item_id": "FOODS_1_206", "name": "Halloween Candy",           "dept_id": "FOODS_1"},
    "strawberries": {"item_id": "FOODS_1_123", "name": "Fresh Strawberries",        "dept_id": "FOODS_1"},
    "icecream":     {"item_id": "FOODS_3_660", "name": "Vanilla Ice Cream",         "dept_id": "FOODS_3"},
    "cocoa":        {"item_id": "FOODS_1_116", "name": "Hot Cocoa Mix",             "dept_id": "FOODS_1"},
    "chips":        {"item_id": "FOODS_2_022", "name": "Tortilla Chips",            "dept_id": "FOODS_2"},
    "milk":         {"item_id": "FOODS_3_586", "name": "Fresh Whole Milk",          "dept_id": "FOODS_3"},
    "bread":        {"item_id": "FOODS_3_080", "name": "Sliced White Bread",        "dept_id": "FOODS_3"},
}
SERIES_IDS = list(PRODUCTS.keys())  # stable order
```

The frontend receives this list from `GET /api/products` (see `05_API_CONTRACT.md` §3) and
never hardcodes it.
