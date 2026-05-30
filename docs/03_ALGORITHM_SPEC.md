# 03 — Algorithm Specification (SOURCE OF TRUTH for ML)

> The complete, unambiguous definition of the forecasting model and every derived metric.
> Anyone implementing MT-02 … MT-05 follows this file exactly. Reads from
> `series_daily.parquet` (see `02_DATA_SPEC.md` §4). All randomness is seeded (`seed=42`).

---

## 0. Pipeline at a glance

```
series_daily.parquet
      │  (MT-02) build_features()
      ▼
feature matrix X, target y  ───►  (MT-03) train LightGBM ──►  model.pkl + feature_meta.json
      │                                                              │
      │                                                              ▼
      └────────────────────────────────►  (MT-04) recursive_forecast(series, start_d, model)
                                                  │
                                                  ▼  28-day prediction
                                         (MT-05) metrics: accuracy, coherence,
                                                  velocity, inventory risk, explainability
```

All artifacts live in `backend/app/models/`:
- `model.pkl` — the trained LightGBM `Booster`.
- `feature_meta.json` — ordered feature list + categorical feature names + best_iteration.
- `profiles.json` — per-series precomputed profiles (monthly/weekday averages, event uplifts,
  yearly totals) used by the dashboard panels (built in MT-03 §5).

---

## 1. The target

For series `p` and day `t`: predict `units[p, t]` = total units sold that day across 10 stores
(the `units` column from `series_daily.parquet`). Daily, non-negative, intermittent (zeros are
real). We model it directly with a **Tweedie** objective (handles zero-inflation + right skew).

---

## 2. Model (LOCKED)

A **single global** `LightGBM` regressor trained across all 8 series at once. `series_id` is
passed as a categorical feature so the model can specialize per product while sharing calendar/
event structure.

### Target scaling (LOCKED — important)
The 8 series span a huge volume range (milk ≈ 480 units/day, cocoa ≈ 6 units/day). Training on
**raw** units lets high-volume series dominate the loss and collapses low-volume series toward 0.
So we train on a **per-series scaled target**:

```
scale[series] = mean of POSITIVE units over the TRAIN period (active-period mean)   # >= 1e-6
target        = units / scale[series]            # what the model fits
prediction    = model_output * scale[series]     # rescale back to units, then clip at 0
```

`scale` is computed in `train.py` and stored in `feature_meta.json` under `series_scale`, so the
forecast engine rescales identically. (Rationale + rejected alternatives: `08_DECISIONS_AND_DATA_NOTES.md` §D2.)

### Fixed hyperparameters (do not tune; reproducibility > marginal accuracy)
```python
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
```

### Training/validation split for early stopping
- **Train fold:** TRAIN rows with `d_index` in `[29, 1011]` (skip first 28 days: lags undefined).
- **Validation fold:** TRAIN rows with `d_index` in `[1012, 1095]` (last 84 train days).
- Fit with `valid_sets=[valid]`, `early_stopping_rounds=100`. Record `best_iteration` into
  `feature_meta.json`. The saved `model.pkl` is the booster at `best_iteration`.
- Do **not** retrain on the validation fold afterward (keeps it simple + reproducible).

---

## 3. Features (LOCKED — exact list and formulas)

All features are computed per (series_id, day). **Categorical** features are marked `[cat]`
and must be passed to LightGBM as pandas `category` dtype. Everything else is numeric.

### 3.1 Identity
| feature | formula |
|---|---|
| `series_id` `[cat]` | the product slug (turkey, candy, …) |

### 3.2 Calendar (known for ALL days, including the future horizon)
| feature | formula |
|---|---|
| `wday` `[cat]` | 1–7 from calendar (1=Sat … 7=Fri) |
| `month` `[cat]` | 1–12 |
| `year` | integer 2011–2016 |
| `day_of_month` | 1–31 (from `date`) |
| `week_of_year` | ISO week 1–53 (from `date`) |
| `is_weekend` | 1 if `wday in {1,2}` else 0 |
| `snap_count` | 0–3 (from §2 data spec) |

### 3.3 Events (known for ALL days)
| feature | formula |
|---|---|
| `event_name_1` `[cat]` | calendar value or `"none"` |
| `event_type_1` `[cat]` | calendar value or `"none"` |
| `event_name_2` `[cat]` | calendar value or `"none"` |
| `event_type_2` `[cat]` | calendar value or `"none"` |
| `is_event` | 1 if `event_name_1 != "none"` else 0 |
| `days_to_next_event` | days until the next calendar day with any event, capped at 28 (28 if none within 28) |
| `days_since_last_event` | days since the previous event day, capped at 28 |

`days_to_next_event` / `days_since_last_event` are computed once over the full calendar
(`d_1 … d_1969`) so horizon days are covered.

### 3.4 Price (known up to today; for horizon use last known)
| feature | formula |
|---|---|
| `sell_price` | from `series_daily` for that day; for horizon days use the **last known** price ≤ start day (forward fill) |
| `price_rel` | `sell_price / mean(sell_price over that series' TRAIN days)`; if mean is 0/NaN → 1.0 |

### 3.5 Lag features (history-dependent; computed recursively for the horizon)
Let `u[t]` = units for the series at day `t` (actual for `t < start`, predicted for horizon days
already produced).
| feature | formula |
|---|---|
| `lag_1` | `u[t-1]` |
| `lag_7` | `u[t-7]` |
| `lag_14` | `u[t-14]` |
| `lag_28` | `u[t-28]` |
| `roll_mean_7` | mean(`u[t-7 .. t-1]`) |
| `roll_mean_28` | mean(`u[t-28 .. t-1]`) |
| `roll_std_7` | std(`u[t-7 .. t-1]`) (population std; 0 if window all equal) |
| `roll_std_28` | std(`u[t-28 .. t-1]`) |
| `roll_mean_7_by_wday` | mean of `u` on the same `wday` over the last 4 occurrences before `t` |

> All rolling/lag windows look **strictly backward** (`t-1` and earlier). No same-day leakage.
> For TRAIN rows where a window extends before `d_1`, the row's `d_index < 29` is excluded from
> training (see §2 split). At inference, `start ≥ d_1096` so all windows are fully defined.

### 3.6 Feature ordering
`feature_meta.json` stores the exact ordered list `FEATURES` and the subset
`CATEGORICAL_FEATURES`. `build_features()` must always emit columns in `FEATURES` order so the
booster sees a stable layout. The canonical order:
```
["series_id","wday","month","year","day_of_month","week_of_year","is_weekend","snap_count",
 "event_name_1","event_type_1","event_name_2","event_type_2","is_event",
 "days_to_next_event","days_since_last_event","sell_price","price_rel",
 "lag_1","lag_7","lag_14","lag_28","roll_mean_7","roll_mean_28","roll_std_7","roll_std_28",
 "roll_mean_7_by_wday"]
CATEGORICAL_FEATURES = ["series_id","wday","month","event_name_1","event_type_1",
                        "event_name_2","event_type_2"]
```

---

## 4. Recursive 28-day forecast (LOCKED algorithm)

Function signature (implemented in MT-04, `forecast_engine.py`):
```python
def recursive_forecast(series_id: str, start_d: int, model, feature_meta, data) -> list[float]:
    """Return 28 daily predictions for days [start_d .. start_d+27]."""
```

Pseudocode (must be followed exactly):
```
Precondition: FIRST_SELECTABLE_D <= start_d <= LAST_SELECTABLE_D

1. u = dict of actual units for this series for all d_index < start_d   # from series_daily
2. last_price = sell_price for this series at the largest d_index <= start_d-1 that has a price
3. preds = []
4. for t in [start_d .. start_d+27]:
       feat = {}
       fill feat with calendar/event features for day t           (§3.2, §3.3 — from calendar)
       feat["sell_price"] = last_price                            (forward-filled)
       feat["price_rel"]  = last_price / series_train_mean_price
       fill feat with lag/rolling features from u                 (§3.5; u already holds earlier preds)
       feat["series_id"] = series_id
       x = order feat by FEATURES, set categoricals to category dtype
       yhat = model.predict(x)[0]
       yhat = max(0.0, yhat)                                      # clip negatives
       u[t] = yhat                                                # feed back for next day's lags
       preds.append(yhat)
5. return preds   # length 28, floats
```

Notes:
- Predictions are kept as **floats** internally (for metrics). The API rounds for display
  (`05_API_CONTRACT.md`): `units_forecast` rounded to 1 decimal; integer display is the UI's call.
- Determinism: `model.predict` is deterministic → same `(series_id, start_d)` ⇒ same result.
- Christmas days inside a horizon will naturally predict ~0 because the model learned the
  `event_name_1 == "Christmas"` / closed-store pattern; do not special-case.

---

## 5. Per-series profiles (built in MT-03, saved to `profiles.json`)

Computed once from `series_daily.parquet` over the **TRAIN** period and stored for the panels.
For each `series_id`:
```jsonc
{
  "turkey": {
    "monthly_avg":   [m1..m12],      // mean units/day by calendar month (TRAIN)
    "weekday_avg":   [w1..w7],       // mean units/day by wday 1..7 (TRAIN)
    "yearly_total":  {"2011": n, ... "2013": n},   // sum per year (TRAIN years only)
    "event_uplift":  {                // mean % uplift on event days vs non-event baseline
        "Thanksgiving": 517.0, "ValentinesDay": 92.0, ...
    },
    "overall_mean":  18.6,           // mean units/day across TRAIN
    "seasonal_cv":   1.25            // std(monthly_avg)/mean(monthly_avg)
  },
  ...
}
```
`event_uplift[E]` = `(mean(units on days with event E) − baseline) / baseline × 100`, where
`baseline` = mean(units on days with **no** event). Only events that actually occur for that
series' TRAIN days are included. Round to 1 decimal.

---

## 6. Metrics (LOCKED formulas) — implemented in MT-05, `metrics.py`

Given aligned arrays over the horizon where actuals exist:
`a = actual[start..start+27]`, `f = forecast[start..start+27]` (length ≤ 28).

### 6.1 Accuracy score (headline = WAPE-based)
```
WAPE     = sum(|a - f|) / sum(|a|) * 100                 # if sum(|a|)==0: accuracy=100 if sum(|f|)<1 else 0
accuracy = round( max(0.0, 100.0 - WAPE), 1 )            # HEADLINE
```
Also return (secondary, all rounded):
```
sMAPE = mean over days where (|a_t|+|f_t|)>0 of ( 2*|a_t-f_t| / (|a_t|+|f_t|) ) * 100
mae   = mean(|a-f|)        rmse = sqrt(mean((a-f)^2))
```
WAPE is the industry standard for demand forecasting — intuitive and stable on intermittent/
low-count days. (Decision: `08_DECISIONS_AND_DATA_NOTES.md` §D3.) Implemented in `metrics.py`
`compute_accuracy()`, which returns `{accuracy, wape, smape, mae, rmse}`.

> **Portfolio accuracy** (shown in the Executive Overview): a volume-weighted WAPE across all
> selected products — `100 − Σ|a−f| / Σ|a| × 100` summed over products. This is high (~80%)
> because high-volume staples forecast well; it is a fair "share of total demand we got right."

### 6.2 Coherence score (shape/trend agreement, 0–100)
```
shape_corr  = Pearson corr(a, f)          # NaN if either array is constant
direction   = fraction of t in [1..len-1] where sign(a_t - a_{t-1}) == sign(f_t - f_{t-1})
if shape_corr is NaN:                      # constant actual or forecast
    coherence = round(100 * direction, 1)
else:
    coherence = round(100 * (0.5 * max(0, shape_corr) + 0.5 * direction), 1)
```
Interpretation surfaced in UI: ≥75 "Strong", 50–74 "Moderate", <50 "Weak".

### 6.3 Velocity score + status (per project doc)
```
prev_28   = sum(actual units for days [start-28 .. start-1])      # real history
recent_28 = sum(forecast)                                          # predicted next 28
if prev_28 == 0:  velocity = 0.0 if recent_28 == 0 else 999.0
else:             velocity = round((recent_28 - prev_28) / prev_28 * 100, 1)

status =  "Critical Decline" if velocity < -50
          "Declining"        if -50 <= velocity < -10
          "Stable"           if -10 <= velocity <= 10
          "Growing"          if  10 <  velocity <= 40
          "Accelerating"     if velocity > 40
```

### 6.4 Inventory risk (SIMULATED — heuristic, deterministic)
The dataset has no real stock, so we simulate one deterministically from recent demand.
Constants (in `config.py`): `INITIAL_COVER_DAYS=14`, `LEAD_TIME_DAYS=7`, `SERVICE_Z=1.65`.
```
trailing      = actual units for days [start-28 .. start-1]
mean_d        = mean(trailing)
std_d         = std(trailing)                      # population std
on_hand       = round(mean_d * INITIAL_COVER_DAYS) # simulated starting stock
safety_stock  = SERVICE_Z * std_d * sqrt(LEAD_TIME_DAYS)
reorder_point = mean_d * LEAD_TIME_DAYS + safety_stock
horizon_demand= sum(forecast)

# project stock forward day by day over the horizon
stock = on_hand; cover_days = HORIZON+1
for i, d_demand in enumerate(forecast):
    stock -= d_demand
    if stock <= 0: cover_days = i; break

stockout_risk = "High"   if cover_days <= LEAD_TIME_DAYS
                "Medium" if cover_days <= HORIZON
                "Low"    otherwise
overstock      = on_hand > horizon_demand * 1.5
recommended_order_qty = max(0, round(horizon_demand + safety_stock - on_hand))
```
Return `on_hand, safety_stock, reorder_point, horizon_demand, cover_days, stockout_risk,
overstock, recommended_order_qty` plus the projected stock path (length 28) for the chart.
**Label this clearly in the UI as a simulated reorder model.**

### 6.5 Explainability (model-based, deterministic) — for P7
Two counterfactual forecasts isolate event contribution:
```
f_full     = recursive_forecast(... normal ...)
f_no_event = recursive_forecast(... but with event features forced to "none"/0
                                 and days_to/since_event = 28 for horizon days ...)
event_contribution_pct = round((sum(f_full) - sum(f_no_event)) / max(1e-6, sum(f_no_event)) * 100, 1)
```
Plus narrative factors assembled from numbers already computed:
- **Trend** → from velocity status (§6.3).
- **Seasonality** → compare this horizon's months' `monthly_avg` vs `overall_mean` (profiles).
- **Events** → list events occurring in the horizon with their `event_uplift` (profiles).
- **SNAP** → count of SNAP days in the horizon.

Narrative bullet templates (fill the numbers; exact wording in MT-13):
- `"Demand is {status} ({velocity:+.0f}% vs the prior 28 days)."`
- `"{month_name} is a {high|low}-demand month for {product} (~{pct:+.0f}% vs average)."`
- `"{event} falls in this window — historically a {uplift:+.0f}% swing."`
- `"Events account for ~{event_contribution_pct:+.0f}% of predicted demand in this window."`

---

## 7. Reproducibility checklist
- `seed=42` everywhere (LightGBM, numpy).
- Pinned versions in `requirements.txt` (see `04_BACKEND_ARCHITECTURE.md` §6).
- `model.pkl`, `feature_meta.json`, `profiles.json` are committed to git so students never
  retrain. Re-running `train.py` on the same data + versions reproduces identical artifacts.
- A test (`test_forecast_engine.py`) asserts a golden forecast for `(turkey, d_1300)` matches a
  stored expected vector within `1e-6` — guards against accidental algorithm drift.
