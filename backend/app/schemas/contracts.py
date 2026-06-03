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


# Alias used by forecast_service.py
HistoryBlock = History


class Metrics(BaseModel):
    """05 §5 `metrics` (03 §6.1–6.2).

    Field order matches the contract JSON exactly:
      accuracy, wape (LOCKED — 05 §5 / 03 §6.1), coherence, coherence_label, smape, mae, rmse.
    """

    accuracy: float
    wape: float
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
