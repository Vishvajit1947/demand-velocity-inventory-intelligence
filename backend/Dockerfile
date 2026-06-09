# backend/Dockerfile — FastAPI service (Python 3.11)
# NOTE: build context is the REPO ROOT (see docker-compose.yml), so paths below
# are relative to the repo root, not to backend/.
#
# Working directory is /app/backend so that:
#   - uvicorn target "app.main:app" resolves correctly (app/ is a package under /app/backend/)
#   - config._find_repo_root() walks up to /app, which contains both backend/ and data/,
#     so all artifact PATHS resolve to /app/data/... and /app/backend/app/models/...
#
# Container layout:
#   /app/                              <- repo root mirror (found by _find_repo_root)
#   /app/backend/app/                  <- FastAPI application code  (WORKDIR: /app/backend)
#   /app/backend/app/models/           <- model.pkl, feature_meta.json, profiles.json
#   /app/data/processed/               <- series_daily.parquet
#   /app/data/raw/                     <- calendar.csv
FROM python:3.11-slim

# Faster, cleaner Python in containers
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

# 1) Install dependencies first (better layer caching)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

# 2) Copy the application code (includes app/models/*.pkl|json committed artifacts)
#    Placed at /app/backend/app/ — uvicorn can resolve "app.main:app" from /app/backend/
COPY backend/app ./app

# 3) Copy committed runtime data artifacts (per 04_BACKEND_ARCHITECTURE.md §7)
#    Store.load() reads data/processed/series_daily.parquet and data/raw/calendar.csv.
#    Placed under /app/data/... so _find_repo_root() locates /app as the repo root.
COPY data/processed/series_daily.parquet /app/data/processed/series_daily.parquet
COPY data/raw/calendar.csv               /app/data/raw/calendar.csv

EXPOSE 8000

# No --reload in the image (production-style run).
# CWD is /app/backend; uvicorn resolves "app.main:app" from here.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
