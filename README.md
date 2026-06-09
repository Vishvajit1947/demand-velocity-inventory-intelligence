# Demand Velocity & Inventory Intelligence

A futuristic, dark-theme web dashboard that forecasts **28 days of daily demand** for **8 retail
products** (Walmart M5 data) using a pre-trained **LightGBM** model. Pick a start date and one or
more products, click **Forecast**, and the app shows the predicted vs. actual demand, accuracy &
coherence scores, product velocity, event/seasonal drivers, inventory-risk recommendations, and a
plain-English explanation — across 7 animated panels.

- **Backend:** Python 3.11 · FastAPI · Uvicorn · LightGBM
- **Frontend:** React 18 · TypeScript · Vite · TailwindCSS · Framer Motion · Recharts
- **Packaging:** local-dev (primary) · Docker Compose (optional)

![Dashboard screenshot](docs/screenshot.png)
<!-- Screenshot placeholder: add docs/screenshot.png after the first successful run. -->

---

## Prerequisites
- **Python 3.11**
- **Node.js 20 (LTS)**
- **git**
- *(optional)* **Docker Desktop** — only needed for the one-command Docker run.

No raw data download and no model training are required — see **Data & model artifacts** below.

---

## Quickstart (local-dev — primary)

Open two terminals.

### 1) Backend (terminal 1)
```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Backend is now at http://localhost:8000 — check http://localhost:8000/api/health
(expect `{"status":"ok","model_loaded":true,"version":"1.0.0"}`).

### 2) Frontend (terminal 2)
Ensure `frontend/.env` points at the real backend:
```
VITE_API_BASE=http://localhost:8000
```
then:
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 and use the dashboard.

---

## Quickstart (Docker — optional)
Requires Docker Desktop running.
```bash
docker compose up --build
```
- Frontend: http://localhost:5173
- Backend:  http://localhost:8000

Stop with `docker compose down`.

---

## Data & model artifacts (why no download/training is needed)
This repo commits the small, derived artifacts the app needs at runtime, so a fresh clone runs
immediately:

- `data/processed/series_daily.parquet` — the 8 product series (built once, committed)
- `data/raw/calendar.csv` — date/event calendar (committed)
- `backend/app/models/model.pkl`, `feature_meta.json`, `profiles.json` — the trained model + metadata

The large raw M5 CSVs (`sales_train_evaluation.csv`, `sell_prices.csv`, …) are **gitignored** and
live only on the dev PC. The data-prep and training scripts were run **once** there; their outputs
are the committed artifacts above. You never need the raw CSVs and never retrain.

---

## Tests
**Backend:**
```bash
cd backend
pytest -q
```
**Frontend:**
```bash
cd frontend
npm run build     # must succeed with 0 TypeScript errors
npm run test
```

---

## Documentation
The full specification set lives in [`docs/`](docs/). Start with
[`docs/00_INDEX.md`](docs/00_INDEX.md). Build tasks are in
[`docs/micro-tasks/MT-INDEX.md`](docs/micro-tasks/MT-INDEX.md).
