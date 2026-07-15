# Demand Velocity & Inventory Intelligence

**[Live Demo →](https://demand-velocity-inventory-intellige.vercel.app)**

A dark-theme retail analytics dashboard that forecasts **28 days of daily demand** for **8 grocery products** using a pre-trained **LightGBM** model on the Walmart M5 dataset. Select a start date and up to 8 products, hit **Forecast**, and get predicted vs. actual demand alongside actionable inventory recommendations — all across 8 animated panels.


---

## Problem Statement

Retail buyers managing seasonal and event-driven products face a compounding challenge: demand spikes can be 4–7× baseline (Thanksgiving turkey, Halloween candy, Super Bowl chips), yet traditional reorder rules treat every product identically. This project turns a pre-trained LightGBM model on 5 years of Walmart M5 sales data into a real-time inventory intelligence layer — surfacing not just the forecast, but *why* demand is moving and exactly how much stock to order.

---

## Highlights

- **19.7% portfolio WAPE** across all 8 products and 6 test dates, volume-weighted (equivalent to `100 − WAPE = 80.3` accuracy score); stable products hit WAPE ≤ 15% (milk, bread) while the hardest event-driven spikes land around 30–67%
- **N× faster multi-product inference** — batching N products into one `model.predict()` call per day reduces 28×N LightGBM calls to 28; at the maximum of 8 products that's 224 → 28 calls, cutting fixed Python↔LightGBM round-trip overhead by 8×
- **Event attribution via counterfactual** — a second neutralised forecast pass isolates the exact % of predicted demand driven by events (e.g. Thanksgiving, Super Bowl) vs. baseline seasonality vs. trend
- **End-to-end inventory simulation** — safety stock (Z = 1.65), reorder point, projected 28-day stock depletion, and recommended order quantity computed from the same forecast in a single pass
- **Zero cold-start latency** — LightGBM model is JIT-warmed at server startup so the first real request hits an already-compiled model

> **No raw data download and no model training required.** All runtime artifacts are committed to the repo. Clone and run.

---

## Features

**8 interactive dashboard panels:**

| Panel | What it shows |
|---|---|
| Executive Overview | Aggregate KPIs — total predicted demand, high-risk product count, avg. velocity & accuracy, active events |
| Forecast Result | Predicted vs. actual demand chart with per-product switcher |
| Velocity | Demand velocity trend: Critical Decline → Declining → Stable → Growing → Accelerating |
| Inventory Risk | On-hand stock, safety stock, reorder point, 28-day projected stock, stockout risk (Low / Medium / High), recommended order quantity |
| Explainability | Event contribution %, SNAP days in horizon, plain-English narrative, factor breakdown by kind (event / seasonal / trend) |
| Event Impact | Calendar events within the forecast horizon and their estimated uplift |
| Seasonal Trend | Month-over-month and weekday demand averages from pre-built product profiles |
| Accuracy & Coherence | WAPE, sMAPE, MAE, RMSE, accuracy score, coherence label (Strong / Moderate / Weak) |

**Under the hood:**
- Recursive 28-step autoregressive forecasting — each day's prediction feeds back as lag features
- Multi-product batching — one `model.predict()` call per day for N products (28 calls total vs. 28×N)
- Counterfactual event-neutralisation pass for event contribution attribution
- LightGBM model JIT warmup at startup — zero first-request latency spike
- Per-IP rate limiting: 20 req/min on `/api/forecast`, 60 req/min on metadata endpoints
- CORS origins configurable via `CORS_ORIGINS` env var

**8 tracked products** (Walmart M5 FOODS department):

| Key | Product | Archetype |
|---|---|---|
| `turkey` | Fresh Whole Turkey | Event-driven |
| `candy` | Halloween Candy | Event-driven |
| `chips` | Tortilla Chips | Event-driven |
| `strawberries` | Fresh Strawberries | Perishable seasonal |
| `icecream` | Vanilla Ice Cream | Seasonal |
| `cocoa` | Hot Cocoa Mix | Seasonal |
| `milk` | Fresh Whole Milk | Stable baseline |
| `bread` | Sliced White Bread | Stable baseline |

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | Python 3.11 · FastAPI 0.115 · Uvicorn 0.34 · Pydantic v2 |
| **ML** | LightGBM 4.5 · Pandas 2.2 · NumPy 2.1 · scikit-learn 1.6 · SciPy 1.15 |
| **Data** | PyArrow 18 (Parquet) · Python-dateutil |
| **Rate limiting** | SlowAPI 0.1.9 · limits 3.14 |
| **Frontend** | React 18 · TypeScript · Vite 5 · TailwindCSS 3 |
| **Visualisation** | Recharts 2 · Framer Motion 11 · react-countup |
| **Data fetching** | TanStack React Query v5 |
| **Testing** | pytest 8.3 · httpx 0.28 (backend) · Vitest · Testing Library (frontend) |
| **CI/CD** | GitHub Actions (parallel backend + frontend jobs) |
| **Packaging** | Local dev (primary) · Docker Compose (optional) |

---

## Prerequisites

- **Python 3.11**
- **Node.js 20 (LTS)**
- **git**
- *(optional)* **Docker Desktop** — only needed for the one-command Docker path

---

## Quickstart — Local Dev

Open two terminals.

### Terminal 1 — Backend

```bash
cd backend
python -m venv .venv

# Windows PowerShell
.venv\Scripts\activate

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Verify the backend is up:

```
GET http://localhost:8000/api/health
→ {"status":"ok","model_loaded":true,"version":"1.0.0"}
```

### Terminal 2 — Frontend

Make sure `frontend/.env` exists with:

```
VITE_API_BASE=http://localhost:8000
```

Then:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Quickstart — Docker

Requires Docker Desktop.

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:8000 |

```bash
docker compose down   # stop and remove containers
```

---

## Data & Model Artifacts

All runtime artifacts are committed — no raw data download or model retraining needed.

| Artifact | Path | Description |
|---|---|---|
| Daily series | `data/processed/series_daily.parquet` | 8 product series, processed once from M5 |
| Calendar | `data/raw/calendar.csv` | Date/event calendar |
| Model | `backend/app/models/model.pkl` | Trained LightGBM booster |
| Feature metadata | `backend/app/models/feature_meta.json` | Feature list, categorical encodings, best iteration |
| Product profiles | `backend/app/models/profiles.json` | Pre-built seasonal/weekday averages |

The large raw M5 CSVs (`sales_train_evaluation.csv`, `sell_prices.csv`, etc.) are gitignored and not required to run the app.

---

## API Reference

All endpoints are served under the `/api` prefix.

| Method | Endpoint | Rate limit | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Service health + model load status |
| `GET` | `/api/products` | 60/min | List of 8 products with archetype, mean, and seasonal CV |
| `GET` | `/api/calendar/bounds` | 60/min | Train/test split dates, selectable window, horizon |
| `POST` | `/api/forecast` | 20/min | Run a forecast for 1–8 products |

### POST /api/forecast

**Request body:**

```json
{
  "product_ids": ["turkey", "chips"],
  "start_date": "2016-04-25"
}
```

- `product_ids` — non-empty array of valid series IDs, max 8, duplicates removed
- `start_date` — ISO `YYYY-MM-DD`, must fall within the selectable test window (`2014-01-28` – `2016-04-25`)

**Selectable date range:** d_1096 (2014-01-28) through d_1914 (2016-04-25). Forecasting 28 days from the last selectable date lands exactly on the end of the test set.

**Error shape (422 / 429 / 500):**

```json
{
  "error": "validation_error",
  "message": "start_date is outside the selectable window.",
  "field": "start_date"
}
```

---

## ML Model Details

**Algorithm:** LightGBM gradient-boosted trees, recursive 28-step autoregressive forecasting.

**Training data:** Walmart M5 competition — 8 food products, daily sales d_1 (2011-01-29) through d_1095. Validation fold: d_1012–d_1095. Test (selectable) range: d_1096–d_1941.

**26 features:**

| Category | Features |
|---|---|
| Calendar | `wday`, `month`, `year`, `day_of_month`, `week_of_year`, `is_weekend` |
| SNAP | `snap_count` (food-stamp days across CA/TX/WI stores) |
| Events | `event_name_1/2`, `event_type_1/2`, `is_event`, `days_to_next_event`, `days_since_last_event` |
| Price | `sell_price`, `price_rel` (relative to training mean) |
| Lags | `lag_1`, `lag_7`, `lag_14`, `lag_28` |
| Rolling | `roll_mean_7`, `roll_mean_28`, `roll_std_7`, `roll_std_28`, `roll_mean_7_by_wday` |
| Identity | `series_id` (categorical) |

**Target scaling:** Each series is scaled by its `series_scale` before training. Predictions are multiplied back at inference time.

**Post-forecast analytics:**
- **Inventory simulation** — safety stock at Z = 1.65, 14-day initial cover, 7-day lead time
- **Event attribution** — counterfactual forecast with events neutralised; contribution % = `(Σforecast − Σforecast_no_event) / Σforecast × 100`
- **Velocity** — % change from trailing 28-day actuals to 28-day forecast sum

---

## Running Tests

**Backend:**

```bash
cd backend
pytest -q
```

**Frontend:**

```bash
cd frontend
npm run build      # TypeScript type-check + production build (must pass with 0 errors)
npm run test       # Vitest single run
```

**Useful frontend scripts:**

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run test` | Vitest (single run) |
| `npm run test:watch` | Vitest watch mode |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm run preview` | Serve the production build locally |

---

## CI

GitHub Actions runs on every push and pull request. Both jobs run in parallel.

```
backend  (Python 3.11, ubuntu-latest)
  └── pip install -r requirements.txt
  └── pytest -q

frontend (Node 20, ubuntu-latest)
  └── npm ci
  └── npm run build
  └── npm run test
```

---

## Project Structure

```
demand-velocity-inventory-intelligence/
├── backend/
│   ├── app/
│   │   ├── api/            # Route handlers: health, products, forecast
│   │   ├── ml/             # ML core: forecast_engine, features, metrics,
│   │   │                   #          calendar_features, data_prep, profiles, train
│   │   ├── models/         # Committed artifacts: model.pkl, feature_meta.json, profiles.json
│   │   ├── schemas/        # Pydantic API contracts (single source of truth)
│   │   ├── services/       # Business logic: forecast_service, artifact store
│   │   ├── config.py       # All constants — splits, products, paths, inventory params
│   │   ├── limiter.py      # SlowAPI rate limiter singleton
│   │   └── main.py         # FastAPI app factory, CORS, middleware, lifespan
│   ├── scripts/            # Dev utilities: time_forecast, validate_engine, verify_rate_limiting
│   ├── tests/              # pytest suite
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── controls/   # ForecastControlBar
│   │   │   ├── panels/     # 8 dashboard panel components
│   │   │   └── ui/         # PanelState, ProductSwitcher, Toast, EntranceList, AnimatedBackground
│   │   ├── hooks/          # useForecast, useBounds, useProducts (React Query)
│   │   ├── lib/            # types.ts, format.ts
│   │   └── App.tsx         # Root shell, lifted forecast state
│   └── package.json
├── data/
│   ├── processed/          # series_daily.parquet (committed)
│   └── raw/                # calendar.csv (committed); large M5 CSVs gitignored
├── docs/                   # Full spec set (00_INDEX.md + micro-task docs)
├── docker-compose.yml
└── .github/workflows/ci.yml
```

---

## Documentation

The full specification set is in [`docs/`](docs/). Start with [`docs/00_INDEX.md`](docs/00_INDEX.md).
