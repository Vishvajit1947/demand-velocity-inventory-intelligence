# MT-46 — E2E Smoke Test + README Quickstart + Final Checklist

## 1. Context
This is the final integration task: the backend (MT-01…MT-24) and frontend (MT-02…MT-43) are complete and Docker packaging exists (MT-45). Until now the frontend was developed against the mock API server (per `05_API_CONTRACT.md` §9); this task connects the real frontend to the real backend, verifies the whole primary flow end-to-end, and writes the project's full `README.md`. It also records a final integration checklist mapping to the success criteria S1–S8 in `01_PROJECT_SPEC.md` §4, and an optional CI workflow per `07_TESTING_STRATEGY.md` §6. After this task, a new person can clone the repo and run the app from the README alone.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/01_PROJECT_SPEC.md` (§2 primary flow, §4 success criteria S1–S8)
- `docs/04_BACKEND_ARCHITECTURE.md` (§6 deps, §7 data strategy, §8 local-dev)
- `docs/05_API_CONTRACT.md` (§2 health, §5 forecast shape, §9 mock-vs-real swap)
- `docs/06_UIUX_SPEC.md` (§3 primary flow / layout, §9 "wow" checklist)
- `docs/07_TESTING_STRATEGY.md` (§4 integration/E2E, §6 CI)

**Prior MT artifacts/paths that must already exist:**
- Backend runnable via `uvicorn app.main:app` from `backend/` (MT-24); committed artifacts present (`data/processed/series_daily.parquet`, `data/raw/calendar.csv`, `backend/app/models/model.pkl|feature_meta.json|profiles.json`).
- Frontend runnable via `npm run dev` and buildable via `npm run build` (MT-02…MT-43); reads `VITE_API_BASE` from `frontend/.env` (per `06` §10, `05` §9).
- `docker-compose.yml` + per-service Dockerfiles (MT-45) — for the optional Docker path.
- Repo scaffold + `.gitignore` + README stub (MT-00) — this task **replaces** the README stub.

## 3. Goal
Run a documented end-to-end smoke test against the real backend, author the full `README.md`, and record a final integration checklist (mapped to S1–S8) plus an optional GitHub Actions CI workflow.

## 4. Design
Locked decisions (do not re-decide):

- **Swap mock → real with one env var (per `05` §9).** No frontend code changes. Point `frontend/.env` `VITE_API_BASE` at `http://localhost:8000` (the real backend) instead of the mock. This is the only change needed to integrate the two tracks.
- **Two run paths, local-dev is primary (per `04` §8, `01` §4 S1):** (a) local-dev — `uvicorn` + `npm run dev`; (b) optional Docker — `docker compose up` (MT-45).
- **Smoke test is documented commands, not a heavy E2E framework (per `07` §4).** The exact sequence: health check → forecast POST → manual UI check against `06` §9 + §3.
- **Canonical smoke request (per `07` §4):** `POST /api/forecast` with `{"product_ids":["turkey"],"start_date":"2015-11-01"}` → 200, `results[0].forecast` length 28. (`2015-11-01` is inside the selectable range `[2014-01-28, 2016-04-25]` from `05` §4.)
- **README structure is fixed below** (§5.2): intro + screenshot placeholder, prerequisites (Python 3.11 + Node 20), local-dev quickstart (backend + frontend), optional Docker quickstart, the committed-artifacts note (no raw data / no training needed), and a link to `docs/`.
- **CI is optional (per `07` §6).** Provide the workflow but state the gate is local green tests.
- **The full README replaces the MT-00 stub** at the repo root (per `04` §1 — `README.md` is authored in MT-46).

## 5. Implementation

### 5.1 E2E smoke-test sequence
Run from the repo root unless noted. Use **either** Path A (local-dev, primary) **or** Path B (Docker).

**Path A — local-dev (primary, per `04` §8):**

1. Start the backend (terminal 1):
   ```powershell
   cd backend
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```
2. Point the frontend at the real backend, then start it (terminal 2). Ensure `frontend/.env` contains:
   ```
   VITE_API_BASE=http://localhost:8000
   ```
   then:
   ```powershell
   cd frontend
   npm install
   npm run dev      # serves http://localhost:5173
   ```

**Path B — Docker (optional, per MT-45):**
```powershell
docker compose up --build
# frontend: http://localhost:5173   backend: http://localhost:8000
```

3. **Health check** (expect `model_loaded: true`, per `05` §2):
   ```powershell
   curl http://localhost:8000/api/health
   ```
   Expected: `{ "status": "ok", "model_loaded": true, "version": "1.0.0" }`.

4. **Forecast check** (expect HTTP 200 and `forecast` length 28, per `05` §5 / `07` §4):
   ```powershell
   curl -X POST http://localhost:8000/api/forecast `
     -H "Content-Type: application/json" `
     -d '{"product_ids":["turkey"],"start_date":"2015-11-01"}'
   ```
   Verify in the JSON body: top-level `horizon` == 28; `results[0].forecast` is an array of length 28; `results[0].metrics.accuracy` is a number; `summary.total_predicted_demand` is present.

   To assert the forecast length programmatically:
   ```powershell
   $body = '{"product_ids":["turkey"],"start_date":"2015-11-01"}'
   $r = Invoke-RestMethod -Uri http://localhost:8000/api/forecast -Method Post -ContentType "application/json" -Body $body
   "forecast length = $($r.results[0].forecast.Count)"   # expect: forecast length = 28
   ```

5. **Manual UI check** at `http://localhost:5173` against `06_UIUX_SPEC.md` §3 (primary flow) and §9 ("wow" checklist):
   - Pick a start date inside the test window, select one or more of the 8 products, click **Forecast** (the §3/§2 primary flow).
   - Forecast Result panel shows actual-vs-forecast line chart with Accuracy + Coherence dials.
   - Executive Overview, Velocity, Event, Seasonal, Inventory Risk, Explainability panels populate.
   - Confirm the §9 "wow" items: dark glass panels with blur/glow; animated background that does not hurt readability; KPI numbers count up and chart lines draw in; velocity gauge looks like an instrument; consistent accent system with labeled statuses; staggered entrance + hover micro-interactions; looks intentional at 1280/1440/1920px.

### 5.2 Full `README.md` (repo root — replaces the MT-00 stub)
Write the repo-root `README.md` with exactly this content:

```markdown
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
```

> The screenshot reference is a placeholder. After a successful run, capture the dashboard and save it as `docs/screenshot.png`; the README link will then resolve. (This is optional and does not block acceptance.)

### 5.3 Optional CI workflow (per `07` §6)
Create `.github/workflows/ci.yml` (optional — the gate remains local green tests):

```yaml
name: CI
on:
  push:
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install -r requirements.txt
      - run: pytest -q

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run build
      - run: npm run test
```

### 5.4 Final integration checklist → success criteria S1–S8
Record this mapping (from `01_PROJECT_SPEC.md` §4) and tick each after verifying:

| Criterion (`01` §4) | How verified in MT-46 |
|---|---|
| **S1** `docker compose up` brings up both with no manual steps | Path B in §5.1 + MT-45 |
| **S2** valid date + product returns a forecast < 2 s | Time the §5.1 step 4 forecast call (warm) |
| **S3** mean accuracy ≥ 60 on a fixed eval date | `backend/tests` `test_accuracy_target` green (`07` §2) |
| **S4** all 7 panels render with real data | §5.1 step 5 manual UI check |
| **S5** UI passes the "wow" bar | §5.1 step 5 against `06` §9 |
| **S6** all backend modules have passing unit tests | `cd backend && pytest -q` all green |
| **S7** frontend builds with 0 TS errors | `cd frontend && npm run build` |
| **S8** a new person can run one MT spec to completion | This README + `docs/` enable a clean-clone run |

## 6. Tests / Verification
1. `frontend/.env` has `VITE_API_BASE=http://localhost:8000` (real backend, not the mock).
2. Backend up; `curl http://localhost:8000/api/health` → `model_loaded: true`.
3. `curl -X POST http://localhost:8000/api/forecast` with `{"product_ids":["turkey"],"start_date":"2015-11-01"}` → HTTP 200 and `results[0].forecast` length **28** (use the PowerShell snippet in §5.1 step 4 to assert the count).
4. Frontend at `http://localhost:5173`: complete the §3 primary flow and confirm all 7 panels populate and the §9 "wow" items hold.
5. `cd backend && pytest -q` → all green (S6, S3). `cd frontend && npm run build && npm run test` → build clean, tests green (S7).
6. `docker compose up --build` (optional) brings both services up and the same health/forecast checks pass (S1).
7. Root `README.md` no longer contains the MT-00 "stub" wording and includes: intro, screenshot placeholder, prerequisites (Python 3.11 + Node 20), local-dev quickstart, optional Docker quickstart, the committed-artifacts note, and the `docs/` link.

## 7. Acceptance checklist
- [ ] `frontend/.env` set to `VITE_API_BASE=http://localhost:8000` (mock → real swap, per `05` §9; no code change).
- [ ] `GET /api/health` returns `model_loaded: true` (`05` §2).
- [ ] `POST /api/forecast` with `{"product_ids":["turkey"],"start_date":"2015-11-01"}` returns 200 with `forecast` length 28 (`07` §4).
- [ ] Manual UI smoke completed: §3 primary flow works and all 7 panels render with real data (S4).
- [ ] `06` §9 "wow" checklist visually confirmed at 1280/1440/1920px (S5).
- [ ] `cd backend && pytest -q` all green (S6); `test_accuracy_target` passes (S3).
- [ ] `cd frontend && npm run build` succeeds with 0 TypeScript errors (S7); `npm run test` green.
- [ ] (Optional) `docker compose up --build` brings both up and passes the health/forecast checks (S1).
- [ ] Full `README.md` written at repo root (replacing the MT-00 stub) with all sections from §5.2.
- [ ] Final integration checklist S1–S8 (§5.4) recorded and all verifiable items ticked.
- [ ] (Optional) `.github/workflows/ci.yml` added per `07` §6.
