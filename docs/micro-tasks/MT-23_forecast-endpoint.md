# MT-23 — `forecast_service` + `POST /api/forecast`

## 1. Context
The core endpoint (`MT-INDEX.md`, depends on **MT-16..19** metrics, **MT-20** schemas,
**MT-21** store). It forecasts the 28-day horizon for one or more products from a start date and
assembles the full `ForecastResult` object locked in `05_API_CONTRACT.md` §5, plus the aggregate
`summary`. Per `04_BACKEND_ARCHITECTURE.md` §2/§4, the **router** only validates the request body
and serializes; **`services/forecast_service.py`** orchestrates the ML calls (`forecast_engine` +
`metrics`) and reads profiles via the store. This task owns those two files and imports — never
redefines — the ML/store/schema modules.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `05_API_CONTRACT.md` §5 (the EXACT `ForecastResult` + `summary` + request body), §6 (codes),
  §7 (error shape), §1 (types).
- `04_BACKEND_ARCHITECTURE.md` §1 (paths), §2 (layers), §4 (request lifecycle), §5 (errors).
- `03_ALGORITHM_SPEC.md` §4 (recursive forecast), §5 (profiles), §6 (all metric formulas).
- `02_DATA_SPEC.md` §3 (split constants), §4 (`series_daily`).
- `07_TESTING_STRATEGY.md` §2.

**Prior MT modules that must already exist (do NOT redefine — import them):**
- **MT-01 → `app/config.py`**: `HORIZON=28`, `HISTORY_WINDOW=84`, `FIRST_SELECTABLE_D=1096`,
  `LAST_SELECTABLE_D=1914`, `PRODUCTS`, `SERIES_IDS`.
- **MT-21 → `app/services/store.py`** — `get_store() -> Store`:
  ```python
  class Store:
      model: object                          # lightgbm Booster
      feature_meta: dict                      # {"features",[...], "best_iteration": N}
      profiles: dict[str, dict]               # profiles.json (03 §5)
      def date_to_d(self, day: datetime.date) -> int        # inverse calendar map (02 §2)
      def d_to_date(self, d: int) -> datetime.date
      def actual_units(self, series_id: str, d_from: int, d_to: int) -> list[float]
          # actual `units` for d_index in [d_from, d_to] inclusive, in ascending date order
      def events_in_range(self, d_from: int, d_to: int) -> list[dict]
          # EventInfo dicts {date,name,type} for calendar events in [d_from,d_to] (05 §1)
  ```
- **MT-15 → `app/ml/forecast_engine.py`**:
  ```python
  def recursive_forecast(series_id, start_d, model, feature_meta, data,
                         *, suppress_events: bool = False) -> list[float]
      # 03 §4 — 28 floats. suppress_events forces event features to "none"/0 and
      # days_to/since_event=28 for the counterfactual (03 §6.5). `data` is store.series_daily.
  ```
- **MT-16..19 → `app/ml/metrics.py`** (pure functions, `03` §6):
  ```python
  def compute_accuracy(actual, forecast) -> dict   # {accuracy,smape,mae,rmse}  (§6.1)
  def compute_coherence(actual, forecast) -> dict  # {coherence,coherence_label} (§6.2)
  def compute_velocity(prev_28: float, forecast) -> dict  # {value,status}      (§6.3)
  def compute_inventory_risk(trailing_28, forecast) -> dict  # all §6.4 fields + projected_stock
  def compute_explainability(f_full, f_no_event, *, velocity, seasonal,
                             events_in_horizon, snap_days, profiles_for_series,
                             product_name) -> dict  # §6.5 {event_contribution_pct,
                             # snap_days_in_horizon, narrative[], factors[]}
  ```
- **MT-20 → `app/schemas/contracts.py`**: `ForecastRequest`, `ForecastResponse`,
  `ForecastResult`, `Summary`, and the nested models (`HistoryBlock`, `Metrics`, `Velocity`,
  `Inventory`, `Explainability`, `Factor`, `Seasonal`, `EventInfo`) mirroring `05` §5.
- **MT-14 → `profiles.json`** (loaded by store) holds per-series `monthly_avg[12]`,
  `weekday_avg[7]`, `event_uplift{}`, `overall_mean`, `seasonal_cv` (`03` §5).
- Python **3.11**, `fastapi==0.115.6`, `pydantic==2.10.4` (`04` §6). Run from `backend/`.

> This task **owns** `app/services/forecast_service.py` and `app/api/forecast.py`.

## 3. Goal
1. `forecast_service.run(product_ids: list[str], start_date_str: str) -> ForecastResponse` —
   validates the date, builds one `ForecastResult` per product (in request order), assembles the
   `summary`, returns a fully-populated `ForecastResponse` matching `05` §5 exactly.
2. `POST /api/forecast` router — validates the body with `ForecastRequest` (MT-20) and calls
   the service. Date-range / unknown-product errors surface as `ValueError` with the `05` §7
   message and `field="start_date"` / `field="product_ids"`, mapped to 422 by MT-24.

## 4. Design (locked decisions; cite foundation sections)
Implements `04` §4 step-by-step. Every numeric field comes from a `03` §6 formula or a
`profiles.json` value; the service does **no** ad-hoc math beyond rounding and summary aggregation.

**4.1 Date validation (`04` §4, `05` §7).** Convert `start_date_str` (ISO) → `date` →
`start_d = store.date_to_d(day)`. If parsing fails or `start_d` is outside
`[FIRST_SELECTABLE_D, LAST_SELECTABLE_D]`, raise:
```python
raise ForecastValidationError(
    field="start_date",
    message=(f"start_date {start_date_str} is outside the selectable range "
             f"[{first_iso}, {last_iso}]."),
)
```
where `first_iso = store.d_to_date(FIRST_SELECTABLE_D).isoformat()` and likewise `last_iso`.
This is the **exact** `05` §7 message. `ForecastValidationError` is a small `ValueError` subclass
carrying `field`; MT-24's handler reads `.field`/`.message`. Product-id validity is enforced by the
`ForecastRequest` Pydantic model (MT-20, `05` §5: each must be a valid `SeriesId`, dups removed,
max 8) → that produces a `RequestValidationError` mapped to 422 by MT-24. The service additionally
guards membership in `SERIES_IDS` and raises `ForecastValidationError(field="product_ids", ...)`
for defense in depth.

**4.2 Per-product horizon windows (all d_index inclusive).**
- horizon: `[start_d, start_d + HORIZON - 1]` (28 days, `02` §3).
- history: `[start_d - HISTORY_WINDOW, start_d - 1]` (84 days ending the day before start, `05` §5).
- prev/trailing 28: `[start_d - 28, start_d - 1]` (real history, `03` §6.3/§6.4).
Because `start_d ≥ 1096` and `HISTORY_WINDOW=84`, the earliest needed index `start_d-84 ≥ 1012 ≥ 1`,
so all windows are fully defined (`03` §3.5 note).

**4.3 Forecast (`03` §4 via MT-15).**
```python
forecast = recursive_forecast(series_id, start_d, store.model, store.feature_meta,
                              store.series_daily)
f_no_event = recursive_forecast(..., suppress_events=True)   # counterfactual (03 §6.5)
```
`forecast` stays float for metrics; only the API field is rounded to 1 dp (`03` §4 note, `05` §5).

**4.4 Actual + history (`05` §5, `02` §4).**
- `actual = store.actual_units(series_id, start_d, start_d + HORIZON - 1)` (length 28; always
  present in selectable range — `02` §3).
- `history.units = store.actual_units(series_id, start_d - HISTORY_WINDOW, start_d - 1)` (length 84).
- `history.dates = [d_to_date(d).isoformat() for d in range(start_d-84, start_d)]`.
- `horizon_dates = [d_to_date(d).isoformat() for d in range(start_d, start_d+28)]`.

**4.5 Metrics (`03` §6 via MT-16..19).**
- `metrics = compute_accuracy(actual, forecast) | compute_coherence(actual, forecast)` →
  `{accuracy,coherence,coherence_label,smape,mae,rmse}` (`05` §5 metrics block).
- `prev_28 = sum(store.actual_units(series_id, start_d-28, start_d-1))`;
  `velocity = compute_velocity(prev_28, forecast)` → `{value,status}` (`03` §6.3).
- `trailing_28 = store.actual_units(series_id, start_d-28, start_d-1)`;
  `inventory = compute_inventory_risk(trailing_28, forecast)` → all `05` §5 inventory fields
  incl. `projected_stock[28]` (`03` §6.4).

**4.6 Calendar + seasonal + uplift (`05` §5, `03` §5).**
- `events_in_horizon = store.events_in_range(start_d, start_d+27)` (`05` §1 EventInfo list).
- `snap_days = #days in horizon with snap_count>0` — sourced from the store; MT-21 exposes
  `store.snap_days_in_range(start_d, start_d+27)`. (If unavailable, derive from series_daily.)
- `month = d_to_date(start_d).month`.
- `monthly_avg = profile["monthly_avg"]` (12), `weekday_avg = profile["weekday_avg"]` (7).
- `month_vs_avg_pct = round((monthly_avg[month-1] - overall_mean)/overall_mean*100, 1)`
  using `overall_mean = profile["overall_mean"]` (`03` §6.5 seasonality basis). If `overall_mean`
  is 0, use `0.0`.
- `event_uplift = profile["event_uplift"]` (map<string,number>, `03` §5).
- `seasonal = {month, month_vs_avg_pct, monthly_avg, weekday_avg}` (`05` §5 seasonal block).

**4.7 Explainability (`03` §6.5 via MT-19).** Pass the already-computed pieces:
```python
explainability = compute_explainability(
    forecast, f_no_event,
    velocity=velocity, seasonal=seasonal,
    events_in_horizon=events_in_horizon, snap_days=snap_days,
    profiles_for_series=profile, product_name=name,
)   # -> {event_contribution_pct, snap_days_in_horizon, narrative[], factors[]}
```
The narrative/factor wording is owned by MT-19 (`03` §6.5 templates); the service does not author it.

**4.8 Assemble `ForecastResult` (EXACT `05` §5).** Round `forecast` to 1 dp **only** for the field:
`forecast_out = [round(x, 1) for x in forecast]`. Build the Pydantic `ForecastResult` with every
field from `05` §5 (`series_id, item_id, product_name, history, horizon_dates, actual, forecast,
metrics, velocity, inventory, explainability, events_in_horizon, seasonal, event_uplift`).

**4.9 Summary (`05` §5 aggregation rules).** Across all results, in request order:
- `total_predicted_demand = round(Σ inventory.horizon_demand, 1)`.
- `high_risk_count = #(inventory.stockout_risk == "High")`.
- `avg_velocity = round(mean(min(velocity.value, 999) for each result), 1)` — **cap each at 999
  before averaging** (`05` §5).
- `avg_accuracy = round(mean(metrics.accuracy), 1)`.
- `active_events` = union of all `events_in_horizon`, **deduped by `(date, name)`**, **sorted by
  date** (`05` §5).

**4.10 Router (`04` §4).** `forecast.py` declares `POST /forecast` taking a `ForecastRequest`
body (FastAPI runs Pydantic validation → 422 via MT-24 on malformed body / bad product id) and
returns `forecast_service.run(req.product_ids, req.start_date)`. No business logic in the router.

## 5. Implementation (exact file paths from 04 §1; FULL runnable code)

### `backend/app/services/forecast_service.py`
```python
"""MT-23 — Orchestrate a full ForecastResponse (05_API_CONTRACT §5).

Per 04 §4: validate the date, then for each requested product run the recursive
forecast (MT-15), look up actuals/history (MT-21 store), compute metrics
(MT-16..19), read profiles (MT-14), and assemble the locked ForecastResult.
Finally build the summary aggregate. No ad-hoc math beyond rounding + summary.
"""
from __future__ import annotations

from datetime import date

from app import config
from app.ml.forecast_engine import recursive_forecast
from app.ml.metrics import (
    compute_accuracy,
    compute_coherence,
    compute_explainability,
    compute_inventory_risk,
    compute_velocity,
)
from app.schemas.contracts import (
    Explainability,
    Factor,
    ForecastResponse,
    ForecastResult,
    HistoryBlock,
    Inventory,
    Metrics,
    Seasonal,
    Summary,
    Velocity,
    EventInfo,
)
from app.services.store import get_store


class ForecastValidationError(ValueError):
    """Raised on invalid forecast input. MT-24 maps it to 422 (05 §7).

    Carries the contract `field` so the error body includes it.
    """

    def __init__(self, message: str, field: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.field = field


def _validate_start_d(store, start_date_str: str) -> int:
    """Parse + range-check the start date; return its d_index (04 §4, 05 §7)."""
    first_iso = store.d_to_date(config.FIRST_SELECTABLE_D).isoformat()
    last_iso = store.d_to_date(config.LAST_SELECTABLE_D).isoformat()
    out_of_range_msg = (
        f"start_date {start_date_str} is outside the selectable range "
        f"[{first_iso}, {last_iso}]."
    )
    try:
        day = date.fromisoformat(start_date_str)
    except ValueError:
        raise ForecastValidationError(out_of_range_msg, field="start_date")
    try:
        start_d = store.date_to_d(day)
    except (KeyError, ValueError):
        raise ForecastValidationError(out_of_range_msg, field="start_date")
    if not (config.FIRST_SELECTABLE_D <= start_d <= config.LAST_SELECTABLE_D):
        raise ForecastValidationError(out_of_range_msg, field="start_date")
    return start_d


def _build_result(store, series_id: str, start_d: int) -> ForecastResult:
    """Assemble one ForecastResult for a product (05 §5)."""
    meta = config.PRODUCTS[series_id]
    name = meta["name"]
    profile = store.profiles[series_id]

    H = config.HORIZON                    # 28
    W = config.HISTORY_WINDOW             # 84
    horizon_lo, horizon_hi = start_d, start_d + H - 1
    hist_lo, hist_hi = start_d - W, start_d - 1
    prev_lo, prev_hi = start_d - 28, start_d - 1

    # 03 §4 forecast (float) + counterfactual for explainability (03 §6.5)
    forecast = recursive_forecast(
        series_id, start_d, store.model, store.feature_meta, store.series_daily
    )
    f_no_event = recursive_forecast(
        series_id, start_d, store.model, store.feature_meta, store.series_daily,
        suppress_events=True,
    )

    # actuals + history (02 §4, 05 §5)
    actual = store.actual_units(series_id, horizon_lo, horizon_hi)          # len 28
    history_units = store.actual_units(series_id, hist_lo, hist_hi)         # len 84
    history_dates = [store.d_to_date(d).isoformat() for d in range(hist_lo, hist_hi + 1)]
    horizon_dates = [store.d_to_date(d).isoformat() for d in range(horizon_lo, horizon_hi + 1)]

    # metrics (03 §6)
    acc = compute_accuracy(actual, forecast)               # accuracy/smape/mae/rmse
    coh = compute_coherence(actual, forecast)              # coherence/coherence_label
    prev_28 = float(sum(store.actual_units(series_id, prev_lo, prev_hi)))
    vel = compute_velocity(prev_28, forecast)              # value/status (03 §6.3)
    trailing_28 = store.actual_units(series_id, prev_lo, prev_hi)
    inv = compute_inventory_risk(trailing_28, forecast)    # 03 §6.4 (+ projected_stock)

    # calendar / seasonal / uplift (05 §5, 03 §5)
    events_raw = store.events_in_range(horizon_lo, horizon_hi)
    events_in_horizon = [EventInfo(**e) for e in events_raw]
    snap_days = store.snap_days_in_range(horizon_lo, horizon_hi)
    month = store.d_to_date(start_d).month
    overall_mean = float(profile["overall_mean"])
    monthly_avg = list(profile["monthly_avg"])             # len 12
    weekday_avg = list(profile["weekday_avg"])             # len 7
    if overall_mean != 0:
        month_vs_avg_pct = round((monthly_avg[month - 1] - overall_mean) / overall_mean * 100, 1)
    else:
        month_vs_avg_pct = 0.0
    seasonal = Seasonal(
        month=month,
        month_vs_avg_pct=month_vs_avg_pct,
        monthly_avg=monthly_avg,
        weekday_avg=weekday_avg,
    )
    event_uplift = dict(profile["event_uplift"])           # map<str,number> (03 §5)

    # explainability (03 §6.5 via MT-19) — pass already-computed pieces
    expl = compute_explainability(
        forecast, f_no_event,
        velocity=vel,
        seasonal={"month": month, "month_vs_avg_pct": month_vs_avg_pct},
        events_in_horizon=events_raw,
        snap_days=snap_days,
        profiles_for_series=profile,
        product_name=name,
    )

    return ForecastResult(
        series_id=series_id,
        item_id=meta["item_id"],
        product_name=name,
        history=HistoryBlock(dates=history_dates, units=history_units),
        horizon_dates=horizon_dates,
        actual=actual,
        forecast=[round(x, 1) for x in forecast],          # 1 dp for display (05 §5)
        metrics=Metrics(
            accuracy=acc["accuracy"],
            coherence=coh["coherence"],
            coherence_label=coh["coherence_label"],
            smape=acc["smape"],
            mae=acc["mae"],
            rmse=acc["rmse"],
        ),
        velocity=Velocity(value=vel["value"], status=vel["status"]),
        inventory=Inventory(
            on_hand=inv["on_hand"],
            safety_stock=inv["safety_stock"],
            reorder_point=inv["reorder_point"],
            horizon_demand=inv["horizon_demand"],
            cover_days=inv["cover_days"],
            stockout_risk=inv["stockout_risk"],
            overstock=inv["overstock"],
            recommended_order_qty=inv["recommended_order_qty"],
            projected_stock=inv["projected_stock"],
        ),
        explainability=Explainability(
            event_contribution_pct=expl["event_contribution_pct"],
            snap_days_in_horizon=expl["snap_days_in_horizon"],
            narrative=expl["narrative"],
            factors=[Factor(**f) for f in expl["factors"]],
        ),
        events_in_horizon=events_in_horizon,
        seasonal=seasonal,
        event_uplift=event_uplift,
    )


def _build_summary(results: list[ForecastResult]) -> Summary:
    """Aggregate across results (05 §5 rules)."""
    total_predicted_demand = round(sum(r.inventory.horizon_demand for r in results), 1)
    high_risk_count = sum(1 for r in results if r.inventory.stockout_risk == "High")
    avg_velocity = round(
        sum(min(r.velocity.value, 999.0) for r in results) / len(results), 1
    )                                                       # cap each at 999 (05 §5)
    avg_accuracy = round(sum(r.metrics.accuracy for r in results) / len(results), 1)

    # union of events, deduped by (date, name), sorted by date (05 §5)
    seen: set[tuple[str, str]] = set()
    active: list[EventInfo] = []
    for r in results:
        for ev in r.events_in_horizon:
            key = (ev.date, ev.name)
            if key not in seen:
                seen.add(key)
                active.append(ev)
    active.sort(key=lambda e: e.date)

    return Summary(
        total_predicted_demand=total_predicted_demand,
        high_risk_count=high_risk_count,
        avg_velocity=avg_velocity,
        avg_accuracy=avg_accuracy,
        active_events=active,
    )


def run(product_ids: list[str], start_date_str: str) -> ForecastResponse:
    """Build the full ForecastResponse for the request (04 §4)."""
    store = get_store()
    if not store.model_loaded:
        # surfaces as 500 via MT-24's generic handler (04 §3, 05 §6)
        raise RuntimeError("model artifacts not loaded; cannot forecast")

    start_d = _validate_start_d(store, start_date_str)

    # defense in depth — MT-20's ForecastRequest already enforces valid SeriesIds
    for pid in product_ids:
        if pid not in config.SERIES_IDS:
            raise ForecastValidationError(
                f"unknown product_id '{pid}'.", field="product_ids"
            )

    results = [_build_result(store, pid, start_d) for pid in product_ids]
    summary = _build_summary(results)

    return ForecastResponse(
        start_date=start_date_str,
        horizon=config.HORIZON,
        summary=summary,
        results=results,
    )
```

### `backend/app/api/forecast.py`
```python
"""MT-23 — POST /api/forecast (04 §4, 05 §5).

The router only validates the body (ForecastRequest, MT-20) and delegates to
forecast_service.run. Errors (date range / bad product) raise from the service
and are mapped to 422 by MT-24; model-not-loaded raises 500 (04 §3, 05 §6).
"""
from __future__ import annotations

from fastapi import APIRouter

from app.schemas.contracts import ForecastRequest, ForecastResponse
from app.services import forecast_service

router = APIRouter()


@router.post("/forecast", response_model=ForecastResponse)
def post_forecast(req: ForecastRequest) -> ForecastResponse:
    """05 §5 — forecast the 28-day horizon for one or more products."""
    return forecast_service.run(req.product_ids, req.start_date)
```

> **Wiring note (MT-24):** `main.py` does `app.include_router(forecast.router, prefix="/api")`.
> The `ForecastRequest` model (MT-20) removes duplicate product_ids and rejects invalid
> `SeriesId`s, so `req.product_ids` arriving here is already clean (`05` §5 validation rules).

## 6. Tests / Verification (exact pytest tests + commands)
Add to `backend/tests/test_api.py`. Uses the `client` fixture (`07` §2).

### `backend/tests/test_api.py` (MT-23 additions)
```python
"""MT-23 — POST /api/forecast happy-path tests (07 §2)."""


def test_forecast_happy_path_turkey(client):
    r = client.post(
        "/api/forecast",
        json={"product_ids": ["turkey"], "start_date": "2015-11-01"},
    )
    assert r.status_code == 200
    body = r.json()

    # top level (05 §5)
    assert body["start_date"] == "2015-11-01"
    assert body["horizon"] == 28
    assert set(body.keys()) == {"start_date", "horizon", "summary", "results"}

    # summary (05 §5)
    summary = body["summary"]
    assert set(summary.keys()) == {
        "total_predicted_demand", "high_risk_count",
        "avg_velocity", "avg_accuracy", "active_events",
    }
    assert isinstance(summary["high_risk_count"], int)
    assert isinstance(summary["active_events"], list)

    # exactly one result, for the requested product
    assert len(body["results"]) == 1
    res = body["results"][0]
    assert res["series_id"] == "turkey"
    assert res["item_id"] == "FOODS_3_069"
    assert res["product_name"] == "Fresh Whole Turkey"

    # array lengths (05 §5)
    assert len(res["history"]["dates"]) == 84
    assert len(res["history"]["units"]) == 84
    assert len(res["horizon_dates"]) == 28
    assert len(res["actual"]) == 28
    assert len(res["forecast"]) == 28
    assert len(res["inventory"]["projected_stock"]) == 28
    assert res["horizon_dates"][0] == "2015-11-01"

    # forecast rounded to 1 dp (03 §4 / 05 §5)
    for v in res["forecast"]:
        assert round(v, 1) == v

    # every locked block present (05 §5)
    for key in (
        "metrics", "velocity", "inventory", "explainability",
        "events_in_horizon", "seasonal", "event_uplift",
    ):
        assert key in res

    # metrics typed (05 §5)
    m = res["metrics"]
    assert set(m.keys()) == {
        "accuracy", "coherence", "coherence_label", "smape", "mae", "rmse",
    }
    assert m["coherence_label"] in {"Strong", "Moderate", "Weak"}

    # velocity (05 §1 status set)
    assert res["velocity"]["status"] in {
        "Critical Decline", "Declining", "Stable", "Growing", "Accelerating",
    }

    # inventory (05 §5)
    assert res["inventory"]["stockout_risk"] in {"Low", "Medium", "High"}
    assert isinstance(res["inventory"]["overstock"], bool)

    # seasonal (05 §5)
    assert len(res["seasonal"]["monthly_avg"]) == 12
    assert len(res["seasonal"]["weekday_avg"]) == 7
    assert res["seasonal"]["month"] == 11


def test_forecast_results_order_matches_request(client):
    r = client.post(
        "/api/forecast",
        json={"product_ids": ["milk", "turkey"], "start_date": "2015-11-01"},
    )
    assert r.status_code == 200
    ids = [res["series_id"] for res in r.json()["results"]]
    assert ids == ["milk", "turkey"]   # request order preserved (05 §5)
```

### Commands (from `backend/`)
```bash
pytest -q tests/test_api.py -k forecast
```

## 7. Acceptance checklist
- [ ] `backend/app/services/forecast_service.py` and `backend/app/api/forecast.py` exist at the exact paths (`04` §1).
- [ ] `forecast_service.run(product_ids, start_date_str) -> ForecastResponse` follows `04` §4 step order.
- [ ] Date validated to `[FIRST_SELECTABLE_D, LAST_SELECTABLE_D]`; out-of-range raises `ValueError` with the exact `05` §7 message and `field="start_date"`.
- [ ] Per product: `recursive_forecast` (MT-15), `actual`/`history` from the store, `compute_accuracy`/`compute_coherence`/`compute_velocity`/`compute_inventory_risk`/`compute_explainability` (MT-16..19), seasonal + `event_uplift` from profiles (MT-14) — no module redefined.
- [ ] `prev_28`/`trailing_28` = sum/list of actuals over `[start-28, start-1]` (`03` §6.3/§6.4); history = 84 actuals before start; horizon = 28.
- [ ] `forecast` field rounded to 1 dp; internal forecast kept float for metrics (`03` §4).
- [ ] `ForecastResult` matches `05` §5 exactly (all blocks + array lengths 84/28/12/7).
- [ ] `summary`: `total_predicted_demand=Σ horizon_demand`, `high_risk_count=#High`, `avg_velocity` caps each at 999 before averaging, `avg_accuracy=mean(accuracy)`, `active_events` deduped by (date,name) + sorted by date (`05` §5).
- [ ] `POST /api/forecast` validates `ForecastRequest` (MT-20) and calls the service; results are in request order.
- [ ] Happy-path test for `["turkey"]` @ `2015-11-01` → 200, `forecast` len 28, all fields present & typed; multi-product order test green. No new runtime deps beyond `04` §6.
