# MT-01 — Backend Init: `requirements.txt`, `config.py`, app skeleton, `conftest.py`

## 1. Context
We are building **Demand Velocity & Inventory Intelligence**, a web dashboard that forecasts 28 days of demand for 8 retail products using a pre-trained LightGBM model (FastAPI backend + React/Vite frontend). MT-00 already materialized the empty folder tree on disk (per `04_BACKEND_ARCHITECTURE.md` §1). This task makes the backend a real, installable Python package: it creates the **pinned `requirements.txt`**, every `__init__.py`, the single **`config.py`** that holds every locked constant and the canonical `PRODUCTS` dict, and the pytest **`conftest.py`** with the shared `store` / `client` fixtures. After MT-01, every later backend/ML task (MT-10 onward) imports its constants from `app.config` and never re-declares them, and the test harness collects cleanly even before the ML artifacts exist.

This task introduces **no algorithm logic** — it only centralizes constants and wires the package so later tasks have one source of truth in code.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/02_DATA_SPEC.md` (§3 split constants, §6 `PRODUCTS` + `SERIES_IDS`)
- `docs/03_ALGORITHM_SPEC.md` (§6.4 inventory constants)
- `docs/04_BACKEND_ARCHITECTURE.md` (§1 repo tree, §2 layers, §6 pinned deps, §8 local-dev)
- `docs/05_API_CONTRACT.md` (§3 archetypes, §4 `history_window`)
- `docs/07_TESTING_STRATEGY.md` (§2 fixtures + conventions)

**Prior MT artifacts/paths that must already exist (from MT-00):**
- Repo folder tree per `04_BACKEND_ARCHITECTURE.md` §1, including:
  `backend/`, `backend/app/`, `backend/app/api/`, `backend/app/ml/`, `backend/app/services/`,
  `backend/app/schemas/`, `backend/app/models/`, `backend/tests/`, `data/processed/`, `data/raw/`.
- `.gitignore` (ignores `.venv/`, `__pycache__/`, etc.).

**Tooling assumed installed on the dev PC:** `git`, **Python 3.11**, plus a Python **3.14** system interpreter (see §4 / §5.0 — we deliberately do **not** use 3.14; we create a 3.11 venv).

## 3. Goal
Create:
1. `backend/requirements.txt` — the **exact** pinned dependency list from `04_BACKEND_ARCHITECTURE.md` §6.
2. `backend/app/__init__.py` and every sub-package `__init__.py` (`api`, `ml`, `services`, `schemas`).
3. `backend/app/config.py` — every locked constant: day-split constants (`02` §3), `PRODUCTS` + `SERIES_IDS` (`02` §6), inventory constants + `HISTORY_WINDOW` (`03` §6.4 / `05` §4), the `ARCHETYPE` map (`05` §3), and robust `PATHS` to all artifacts.
4. `backend/tests/conftest.py` — session-scoped `store` fixture and a `client` fixture (lazy imports, so the file is valid before MT-21/MT-24 land).

After this task: `pip install -r requirements.txt` succeeds in a 3.11 venv, and
`python -c "from app.config import PRODUCTS,SERIES_IDS; print(len(SERIES_IDS))"` prints `8`.

## 4. Design (locked decisions; cite foundation sections)
Everything here is already decided in the foundation docs. Do **not** re-decide or invent values.

- **Python version (LOCKED — `04` §6/§8):** Python **3.11**. The pinned versions (notably `numpy==2.1.3`, `lightgbm==4.5.0`, `pyarrow==18.1.0`) are chosen so `model.pkl` reproduces. The dev PC's *system* Python is **3.14**, which has no prebuilt wheels for several pins and would break reproducibility — therefore the project **must** use a dedicated **3.11 venv** (`backend/.venv`, gitignored). This is documented in §5.0 and is a hard requirement, not a suggestion.
- **Dependencies (LOCKED — `04` §6):** reproduce the pinned list **byte-for-byte**, including the inline comments. These are the *only* allowed runtime deps (`03` §7, `07` §5).
- **Day-split constants (LOCKED — `02` §3):** copy the constants block verbatim. `FIRST_SELECTABLE_D = 1096`, `LAST_SELECTABLE_D = 1914`, `HORIZON = 28`, and `LAST_SELECTABLE_D + HORIZON - 1 == TEST_END_D` (1914 + 28 − 1 = 1941). Also encode the day-1 anchor `D1_DATE = 2011-01-29` (`02` §1) so date math has one source.
- **`PRODUCTS` + `SERIES_IDS` (LOCKED — `02` §6):** copy the dict exactly (same keys, `item_id`, `name`, `dept_id`, same order). `SERIES_IDS = list(PRODUCTS.keys())` — this fixed order is the canonical API/series order (`02` §6, `05` §3).
- **Inventory constants (LOCKED — `03` §6.4):** `INITIAL_COVER_DAYS = 14`, `LEAD_TIME_DAYS = 7`, `SERVICE_Z = 1.65`.
- **`HISTORY_WINDOW` (LOCKED — `05` §4 `history_window`):** `HISTORY_WINDOW = 84` (the 84 history points returned by `/api/forecast`, `05` §5 `history`).
- **`ARCHETYPE` map (LOCKED — `05` §3):** the API's `archetype` field must be one of exactly
  `{"Event-driven","Seasonal","Perishable seasonal","Stable baseline"}` (`05` §3), mapped per
  `series_id` from the story column in `02` §2. Locked mapping:
  | series_id | archetype label (`05` §3) | basis (`02` §2 story) |
  |---|---|---|
  | `turkey` | `Event-driven` | Thanksgiving event spike |
  | `candy` | `Event-driven` | Halloween single-event spike |
  | `strawberries` | `Perishable seasonal` | perishable, dual-trigger (Valentine's + winter) |
  | `icecream` | `Seasonal` | summer seasonal |
  | `cocoa` | `Seasonal` | winter seasonal |
  | `chips` | `Event-driven` | pure one-day Super Bowl event |
  | `milk` | `Stable baseline` | stable baseline, CV 0.10 |
  | `bread` | `Stable baseline` | flattest baseline, CV 0.08 |

  Only these four labels appear (matches the `05` §3 enum). `strawberries` is `Perishable seasonal` (its story explicitly calls it perishable + seasonal); both event products with a dominant single event are `Event-driven`.
- **`PATHS` (LOCKED targets — `04` §1):** resolve artifact paths relative to the **repo root**, found robustly so imports work regardless of the current working directory (running `pytest` from `backend/`, `uvicorn` from `backend/`, or scripts from the repo root). The repo root is the directory that contains both `backend/` and `data/`. Targets (exact, `04` §1):
  - `data/processed/series_daily.parquet`
  - `backend/app/models/model.pkl`
  - `backend/app/models/feature_meta.json`
  - `backend/app/models/profiles.json`
  - `data/raw/calendar.csv`
- **`conftest.py` fixtures (LOCKED contract — `07` §2):** `store` (session-scoped loaded `Store`) and `client` (FastAPI `TestClient`). Both **import lazily inside the fixture body** so this file is import-valid *now*, before `app.services.store` (MT-21) and `app.main` (MT-24) exist. The fixtures are documented as becoming usable once MT-21/MT-24 land.
- **`config.py` is pure constants + path resolution.** No FastAPI imports, no pandas, no model loading (that is MT-21's `Store`). Keeping `config` dependency-free means every layer can import it (`04` §2).

## 5. Implementation (exact file paths from `04` §1; FULL runnable code)
All paths are relative to the **repo root** (the project directory). The `backend/` and `data/` folders already exist (MT-00).

### 5.0 Create the Python 3.11 virtual environment (REQUIRED — do this first)
The dev PC's system Python is **3.14**; the project must run on **3.11** (`04` §6/§8). Create a project-local 3.11 venv. Pick the command for the launcher you have:

**Windows PowerShell (primary dev environment), run from the repo root:**
```powershell
# Use the Python launcher to select 3.11 explicitly (NOT the 3.14 default):
py -3.11 --version            # must print "Python 3.11.x"; if it errors, install Python 3.11 first
py -3.11 -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python --version              # confirm: Python 3.11.x (the venv interpreter, not 3.14)
python -m pip install --upgrade pip
```

**Bash (macOS/Linux), run from the repo root:**
```bash
python3.11 --version          # must print Python 3.11.x; install it if missing
python3.11 -m venv backend/.venv
source backend/.venv/bin/activate
python --version              # confirm Python 3.11.x
python -m pip install --upgrade pip
```

> `backend/.venv/` is gitignored (`04` §7 — `.venv/`). Every later backend command in this project
> (`pip install`, `pytest`, `uvicorn`) is run **with this venv activated**. If `py -3.11` /
> `python3.11` is not found, install CPython **3.11** from python.org first — do **not** fall back
> to 3.14, as the pinned wheels (e.g. `numpy==2.1.3`, `lightgbm==4.5.0`) are validated against 3.11.

### 5.1 `backend/requirements.txt` — EXACT content (verbatim from `04` §6)
Create `backend/requirements.txt` with **exactly** this content:

```text
fastapi==0.115.6
uvicorn[standard]==0.34.0
pydantic==2.10.4
pandas==2.2.3
numpy==2.1.3
pyarrow==18.1.0
lightgbm==4.5.0
scikit-learn==1.6.0     # metrics helpers (pearsonr via scipy alternative ok)
scipy==1.15.0
python-dateutil==2.9.0
pytest==8.3.4           # dev/test
httpx==0.28.1           # test client for FastAPI
```

### 5.2 Package `__init__.py` files
Create these five files. The top-level `app/__init__.py` carries the project version string used by `/api/health` (`05` §2 → `"version": "1.0.0"`); the sub-package files are empty markers.

**`backend/app/__init__.py`:**
```python
"""Demand Velocity & Inventory Intelligence — backend package."""

__version__ = "1.0.0"
```

**`backend/app/api/__init__.py`:**
```python
```

**`backend/app/ml/__init__.py`:**
```python
```

**`backend/app/services/__init__.py`:**
```python
```

**`backend/app/schemas/__init__.py`:**
```python
```

> The four sub-package files are intentionally **empty** (zero bytes) — they only mark the
> directories as importable Python packages. `app/__init__.py` is the only one with content.

### 5.3 `backend/app/config.py` — FULL code
Create `backend/app/config.py` with exactly this content. Every value is copied from the cited foundation section; do not change any number, key, or label.

```python
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
    "icecream":     {"item_id": "FOODS_3_008", "name": "Vanilla Ice Cream",         "dept_id": "FOODS_3"},
    "cocoa":        {"item_id": "FOODS_3_073", "name": "Hot Cocoa Mix",             "dept_id": "FOODS_3"},
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
CORS_ORIGINS = ["http://localhost:5173"]  # Vite dev server (05 §1, 04 §3)
```

### 5.4 `backend/tests/conftest.py` — FULL code
Create `backend/tests/conftest.py` with exactly this content. Imports of not-yet-existing modules are **lazy** (inside the fixture body), so this file collects cleanly today.

```python
"""
Shared pytest fixtures (07_TESTING_STRATEGY.md §2).

  - `store`  : a session-scoped, loaded Store (model + data + profiles). Provided by
               app.services.store.get_store() — implemented in MT-21.
  - `client` : a FastAPI TestClient over app.main:app — implemented in MT-24.

Both fixtures import their targets LAZILY (inside the fixture body) so this conftest is
valid and pytest collects with no import errors BEFORE MT-21 / MT-24 exist. Until those
tasks land, any test that requests these fixtures will skip with a clear reason.

This file also makes the `app` package importable when running `pytest` from the
`backend/` directory (it inserts `backend/` onto sys.path).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure `import app...` works when pytest is run from backend/ (or the repo root).
_BACKEND_DIR = Path(__file__).resolve().parents[1]  # <repo_root>/backend
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))


@pytest.fixture(scope="session")
def store():
    """
    Session-scoped loaded Store singleton (MT-21). Loads model/data/profiles once.

    Becomes usable once app/services/store.py (MT-21) lands. Until then the import
    fails and the test that requested this fixture is skipped (not errored).
    """
    try:
        from app.services.store import get_store
    except ImportError:
        pytest.skip("app.services.store not implemented yet (lands in MT-21)")
    return get_store()


@pytest.fixture(scope="session")
def client():
    """
    FastAPI TestClient over app.main:app (MT-24).

    Becomes usable once app/main.py (MT-24) lands. Until then the test that requested
    this fixture is skipped (not errored).
    """
    try:
        from fastapi.testclient import TestClient

        from app.main import app
    except ImportError:
        pytest.skip("app.main not implemented yet (lands in MT-24)")
    return TestClient(app)
```

### 5.5 Install dependencies
With the 3.11 venv from §5.0 **activated**, run from the repo root:

**PowerShell:**
```powershell
pip install -r backend\requirements.txt
```
**Bash:**
```bash
pip install -r backend/requirements.txt
```

## 6. Tests / Verification (exact pytest tests + commands)
Run everything with the **3.11 venv activated** (§5.0).

### 6.1 Dependencies install cleanly
From the repo root:
```powershell
pip install -r backend\requirements.txt
```
Must complete with no resolver errors. Confirm the interpreter is 3.11 and a few key pins:
```powershell
python --version                              # Python 3.11.x
pip show numpy   | findstr Version            # Version: 2.1.3
pip show lightgbm| findstr Version            # Version: 4.5.0
pip show fastapi | findstr Version            # Version: 0.115.6
```
(Bash: replace `findstr Version` with `grep Version`.)

### 6.2 Headline import check (the task's stated acceptance command)
Run from `backend/` so `app` is importable:
```powershell
cd backend
python -c "from app.config import PRODUCTS,SERIES_IDS; print(len(SERIES_IDS))"
```
Must print exactly:
```
8
```

### 6.3 pytest collects cleanly (conftest is valid before MT-21/MT-24)
From `backend/`:
```powershell
pytest -q --collect-only
```
Must exit 0 with **no import errors** (zero tests is fine at this stage — only `conftest.py` exists).

### 6.4 Config self-test (optional but recommended)
Add this temporary check (or run inline) from `backend/`:
```powershell
python -c "from app.config import (PRODUCTS, SERIES_IDS, ARCHETYPE, PATHS, HORIZON, FIRST_SELECTABLE_D, LAST_SELECTABLE_D, TEST_END_D, INITIAL_COVER_DAYS, LEAD_TIME_DAYS, SERVICE_Z, HISTORY_WINDOW); assert len(SERIES_IDS)==8; assert set(ARCHETYPE)==set(SERIES_IDS); assert set(ARCHETYPE.values())<= {'Event-driven','Seasonal','Perishable seasonal','Stable baseline'}; assert LAST_SELECTABLE_D+HORIZON-1==TEST_END_D; assert (INITIAL_COVER_DAYS,LEAD_TIME_DAYS,SERVICE_Z,HISTORY_WINDOW)==(14,7,1.65,84); assert PATHS['series_daily'].name=='series_daily.parquet'; assert PATHS['calendar'].parent.name=='raw'; print('config OK')"
```
Must print `config OK`. This asserts: 8 series, every series has an archetype, only the four
allowed labels are used, the split identity holds, the inventory/history constants match `03`/`05`,
and the artifact paths resolve to the right filenames.

> Note: `PATHS` entries may point at files that **do not exist yet** (the parquet/model/profiles
> are produced by MT-10/MT-13/MT-14). MT-01 only verifies the **paths resolve** correctly, not that
> the files are present. `Store.load()` (MT-21) handles missing files gracefully.

## 7. Acceptance checklist
- [ ] A Python **3.11** venv (`backend/.venv`) was created and activated; `python --version` shows 3.11.x (not the system 3.14).
- [ ] `backend/requirements.txt` exists with the **exact** pinned list from `04_BACKEND_ARCHITECTURE.md` §6 (12 lines, comments included).
- [ ] `pip install -r backend/requirements.txt` completes with no errors; `numpy==2.1.3`, `lightgbm==4.5.0`, `fastapi==0.115.6` confirmed.
- [ ] `backend/app/__init__.py` exists with `__version__ = "1.0.0"`; `api/`, `ml/`, `services/`, `schemas/` each have an (empty) `__init__.py`.
- [ ] `backend/app/config.py` exists and defines: `TRAIN_START_D … LAST_SELECTABLE_D`, `HORIZON`, `D1_DATE` (`02` §1/§3); `PRODUCTS` + `SERIES_IDS` exactly per `02` §6; `INITIAL_COVER_DAYS=14`, `LEAD_TIME_DAYS=7`, `SERVICE_Z=1.65` (`03` §6.4); `HISTORY_WINDOW=84` (`05` §4); `ARCHETYPE` per `05` §3; `PATHS` to all five artifacts (`04` §1).
- [ ] `config.py` has **no** FastAPI/pandas/model-loading imports (pure constants + path resolution).
- [ ] `ARCHETYPE` covers all 8 series and uses only the four labels from `05` §3.
- [ ] `PATHS` resolve relative to the auto-detected repo root and work from both `backend/` and the repo root (verified by §6.4).
- [ ] `backend/tests/conftest.py` exists with session-scoped `store` and `client` fixtures that import lazily and **skip** (not error) before MT-21/MT-24.
- [ ] `python -c "from app.config import PRODUCTS,SERIES_IDS; print(len(SERIES_IDS))"` prints `8` (run from `backend/`).
- [ ] `pytest -q --collect-only` from `backend/` exits 0 with no import errors.
- [ ] Only files in this task's scope were created; `docs/` and MT-00 outputs were left unchanged.
