# MT-45 — Docker Compose + Dockerfiles (OPTIONAL packaging)

## 1. Context
The project is a FastAPI backend (Python 3.11) + a React/Vite frontend (Node 20) that together render a demand-forecasting dashboard. By this point the backend (MT-01…MT-24) and frontend (MT-02…MT-43) are complete and run via local-dev. This task adds **optional** Docker packaging so the whole app can come up with one command for the final demo. Per `04_BACKEND_ARCHITECTURE.md` §8 and `01_PROJECT_SPEC.md` §4 (S1), local-dev is the **primary** workflow; Docker is convenience packaging only — Docker Desktop is installed but only launched for the final demo.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/04_BACKEND_ARCHITECTURE.md` (§1 repo tree, §6 dependencies, §8 local-dev)
- `docs/06_UIUX_SPEC.md` (§10 frontend tree, §7 locked libraries)
- `docs/05_API_CONTRACT.md` (§2 health endpoint, CORS, base URL)

**Prior MT artifacts/paths that must already exist:**
- `backend/requirements.txt` (pinned deps — MT-01, per `04` §6).
- `backend/app/**` (the FastAPI app, entrypoint `app.main:app` — MT-24).
- `data/processed/series_daily.parquet` (committed — MT-10).
- `data/raw/calendar.csv` (committed — needed at runtime, per `04` §7).
- `backend/app/models/model.pkl`, `feature_meta.json`, `profiles.json` (committed — MT-13/MT-14).
- `frontend/package.json`, `frontend/package-lock.json`, `frontend/vite.config.ts`, and the full `frontend/src/**` (MT-02…MT-43). `npm run build` must already succeed locally.
- The repo scaffold (MT-00) — directories `backend/` and `frontend/` already exist.

## 3. Goal
Author `backend/Dockerfile`, `frontend/Dockerfile`, and a root `docker-compose.yml` that build and run both services with one `docker compose up`, exposing the frontend on `5173` and the backend on `8000`, wired so the frontend calls the backend.

## 4. Design
Locked decisions for this task (do not re-decide):

- **Optional, not primary.** Local-dev (`04` §8) remains the documented primary path. Docker is for the final demo only.
- **Backend image (per `04` §1 file `backend/Dockerfile`, §6 deps):**
  - Base `python:3.11-slim` (matches the locked Python 3.11).
  - Copy `requirements.txt` first, `pip install` (layer caching), then copy the app.
  - The container needs three committed artifact sets at runtime: `backend/app/**` (includes `app/models/*`), `data/processed/series_daily.parquet`, and `data/raw/calendar.csv` (per `04` §7 — `Store.load()` reads all of these).
  - Expose `8000`; `CMD uvicorn app.main:app --host 0.0.0.0 --port 8000` (per `04` §8, but bound to `0.0.0.0` for container networking, and **no** `--reload` in the image).
- **Frontend image (per `06` §10 file `frontend/Dockerfile`):**
  - Multi-stage. **Build stage** `node:20` runs `npm ci && npm run build` → static `dist/`.
  - **Serve stage** `nginx:alpine` serves the built `dist/` on port `80` (chosen over `npx serve` for a tiny, dependency-free runtime image). A minimal SPA-fallback nginx config is included so client routes resolve to `index.html`.
  - The API base URL is a **build-time** Vite env (`VITE_API_BASE`) baked into the bundle at build (Vite inlines `import.meta.env.VITE_API_BASE` at build time). Default `http://localhost:8000` — the browser (on the host) calls the backend via the host-published port `8000`.
- **Compose wiring (per `04` §1 file `docker-compose.yml`):**
  - Two services: `backend` (publish `8000:8000`) and `frontend` (publish `5173:80` — host `5173`, container nginx `80`).
  - `frontend` sets build arg `VITE_API_BASE=http://localhost:8000` and `depends_on: backend`.
  - **CORS:** the backend already allows origin `http://localhost:5173` (per `04` §3 and `05` §0). Because the frontend is published on host `5173` and the browser calls `http://localhost:8000` from that origin, the existing CORS allowance is correct — no backend change needed.
- **Build context paths:** the backend image must access `data/` (sibling of `backend/`), so the backend service's **build context is the repo root** with an explicit `dockerfile: backend/Dockerfile`. The frontend's context is `./frontend`.

## 5. Implementation
All paths are relative to the repo root.

### 5.1 `backend/Dockerfile`
```dockerfile
# backend/Dockerfile — FastAPI service (Python 3.11)
# NOTE: build context is the REPO ROOT (see docker-compose.yml), so paths below
# are relative to the repo root, not to backend/.
FROM python:3.11-slim

# Faster, cleaner Python in containers
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 1) Install dependencies first (better layer caching)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

# 2) Copy the application code (includes app/models/*.pkl|json committed artifacts)
COPY backend/app ./app

# 3) Copy committed runtime data artifacts (per 04_BACKEND_ARCHITECTURE.md §7)
#    Store.load() reads data/processed/series_daily.parquet and data/raw/calendar.csv.
COPY data/processed/series_daily.parquet /app/data/processed/series_daily.parquet
COPY data/raw/calendar.csv               /app/data/raw/calendar.csv

EXPOSE 8000

# No --reload in the image (production-style run)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

> If `Store.load()` resolves artifact paths relative to a different working directory than `/app`, the app must compute paths relative to the repo root layout `data/...` and `app/models/...`. The copies above reproduce that exact layout under `/app` (`/app/app/models/*`, `/app/data/...`), matching the committed tree from `04` §1.

### 5.2 `frontend/Dockerfile`
```dockerfile
# frontend/Dockerfile — React + Vite static build, served by nginx
# Build context is ./frontend (see docker-compose.yml).

# ---- Build stage ----
FROM node:20 AS build
WORKDIR /app

# Build-time API base URL (inlined into the bundle by Vite)
ARG VITE_API_BASE=http://localhost:8000
ENV VITE_API_BASE=$VITE_API_BASE

# Install deps with a reproducible lockfile install
COPY package.json package-lock.json ./
RUN npm ci

# Build the static site
COPY . .
RUN npm run build      # outputs ./dist

# ---- Serve stage ----
FROM nginx:alpine AS serve
# SPA fallback so client-side routes resolve to index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 5.3 `frontend/nginx.conf`
```nginx
server {
    listen       80;
    server_name  _;
    root   /usr/share/nginx/html;
    index  index.html;

    # SPA fallback: serve index.html for any unmatched route
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

> `frontend/.dockerignore` is recommended so the build stage does not copy `node_modules`/`dist` from the host. Create `frontend/.dockerignore`:
> ```
> node_modules
> dist
> .env.local
> ```

### 5.4 `docker-compose.yml` (repo root)
```yaml
# docker-compose.yml — OPTIONAL one-command run for the final demo.
# Primary workflow is local-dev (see 04_BACKEND_ARCHITECTURE.md §8 and README quickstart).
services:
  backend:
    build:
      context: .                      # repo root, so the backend can copy data/*
      dockerfile: backend/Dockerfile
    image: demand-velocity-backend
    ports:
      - "8000:8000"                   # host:container
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        VITE_API_BASE: "http://localhost:8000"   # baked into the bundle at build time
    image: demand-velocity-frontend
    ports:
      - "5173:80"                     # host 5173 -> nginx 80 (matches CORS origin 04 §3)
    depends_on:
      - backend
    restart: unless-stopped
```

> The frontend talks to the backend from the **browser** at `http://localhost:8000` (a host-published port), not over the compose network, so no inter-service hostname is needed. `depends_on` only orders startup.

## 6. Tests / Verification
Docker Desktop must be running. Run all commands from the repo root.

1. **Build and start both services:**
   ```powershell
   docker compose build
   docker compose up -d
   docker compose ps        # both services should be "Up"
   ```

2. **Backend health (model loaded):** expect `model_loaded: true` (per `05` §2).
   ```powershell
   curl http://localhost:8000/api/health
   ```
   Expected body: `{ "status": "ok", "model_loaded": true, "version": "1.0.0" }`.

3. **Forecast smoke (cross-reference MT-46):** expect HTTP 200 and `results[0].forecast` length 28.
   ```powershell
   curl -X POST http://localhost:8000/api/forecast `
     -H "Content-Type: application/json" `
     -d '{"product_ids":["turkey"],"start_date":"2015-11-01"}'
   ```

4. **Frontend served:** open `http://localhost:5173` in a browser — the dashboard loads (dark theme, control bar). The full UI smoke is in **MT-46** (§6 there).

5. **Tear down:**
   ```powershell
   docker compose down
   ```

> If the backend reports `model_loaded: false`, the committed artifacts (`series_daily.parquet`, `calendar.csv`, `app/models/*`) were not present at build time — verify they exist in the repo (per `04` §7) and rebuild.

## 7. Acceptance checklist
- [ ] `backend/Dockerfile` exists: `python:3.11-slim`, copies `requirements.txt` then `pip install`, copies `app/` + committed data artifacts, `EXPOSE 8000`, CMD runs `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- [ ] `frontend/Dockerfile` exists: `node:20` build stage runs `npm ci && npm run build`; serve stage (`nginx:alpine`) serves `dist/`; `EXPOSE 80`.
- [ ] `frontend/nginx.conf` and `frontend/.dockerignore` exist.
- [ ] `docker-compose.yml` exists at repo root wiring `backend` (8000:8000) and `frontend` (5173:80) with build arg `VITE_API_BASE=http://localhost:8000` and `depends_on: backend`.
- [ ] `docker compose build` succeeds for both services.
- [ ] `docker compose up` brings both up; `curl /api/health` returns `model_loaded: true`.
- [ ] `curl POST /api/forecast` with `{"product_ids":["turkey"],"start_date":"2015-11-01"}` returns 200 with `forecast` length 28.
- [ ] `http://localhost:5173` loads the dashboard.
- [ ] The spec clearly states Docker is OPTIONAL and local-dev (`04` §8) is primary.
