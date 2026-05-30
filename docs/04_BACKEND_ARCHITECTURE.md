# 04 — Backend Architecture

> How the Python/FastAPI backend is organized. Implements the algorithm (`03`) behind the API
> contract (`05`). Reads the data artifacts (`02`). Local-dev is the primary workflow; Docker
> is optional packaging only.

---

## 1. Repository layout (canonical — every task uses these exact paths)

```
demand-velocity/                      # repo root (this project directory)
├── .gitignore
├── README.md                         # quickstart (MT-46)
├── docker-compose.yml                # optional one-command run (MT-45)
├── docs/                             # this documentation set
├── data/
│   ├── raw/                          # GITIGNORED — large M5 CSVs live here on the dev PC
│   │   ├── calendar.csv              # EXCEPTION: small (102 KB) — see §7, committed
│   │   ├── sales_train_evaluation.csv   # gitignored (117 MB)
│   │   └── sell_prices.csv              # gitignored (194 MB)
│   └── processed/                    # COMMITTED — small derived artifacts
│       └── series_daily.parquet      # 8 series × 1941 days (built by MT-10)
├── backend/
│   ├── Dockerfile                    # MT-45
│   ├── requirements.txt              # pinned (§6)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI app + startup (MT-24)
│   │   ├── config.py                 # ALL constants + PRODUCTS (MT-01 backend-init)
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── health.py             # GET /api/health (MT-22)
│   │   │   ├── products.py           # GET /api/products, /api/calendar/bounds (MT-22)
│   │   │   └── forecast.py           # POST /api/forecast (MT-23)
│   │   ├── ml/
│   │   │   ├── __init__.py
│   │   │   ├── data_prep.py          # raw CSV → series_daily.parquet (MT-10)
│   │   │   ├── calendar_features.py  # date↔d, days_to/since_event, snap (MT-11)
│   │   │   ├── features.py           # build_features() (MT-12)
│   │   │   ├── train.py              # trains model.pkl (MT-13)
│   │   │   ├── profiles.py           # builds profiles.json (MT-14)
│   │   │   ├── forecast_engine.py    # recursive_forecast() (MT-15)
│   │   │   └── metrics.py            # accuracy/coherence/velocity/risk/explain (MT-16..19)
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── store.py              # loads artifacts once (singletons) (MT-21)
│   │   │   └── forecast_service.py   # orchestrates a full ForecastResult (MT-23)
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   └── contracts.py          # Pydantic models == 05 contract (MT-20)
│   │   └── models/                   # COMMITTED artifacts
│   │       ├── model.pkl             # trained booster (MT-13)
│   │       ├── feature_meta.json     # feature order + best_iteration (MT-13)
│   │       └── profiles.json         # per-series profiles (MT-14)
│   └── tests/
│       ├── conftest.py
│       ├── test_data_prep.py         # MT-10
│       ├── test_calendar_features.py # MT-11
│       ├── test_features.py          # MT-12
│       ├── test_forecast_engine.py   # MT-15 (golden test)
│       ├── test_metrics.py           # MT-16..19
│       └── test_api.py               # MT-22..24
└── frontend/                         # see 06_UIUX_SPEC.md §10 for the frontend tree
```

---

## 2. Layered design

```
HTTP  ──►  api/*.py (routers)  ──►  services/* (orchestration)  ──►  ml/* (pure functions)
                                          │
                                          └──►  services/store.py (cached artifacts: model,
                                                series_daily DataFrame, calendar, profiles)
```

- **`ml/*`** are pure, testable functions — no FastAPI imports, no globals. They take data in,
  return numbers/arrays out. This is what the unit tests target.
- **`services/store.py`** loads `model.pkl`, `series_daily.parquet`, `calendar.csv`,
  `feature_meta.json`, `profiles.json` **once** at process start and holds them in module-level
  singletons (`get_store()`), so requests are fast and deterministic.
- **`services/forecast_service.py`** assembles a full `ForecastResult` (per `05` §5) by calling
  `forecast_engine` + `metrics` + reading profiles. The router just validates and serializes.

---

## 3. Startup sequence (`main.py`)
```
on startup:
  1. store = Store.load()        # reads all artifacts from backend/app/models + data/processed
  2. assert store.model_loaded   # else /api/health returns model_loaded=false
  3. register routers, CORS (allow http://localhost:5173)
```
If artifacts are missing, the app still starts but `/api/health` reports `model_loaded:false`
and `/api/forecast` returns 500 with a clear message (so the failure is obvious, not silent).

---

## 4. Request lifecycle for `POST /api/forecast`
```
forecast.py router
  → validate body with Pydantic (ForecastRequest)  → 422 on error (05 §7)
  → forecast_service.run(product_ids, start_date):
        for each product_id:
            preds   = recursive_forecast(...)            # ml/forecast_engine
            actual  = lookup actuals over horizon         # store.series_daily
            metrics = compute_metrics(actual, preds)      # ml/metrics
            velocity= compute_velocity(...)
            inv     = compute_inventory_risk(...)
            expl    = compute_explainability(...)         # incl. counterfactual forecast
            assemble ForecastResult
        build summary
  → return ForecastResponse (serialized by Pydantic)
```

---

## 5. Error handling
- A single exception handler maps `ValidationError`/`ValueError` → 422 with the `05` §7 shape.
- Unhandled exceptions → 500 with `{"error":"server_error","message": str(e)}`.
- Never leak stack traces in the body; log them server-side.

---

## 6. Dependencies (`backend/requirements.txt`, pinned)
```
fastapi==0.115.6
uvicorn[standard]==0.34.0
pydantic==2.10.4
pandas==2.2.3
numpy==2.1.3
pyarrow==18.1.0
lightgbm==4.6.0         # the committed model.pkl was trained with this version
scikit-learn==1.6.0     # metrics helpers (pearsonr via scipy alternative ok)
scipy==1.15.0
python-dateutil==2.9.0
pytest==8.3.4           # dev/test
httpx==0.28.1           # test client for FastAPI
```
> Pin exactly so `model.pkl` reproduces. Python **3.11**. These are the only allowed runtime deps.

---

## 7. Repository & data strategy (LOCKED — solves GitHub's 100 MB limit)

GitHub rejects files > 100 MB. Two raw files exceed it. Therefore:

**Committed to git (small, needed at runtime):**
- all source code + `docs/`
- `data/raw/calendar.csv` (102 KB — needed at runtime for date/event features)
- `data/processed/series_daily.parquet` (< 1 MB — the absorbed 8-product data)
- `backend/app/models/model.pkl`, `feature_meta.json`, `profiles.json`

**Gitignored (large or private):**
- `data/raw/sales_train_evaluation.csv`, `data/raw/sell_prices.csv`,
  `data/raw/sales_train_validation.csv`, `data/raw/sample_submission.csv`
- `official_docs/` (interns' personal appointment letters — must NOT be public)
- standard junk: `__pycache__/`, `*.pyc`, `.venv/`, `node_modules/`, `dist/`, `.env`

**Consequence:** because `series_daily.parquet`, `calendar.csv`, and the model artifacts are
committed, a student who clones the repo can run the backend **immediately** — they never need
the raw CSVs and never retrain. `data_prep.py` (MT-10) and `train.py` (MT-13) are run **once on
the dev PC** that has the raw data; their outputs are committed.

Canonical `.gitignore` (authored in MT-00):
```gitignore
# raw M5 data (too large for GitHub) — keep calendar.csv (small, needed at runtime)
data/raw/*
!data/raw/calendar.csv
# private documents
official_docs/
# python
__pycache__/
*.pyc
.venv/
venv/
.pytest_cache/
# node / frontend
node_modules/
frontend/dist/
# env / secrets
.env
*.local
```

---

## 8. Local-dev run (primary workflow — no Docker)
```
cd backend
python -m venv .venv && .venv\Scripts\activate      # Windows PowerShell
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/api/health
```
Tests: `pytest -q` from `backend/`. Docker is only assembled in MT-45 for the final demo.

---

## 9. Determinism & performance
- Artifacts loaded once (singleton) → forecasts are CPU-only, sub-second per product.
- No network calls at runtime. No randomness at inference.
- A warm `/api/forecast` for 8 products must complete in ≤ 2 s (`05` §8).
