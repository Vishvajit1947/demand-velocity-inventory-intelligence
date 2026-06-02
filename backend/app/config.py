"""
Single source of truth for all backend constants and artifact paths.

Pure constants + path resolution only — NO FastAPI, pandas, numpy, or model loading here
(artifacts are loaded by app.services.store in MT-21). Every layer may import this module.

Citations:
  - Day-split constants & D1 anchor ... 02_DATA_SPEC.md §1, §3
  - PRODUCTS / SERIES_IDS ............... 02_DATA_SPEC.md §6
  - Inventory constants ................ 03_ALGORITHM_SPEC.md §6.4
  - HISTORY_WINDOW ..................... 05_API_CONTRACT.md §4 (history_window)
  - ARCHETYPE labels ................... 05_API_CONTRACT.md §3 (mapped from 02 §2 stories)
  - Artifact paths ..................... 04_BACKEND_ARCHITECTURE.md §1
"""

from __future__ import annotations

import datetime as _dt
from pathlib import Path

# ---------------------------------------------------------------------------
# 1. Train / test split + horizon (LOCKED — 02_DATA_SPEC.md §3)
# ---------------------------------------------------------------------------
TRAIN_START_D = 1
TRAIN_END_D = 1095
TEST_START_D = 1096
TEST_END_D = 1941
HORIZON = 28
FIRST_SELECTABLE_D = 1096   # 2014-01-28
LAST_SELECTABLE_D = 1914    # 2016-04-25  (LAST_SELECTABLE_D + HORIZON - 1 == TEST_END_D)

# Day-1 anchor: d_1 == 2011-01-29 (02_DATA_SPEC.md §1). calendar.csv is authoritative;
# this constant is the single in-code anchor for tested date helpers (MT-11).
D1_DATE = _dt.date(2011, 1, 29)

# Internal consistency guard (matches 02 §3 note).
assert LAST_SELECTABLE_D + HORIZON - 1 == TEST_END_D

# ---------------------------------------------------------------------------
# 2. Canonical product config (LOCKED — 02_DATA_SPEC.md §6)
#    THE single source of product identity in code.
# ---------------------------------------------------------------------------
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
SERIES_IDS = list(PRODUCTS.keys())  # stable, canonical order (8 ids)

# ---------------------------------------------------------------------------
# 3. Archetype labels (LOCKED — 05_API_CONTRACT.md §3; mapped from 02 §2 stories)
#    Allowed labels (exactly these four, per 05 §3):
#      "Event-driven" | "Seasonal" | "Perishable seasonal" | "Stable baseline"
# ---------------------------------------------------------------------------
ARCHETYPE = {
    "turkey":       "Event-driven",        # Thanksgiving spike (02 §2)
    "candy":        "Event-driven",        # Halloween single-event spike (02 §2)
    "strawberries": "Perishable seasonal",  # perishable, dual-trigger seasonal (02 §2)
    "icecream":     "Seasonal",            # summer seasonal (02 §2)
    "cocoa":        "Seasonal",            # winter seasonal (02 §2)
    "chips":        "Event-driven",        # Super Bowl one-day event (02 §2)
    "milk":         "Stable baseline",     # stable baseline, CV 0.10 (02 §2)
    "bread":        "Stable baseline",     # flattest baseline, CV 0.08 (02 §2)
}

# ---------------------------------------------------------------------------
# 4. Inventory simulation constants (LOCKED — 03_ALGORITHM_SPEC.md §6.4)
# ---------------------------------------------------------------------------
INITIAL_COVER_DAYS = 14
LEAD_TIME_DAYS = 7
SERVICE_Z = 1.65

# History context length returned by /api/forecast (LOCKED — 05_API_CONTRACT.md §4 history_window)
HISTORY_WINDOW = 84

# ---------------------------------------------------------------------------
# 5. Artifact paths (LOCKED targets — 04_BACKEND_ARCHITECTURE.md §1)
#    Resolved relative to the repo root, robustly, so imports work no matter the CWD.
# ---------------------------------------------------------------------------
def _find_repo_root(start: Path) -> Path:
    """
    Walk upward from `start` until we find the directory that contains BOTH `backend/`
    and `data/` (the repo root, per 04 §1). Fall back to two levels above this file
    (repo_root/backend/app/config.py -> repo_root) if no marker is found.
    """
    for parent in [start, *start.parents]:
        if (parent / "backend").is_dir() and (parent / "data").is_dir():
            return parent
    # Fallback: this file lives at <repo_root>/backend/app/config.py
    return start.parents[2]


# This file: <repo_root>/backend/app/config.py  ->  parents[2] == <repo_root>
_THIS_FILE = Path(__file__).resolve()
REPO_ROOT = _find_repo_root(_THIS_FILE.parent)

# Directory holding the committed model artifacts (04 §1).
MODELS_DIR = REPO_ROOT / "backend" / "app" / "models"

PATHS = {
    "series_daily": REPO_ROOT / "data" / "processed" / "series_daily.parquet",
    "model":        MODELS_DIR / "model.pkl",
    "feature_meta": MODELS_DIR / "feature_meta.json",
    "profiles":     MODELS_DIR / "profiles.json",
    "calendar":     REPO_ROOT / "data" / "raw" / "calendar.csv",
}

# ---------------------------------------------------------------------------
# 6. App metadata
# ---------------------------------------------------------------------------
API_VERSION = "1.0.0"                  # /api/health version (05 §2)
VERSION = API_VERSION                  # alias expected by MT-22/MT-24 (05 §2)
CORS_ORIGINS = ["http://localhost:5173"]  # Vite dev server (05 §1, 04 §3)

# ---------------------------------------------------------------------------
# Compatibility aliases used by existing scripts/tests (convenience)
# ---------------------------------------------------------------------------
DATA_RAW = REPO_ROOT / "data" / "raw"
DATA_PROCESSED = REPO_ROOT / "data" / "processed"

MODELS_DIR = MODELS_DIR

SERIES_DAILY_PATH = PATHS["series_daily"]
CALENDAR_PATH = PATHS["calendar"]
MODEL_PATH = PATHS["model"]
FEATURE_META_PATH = PATHS["feature_meta"]
PROFILES_PATH = PATHS["profiles"]

# Training fold split for early stopping (docs/03_ALGORITHM_SPEC.md sec 2)
FIT_START_D = 29
FIT_END_D = 1011
VALID_START_D = 1012
VALID_END_D = 1095
