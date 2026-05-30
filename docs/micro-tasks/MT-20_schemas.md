# MT-20 — Pydantic Schemas (`contracts.py`) == API Contract

## 1. Context
The frontend and backend are built in **separate sessions** and agree **only** through
`05_API_CONTRACT.md`. This task encodes that contract as **Pydantic v2** models in
`backend/app/schemas/contracts.py` (the path is fixed in `04_BACKEND_ARCHITECTURE.md` §1). These
models are what the API routers (MT-22/MT-23/MT-24) use to validate requests and serialize
responses — so they must mirror `05` field-for-field, type-for-type, with identical nesting and
array lengths. Get this wrong and the frontend (which consumes the same shapes from `types.ts`,
MT-31) breaks. This task is **pure schema** — no business logic, no data access.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/05_API_CONTRACT.md` (§1 types, §2 health, §3 products, §4 bounds, §5 forecast request/response, §7 error shape) — **the binding source for every field**.
- `docs/02_DATA_SPEC.md` (§6 the 8 series slugs — for the `SeriesId` Literal).
- `docs/04_BACKEND_ARCHITECTURE.md` (§1 path, §6 `pydantic==2.10.4`).
- `docs/07_TESTING_STRATEGY.md` (§2 conventions).

**Prior MT artifacts/paths that must already exist:**
- MT-01: `backend/app/config.py` (provides `SERIES_IDS`, `HORIZON`, `HISTORY_WINDOW`), package `__init__.py`s, and `backend/requirements.txt` (`pydantic==2.10.4` installed in the 3.11 venv).
- `backend/app/schemas/__init__.py` (empty marker from MT-01).

**Tooling:** the project's **3.11 venv** (MT-01 §5.0) activated, with deps installed.

## 3. Goal
Create `backend/app/schemas/contracts.py` containing Pydantic v2 models that mirror
`05_API_CONTRACT.md` §1–§7 **exactly**:
- Shared vocab: `SeriesId`, `VelocityStatus`, `RiskLevel` (Literals); `EventInfo`.
- `HealthResponse`; `ProductInfo` + `ProductsResponse`; `BoundsResponse`.
- `ForecastRequest` (with validators: non-empty, valid-slug subset, max 8, dedup preserving order).
- `Metrics`, `Velocity`, `Inventory` (incl. `projected_stock`), `Factor`, `Explainability`,
  `Seasonal`, `History`, `ForecastResult`, `Summary`, `ForecastResponse`, `ErrorResponse`.

Every model instantiates from the example JSON in `05` and round-trips (dump == input).

## 4. Design (locked decisions; cite foundation sections)
All shapes are dictated by `05`. Do **not** add, rename, drop, or re-type any field.

- **Pydantic v2 (LOCKED — `04` §6: `pydantic==2.10.4`).** Use `BaseModel`, `Field`,
  `field_validator`, and `typing.Literal`. Use `model_validate(...)` / `model_dump()` (v2 API),
  not v1's `parse_obj` / `dict`.
- **`SeriesId` (LOCKED — `05` §1 / `02` §6).** A `Literal` of the **8** slugs in canonical order:
  `"turkey","candy","strawberries","icecream","cocoa","chips","milk","bread"`. We hard-code the
  Literal (a `Literal` needs static members) but add a module-load **assert** that it equals
  `config.SERIES_IDS`, so any future drift between `config` and the contract fails fast.
- **`VelocityStatus` (LOCKED — `05` §1).** Literal:
  `"Critical Decline" | "Declining" | "Stable" | "Growing" | "Accelerating"`.
- **`RiskLevel` (LOCKED — `05` §1).** Literal: `"Low" | "Medium" | "High"`.
- **`EventInfo` (LOCKED — `05` §1).** `{ date: str; name: str; type: str }`. Used by
  `summary.active_events`, `ForecastResult.events_in_horizon`.
- **`HealthResponse` (LOCKED — `05` §2).** `{ status: str; model_loaded: bool; version: str }`.
- **`ProductInfo` (LOCKED — `05` §3).** `series_id: SeriesId`, `item_id: str`, `name: str`,
  `dept_id: str`, `archetype: ArchetypeLabel`, `overall_mean: float`, `seasonal_cv: float`.
  `archetype` is a `Literal` of the four labels in `05` §3 (matches MT-01 `ARCHETYPE`).
  `ProductsResponse = { products: list[ProductInfo] }`.
- **`BoundsResponse` (LOCKED — `05` §4).** Exactly these keys (all `str` dates except the two ints):
  `train_start, train_end, test_start, test_end, first_selectable_date, last_selectable_date`
  (str), `horizon: int`, `history_window: int`.
- **`ForecastRequest` (LOCKED — `05` §5 request).** `product_ids: list[SeriesId]`,
  `start_date: str` (ISO `YYYY-MM-DD`). **Validators (this task's scope, per `05` §5 rules):**
  1. non-empty list; 2. each is a valid `SeriesId` (enforced by the Literal type — invalid → 422);
  3. **dedup** removing duplicates while **preserving first-seen order**; 4. **max 8** after dedup.
  **Date-range validation is deliberately NOT here** — it needs `config` bounds and is done in the
  service (per the task scope note; `05` §5 says the backend returns 422 with `field=="start_date"`,
  which MT-23/MT-24's error handler produces). We still validate `start_date` is a syntactically
  valid ISO date here (so malformed dates → 422 early), but the *in-range* check lives in the
  service. The `field`/message shape on the in-range failure is `05` §7 (produced downstream).
- **`Metrics` (LOCKED — `05` §5).** `accuracy: float, coherence: float, coherence_label: str`
  (`"Strong"|"Moderate"|"Weak"`, `03` §6.2 — modeled as a Literal), `smape: float, mae: float,
  rmse: float`.
- **`Velocity` (LOCKED — `05` §5).** `value: float, status: VelocityStatus`.
- **`Inventory` (LOCKED — `05` §5).** `on_hand: int, safety_stock: float, reorder_point: float,
  horizon_demand: float, cover_days: int, stockout_risk: RiskLevel, overstock: bool,
  recommended_order_qty: int, projected_stock: list[float]` (length `HORIZON`=28).
  > Per `03` §6.4: `on_hand` and `recommended_order_qty` are `round(...)` integers; the `05` example
  > shows them as integers (`260`, `301`). Typed as `int`.
- **`Factor` (LOCKED — `05` §5).** `label: str, value: float, kind: str`
  (`kind` ∈ `"event"|"seasonal"|"trend"` per the `05` example — modeled as a Literal).
- **`Explainability` (LOCKED — `05` §5).** `event_contribution_pct: float,
  snap_days_in_horizon: int, narrative: list[str], factors: list[Factor]`.
- **`Seasonal` (LOCKED — `05` §5).** `month: int, month_vs_avg_pct: float,
  monthly_avg: list[float]` (length 12), `weekday_avg: list[float]` (length 7).
- **`History` (LOCKED — `05` §5 `history`).** `dates: list[str]` (length `HISTORY_WINDOW`=84),
  `units: list[float]` (length 84).
- **`ForecastResult` (LOCKED — `05` §5, EXACT shape).** Fields, in order:
  `series_id: SeriesId, item_id: str, product_name: str, history: History,
  horizon_dates: list[str]` (28), `actual: list[float]` (28), `forecast: list[float]` (28),
  `metrics: Metrics, velocity: Velocity, inventory: Inventory, explainability: Explainability,
  events_in_horizon: list[EventInfo], seasonal: Seasonal, event_uplift: dict[str, float]`.
- **`Summary` (LOCKED — `05` §5).** `total_predicted_demand: float, high_risk_count: int,
  avg_velocity: float, avg_accuracy: float, active_events: list[EventInfo]`.
- **`ForecastResponse` (LOCKED — `05` §5 top level).** `start_date: str, horizon: int,
  summary: Summary, results: list[ForecastResult]`.
- **`ErrorResponse` (LOCKED — `05` §7).** `error: str, message: str, field: str | None = None`
  (`field` omitted for 500s → optional, and excluded from output when `None`).
- **Array-length enforcement.** Where `05` fixes a length (history 84, horizon arrays 28, monthly 12,
  weekday 7), add length validators (using `HORIZON`/`HISTORY_WINDOW` from `config` where applicable)
  so a wrong-length array is a 422 rather than a silent contract break. These guard the backend's own
  output during tests.
- **Config alignment.** Import `SERIES_IDS, HORIZON, HISTORY_WINDOW` from `app.config` (MT-01) and
  assert the `SeriesId` Literal matches `SERIES_IDS` at import time.

## 5. Implementation (exact file paths from `04` §1; FULL runnable code)

### 5.1 `backend/app/schemas/contracts.py` — FULL code
Create `backend/app/schemas/contracts.py` with exactly this content:

```python
"""
Pydantic v2 models mirroring 05_API_CONTRACT.md §1–§7 EXACTLY.

These are the ONLY agreement between frontend and backend. Field names, types, nesting,
and array lengths are binding (05). No business logic lives here — see services/* (MT-23).

Citations: every model notes its 05 section. SeriesId / lengths are cross-checked against
app.config (MT-01) at import time so config <-> contract can never silently drift.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.config import HISTORY_WINDOW, HORIZON, SERIES_IDS

# ---------------------------------------------------------------------------
# §1 — Shared vocabulary
# ---------------------------------------------------------------------------
SeriesId = Literal[
    "turkey", "candy", "strawberries", "icecream", "cocoa", "chips", "milk", "bread"
]

# Fail fast if the contract's slug set ever diverges from config.SERIES_IDS (02 §6).
assert list(SeriesId.__args__) == SERIES_IDS, (
    "SeriesId Literal must match config.SERIES_IDS exactly (order included)."
)

VelocityStatus = Literal[
    "Critical Decline", "Declining", "Stable", "Growing", "Accelerating"
]

RiskLevel = Literal["Low", "Medium", "High"]

# Allowed archetype labels (05 §3) and coherence labels (03 §6.2) and factor kinds (05 §5).
ArchetypeLabel = Literal[
    "Event-driven", "Seasonal", "Perishable seasonal", "Stable baseline"
]
CoherenceLabel = Literal["Strong", "Moderate", "Weak"]
FactorKind = Literal["event", "seasonal", "trend"]


class EventInfo(BaseModel):
    """05 §1 — { date, name, type }."""

    date: str
    name: str
    type: str


# ---------------------------------------------------------------------------
# §2 — GET /api/health
# ---------------------------------------------------------------------------
class HealthResponse(BaseModel):
    """05 §2."""

    status: str
    model_loaded: bool
    version: str


# ---------------------------------------------------------------------------
# §3 — GET /api/products
# ---------------------------------------------------------------------------
class ProductInfo(BaseModel):
    """05 §3 — one entry in `products`."""

    series_id: SeriesId
    item_id: str
    name: str
    dept_id: str
    archetype: ArchetypeLabel
    overall_mean: float
    seasonal_cv: float


class ProductsResponse(BaseModel):
    """05 §3."""

    products: list[ProductInfo]


# ---------------------------------------------------------------------------
# §4 — GET /api/calendar/bounds
# ---------------------------------------------------------------------------
class BoundsResponse(BaseModel):
    """05 §4 — selectable window + split metadata."""

    train_start: str
    train_end: str
    test_start: str
    test_end: str
    first_selectable_date: str
    last_selectable_date: str
    horizon: int
    history_window: int


# ---------------------------------------------------------------------------
# §5 — POST /api/forecast — request
# ---------------------------------------------------------------------------
class ForecastRequest(BaseModel):
    """
    05 §5 request body. Validation rules (05 §5):
      - product_ids: non-empty; each a valid SeriesId (Literal); duplicates removed; max 8.
      - start_date: ISO YYYY-MM-DD; in-range check is done in the service (needs config
        bounds) and surfaces as 422 with field=="start_date" (05 §7).
    """

    product_ids: list[SeriesId]
    start_date: str

    @field_validator("product_ids")
    @classmethod
    def _clean_product_ids(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("product_ids must be a non-empty array")
        # Dedup while preserving first-seen order (05 §5: "duplicates removed").
        seen: set[str] = set()
        deduped: list[str] = []
        for pid in v:
            if pid not in seen:
                seen.add(pid)
                deduped.append(pid)
        if len(deduped) > 8:
            raise ValueError("product_ids may contain at most 8 products")
        return deduped

    @field_validator("start_date")
    @classmethod
    def _valid_iso_date(cls, v: str) -> str:
        # Syntactic ISO validation only; the in-range check lives in the service (05 §5 note).
        import datetime as _dt

        try:
            _dt.date.fromisoformat(v)
        except ValueError as exc:
            raise ValueError(
                f"start_date must be an ISO YYYY-MM-DD date, got {v!r}"
            ) from exc
        return v


# ---------------------------------------------------------------------------
# §5 — POST /api/forecast — response building blocks
# ---------------------------------------------------------------------------
class History(BaseModel):
    """05 §5 `history` — 84 dates/units ending at start_date - 1."""

    dates: list[str]
    units: list[float]

    @field_validator("dates", "units")
    @classmethod
    def _len_history(cls, v: list) -> list:
        if len(v) != HISTORY_WINDOW:
            raise ValueError(f"history arrays must have length {HISTORY_WINDOW}")
        return v


class Metrics(BaseModel):
    """05 §5 `metrics` (03 §6.1–6.2)."""

    accuracy: float
    coherence: float
    coherence_label: CoherenceLabel
    smape: float
    mae: float
    rmse: float


class Velocity(BaseModel):
    """05 §5 `velocity` (03 §6.3)."""

    value: float
    status: VelocityStatus


class Inventory(BaseModel):
    """05 §5 `inventory` (03 §6.4). on_hand & recommended_order_qty are rounded ints."""

    on_hand: int
    safety_stock: float
    reorder_point: float
    horizon_demand: float
    cover_days: int
    stockout_risk: RiskLevel
    overstock: bool
    recommended_order_qty: int
    projected_stock: list[float]

    @field_validator("projected_stock")
    @classmethod
    def _len_projected(cls, v: list[float]) -> list[float]:
        if len(v) != HORIZON:
            raise ValueError(f"projected_stock must have length {HORIZON}")
        return v


class Factor(BaseModel):
    """05 §5 `explainability.factors[*]`."""

    label: str
    value: float
    kind: FactorKind


class Explainability(BaseModel):
    """05 §5 `explainability` (03 §6.5)."""

    event_contribution_pct: float
    snap_days_in_horizon: int
    narrative: list[str]
    factors: list[Factor]


class Seasonal(BaseModel):
    """05 §5 `seasonal` (profiles.json)."""

    month: int
    month_vs_avg_pct: float
    monthly_avg: list[float]
    weekday_avg: list[float]

    @field_validator("monthly_avg")
    @classmethod
    def _len_monthly(cls, v: list[float]) -> list[float]:
        if len(v) != 12:
            raise ValueError("monthly_avg must have length 12")
        return v

    @field_validator("weekday_avg")
    @classmethod
    def _len_weekday(cls, v: list[float]) -> list[float]:
        if len(v) != 7:
            raise ValueError("weekday_avg must have length 7")
        return v


class ForecastResult(BaseModel):
    """05 §5 — EXACT per-product result shape (field order matches the contract)."""

    series_id: SeriesId
    item_id: str
    product_name: str

    history: History
    horizon_dates: list[str]

    actual: list[float]
    forecast: list[float]

    metrics: Metrics
    velocity: Velocity
    inventory: Inventory
    explainability: Explainability
    events_in_horizon: list[EventInfo]
    seasonal: Seasonal
    event_uplift: dict[str, float]

    @field_validator("horizon_dates", "actual", "forecast")
    @classmethod
    def _len_horizon(cls, v: list) -> list:
        if len(v) != HORIZON:
            raise ValueError(f"horizon arrays must have length {HORIZON}")
        return v


class Summary(BaseModel):
    """05 §5 `summary` — aggregates across results."""

    total_predicted_demand: float
    high_risk_count: int
    avg_velocity: float
    avg_accuracy: float
    active_events: list[EventInfo]


class ForecastResponse(BaseModel):
    """05 §5 top-level response."""

    start_date: str
    horizon: int
    summary: Summary
    results: list[ForecastResult]


# ---------------------------------------------------------------------------
# §7 — Error response shape (422 / 500)
# ---------------------------------------------------------------------------
class ErrorResponse(BaseModel):
    """05 §7. `field` is omitted for 500s (excluded from output when None)."""

    error: str
    message: str
    field: Optional[str] = Field(default=None)

    def model_dump_api(self) -> dict:
        """Dump excluding `field` when it is None (so 500s omit the key, per 05 §7)."""
        return self.model_dump(exclude_none=True)
```

> Note on `field` omission: routers should serialize `ErrorResponse` for 500s with
> `model_dump(exclude_none=True)` (helper `model_dump_api()` above) so the `field` key is absent,
> exactly matching `05` §7 ("`field` is omitted for 500s"). MT-24 wires the exception handlers.

## 6. Tests / Verification (exact pytest tests + commands)

### 6.1 Test file
Create `backend/tests/test_schemas.py` with exactly this content. It instantiates every model from
the **example JSON in `05`** and asserts round-trip equality (validate → dump == input).

```python
"""
MT-20 — contracts.py mirrors 05_API_CONTRACT.md exactly.

Builds each model from the literal example JSON in 05 and asserts round-trip
(model_validate -> model_dump == original). Also checks validators: dedup, max-8,
non-empty, bad slug, bad date, and array-length guards.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import contracts as c


def _horizon_floats(n=28):
    return [float(i) for i in range(n)]


def _history_floats(n=84):
    return [float(i) for i in range(n)]


# ----- §2 health ------------------------------------------------------------
def test_health_roundtrip():
    data = {"status": "ok", "model_loaded": True, "version": "1.0.0"}
    m = c.HealthResponse.model_validate(data)
    assert m.model_dump() == data


# ----- §3 products ----------------------------------------------------------
def test_products_roundtrip():
    data = {
        "products": [
            {
                "series_id": "turkey",
                "item_id": "FOODS_3_069",
                "name": "Fresh Whole Turkey",
                "dept_id": "FOODS_3",
                "archetype": "Event-driven",
                "overall_mean": 18.6,
                "seasonal_cv": 1.25,
            }
        ]
    }
    m = c.ProductsResponse.model_validate(data)
    assert m.model_dump() == data


# ----- §4 bounds ------------------------------------------------------------
def test_bounds_roundtrip():
    data = {
        "train_start": "2011-01-29",
        "train_end": "2014-01-27",
        "test_start": "2014-01-28",
        "test_end": "2016-05-22",
        "first_selectable_date": "2014-01-28",
        "last_selectable_date": "2016-04-25",
        "horizon": 28,
        "history_window": 84,
    }
    m = c.BoundsResponse.model_validate(data)
    assert m.model_dump() == data


# ----- §5 request validators ------------------------------------------------
def test_request_roundtrip_and_dedup():
    m = c.ForecastRequest.model_validate(
        {"product_ids": ["turkey", "milk", "turkey"], "start_date": "2015-11-01"}
    )
    assert m.product_ids == ["turkey", "milk"]  # dedup, order preserved
    assert m.start_date == "2015-11-01"


def test_request_empty_rejected():
    with pytest.raises(ValidationError):
        c.ForecastRequest.model_validate({"product_ids": [], "start_date": "2015-11-01"})


def test_request_bad_slug_rejected():
    with pytest.raises(ValidationError):
        c.ForecastRequest.model_validate(
            {"product_ids": ["banana"], "start_date": "2015-11-01"}
        )


def test_request_max_8():
    eight = ["turkey", "candy", "strawberries", "icecream", "cocoa", "chips", "milk", "bread"]
    # all 8 fine
    c.ForecastRequest.model_validate({"product_ids": eight, "start_date": "2015-11-01"})
    # 9th distinct slug is impossible (only 8 exist), but duplicates beyond 8 dedup away;
    # a list with a 9th invalid slug is rejected by the Literal anyway.


def test_request_bad_date_rejected():
    with pytest.raises(ValidationError):
        c.ForecastRequest.model_validate(
            {"product_ids": ["turkey"], "start_date": "2015-13-99"}
        )


# ----- §5 full ForecastResult / ForecastResponse round-trip -----------------
def _forecast_result_example():
    return {
        "series_id": "turkey",
        "item_id": "FOODS_3_069",
        "product_name": "Fresh Whole Turkey",
        "history": {"dates": [f"d{i}" for i in range(84)], "units": _history_floats()},
        "horizon_dates": [f"h{i}" for i in range(28)],
        "actual": _horizon_floats(),
        "forecast": _horizon_floats(),
        "metrics": {
            "accuracy": 78.4,
            "coherence": 71.0,
            "coherence_label": "Moderate",
            "smape": 21.6,
            "mae": 3.21,
            "rmse": 4.87,
        },
        "velocity": {"value": 412.0, "status": "Accelerating"},
        "inventory": {
            "on_hand": 260,
            "safety_stock": 41.0,
            "reorder_point": 171.0,
            "horizon_demand": 520.0,
            "cover_days": 9,
            "stockout_risk": "Medium",
            "overstock": False,
            "recommended_order_qty": 301,
            "projected_stock": _horizon_floats(),
        },
        "explainability": {
            "event_contribution_pct": 280.5,
            "snap_days_in_horizon": 8,
            "narrative": ["Demand is Accelerating (+412% vs the prior 28 days)."],
            "factors": [
                {"label": "Event uplift", "value": 280.5, "kind": "event"},
                {"label": "Seasonality", "value": 220.0, "kind": "seasonal"},
                {"label": "Trend", "value": 412.0, "kind": "trend"},
            ],
        },
        "events_in_horizon": [
            {"date": "2015-11-26", "name": "Thanksgiving", "type": "National"}
        ],
        "seasonal": {
            "month": 11,
            "month_vs_avg_pct": 220.0,
            "monthly_avg": [15.0, 13.0, 9.0, 10.0, 8.0, 7.0, 8.0, 8.0, 7.0, 12.0, 57.0, 92.0],
            "weekday_avg": [22.1, 18.0, 16.4, 15.9, 17.2, 19.8, 24.0],
        },
        "event_uplift": {"Thanksgiving": 517.0, "ValentinesDay": 92.0},
    }


def test_forecast_result_roundtrip():
    data = _forecast_result_example()
    m = c.ForecastResult.model_validate(data)
    assert m.model_dump() == data


def test_forecast_response_roundtrip():
    data = {
        "start_date": "2015-11-01",
        "horizon": 28,
        "summary": {
            "total_predicted_demand": 1234.5,
            "high_risk_count": 1,
            "avg_velocity": 12.3,
            "avg_accuracy": 78.4,
            "active_events": [
                {"date": "2015-11-26", "name": "Thanksgiving", "type": "National"}
            ],
        },
        "results": [_forecast_result_example()],
    }
    m = c.ForecastResponse.model_validate(data)
    assert m.model_dump() == data


# ----- §5 array-length guards ----------------------------------------------
def test_wrong_length_horizon_rejected():
    bad = _forecast_result_example()
    bad["forecast"] = _horizon_floats(27)  # too short
    with pytest.raises(ValidationError):
        c.ForecastResult.model_validate(bad)


def test_wrong_length_history_rejected():
    with pytest.raises(ValidationError):
        c.History.model_validate({"dates": ["a"], "units": [1.0]})


# ----- §7 error shape -------------------------------------------------------
def test_error_with_field_roundtrip():
    data = {
        "error": "validation_error",
        "message": "start_date 2016-12-01 is outside the selectable range [2014-01-28, 2016-04-25].",
        "field": "start_date",
    }
    m = c.ErrorResponse.model_validate(data)
    assert m.model_dump() == data


def test_error_omits_field_for_500():
    m = c.ErrorResponse(error="server_error", message="boom")
    assert m.model_dump_api() == {"error": "server_error", "message": "boom"}
```

### 6.2 Commands
With the 3.11 venv (MT-01) activated, from `backend/`:
```powershell
pytest -q tests/test_schemas.py
```
All tests must pass. Also confirm the module imports (the `SeriesId == SERIES_IDS` assert runs at import):
```powershell
python -c "from app.schemas.contracts import ForecastResponse, ForecastRequest, ProductInfo; print('schemas import OK')"
```
Must print `schemas import OK`.

## 7. Acceptance checklist
- [ ] `backend/app/schemas/contracts.py` exists at the `04` §1 path; imports cleanly (the `SeriesId == config.SERIES_IDS` assert passes).
- [ ] `SeriesId`, `VelocityStatus`, `RiskLevel` are `Literal`s matching `05` §1 exactly; `EventInfo` has `date/name/type`.
- [ ] `HealthResponse`, `ProductInfo` + `ProductsResponse`, `BoundsResponse` mirror `05` §2/§3/§4 field-for-field (incl. `horizon` & `history_window` ints in bounds).
- [ ] `ForecastRequest` validators: rejects empty list, rejects invalid slug, **dedups preserving order**, caps at 8, rejects malformed ISO date; **does not** do the in-range date check (left to the service per `05` §5 note).
- [ ] `Metrics`, `Velocity`, `Inventory` (incl. `projected_stock` len 28; `on_hand`/`recommended_order_qty` as `int`), `Factor`, `Explainability`, `Seasonal` (monthly 12 / weekday 7), `History` (84) match `05` §5.
- [ ] `ForecastResult` has every field in `05` §5 order with horizon arrays length 28; `ForecastResponse` = `start_date/horizon/summary/results`.
- [ ] `Summary` matches `05` §5; `ErrorResponse` matches `05` §7 and omits `field` when `None`.
- [ ] `tests/test_schemas.py` passes: every model round-trips from the `05` example JSON; length/validator guards fire.
- [ ] No business logic or data access added; only schema definitions + validators.
- [ ] Only files in this task's scope were created/changed.
