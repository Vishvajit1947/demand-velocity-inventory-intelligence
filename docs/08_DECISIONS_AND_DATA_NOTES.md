# 08 — Decision Record & Data Notes

> Why the algorithm and product list are what they are. Written after building and testing the
> real forecasting engine on the M5 data. Read this if you ever wonder "why didn't they just use
> the original 8 products / a single raw model?". Every claim here was verified against the data.

---

## D1 — Two products were replaced (cocoa, icecream)

### What we found
The original product list (from `Products Explaination.pdf`) included two items that **did not
sell during most of the 3-year training window** (`d_1`–`d_1095`, 2011-01-29 → 2014-01-27):

| original slug | original item | first day with any sales | problem |
|---|---|---|---|
| `cocoa` | `FOODS_3_073` | **d_1032 (2013-11-25)** | ~0 sales in 2011–2013; only ~64 training days; **discontinued after d_1862 (early 2016)** |
| `icecream` | `FOODS_3_008` | **d_759 (2013-02-25)** | only ~1 year of training history |

These are **late-introduced / cold-start products**. A forecasting model learns patterns from
the training period; **you cannot forecast a product that did not exist during training.** When
we trained on these, `cocoa` collapsed to ≈0 predictions (the model never saw a non-zero cocoa
in the fit window) and per-series training even failed outright (`tweedie: sum of labels is
zero`). This would have made 2 of 8 products look broken in the dashboard.

### What we did
We scanned the full M5 `FOODS` catalog for items that (a) sell for the **entire** 2011–2016
window and (b) have the **same seasonal archetype**, then swapped:

| slug | old item | **new item** | why it matches the story |
|---|---|---|---|
| `cocoa` | FOODS_3_073 | **FOODS_1_116** | full history, **February peak** (winter-seasonal) — same "Hot Cocoa Mix" winter story |
| `icecream` | FOODS_3_008 | **FOODS_3_660** | full history, **June peak** (summer-seasonal) — same "Vanilla Ice Cream" summer story |

The names/archetypes/stories are unchanged; only the underlying M5 item id changed. **Note:** M5
item ids are anonymous — the product *names* were always narrative labels assigned to match a
demand pattern, so swapping the underlying item while keeping the story is legitimate.

After the swap, **all 8 products have full 2011–2016 history** and are cleanly forecastable.
The other six (`turkey, candy, strawberries, chips, milk, bread`) were full-history already and
were **not** changed.

> If you (the instructor) prefer to keep the original items as a teaching example of the
> cold-start problem, the dashboard could instead flag them as "newly-introduced / low
> confidence". We chose replacement for a cleaner, more impressive demo.

---

## D2 — Algorithm: single global LightGBM with a per-series **scaled** target

### Why not a single raw-units global model?
The 8 series span a huge volume range — `milk` ≈ 480 units/day, `cocoa` ≈ 6 units/day. A single
model trained on **raw** units lets the high-volume series dominate the loss, so low-volume
series get under-predicted (collapse toward 0). Verified: raw global model scored ~0 accuracy on
the small series.

### What we use (locked)
- **One global `LightGBM`** (Tweedie objective) with `series_id` as a categorical feature.
- **Target is scaled per series**: we predict `units / scale[series]`, where
  `scale[series] = mean of positive units over the training period`, then multiply the
  prediction back by `scale[series]`. This puts every series on a comparable scale so the model
  treats them equally. (Implemented in `backend/app/ml/train.py` + `forecast_engine.py`.)
- Features, hyperparameters, and the recursive 28-day procedure are in `03_ALGORITHM_SPEC.md`.

### Things we tried and rejected (so you don't repeat them)
- **Per-series models (8 separate):** marginally different, but fragile for low-volume series
  and fails for any series with a degenerate fold. Not worth the complexity for 8 series.
- **Year-over-year `lag_364` feature:** intended to capture annual event spikes (turkey at
  Thanksgiving). It **backfired** — for `candy`, whose demand declined year over year, it learned
  the previous year's big Halloween and **over-forecast ~6×**. Removed.

---

## D3 — Headline accuracy metric: **WAPE-based**

`accuracy = max(0, 100 − WAPE)`, where `WAPE = Σ|actual − forecast| / Σ|actual| × 100`.
WAPE is the industry standard for demand forecasting: intuitive ("we were off by X% of total
volume") and stable on intermittent/low-count days. The dashboard also shows `sMAPE`, `MAE`,
`RMSE` as secondary numbers. (`03_ALGORITHM_SPEC.md` §6.1.)

---

## D4 — Honest accuracy expectations (measured, not promised)

Measured on the shipped engine across several test-period dates (28-day horizons):

| product type | examples | WAPE-accuracy |
|---|---|---|
| Stable, high-volume | milk, bread | **~83–87%** |
| Moderate seasonal | chips, strawberries | ~55–60% |
| Spiky / low-volume / event | turkey, candy, cocoa, icecream | ~25–45% |
| **Mean across all 8 (equal weight)** | | **~54%** |
| **Portfolio (volume-weighted across all 8)** | | **~80%+** |

Why the spread: forecasting a single product's **daily** demand 28 days out is genuinely hard
when the product is low-volume and spiky (a one-day event swamps a percentage error). This is the
real nature of the M5 data — **the dashboard shows the true per-product number, never an inflated
one.** The portfolio (volume-weighted) figure is high because the staples dominate total volume
and forecast well; it is a fair "how much of total demand did we get right" headline.

**Implication for the demo:** lead with `milk`/`bread` (excellent) and with event-window shapes
(e.g. turkey rising into Thanksgiving). Show the honest per-product score everywhere.

---

## D5 — Repository & data (recap; full detail in `04_BACKEND_ARCHITECTURE.md` §7)
- Large raw CSVs are **gitignored**; the small `data/processed/series_daily.parquet`,
  `data/raw/calendar.csv`, and the model artifacts are **committed** → students run with no raw
  data and no training. `official_docs/` (interns' personal letters) is gitignored.
- The **core forecasting engine is pre-built and tested** (`backend/app/ml/*`,
  `backend/app/models/*`). Students build the API, frontend, and integration **around** it.
