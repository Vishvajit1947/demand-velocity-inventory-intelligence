# 05 — API Contract (SOURCE OF TRUTH for Frontend ↔ Backend)

> The frontend and backend are built in **separate sessions** and never read each other's code.
> They agree **only** through this file. Every field, type, and example here is binding. The
> backend must return exactly these shapes; the frontend must consume exactly these shapes.
> A **mock server** (§9) returns these exact fixtures so the frontend can be built first.

- Base URL (local dev): `http://localhost:8000`
- All endpoints are under `/api`. All responses are JSON, UTF-8.
- CORS: backend allows origin `http://localhost:5173` (Vite dev server).
- Dates are ISO `YYYY-MM-DD` strings. Numbers are JSON numbers (floats unless noted).
- Determinism: identical requests return identical bodies (no timestamps in the body).

---

## 1. Types (shared vocabulary)

```ts
type SeriesId = "turkey" | "candy" | "strawberries" | "icecream"
              | "cocoa"  | "chips" | "milk"          | "bread";

type VelocityStatus = "Critical Decline" | "Declining" | "Stable"
                    | "Growing" | "Accelerating";

type RiskLevel = "Low" | "Medium" | "High";

type EventInfo = { date: string; name: string; type: string };
```

These are mirrored verbatim in `frontend/src/lib/types.ts` (built in MT-31) and in
`backend/app/schemas/contracts.py` as Pydantic models (built in MT-20).

---

## 2. `GET /api/health`
Liveness + readiness.

**200 Response**
```json
{ "status": "ok", "model_loaded": true, "version": "1.0.0" }
```

---

## 3. `GET /api/products`
List the 8 products with summary profile data (for selectors + cards). Static (no params).

**200 Response**
```json
{
  "products": [
    {
      "series_id": "turkey",
      "item_id": "FOODS_3_069",
      "name": "Fresh Whole Turkey",
      "dept_id": "FOODS_3",
      "archetype": "Event-driven",
      "overall_mean": 18.6,
      "seasonal_cv": 1.25
    }
    // ... 7 more, in the fixed order of SERIES_IDS
  ]
}
```
`archetype` ∈ {"Event-driven","Seasonal","Perishable seasonal","Stable baseline"} — a short
label from `02_DATA_SPEC.md` §2 (backend maps it; see MT-22).

---

## 4. `GET /api/calendar/bounds`
The selectable date window + split metadata. Drives the date picker.

**200 Response**
```json
{
  "train_start": "2011-01-29",
  "train_end":   "2014-01-27",
  "test_start":  "2014-01-28",
  "test_end":    "2016-05-22",
  "first_selectable_date": "2014-01-28",
  "last_selectable_date":  "2016-04-25",
  "horizon": 28,
  "history_window": 84
}
```
The date picker MUST disable any date outside `[first_selectable_date, last_selectable_date]`.

---

## 5. `POST /api/forecast`
The core endpoint. Forecasts the 28-day horizon for one or more products from a start date.

### Request body
```json
{
  "product_ids": ["turkey", "milk"],
  "start_date": "2015-11-01"
}
```
Validation rules (backend enforces; returns 422 on violation — see §7):
- `product_ids`: non-empty array; each must be a valid `SeriesId`; duplicates removed; max 8.
- `start_date`: ISO date within `[first_selectable_date, last_selectable_date]`.

### 200 Response (top level)
```json
{
  "start_date": "2015-11-01",
  "horizon": 28,
  "summary": {
    "total_predicted_demand": 1234.5,
    "high_risk_count": 1,
    "avg_velocity": 12.3,
    "avg_accuracy": 78.4,
    "active_events": [ { "date": "2015-11-26", "name": "Thanksgiving", "type": "National" } ]
  },
  "results": [ /* one ForecastResult per requested product, in request order */ ]
}
```

### `ForecastResult` object (per product) — EXACT shape
```json
{
  "series_id": "turkey",
  "item_id": "FOODS_3_069",
  "product_name": "Fresh Whole Turkey",

  "history": {
    "dates": ["2015-08-10", "..."],          // 84 dates ending at start_date - 1
    "units": [12.0, 9.0, "..."]              // actual units, length 84
  },
  "horizon_dates": ["2015-11-01", "...", "2015-11-28"],   // length 28

  "actual":   [10.0, 8.0, "..."],            // length 28, actual units over horizon (always present in selectable range)
  "forecast": [11.3, 7.9, "..."],            // length 28, model prediction (1 decimal)

  "metrics": {
    "accuracy": 78.4,                        // HEADLINE = max(0, 100 - WAPE)
    "wape": 21.6,                            // weighted abs % error
    "coherence": 71.0,
    "coherence_label": "Moderate",           // Strong|Moderate|Weak
    "smape": 24.1,                           // secondary
    "mae": 3.21,
    "rmse": 4.87
  },

  "velocity": { "value": 412.0, "status": "Accelerating" },

  "inventory": {
    "on_hand": 260,
    "safety_stock": 41.0,
    "reorder_point": 171.0,
    "horizon_demand": 520.0,
    "cover_days": 9,
    "stockout_risk": "Medium",
    "overstock": false,
    "recommended_order_qty": 301,
    "projected_stock": [248.7, 240.8, "..."] // length 28
  },

  "explainability": {
    "event_contribution_pct": 280.5,
    "snap_days_in_horizon": 8,
    "narrative": [
      "Demand is Accelerating (+412% vs the prior 28 days).",
      "November is a high-demand month for Fresh Whole Turkey (~+220% vs average).",
      "Thanksgiving falls in this window — historically a +517% swing.",
      "Events account for ~+280% of predicted demand in this window."
    ],
    "factors": [
      { "label": "Event uplift", "value": 280.5, "kind": "event" },
      { "label": "Seasonality",  "value": 220.0, "kind": "seasonal" },
      { "label": "Trend",        "value": 412.0, "kind": "trend" }
    ]
  },

  "events_in_horizon": [
    { "date": "2015-11-26", "name": "Thanksgiving", "type": "National" }
  ],

  "seasonal": {
    "month": 11,
    "month_vs_avg_pct": 220.0,
    "monthly_avg": [15.0, 13.0, 9.0, 10.0, 8.0, 7.0, 8.0, 8.0, 7.0, 12.0, 57.0, 92.0],
    "weekday_avg": [22.1, 18.0, 16.4, 15.9, 17.2, 19.8, 24.0]
  },

  "event_uplift": { "Thanksgiving": 517.0, "ValentinesDay": 92.0 }
}
```

### Field reference (every field, no ambiguity)
| path | type | meaning | source |
|---|---|---|---|
| `history.dates/units` | string[84] / number[84] | actual context before start | `series_daily` |
| `horizon_dates` | string[28] | the forecast days | calendar |
| `actual` | number[28] | real units over horizon | `series_daily` |
| `forecast` | number[28] | predictions, 1 dp | MT-04 |
| `metrics.accuracy` | number | headline = max(0,100−WAPE), `03` §6.1 | metrics.py |
| `metrics.wape/smape/mae/rmse` | numbers | secondary errors, `03` §6.1 | metrics.py |
| `metrics.coherence/coherence_label` | number/string | `03` §6.2 | metrics.py |
| `velocity.value/status` | number / VelocityStatus | `03` §6.3 | MT-05 |
| `inventory.*` | numbers/RiskLevel/bool | `03` §6.4 | MT-05 |
| `inventory.projected_stock` | number[28] | sim stock path | MT-05 |
| `explainability.event_contribution_pct` | number | `03` §6.5 | MT-05 |
| `explainability.narrative` | string[] | templated bullets | MT-05/MT-19 |
| `explainability.factors` | {label,value,kind}[] | for the factor bar chart | MT-05 |
| `events_in_horizon` | EventInfo[] | events within the 28 days | calendar |
| `seasonal.monthly_avg` | number[12] | profile | `profiles.json` |
| `seasonal.weekday_avg` | number[7] | profile | `profiles.json` |
| `event_uplift` | map<string,number> | profile | `profiles.json` |

`summary` aggregates across `results`: `total_predicted_demand = Σ horizon_demand`,
`high_risk_count = #(stockout_risk=="High")`, `avg_velocity = mean(velocity.value)` (cap each at
999 before averaging), `avg_accuracy = mean(metrics.accuracy)`, `active_events` = union of all
`events_in_horizon` deduped by (date,name), sorted by date.

---

## 6. Status codes
| code | when |
|---|---|
| 200 | success |
| 422 | validation error (bad product id, date out of range, malformed body) |
| 500 | unexpected server error (model not loaded, etc.) |

---

## 7. Error response shape (422 / 500)
```json
{
  "error": "validation_error",
  "message": "start_date 2016-12-01 is outside the selectable range [2014-01-28, 2016-04-25].",
  "field": "start_date"
}
```
`field` is omitted for 500s. The frontend shows `message` in a toast (MT-42).

---

## 8. Performance contract
- `/api/forecast` for up to 8 products returns in **≤ 2 s** on a warm server (model already
  loaded). The model + data load once at startup, not per request (MT-21).

---

## 9. Mock server (so the frontend can be built without the backend)
MT-25 produces `frontend/mock/` — a tiny standalone responder (Vite middleware or a 30-line
Express script) that serves **byte-for-byte these fixtures**:
- `GET /api/health`, `GET /api/products`, `GET /api/calendar/bounds` → the literal examples above.
- `POST /api/forecast` → returns a fixture `ForecastResult` for each requested product, drawn
  from committed JSON files `frontend/mock/fixtures/<series_id>.json` (one per product, with
  realistic but static arrays). The mock ignores `start_date` except to echo it.

The frontend reads `VITE_API_BASE` (`.env`): point it at the mock during MT-30…MT-41, then at
`http://localhost:8000` for MT-46 integration. **No frontend code changes** are needed to swap —
only the env var. This is what lets the two tracks run fully in parallel.
