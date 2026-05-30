# 09 — PROVIDED Core Engine (pre-built & tested — DO NOT rebuild)

> The hard, correctness-critical part — the **forecasting engine** — is already built, tested,
> and committed. Students build the **API, frontend, integration, and Docker around it.** This
> file is the authoritative contract for the provided code: if any `MT-10…MT-19` code listing
> differs from what's described here, **the shipped code in `backend/app/` wins.**

---

## 1. What is provided (already in the repo, committed to git)

| Path | What it is | Status |
|---|---|---|
| `backend/app/config.py` | constants + `PRODUCTS`/`SERIES_IDS` | ✅ final |
| `backend/app/ml/calendar_features.py` | `d_to_date`, `date_to_d`, `load_calendar` | ✅ final |
| `backend/app/ml/data_prep.py` | raw CSV → `series_daily.parquet` | ✅ final (already run) |
| `backend/app/ml/features.py` | `FEATURES`, `build_feature_matrix`, `build_single_row` | ✅ final |
| `backend/app/ml/train.py` | trains the model | ✅ final (already run) |
| `backend/app/ml/profiles.py` | builds `profiles.json` | ✅ final (already run) |
| `backend/app/ml/forecast_engine.py` | `recursive_forecast(...)` | ✅ final |
| `backend/app/ml/metrics.py` | accuracy / coherence / velocity / inventory / explainability | ✅ final |
| `backend/app/models/model.pkl` | trained LightGBM booster (2.8 MB) | ✅ committed |
| `backend/app/models/feature_meta.json` | feature order, categories, `series_scale`, `best_iteration` | ✅ committed |
| `backend/app/models/profiles.json` | per-series profiles | ✅ committed |
| `data/processed/series_daily.parquet` | the 8-product daily table | ✅ committed |
| `data/raw/calendar.csv` | calendar (needed at runtime) | ✅ committed |
| `backend/tests/` (ml tests + golden) | 18 passing tests | ✅ committed |

**Verify it works on your machine (after `pip install -r backend/requirements.txt`):**
```bash
cd backend
python -m pytest -q          # expect: 18 passed
PYTHONPATH=. python scripts/validate_engine.py   # prints accuracy + writes golden fixture
```

> `MT-10 … MT-19` remain in `docs/micro-tasks/` as **design rationale / reference**. You do
> **not** need to re-implement them — the code already exists and is tested. Treat those files as
> "how the engine was built and why." Build tasks **`MT-20 … MT-46`** (API, frontend, Docker) are
> the real work.

---

## 2. Authoritative function signatures (call THESE from the backend API)

When you build the backend service (MT-21/MT-23), import and call the provided functions exactly
as below. (These supersede any differing signatures in the MT spec listings.)

```python
# app/ml/calendar_features.py
d_to_date(d: int) -> datetime.date
date_to_d(value: str | date) -> int
load_calendar() -> pd.DataFrame          # indexed by d_index; has event/snap/distance columns

# app/ml/forecast_engine.py
recursive_forecast(
    series_id: str,
    start_d: int,
    model,                      # the unpickled LightGBM booster
    feature_meta: dict,         # parsed feature_meta.json
    units_by_d: dict[int, float],   # {d_index: actual units}   for THIS series
    price_by_d: dict[int, float],   # {d_index: sell_price}      for THIS series
    neutralize_events: bool = False,
) -> list[float]                # length 28, non-negative

# app/ml/metrics.py   (all pure; pass plain lists/arrays)
compute_accuracy(actual, forecast) -> {accuracy, wape, smape, mae, rmse}      # headline = accuracy (WAPE-based)
compute_coherence(actual, forecast) -> {coherence, coherence_label}
compute_velocity(prev_28_sum: float, forecast) -> {value, status}
compute_inventory_risk(trailing_28, forecast) -> {on_hand, safety_stock, reorder_point,
        horizon_demand, cover_days, stockout_risk, overstock, recommended_order_qty, projected_stock}
compute_explainability(series_id, product_name, month, forecast_full, forecast_no_event,
        profile: dict, velocity: dict, events_in_horizon: list[dict],
        snap_days_in_horizon: int) -> {event_contribution_pct, snap_days_in_horizon, narrative, factors}
```

### How the service wires them (MT-23 reference)
```python
sd   = pd.read_parquet(SERIES_DAILY_PATH)              # load once at startup (MT-21 Store)
model = pickle.load(open(MODEL_PATH, "rb"))
meta  = json.loads(FEATURE_META_PATH.read_text())
prof  = json.loads(PROFILES_PATH.read_text())
cal   = load_calendar()

# per requested product:
ubys = {d: u for d, u in zip(g.d_index, g.units)}      # for this series_id
pbys = {d: p for d, p in zip(g.d_index, g.sell_price)}
start_d = date_to_d(start_date)
forecast      = recursive_forecast(sid, start_d, model, meta, ubys, pbys)
forecast_noev = recursive_forecast(sid, start_d, model, meta, ubys, pbys, neutralize_events=True)
actual        = [ubys.get(start_d + i, 0.0) for i in range(28)]
prev28        = sum(ubys.get(d, 0.0) for d in range(start_d - 28, start_d))
trailing28    = [ubys.get(d, 0.0) for d in range(start_d - 28, start_d)]

acc  = compute_accuracy(actual, forecast)
coh  = compute_coherence(actual, forecast)
vel  = compute_velocity(prev28, forecast)
inv  = compute_inventory_risk(trailing28, forecast)
expl = compute_explainability(sid, name, month, forecast, forecast_noev, prof[sid], vel,
                              events_in_horizon, snap_days_in_horizon)
```
Map these dicts into the `ForecastResult` shape from `05_API_CONTRACT.md` §5. (Note: the API
`metrics` object now also includes `wape` — see `05` §5; merge `acc` + `coh` into it.)

---

## 3. What students still build (the real assignment)
- **MT-20–24** — Pydantic schemas, `Store` loader, the 3 GET endpoints, the `POST /forecast`
  service+router, app wiring (CORS, errors). Call the provided engine per §2.
- **MT-25** — mock server + fixtures for frontend dev.
- **MT-30–44** — the entire futuristic React dashboard.
- **MT-45–46** — Docker + end-to-end + README.

The engine guarantees the numbers are correct; your job is the product around it.

---

## 4. Re-running the build (only if you change products/features — usually never)
On a machine that has the raw M5 CSVs in `data/raw/`:
```bash
cd backend
python -m app.ml.data_prep     # rebuild series_daily.parquet
python -m app.ml.train         # rebuild model.pkl + feature_meta.json
python -m app.ml.profiles      # rebuild profiles.json
PYTHONPATH=. python scripts/validate_engine.py   # regenerate golden + sanity-check
```
Students normally **skip this entirely** — the artifacts are committed.
