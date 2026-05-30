# MT-22 — Endpoints: health, products, calendar/bounds

## 1. Context
Phase 2 of the backend API (`MT-INDEX.md`, depends on **MT-20** schemas and **MT-21** store).
This task implements the three **read-only, parameter-free** endpoints of the API contract:
`GET /api/health`, `GET /api/products`, and `GET /api/calendar/bounds`. They are the simplest
endpoints — no ML, no request body — and exist so the frontend selectors, product cards, and the
date picker can be wired before the heavy `POST /api/forecast` (MT-23) lands.

The exact JSON these must return is **locked** in `05_API_CONTRACT.md` §2, §3, §4. This task
returns those shapes byte-for-shape, sourcing every value from already-built modules:
`config.py` (MT-01: `PRODUCTS`, `SERIES_IDS`, `ARCHETYPE`, constants), `services/store.py`
(MT-21: `get_store()`, profiles, calendar), and `schemas/contracts.py` (MT-20: response models).
This task **owns** two router files; it does **not** redefine any dependency module.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `05_API_CONTRACT.md` §2 (health), §3 (products), §4 (calendar/bounds), §1 (types).
- `04_BACKEND_ARCHITECTURE.md` §1 (paths), §2 (layers), §6 (deps), §3 (startup).
- `02_DATA_SPEC.md` §2 (the 8 products + archetypes), §3 (split constants), §6 (`PRODUCTS`).
- `03_ALGORITHM_SPEC.md` §5 (profiles: `overall_mean`, `seasonal_cv`).
- `07_TESTING_STRATEGY.md` §2 (`test_api.py`, `client` fixture).

**Prior MT artifacts/modules that must already exist (do NOT redefine — import them):**
- **MT-01 → `backend/app/config.py`** exposes:
  ```python
  PRODUCTS: dict[str, dict]          # 02 §6 — series_id -> {item_id, name, dept_id}
  SERIES_IDS: list[str]              # 02 §6 — stable order of the 8 slugs
  ARCHETYPE: dict[str, str]          # series_id -> one of the 4 archetype labels (05 §3)
  TRAIN_START_D, TRAIN_END_D, TEST_START_D, TEST_END_D: int   # 02 §3
  HORIZON, FIRST_SELECTABLE_D, LAST_SELECTABLE_D: int          # 02 §3
  HISTORY_WINDOW: int                # = 84 (05 §4 history_window)
  VERSION: str                       # = "1.0.0" (05 §2)
  ```
  > `ARCHETYPE` maps each `series_id` to exactly one of
  > `{"Event-driven","Seasonal","Perishable seasonal","Stable baseline"}` (05 §3, from 02 §2).
- **MT-21 → `backend/app/services/store.py`** exposes:
  ```python
  def get_store() -> Store
  class Store:
      model_loaded: bool
      profiles: dict[str, dict]      # profiles.json content (03 §5), keyed by series_id
      def d_to_date(self, d: int) -> datetime.date   # calendar map (02 §2)
  ```
- **MT-20 → `backend/app/schemas/contracts.py`** exposes the Pydantic response models
  (mirroring `05` §1–§4): `HealthResponse`, `ProductInfo`, `ProductsResponse`, `BoundsResponse`.
- Python **3.11**, `fastapi==0.115.6`, `pydantic==2.10.4` (`04` §6). Run from `backend/`.

> This task **owns** `backend/app/api/health.py` and `backend/app/api/products.py`. It imports —
> never redefines — `config.py`, `store.py`, `contracts.py`.

## 3. Goal
Two `APIRouter`s providing:
1. `GET /api/health` → `HealthResponse {status:"ok", model_loaded: get_store().model_loaded, version:"1.0.0"}` (`05` §2).
2. `GET /api/products` → `ProductsResponse` with one `ProductInfo` per `series_id` **in `SERIES_IDS` order** (`05` §3).
3. `GET /api/calendar/bounds` → `BoundsResponse` with the **exact literal values** in `05` §4, derived from `config` constants via `store.d_to_date`.

The routers are included under `/api` by `main.py` (MT-24). This task does not call `include_router`.

## 4. Design (locked decisions; cite foundation sections)
- **Two router files, both under `/api`** (`04` §1 splits health into `health.py`, products +
  bounds into `products.py`). `main.py` (MT-24) mounts them with `prefix="/api"`; therefore the
  route paths declared here are `"/health"`, `"/products"`, `"/calendar/bounds"`.
- **`/api/health`** (`05` §2): `status` is the constant string `"ok"`; `model_loaded` is read
  **live** from `get_store().model_loaded` (per `04` §3, health reports `false` if artifacts
  failed to load); `version` is `config.VERSION == "1.0.0"`. Health must **never** raise — it is
  the liveness probe — so it does not touch the model, only the boolean flag.
- **`/api/products`** (`05` §3): iterate `SERIES_IDS` (the locked order, `02` §6) and for each
  `series_id` build a `ProductInfo` from:
  - `item_id`, `name`, `dept_id` ← `PRODUCTS[series_id]` (`02` §6).
  - `archetype` ← `ARCHETYPE[series_id]` (`config`, label from `02` §2 / `05` §3).
  - `overall_mean`, `seasonal_cv` ← `get_store().profiles[series_id]` (`03` §5). These are read
    from the committed `profiles.json` via the store — **not** recomputed here.
  Order is guaranteed because we iterate `SERIES_IDS`, not a dict whose order could vary.
- **`/api/calendar/bounds`** (`05` §4): the response is fully determined by the locked split
  constants in `02` §3 and the calendar map (`02` §2). We derive, never hardcode, the dates:
  | field | value | derivation |
  |---|---|---|
  | `train_start` | `2011-01-29` | `d_to_date(TRAIN_START_D)` (`TRAIN_START_D=1`) |
  | `train_end` | `2014-01-27` | `d_to_date(TRAIN_END_D)` (`=1095`) |
  | `test_start` | `2014-01-28` | `d_to_date(TEST_START_D)` (`=1096`) |
  | `test_end` | `2016-05-22` | `d_to_date(TEST_END_D)` (`=1941`) |
  | `first_selectable_date` | `2014-01-28` | `d_to_date(FIRST_SELECTABLE_D)` (`=1096`) |
  | `last_selectable_date` | `2016-04-25` | `d_to_date(LAST_SELECTABLE_D)` (`=1914`) |
  | `horizon` | `28` | `HORIZON` |
  | `history_window` | `84` | `HISTORY_WINDOW` |
  Dates are serialized as ISO `YYYY-MM-DD` strings (`05` intro). `date.isoformat()` yields exactly
  that. These derived values **equal** the `05` §4 literals; the test asserts both the literals and
  the derivation agree.
- **No business logic in routers** (`04` §2): routers only read config/store and serialize via the
  MT-20 Pydantic models. The models enforce field names/types matching `05`.

## 5. Implementation (exact file paths from 04 §1; FULL runnable code)

### `backend/app/api/health.py`
```python
"""MT-22 — GET /api/health (05_API_CONTRACT §2).

Liveness + readiness. Reports model_loaded live from the store so a failed
artifact load (04 §3) is visible without crashing the process. Must never raise.
"""
from __future__ import annotations

from fastapi import APIRouter

from app import config
from app.schemas.contracts import HealthResponse
from app.services.store import get_store

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    """05 §2: {status:"ok", model_loaded: <bool>, version:"1.0.0"}."""
    return HealthResponse(
        status="ok",
        model_loaded=get_store().model_loaded,
        version=config.VERSION,
    )
```

### `backend/app/api/products.py`
```python
"""MT-22 — GET /api/products and GET /api/calendar/bounds.

Both endpoints are static (no request params) and source every value from
config.py (MT-01) + profiles via the store (MT-21). Shapes are locked in
05_API_CONTRACT §3 and §4.
"""
from __future__ import annotations

from fastapi import APIRouter

from app import config
from app.schemas.contracts import BoundsResponse, ProductInfo, ProductsResponse
from app.services.store import get_store

router = APIRouter()


@router.get("/products", response_model=ProductsResponse)
def get_products() -> ProductsResponse:
    """05 §3: the 8 products in SERIES_IDS order, with profile summary stats."""
    store = get_store()
    products: list[ProductInfo] = []
    for series_id in config.SERIES_IDS:                  # 02 §6 — locked order
        meta = config.PRODUCTS[series_id]                # item_id / name / dept_id
        profile = store.profiles[series_id]              # 03 §5 — from profiles.json
        products.append(
            ProductInfo(
                series_id=series_id,
                item_id=meta["item_id"],
                name=meta["name"],
                dept_id=meta["dept_id"],
                archetype=config.ARCHETYPE[series_id],   # 05 §3 label (02 §2)
                overall_mean=profile["overall_mean"],
                seasonal_cv=profile["seasonal_cv"],
            )
        )
    return ProductsResponse(products=products)


@router.get("/calendar/bounds", response_model=BoundsResponse)
def get_calendar_bounds() -> BoundsResponse:
    """05 §4: selectable window + split metadata, derived from config constants."""
    store = get_store()

    def iso(d: int) -> str:
        return store.d_to_date(d).isoformat()            # 02 §2 calendar map -> "YYYY-MM-DD"

    return BoundsResponse(
        train_start=iso(config.TRAIN_START_D),           # 2011-01-29
        train_end=iso(config.TRAIN_END_D),               # 2014-01-27
        test_start=iso(config.TEST_START_D),             # 2014-01-28
        test_end=iso(config.TEST_END_D),                 # 2016-05-22
        first_selectable_date=iso(config.FIRST_SELECTABLE_D),  # 2014-01-28
        last_selectable_date=iso(config.LAST_SELECTABLE_D),    # 2016-04-25
        horizon=config.HORIZON,                          # 28
        history_window=config.HISTORY_WINDOW,            # 84
    )
```

> **Wiring note (MT-24):** `main.py` does
> `app.include_router(health.router, prefix="/api")` and
> `app.include_router(products.router, prefix="/api")`. Do not add the prefix here.

## 6. Tests / Verification (exact pytest tests + commands)
Add to `backend/tests/test_api.py` (shared with MT-23/24). Uses the `client` fixture
(`TestClient`) provided by `conftest.py` (`07` §2), which starts the app with a loaded store.

### `backend/tests/test_api.py` (MT-22 additions)
```python
"""MT-22 — health / products / calendar-bounds endpoint tests (07 §2)."""
from app import config
from app.services.store import get_store


# ── GET /api/health ────────────────────────────────────────────────────────────
def test_health_200_and_keys(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {"status", "model_loaded", "version"}
    assert body["status"] == "ok"
    assert body["version"] == "1.0.0"
    assert isinstance(body["model_loaded"], bool)
    assert body["model_loaded"] == get_store().model_loaded


# ── GET /api/products ──────────────────────────────────────────────────────────
def test_products_returns_8_in_series_order(client):
    r = client.get("/api/products")
    assert r.status_code == 200
    products = r.json()["products"]
    assert len(products) == 8
    # order matches SERIES_IDS (02 §6) exactly
    assert [p["series_id"] for p in products] == config.SERIES_IDS
    # each item carries the full ProductInfo shape (05 §3)
    expected_keys = {
        "series_id", "item_id", "name", "dept_id",
        "archetype", "overall_mean", "seasonal_cv",
    }
    for p in products:
        assert set(p.keys()) == expected_keys
        meta = config.PRODUCTS[p["series_id"]]
        assert p["item_id"] == meta["item_id"]
        assert p["name"] == meta["name"]
        assert p["dept_id"] == meta["dept_id"]
        assert p["archetype"] in {
            "Event-driven", "Seasonal", "Perishable seasonal", "Stable baseline",
        }
        assert isinstance(p["overall_mean"], (int, float))
        assert isinstance(p["seasonal_cv"], (int, float))


def test_products_turkey_matches_contract_example(client):
    """05 §3 example row for turkey."""
    products = client.get("/api/products").json()["products"]
    turkey = next(p for p in products if p["series_id"] == "turkey")
    assert turkey["item_id"] == "FOODS_3_069"
    assert turkey["name"] == "Fresh Whole Turkey"
    assert turkey["dept_id"] == "FOODS_3"
    assert turkey["archetype"] == "Event-driven"


# ── GET /api/calendar/bounds ───────────────────────────────────────────────────
def test_bounds_matches_contract_literals(client):
    """05 §4 — exact literal values."""
    r = client.get("/api/calendar/bounds")
    assert r.status_code == 200
    assert r.json() == {
        "train_start": "2011-01-29",
        "train_end": "2014-01-27",
        "test_start": "2014-01-28",
        "test_end": "2016-05-22",
        "first_selectable_date": "2014-01-28",
        "last_selectable_date": "2016-04-25",
        "horizon": 28,
        "history_window": 84,
    }
```

### Commands (from `backend/`)
```bash
pytest -q tests/test_api.py -k "health or products or bounds"
```

## 7. Acceptance checklist
- [ ] `backend/app/api/health.py` and `backend/app/api/products.py` exist at the exact paths (`04` §1).
- [ ] Each declares a module-level `router = APIRouter()` (so MT-24 can `include_router` with `prefix="/api"`).
- [ ] `GET /api/health` returns `{status:"ok", model_loaded:<get_store().model_loaded>, version:"1.0.0"}` and never raises (`05` §2, `04` §3).
- [ ] `GET /api/products` returns 8 `ProductInfo` in `SERIES_IDS` order; each has `item_id/name/dept_id` from `PRODUCTS`, `archetype` from `ARCHETYPE`, and `overall_mean/seasonal_cv` from `store.profiles` (`05` §3, `02` §6, `03` §5).
- [ ] `archetype` ∈ `{"Event-driven","Seasonal","Perishable seasonal","Stable baseline"}` (`05` §3).
- [ ] `GET /api/calendar/bounds` returns the exact `05` §4 literals, **derived** from `config` constants via `store.d_to_date(...).isoformat()`.
- [ ] No business logic / no recomputation in routers; values come from `config.py` and the store (`04` §2). Imports only — `config.py`, `store.py`, `contracts.py` are not redefined.
- [ ] All three endpoint tests in `test_api.py` are green; no new runtime deps beyond `04` §6.
