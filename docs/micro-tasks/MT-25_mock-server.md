# MT-25 — Mock API server + fixtures (`frontend/mock/`)

## 1. Context
Frontend-enabler task (`MT-INDEX.md`, depends on **MT-00** scaffold; reads `05`). The frontend and
backend are built in separate sessions and agree only through `05_API_CONTRACT.md`. So the
frontend can be built **before** the real backend exists, this task produces a tiny standalone
Node HTTP server in `frontend/mock/` that serves the **exact** `05` fixtures (`05` §9): `GET
/api/health`, `GET /api/products`, `GET /api/calendar/bounds`, and `POST /api/forecast`. The POST
returns a committed `ForecastResult` per requested product from
`frontend/mock/fixtures/<series_id>.json`, echoing `start_date` and building the `summary`.

The frontend points `VITE_API_BASE` at this mock during MT-30…MT-41, then at
`http://localhost:8000` for MT-46 — **no frontend code changes** to swap, only the env var (`05`
§9). This task owns the server file and all 8 fixtures; it must match `05` byte-for-shape but uses
**no npm dependencies** (built-in `http` only) so `node mock/server.mjs` runs with zero install.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `05_API_CONTRACT.md` §2 (health), §3 (products), §4 (bounds), §5 (`ForecastResult` + summary +
  request), §7 (errors), §9 (mock server), §1 (types).
- `02_DATA_SPEC.md` §2 (the 8 products + archetypes — drives realistic per-product fixtures).
- `04_BACKEND_ARCHITECTURE.md` §1 (frontend tree: `frontend/mock/`, `frontend/mock/fixtures/`).

**Prior MT artifacts that must already exist:**
- **MT-00** created the empty `frontend/mock/` and `frontend/mock/fixtures/` directories.
- Node **20** (no npm packages required — built-in `http`/`fs`/`url` only). Run from `frontend/`.

> This task **owns** `frontend/mock/server.mjs` and the 8 files
> `frontend/mock/fixtures/<series_id>.json` (turkey, candy, strawberries, icecream, cocoa, chips,
> milk, bread). It introduces **no** dependencies.

## 3. Goal
1. `frontend/mock/server.mjs` — a ~120-line zero-dependency Node HTTP server on port **8000**
   that serves the four endpoints with the literal `05` §2–§4 values and, for `POST /api/forecast`,
   loads one fixture per requested product, echoes `start_date`, and builds the `summary` per `05`
   §5 aggregation rules. Validates the request minimally and returns the `05` §7 error shape on bad
   input.
2. Eight fixture files, each a complete `ForecastResult` (`05` §5) with correct array lengths
   (history 84, horizon_dates/actual/forecast/projected_stock 28; monthly_avg 12; weekday_avg 7)
   and metrics/velocity/inventory/explainability/seasonal/event_uplift consistent with the
   product's archetype (`02` §2).

## 4. Design (locked decisions; cite foundation sections)
- **Zero dependencies** (`05` §9 allows a ~30-line responder; we pick built-in `http` to avoid an
  npm install in the frontend). ES module (`.mjs`) so `import` works without `package.json` config.
- **Port 8000, `/api` prefix** — matches the real backend base URL (`05` intro) so swapping
  `VITE_API_BASE` between mock and backend requires no other change (`05` §9).
- **CORS** — respond with `Access-Control-Allow-Origin: *` and handle `OPTIONS` preflight (200),
  so the Vite dev server (`http://localhost:5173`) can call the mock cross-origin during dev. (The
  real backend restricts this to the Vite origin per `04` §3; for a static mock, `*` is fine and
  simpler.)
- **Static literals (`05` §2–§4)** — `/api/health` → `{status:"ok",model_loaded:true,
  version:"1.0.0"}`; `/api/products` → the 8 products in `SERIES_IDS` order with the example
  `archetype/overall_mean/seasonal_cv` (turkey example verbatim from `05` §3, others per `02` §2);
  `/api/calendar/bounds` → the exact `05` §4 object.
- **`POST /api/forecast` (`05` §5, §9)** — parse JSON body `{product_ids, start_date}`; dedupe
  product_ids preserving order, cap at 8 (`05` §5). For each id load
  `fixtures/<id>.json` (a `ForecastResult`). The mock **ignores `start_date` except to echo it**
  (`05` §9) — it does not recompute dates inside the fixtures. Build the response:
  ```
  { start_date: <echoed>, horizon: 28, summary: <aggregated>, results: [<fixtures...>] }
  ```
  `summary` is computed from the chosen fixtures with the **exact `05` §5 rules**:
  `total_predicted_demand = round(Σ inventory.horizon_demand,1)`,
  `high_risk_count = #(stockout_risk=="High")`,
  `avg_velocity = round(mean(min(velocity.value,999)),1)`,
  `avg_accuracy = round(mean(metrics.accuracy),1)`,
  `active_events` = union of `events_in_horizon` deduped by `(date,name)`, sorted by date.
- **Validation / errors (`05` §6/§7)** — empty/invalid `product_ids` (none valid) or unknown id →
  422 `{error:"validation_error", message, field}`; unknown route → 404; any handler throw → 500
  `{error:"server_error", message}`. (Date range is **not** enforced by the mock — it echoes any
  `start_date`, per `05` §9.)
- **Fixture archetype consistency (`02` §2)** — each fixture's numbers reflect its story so the UI
  looks believable: turkey/candy/chips show event spikes + high velocity; icecream/cocoa/
  strawberries show seasonal shape; milk/bread are flat, high-volume, Low risk, Stable velocity.
  These are **static** demo values, not computed — the real backend (MT-23) produces live numbers.
- **Array lengths are load-bearing** (`05` §5): each fixture has `history.dates`/`history.units`
  length 84, `horizon_dates`/`actual`/`forecast`/`inventory.projected_stock` length 28,
  `seasonal.monthly_avg` length 12, `seasonal.weekday_avg` length 7. The verification curl checks
  these.

## 5. Implementation (exact file paths from 04 §1; FULL runnable code)

### `frontend/mock/server.mjs`
```javascript
// MT-25 — zero-dependency mock API server (05_API_CONTRACT §9).
// Serves the exact 05 fixtures so the frontend can be built before the backend.
// Run from frontend/:  node mock/server.mjs   (listens on http://localhost:8000)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const PORT = 8000;

// 02 §6 / 05 §3 — fixed product order + summary profile data.
const SERIES_IDS = [
  "turkey", "candy", "strawberries", "icecream",
  "cocoa", "chips", "milk", "bread",
];

const PRODUCTS = [
  { series_id: "turkey",       item_id: "FOODS_3_069", name: "Fresh Whole Turkey",  dept_id: "FOODS_3", archetype: "Event-driven",        overall_mean: 18.6, seasonal_cv: 1.25 },
  { series_id: "candy",        item_id: "FOODS_1_206", name: "Halloween Candy",     dept_id: "FOODS_1", archetype: "Event-driven",        overall_mean: 14.2, seasonal_cv: 1.10 },
  { series_id: "strawberries", item_id: "FOODS_1_123", name: "Fresh Strawberries",  dept_id: "FOODS_1", archetype: "Perishable seasonal", overall_mean: 22.4, seasonal_cv: 0.62 },
  { series_id: "icecream",     item_id: "FOODS_3_008", name: "Vanilla Ice Cream",   dept_id: "FOODS_3", archetype: "Seasonal",            overall_mean: 31.7, seasonal_cv: 0.55 },
  { series_id: "cocoa",        item_id: "FOODS_3_073", name: "Hot Cocoa Mix",       dept_id: "FOODS_3", archetype: "Seasonal",            overall_mean: 9.8,  seasonal_cv: 0.95 },
  { series_id: "chips",        item_id: "FOODS_2_022", name: "Tortilla Chips",      dept_id: "FOODS_2", archetype: "Event-driven",        overall_mean: 27.5, seasonal_cv: 0.34 },
  { series_id: "milk",         item_id: "FOODS_3_586", name: "Fresh Whole Milk",    dept_id: "FOODS_3", archetype: "Stable baseline",     overall_mean: 188.0, seasonal_cv: 0.10 },
  { series_id: "bread",        item_id: "FOODS_3_080", name: "Sliced White Bread",  dept_id: "FOODS_3", archetype: "Stable baseline",     overall_mean: 142.0, seasonal_cv: 0.08 },
];

// 05 §4 — exact literal bounds.
const BOUNDS = {
  train_start: "2011-01-29",
  train_end: "2014-01-27",
  test_start: "2014-01-28",
  test_end: "2016-05-22",
  first_selectable_date: "2014-01-28",
  last_selectable_date: "2016-04-25",
  horizon: 28,
  history_window: 84,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function loadFixture(seriesId) {
  const raw = await readFile(join(FIXTURES_DIR, `${seriesId}.json`), "utf-8");
  return JSON.parse(raw);
}

// 05 §5 — summary aggregation across the chosen fixtures.
function buildSummary(results) {
  const round1 = (x) => Math.round(x * 10) / 10;
  const total = results.reduce((s, r) => s + r.inventory.horizon_demand, 0);
  const highRisk = results.filter((r) => r.inventory.stockout_risk === "High").length;
  const avgVel =
    results.reduce((s, r) => s + Math.min(r.velocity.value, 999), 0) / results.length;
  const avgAcc =
    results.reduce((s, r) => s + r.metrics.accuracy, 0) / results.length;

  const seen = new Set();
  const active = [];
  for (const r of results) {
    for (const ev of r.events_in_horizon) {
      const key = `${ev.date}|${ev.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        active.push(ev);
      }
    }
  }
  active.sort((a, b) => a.date.localeCompare(b.date));

  return {
    total_predicted_demand: round1(total),
    high_risk_count: highRisk,
    avg_velocity: round1(avgVel),
    avg_accuracy: round1(avgAcc),
    active_events: active,
  };
}

async function handleForecast(req, res) {
  let body;
  try {
    body = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return send(res, 422, {
      error: "validation_error",
      message: "Malformed JSON body.",
      field: "body",
    });
  }

  const requested = Array.isArray(body.product_ids) ? body.product_ids : [];
  const startDate = body.start_date;

  // dedupe preserving order, keep only valid ids, cap at 8 (05 §5)
  const ids = [];
  for (const id of requested) {
    if (SERIES_IDS.includes(id) && !ids.includes(id)) ids.push(id);
    if (ids.length >= 8) break;
  }
  if (ids.length === 0) {
    return send(res, 422, {
      error: "validation_error",
      message: "product_ids must contain at least one valid product id.",
      field: "product_ids",
    });
  }

  const results = [];
  for (const id of ids) results.push(await loadFixture(id));

  // 05 §9 — ignore start_date except to echo it.
  return send(res, 200, {
    start_date: startDate ?? null,
    horizon: 28,
    summary: buildSummary(results),
    results,
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (req.method === "GET" && path === "/api/health") {
      return send(res, 200, { status: "ok", model_loaded: true, version: "1.0.0" });
    }
    if (req.method === "GET" && path === "/api/products") {
      return send(res, 200, { products: PRODUCTS });
    }
    if (req.method === "GET" && path === "/api/calendar/bounds") {
      return send(res, 200, BOUNDS);
    }
    if (req.method === "POST" && path === "/api/forecast") {
      return await handleForecast(req, res);
    }
    return send(res, 404, { error: "not_found", message: `No route ${req.method} ${path}` });
  } catch (e) {
    return send(res, 500, { error: "server_error", message: String(e && e.message) });
  }
});

server.listen(PORT, () => {
  console.log(`[MT-25] mock API server on http://localhost:${PORT} (CORS *)`);
});
```

### Fixtures — `frontend/mock/fixtures/<series_id>.json`
Each is a complete `ForecastResult` (`05` §5). To keep the arrays readable and verifiable, the
84/28-length arrays below use compact repeating but **plausible** values; every length is exact.
Copy each block verbatim into its file.

> Helper for writing the arrays: the 84 `history.dates` and 28 `horizon_dates` are static example
> dates (the mock ignores the real `start_date` per `05` §9). They are written out in full so the
> charts render real-looking axes.

#### `frontend/mock/fixtures/turkey.json` (Event-driven — Thanksgiving spike, `02` §2)
```json
{
  "series_id": "turkey",
  "item_id": "FOODS_3_069",
  "product_name": "Fresh Whole Turkey",
  "history": {
    "dates": ["2015-08-09","2015-08-10","2015-08-11","2015-08-12","2015-08-13","2015-08-14","2015-08-15","2015-08-16","2015-08-17","2015-08-18","2015-08-19","2015-08-20","2015-08-21","2015-08-22","2015-08-23","2015-08-24","2015-08-25","2015-08-26","2015-08-27","2015-08-28","2015-08-29","2015-08-30","2015-08-31","2015-09-01","2015-09-02","2015-09-03","2015-09-04","2015-09-05","2015-09-06","2015-09-07","2015-09-08","2015-09-09","2015-09-10","2015-09-11","2015-09-12","2015-09-13","2015-09-14","2015-09-15","2015-09-16","2015-09-17","2015-09-18","2015-09-19","2015-09-20","2015-09-21","2015-09-22","2015-09-23","2015-09-24","2015-09-25","2015-09-26","2015-09-27","2015-09-28","2015-09-29","2015-09-30","2015-10-01","2015-10-02","2015-10-03","2015-10-04","2015-10-05","2015-10-06","2015-10-07","2015-10-08","2015-10-09","2015-10-10","2015-10-11","2015-10-12","2015-10-13","2015-10-14","2015-10-15","2015-10-16","2015-10-17","2015-10-18","2015-10-19","2015-10-20","2015-10-21","2015-10-22","2015-10-23","2015-10-24","2015-10-25","2015-10-26","2015-10-27","2015-10-28","2015-10-29","2015-10-30","2015-10-31"],
    "units": [9.0,8.0,7.0,10.0,11.0,14.0,12.0,8.0,7.0,6.0,9.0,10.0,13.0,11.0,8.0,7.0,8.0,9.0,12.0,15.0,13.0,9.0,8.0,7.0,10.0,11.0,14.0,12.0,9.0,8.0,7.0,9.0,11.0,13.0,12.0,8.0,7.0,8.0,10.0,12.0,15.0,14.0,9.0,8.0,9.0,11.0,13.0,16.0,14.0,10.0,9.0,8.0,11.0,12.0,15.0,17.0,13.0,10.0,9.0,10.0,12.0,14.0,18.0,16.0,11.0,10.0,11.0,13.0,15.0,19.0,17.0,12.0,11.0,12.0,14.0,16.0,21.0,18.0,13.0,12.0,13.0,15.0,18.0,23.0]
  },
  "horizon_dates": ["2015-11-01","2015-11-02","2015-11-03","2015-11-04","2015-11-05","2015-11-06","2015-11-07","2015-11-08","2015-11-09","2015-11-10","2015-11-11","2015-11-12","2015-11-13","2015-11-14","2015-11-15","2015-11-16","2015-11-17","2015-11-18","2015-11-19","2015-11-20","2015-11-21","2015-11-22","2015-11-23","2015-11-24","2015-11-25","2015-11-26","2015-11-27","2015-11-28"],
  "actual": [16.0,14.0,13.0,15.0,18.0,24.0,20.0,17.0,16.0,18.0,22.0,28.0,25.0,21.0,24.0,30.0,38.0,52.0,61.0,74.0,98.0,120.0,142.0,165.0,180.0,210.0,96.0,40.0],
  "forecast": [15.4,13.8,12.9,15.1,17.6,23.2,19.8,16.7,15.9,17.4,21.1,27.0,24.3,20.6,23.5,29.4,37.1,50.6,59.8,72.4,95.7,118.2,139.5,162.0,176.4,205.8,93.1,39.2],
  "metrics": {
    "accuracy": 81.4,
    "coherence": 88.0,
    "coherence_label": "Strong",
    "smape": 18.6,
    "mae": 4.12,
    "rmse": 6.95
  },
  "velocity": { "value": 412.0, "status": "Accelerating" },
  "inventory": {
    "on_hand": 182,
    "safety_stock": 41.0,
    "reorder_point": 132.0,
    "horizon_demand": 1683.6,
    "cover_days": 9,
    "stockout_risk": "High",
    "overstock": false,
    "recommended_order_qty": 1543,
    "projected_stock": [166.6,152.8,139.9,124.8,107.2,84.0,64.2,47.5,31.6,14.2,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]
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
      { "label": "Seasonality", "value": 220.0, "kind": "seasonal" },
      { "label": "Trend", "value": 412.0, "kind": "trend" }
    ]
  },
  "events_in_horizon": [
    { "date": "2015-11-11", "name": "VeteransDay", "type": "National" },
    { "date": "2015-11-26", "name": "Thanksgiving", "type": "National" }
  ],
  "seasonal": {
    "month": 11,
    "month_vs_avg_pct": 220.0,
    "monthly_avg": [15.0,13.0,9.0,10.0,8.0,7.0,8.0,8.0,7.0,12.0,57.0,92.0],
    "weekday_avg": [22.1,18.0,16.4,15.9,17.2,19.8,24.0]
  },
  "event_uplift": { "Thanksgiving": 517.0, "VeteransDay": 41.0, "ValentinesDay": 92.0 }
}
```

#### `frontend/mock/fixtures/candy.json` (Event-driven — Halloween +1,497%, `02` §2)
```json
{
  "series_id": "candy",
  "item_id": "FOODS_1_206",
  "product_name": "Halloween Candy",
  "history": {
    "dates": ["2015-08-09","2015-08-10","2015-08-11","2015-08-12","2015-08-13","2015-08-14","2015-08-15","2015-08-16","2015-08-17","2015-08-18","2015-08-19","2015-08-20","2015-08-21","2015-08-22","2015-08-23","2015-08-24","2015-08-25","2015-08-26","2015-08-27","2015-08-28","2015-08-29","2015-08-30","2015-08-31","2015-09-01","2015-09-02","2015-09-03","2015-09-04","2015-09-05","2015-09-06","2015-09-07","2015-09-08","2015-09-09","2015-09-10","2015-09-11","2015-09-12","2015-09-13","2015-09-14","2015-09-15","2015-09-16","2015-09-17","2015-09-18","2015-09-19","2015-09-20","2015-09-21","2015-09-22","2015-09-23","2015-09-24","2015-09-25","2015-09-26","2015-09-27","2015-09-28","2015-09-29","2015-09-30","2015-10-01","2015-10-02","2015-10-03","2015-10-04","2015-10-05","2015-10-06","2015-10-07","2015-10-08","2015-10-09","2015-10-10","2015-10-11","2015-10-12","2015-10-13","2015-10-14","2015-10-15","2015-10-16","2015-10-17","2015-10-18","2015-10-19","2015-10-20","2015-10-21","2015-10-22","2015-10-23","2015-10-24","2015-10-25","2015-10-26","2015-10-27","2015-10-28","2015-10-29","2015-10-30","2015-10-31"],
    "units": [6.0,5.0,7.0,8.0,9.0,11.0,10.0,6.0,5.0,7.0,8.0,10.0,9.0,7.0,6.0,7.0,8.0,10.0,12.0,11.0,7.0,6.0,8.0,9.0,11.0,10.0,8.0,7.0,8.0,9.0,12.0,11.0,8.0,7.0,9.0,10.0,13.0,12.0,9.0,8.0,10.0,12.0,15.0,14.0,10.0,9.0,11.0,14.0,18.0,16.0,12.0,11.0,14.0,18.0,24.0,22.0,16.0,15.0,20.0,28.0,38.0,34.0,24.0,22.0,30.0,44.0,62.0,55.0,38.0,36.0,52.0,78.0,110.0,98.0,70.0,68.0,98.0,150.0,210.0,190.0,140.0,180.0,260.0,360.0]
  },
  "horizon_dates": ["2015-11-01","2015-11-02","2015-11-03","2015-11-04","2015-11-05","2015-11-06","2015-11-07","2015-11-08","2015-11-09","2015-11-10","2015-11-11","2015-11-12","2015-11-13","2015-11-14","2015-11-15","2015-11-16","2015-11-17","2015-11-18","2015-11-19","2015-11-20","2015-11-21","2015-11-22","2015-11-23","2015-11-24","2015-11-25","2015-11-26","2015-11-27","2015-11-28"],
  "actual": [42.0,18.0,12.0,10.0,9.0,11.0,10.0,8.0,7.0,8.0,9.0,11.0,10.0,8.0,7.0,8.0,9.0,11.0,10.0,8.0,7.0,9.0,10.0,12.0,11.0,14.0,9.0,8.0],
  "forecast": [40.3,17.6,11.8,9.9,8.8,10.7,9.8,7.9,7.1,7.8,8.9,10.6,9.7,7.8,7.0,7.9,8.8,10.7,9.8,7.9,7.0,8.7,9.8,11.6,10.7,13.4,8.9,7.9],
  "metrics": {
    "accuracy": 74.8,
    "coherence": 79.0,
    "coherence_label": "Strong",
    "smape": 25.2,
    "mae": 1.84,
    "rmse": 3.10
  },
  "velocity": { "value": -68.0, "status": "Critical Decline" },
  "inventory": {
    "on_hand": 196,
    "safety_stock": 58.0,
    "reorder_point": 120.0,
    "horizon_demand": 318.6,
    "cover_days": 28,
    "stockout_risk": "Medium",
    "overstock": false,
    "recommended_order_qty": 181,
    "projected_stock": [155.7,138.1,126.3,116.4,107.6,96.9,87.1,79.2,72.1,64.3,55.4,44.8,35.1,27.3,20.3,12.4,3.6,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]
  },
  "explainability": {
    "event_contribution_pct": -42.0,
    "snap_days_in_horizon": 8,
    "narrative": [
      "Demand is Critical Decline (-68% vs the prior 28 days).",
      "November is a low-demand month for Halloween Candy (~-30% vs average).",
      "No major candy event falls in this window — the Halloween spike has passed.",
      "Events account for ~-42% of predicted demand in this window."
    ],
    "factors": [
      { "label": "Event uplift", "value": -42.0, "kind": "event" },
      { "label": "Seasonality", "value": -30.0, "kind": "seasonal" },
      { "label": "Trend", "value": -68.0, "kind": "trend" }
    ]
  },
  "events_in_horizon": [
    { "date": "2015-11-26", "name": "Thanksgiving", "type": "National" }
  ],
  "seasonal": {
    "month": 11,
    "month_vs_avg_pct": -30.0,
    "monthly_avg": [9.0,11.0,8.0,7.0,8.0,7.0,8.0,9.0,14.0,68.0,10.0,12.0],
    "weekday_avg": [16.2,12.1,10.8,10.4,11.9,14.0,18.6]
  },
  "event_uplift": { "Halloween": 1497.0, "Thanksgiving": 22.0 }
}
```

#### `frontend/mock/fixtures/strawberries.json` (Perishable seasonal — Valentine's + winter, `02` §2)
```json
{
  "series_id": "strawberries",
  "item_id": "FOODS_1_123",
  "product_name": "Fresh Strawberries",
  "history": {
    "dates": ["2015-08-09","2015-08-10","2015-08-11","2015-08-12","2015-08-13","2015-08-14","2015-08-15","2015-08-16","2015-08-17","2015-08-18","2015-08-19","2015-08-20","2015-08-21","2015-08-22","2015-08-23","2015-08-24","2015-08-25","2015-08-26","2015-08-27","2015-08-28","2015-08-29","2015-08-30","2015-08-31","2015-09-01","2015-09-02","2015-09-03","2015-09-04","2015-09-05","2015-09-06","2015-09-07","2015-09-08","2015-09-09","2015-09-10","2015-09-11","2015-09-12","2015-09-13","2015-09-14","2015-09-15","2015-09-16","2015-09-17","2015-09-18","2015-09-19","2015-09-20","2015-09-21","2015-09-22","2015-09-23","2015-09-24","2015-09-25","2015-09-26","2015-09-27","2015-09-28","2015-09-29","2015-09-30","2015-10-01","2015-10-02","2015-10-03","2015-10-04","2015-10-05","2015-10-06","2015-10-07","2015-10-08","2015-10-09","2015-10-10","2015-10-11","2015-10-12","2015-10-13","2015-10-14","2015-10-15","2015-10-16","2015-10-17","2015-10-18","2015-10-19","2015-10-20","2015-10-21","2015-10-22","2015-10-23","2015-10-24","2015-10-25","2015-10-26","2015-10-27","2015-10-28","2015-10-29","2015-10-30","2015-10-31"],
    "units": [28.0,25.0,22.0,24.0,27.0,32.0,30.0,26.0,24.0,23.0,26.0,29.0,33.0,31.0,25.0,23.0,24.0,26.0,29.0,34.0,32.0,26.0,24.0,22.0,25.0,28.0,31.0,29.0,24.0,22.0,21.0,24.0,27.0,30.0,28.0,23.0,21.0,22.0,24.0,27.0,31.0,29.0,22.0,21.0,22.0,24.0,26.0,29.0,27.0,21.0,20.0,19.0,22.0,24.0,27.0,25.0,20.0,19.0,20.0,22.0,25.0,28.0,26.0,20.0,18.0,19.0,21.0,24.0,27.0,25.0,19.0,18.0,19.0,21.0,24.0,27.0,25.0,20.0,18.0,19.0,21.0,23.0,26.0,29.0]
  },
  "horizon_dates": ["2015-11-01","2015-11-02","2015-11-03","2015-11-04","2015-11-05","2015-11-06","2015-11-07","2015-11-08","2015-11-09","2015-11-10","2015-11-11","2015-11-12","2015-11-13","2015-11-14","2015-11-15","2015-11-16","2015-11-17","2015-11-18","2015-11-19","2015-11-20","2015-11-21","2015-11-22","2015-11-23","2015-11-24","2015-11-25","2015-11-26","2015-11-27","2015-11-28"],
  "actual": [27.0,24.0,22.0,23.0,26.0,29.0,27.0,22.0,21.0,22.0,24.0,27.0,30.0,28.0,23.0,21.0,22.0,25.0,28.0,31.0,29.0,24.0,23.0,26.0,30.0,34.0,28.0,24.0],
  "forecast": [26.4,23.6,21.8,22.7,25.6,28.5,26.6,21.9,20.8,21.7,23.6,26.5,29.4,27.5,22.7,20.8,21.8,24.6,27.5,30.4,28.5,23.7,22.7,25.6,29.4,33.3,27.5,23.6],
  "metrics": {
    "accuracy": 86.2,
    "coherence": 82.0,
    "coherence_label": "Strong",
    "smape": 13.8,
    "mae": 1.92,
    "rmse": 2.41
  },
  "velocity": { "value": 6.0, "status": "Stable" },
  "inventory": {
    "on_hand": 330,
    "safety_stock": 38.0,
    "reorder_point": 192.0,
    "horizon_demand": 712.6,
    "cover_days": 13,
    "stockout_risk": "Medium",
    "overstock": false,
    "recommended_order_qty": 421,
    "projected_stock": [303.6,280.0,258.2,235.5,209.9,181.4,154.8,132.9,112.1,90.4,66.8,40.3,10.9,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]
  },
  "explainability": {
    "event_contribution_pct": 4.0,
    "snap_days_in_horizon": 8,
    "narrative": [
      "Demand is Stable (+6% vs the prior 28 days).",
      "November is a slightly low-demand month for Fresh Strawberries (~-12% vs average).",
      "No strawberry-driving event falls in this window (Valentine's drives the February peak).",
      "Events account for ~+4% of predicted demand in this window."
    ],
    "factors": [
      { "label": "Event uplift", "value": 4.0, "kind": "event" },
      { "label": "Seasonality", "value": -12.0, "kind": "seasonal" },
      { "label": "Trend", "value": 6.0, "kind": "trend" }
    ]
  },
  "events_in_horizon": [
    { "date": "2015-11-26", "name": "Thanksgiving", "type": "National" }
  ],
  "seasonal": {
    "month": 11,
    "month_vs_avg_pct": -12.0,
    "monthly_avg": [24.0,38.0,26.0,22.0,24.0,28.0,26.0,21.0,19.0,20.0,21.0,23.0],
    "weekday_avg": [27.4,23.1,21.6,22.0,24.2,26.8,30.1]
  },
  "event_uplift": { "ValentinesDay": 64.0, "Thanksgiving": 8.0 }
}
```

#### `frontend/mock/fixtures/icecream.json` (Seasonal — summer peak, low in November, `02` §2)
```json
{
  "series_id": "icecream",
  "item_id": "FOODS_3_008",
  "product_name": "Vanilla Ice Cream",
  "history": {
    "dates": ["2015-08-09","2015-08-10","2015-08-11","2015-08-12","2015-08-13","2015-08-14","2015-08-15","2015-08-16","2015-08-17","2015-08-18","2015-08-19","2015-08-20","2015-08-21","2015-08-22","2015-08-23","2015-08-24","2015-08-25","2015-08-26","2015-08-27","2015-08-28","2015-08-29","2015-08-30","2015-08-31","2015-09-01","2015-09-02","2015-09-03","2015-09-04","2015-09-05","2015-09-06","2015-09-07","2015-09-08","2015-09-09","2015-09-10","2015-09-11","2015-09-12","2015-09-13","2015-09-14","2015-09-15","2015-09-16","2015-09-17","2015-09-18","2015-09-19","2015-09-20","2015-09-21","2015-09-22","2015-09-23","2015-09-24","2015-09-25","2015-09-26","2015-09-27","2015-09-28","2015-09-29","2015-09-30","2015-10-01","2015-10-02","2015-10-03","2015-10-04","2015-10-05","2015-10-06","2015-10-07","2015-10-08","2015-10-09","2015-10-10","2015-10-11","2015-10-12","2015-10-13","2015-10-14","2015-10-15","2015-10-16","2015-10-17","2015-10-18","2015-10-19","2015-10-20","2015-10-21","2015-10-22","2015-10-23","2015-10-24","2015-10-25","2015-10-26","2015-10-27","2015-10-28","2015-10-29","2015-10-30","2015-10-31"],
    "units": [54.0,50.0,46.0,49.0,55.0,62.0,58.0,48.0,45.0,44.0,48.0,53.0,60.0,56.0,46.0,43.0,44.0,47.0,52.0,58.0,54.0,44.0,42.0,40.0,44.0,49.0,54.0,50.0,41.0,39.0,38.0,42.0,46.0,51.0,47.0,38.0,36.0,37.0,40.0,44.0,49.0,45.0,36.0,34.0,35.0,38.0,42.0,46.0,42.0,34.0,32.0,31.0,34.0,37.0,41.0,38.0,30.0,29.0,30.0,33.0,36.0,40.0,37.0,29.0,27.0,28.0,30.0,33.0,37.0,34.0,27.0,25.0,26.0,28.0,31.0,34.0,31.0,25.0,23.0,24.0,26.0,28.0,31.0,28.0]
  },
  "horizon_dates": ["2015-11-01","2015-11-02","2015-11-03","2015-11-04","2015-11-05","2015-11-06","2015-11-07","2015-11-08","2015-11-09","2015-11-10","2015-11-11","2015-11-12","2015-11-13","2015-11-14","2015-11-15","2015-11-16","2015-11-17","2015-11-18","2015-11-19","2015-11-20","2015-11-21","2015-11-22","2015-11-23","2015-11-24","2015-11-25","2015-11-26","2015-11-27","2015-11-28"],
  "actual": [26.0,23.0,21.0,22.0,24.0,27.0,25.0,20.0,19.0,20.0,22.0,24.0,27.0,25.0,20.0,18.0,19.0,21.0,23.0,26.0,24.0,19.0,18.0,20.0,23.0,26.0,21.0,18.0],
  "forecast": [25.5,22.6,20.7,21.6,23.6,26.5,24.6,19.7,18.8,19.7,21.6,23.6,26.5,24.6,19.7,17.8,18.7,20.6,22.6,25.5,23.6,18.8,17.8,19.7,22.6,25.5,20.7,17.8],
  "metrics": {
    "accuracy": 84.0,
    "coherence": 80.0,
    "coherence_label": "Strong",
    "smape": 16.0,
    "mae": 1.74,
    "rmse": 2.18
  },
  "velocity": { "value": -22.0, "status": "Declining" },
  "inventory": {
    "on_hand": 308,
    "safety_stock": 34.0,
    "reorder_point": 176.0,
    "horizon_demand": 624.4,
    "cover_days": 14,
    "stockout_risk": "Medium",
    "overstock": false,
    "recommended_order_qty": 350,
    "projected_stock": [282.5,259.9,239.2,217.6,194.0,167.5,142.9,123.2,104.4,84.7,63.1,39.5,13.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]
  },
  "explainability": {
    "event_contribution_pct": 2.0,
    "snap_days_in_horizon": 8,
    "narrative": [
      "Demand is Declining (-22% vs the prior 28 days).",
      "November is a low-demand month for Vanilla Ice Cream (~-34% vs average).",
      "No summer event falls in this window — peak demand is Labor Day.",
      "Events account for ~+2% of predicted demand in this window."
    ],
    "factors": [
      { "label": "Event uplift", "value": 2.0, "kind": "event" },
      { "label": "Seasonality", "value": -34.0, "kind": "seasonal" },
      { "label": "Trend", "value": -22.0, "kind": "trend" }
    ]
  },
  "events_in_horizon": [
    { "date": "2015-11-26", "name": "Thanksgiving", "type": "National" }
  ],
  "seasonal": {
    "month": 11,
    "month_vs_avg_pct": -34.0,
    "monthly_avg": [22.0,24.0,28.0,34.0,42.0,52.0,58.0,55.0,48.0,36.0,21.0,18.0],
    "weekday_avg": [33.6,29.1,27.4,27.9,30.2,33.8,38.4]
  },
  "event_uplift": { "LaborDay": 88.0, "IndependenceDay": 64.0 }
}
```

#### `frontend/mock/fixtures/cocoa.json` (Seasonal — winter, ramping up into November, `02` §2)
```json
{
  "series_id": "cocoa",
  "item_id": "FOODS_3_073",
  "product_name": "Hot Cocoa Mix",
  "history": {
    "dates": ["2015-08-09","2015-08-10","2015-08-11","2015-08-12","2015-08-13","2015-08-14","2015-08-15","2015-08-16","2015-08-17","2015-08-18","2015-08-19","2015-08-20","2015-08-21","2015-08-22","2015-08-23","2015-08-24","2015-08-25","2015-08-26","2015-08-27","2015-08-28","2015-08-29","2015-08-30","2015-08-31","2015-09-01","2015-09-02","2015-09-03","2015-09-04","2015-09-05","2015-09-06","2015-09-07","2015-09-08","2015-09-09","2015-09-10","2015-09-11","2015-09-12","2015-09-13","2015-09-14","2015-09-15","2015-09-16","2015-09-17","2015-09-18","2015-09-19","2015-09-20","2015-09-21","2015-09-22","2015-09-23","2015-09-24","2015-09-25","2015-09-26","2015-09-27","2015-09-28","2015-09-29","2015-09-30","2015-10-01","2015-10-02","2015-10-03","2015-10-04","2015-10-05","2015-10-06","2015-10-07","2015-10-08","2015-10-09","2015-10-10","2015-10-11","2015-10-12","2015-10-13","2015-10-14","2015-10-15","2015-10-16","2015-10-17","2015-10-18","2015-10-19","2015-10-20","2015-10-21","2015-10-22","2015-10-23","2015-10-24","2015-10-25","2015-10-26","2015-10-27","2015-10-28","2015-10-29","2015-10-30","2015-10-31"],
    "units": [2.0,1.0,2.0,3.0,2.0,3.0,3.0,2.0,1.0,2.0,2.0,3.0,4.0,3.0,2.0,2.0,3.0,3.0,4.0,4.0,3.0,2.0,3.0,3.0,4.0,5.0,4.0,3.0,3.0,4.0,4.0,5.0,6.0,5.0,4.0,4.0,5.0,5.0,6.0,7.0,6.0,5.0,5.0,6.0,7.0,8.0,9.0,8.0,6.0,6.0,7.0,8.0,9.0,11.0,10.0,8.0,8.0,9.0,11.0,12.0,14.0,13.0,10.0,10.0,12.0,14.0,16.0,18.0,16.0,13.0,13.0,15.0,18.0,21.0,23.0,21.0,17.0,17.0,20.0,24.0,28.0,30.0,27.0,22.0]
  },
  "horizon_dates": ["2015-11-01","2015-11-02","2015-11-03","2015-11-04","2015-11-05","2015-11-06","2015-11-07","2015-11-08","2015-11-09","2015-11-10","2015-11-11","2015-11-12","2015-11-13","2015-11-14","2015-11-15","2015-11-16","2015-11-17","2015-11-18","2015-11-19","2015-11-20","2015-11-21","2015-11-22","2015-11-23","2015-11-24","2015-11-25","2015-11-26","2015-11-27","2015-11-28"],
  "actual": [23.0,20.0,22.0,26.0,30.0,33.0,29.0,24.0,26.0,30.0,35.0,39.0,34.0,28.0,31.0,36.0,42.0,46.0,40.0,33.0,36.0,42.0,49.0,54.0,47.0,52.0,38.0,32.0],
  "forecast": [22.6,19.7,21.6,25.5,29.4,32.3,28.5,23.6,25.5,29.4,34.3,38.2,33.3,27.5,30.4,35.3,41.2,45.1,39.2,32.3,35.3,41.2,48.0,52.9,46.1,50.9,37.2,31.4],
  "metrics": {
    "accuracy": 82.5,
    "coherence": 84.0,
    "coherence_label": "Strong",
    "smape": 17.5,
    "mae": 2.34,
    "rmse": 3.02
  },
  "velocity": { "value": 78.0, "status": "Accelerating" },
  "inventory": {
    "on_hand": 196,
    "safety_stock": 32.0,
    "reorder_point": 118.0,
    "horizon_demand": 968.6,
    "cover_days": 6,
    "stockout_risk": "High",
    "overstock": false,
    "recommended_order_qty": 805,
    "projected_stock": [173.4,153.7,132.1,106.6,77.2,44.9,16.4,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]
  },
  "explainability": {
    "event_contribution_pct": 18.0,
    "snap_days_in_horizon": 8,
    "narrative": [
      "Demand is Accelerating (+78% vs the prior 28 days).",
      "November is a high-demand month for Hot Cocoa Mix (~+112% vs average).",
      "Thanksgiving falls in this window — a mild +28% swing for winter warmers.",
      "Events account for ~+18% of predicted demand in this window."
    ],
    "factors": [
      { "label": "Event uplift", "value": 18.0, "kind": "event" },
      { "label": "Seasonality", "value": 112.0, "kind": "seasonal" },
      { "label": "Trend", "value": 78.0, "kind": "trend" }
    ]
  },
  "events_in_horizon": [
    { "date": "2015-11-26", "name": "Thanksgiving", "type": "National" }
  ],
  "seasonal": {
    "month": 11,
    "month_vs_avg_pct": 112.0,
    "monthly_avg": [18.0,14.0,9.0,6.0,4.0,3.0,2.0,2.0,3.0,8.0,21.0,28.0],
    "weekday_avg": [11.8,9.2,8.4,8.7,9.9,11.6,13.4]
  },
  "event_uplift": { "Thanksgiving": 28.0, "Christmas": -100.0 }
}
```

#### `frontend/mock/fixtures/chips.json` (Event-driven — Super Bowl, flat in November, `02` §2)
```json
{
  "series_id": "chips",
  "item_id": "FOODS_2_022",
  "product_name": "Tortilla Chips",
  "history": {
    "dates": ["2015-08-09","2015-08-10","2015-08-11","2015-08-12","2015-08-13","2015-08-14","2015-08-15","2015-08-16","2015-08-17","2015-08-18","2015-08-19","2015-08-20","2015-08-21","2015-08-22","2015-08-23","2015-08-24","2015-08-25","2015-08-26","2015-08-27","2015-08-28","2015-08-29","2015-08-30","2015-08-31","2015-09-01","2015-09-02","2015-09-03","2015-09-04","2015-09-05","2015-09-06","2015-09-07","2015-09-08","2015-09-09","2015-09-10","2015-09-11","2015-09-12","2015-09-13","2015-09-14","2015-09-15","2015-09-16","2015-09-17","2015-09-18","2015-09-19","2015-09-20","2015-09-21","2015-09-22","2015-09-23","2015-09-24","2015-09-25","2015-09-26","2015-09-27","2015-09-28","2015-09-29","2015-09-30","2015-10-01","2015-10-02","2015-10-03","2015-10-04","2015-10-05","2015-10-06","2015-10-07","2015-10-08","2015-10-09","2015-10-10","2015-10-11","2015-10-12","2015-10-13","2015-10-14","2015-10-15","2015-10-16","2015-10-17","2015-10-18","2015-10-19","2015-10-20","2015-10-21","2015-10-22","2015-10-23","2015-10-24","2015-10-25","2015-10-26","2015-10-27","2015-10-28","2015-10-29","2015-10-30","2015-10-31"],
    "units": [24.0,22.0,21.0,23.0,27.0,33.0,30.0,23.0,22.0,23.0,26.0,29.0,34.0,31.0,24.0,22.0,23.0,25.0,28.0,33.0,30.0,23.0,22.0,24.0,27.0,30.0,28.0,23.0,22.0,24.0,26.0,30.0,35.0,32.0,24.0,23.0,24.0,26.0,29.0,34.0,31.0,24.0,23.0,24.0,27.0,30.0,28.0,24.0,23.0,25.0,27.0,31.0,36.0,33.0,25.0,24.0,25.0,27.0,30.0,35.0,32.0,25.0,24.0,25.0,28.0,31.0,29.0,25.0,24.0,26.0,28.0,32.0,37.0,34.0,26.0,25.0,26.0,28.0,31.0,36.0,33.0,26.0,25.0,27.0]
  },
  "horizon_dates": ["2015-11-01","2015-11-02","2015-11-03","2015-11-04","2015-11-05","2015-11-06","2015-11-07","2015-11-08","2015-11-09","2015-11-10","2015-11-11","2015-11-12","2015-11-13","2015-11-14","2015-11-15","2015-11-16","2015-11-17","2015-11-18","2015-11-19","2015-11-20","2015-11-21","2015-11-22","2015-11-23","2015-11-24","2015-11-25","2015-11-26","2015-11-27","2015-11-28"],
  "actual": [29.0,27.0,26.0,28.0,31.0,37.0,34.0,27.0,26.0,28.0,30.0,33.0,38.0,35.0,27.0,26.0,28.0,30.0,34.0,40.0,37.0,30.0,32.0,38.0,44.0,49.0,38.0,30.0],
  "forecast": [28.5,26.5,25.5,27.5,30.4,36.3,33.3,26.5,25.5,27.5,29.4,32.3,37.2,34.3,26.5,25.5,27.5,29.4,33.3,39.2,36.3,29.4,31.4,37.2,43.1,48.0,37.2,29.4],
  "metrics": {
    "accuracy": 83.6,
    "coherence": 81.0,
    "coherence_label": "Strong",
    "smape": 16.4,
    "mae": 2.04,
    "rmse": 2.58
  },
  "velocity": { "value": 14.0, "status": "Growing" },
  "inventory": {
    "on_hand": 392,
    "safety_stock": 36.0,
    "reorder_point": 218.0,
    "horizon_demand": 902.7,
    "cover_days": 12,
    "stockout_risk": "Medium",
    "overstock": false,
    "recommended_order_qty": 547,
    "projected_stock": [363.5,337.0,311.5,284.0,253.6,217.3,184.0,157.5,132.0,104.5,75.1,42.8,5.6,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]
  },
  "explainability": {
    "event_contribution_pct": 12.0,
    "snap_days_in_horizon": 8,
    "narrative": [
      "Demand is Growing (+14% vs the prior 28 days).",
      "November is an average month for Tortilla Chips (~+6% vs average).",
      "Thanksgiving falls in this window — a modest +18% party-snack swing.",
      "Events account for ~+12% of predicted demand in this window."
    ],
    "factors": [
      { "label": "Event uplift", "value": 12.0, "kind": "event" },
      { "label": "Seasonality", "value": 6.0, "kind": "seasonal" },
      { "label": "Trend", "value": 14.0, "kind": "trend" }
    ]
  },
  "events_in_horizon": [
    { "date": "2015-11-26", "name": "Thanksgiving", "type": "National" }
  ],
  "seasonal": {
    "month": 11,
    "month_vs_avg_pct": 6.0,
    "monthly_avg": [29.0,34.0,27.0,26.0,28.0,30.0,32.0,29.0,27.0,28.0,31.0,33.0],
    "weekday_avg": [33.8,28.4,26.6,27.1,29.4,33.2,38.6]
  },
  "event_uplift": { "SuperBowl": 136.0, "Thanksgiving": 18.0, "IndependenceDay": 44.0 }
}
```

#### `frontend/mock/fixtures/milk.json` (Stable baseline — high volume, flat, Low risk, `02` §2)
```json
{
  "series_id": "milk",
  "item_id": "FOODS_3_586",
  "product_name": "Fresh Whole Milk",
  "history": {
    "dates": ["2015-08-09","2015-08-10","2015-08-11","2015-08-12","2015-08-13","2015-08-14","2015-08-15","2015-08-16","2015-08-17","2015-08-18","2015-08-19","2015-08-20","2015-08-21","2015-08-22","2015-08-23","2015-08-24","2015-08-25","2015-08-26","2015-08-27","2015-08-28","2015-08-29","2015-08-30","2015-08-31","2015-09-01","2015-09-02","2015-09-03","2015-09-04","2015-09-05","2015-09-06","2015-09-07","2015-09-08","2015-09-09","2015-09-10","2015-09-11","2015-09-12","2015-09-13","2015-09-14","2015-09-15","2015-09-16","2015-09-17","2015-09-18","2015-09-19","2015-09-20","2015-09-21","2015-09-22","2015-09-23","2015-09-24","2015-09-25","2015-09-26","2015-09-27","2015-09-28","2015-09-29","2015-09-30","2015-10-01","2015-10-02","2015-10-03","2015-10-04","2015-10-05","2015-10-06","2015-10-07","2015-10-08","2015-10-09","2015-10-10","2015-10-11","2015-10-12","2015-10-13","2015-10-14","2015-10-15","2015-10-16","2015-10-17","2015-10-18","2015-10-19","2015-10-20","2015-10-21","2015-10-22","2015-10-23","2015-10-24","2015-10-25","2015-10-26","2015-10-27","2015-10-28","2015-10-29","2015-10-30","2015-10-31"],
    "units": [186.0,182.0,179.0,188.0,196.0,205.0,201.0,184.0,180.0,183.0,190.0,197.0,206.0,200.0,185.0,181.0,184.0,189.0,195.0,204.0,199.0,183.0,180.0,182.0,191.0,198.0,194.0,184.0,181.0,185.0,192.0,199.0,207.0,202.0,186.0,182.0,184.0,190.0,196.0,205.0,200.0,184.0,181.0,183.0,191.0,198.0,193.0,185.0,182.0,186.0,193.0,200.0,208.0,203.0,187.0,183.0,185.0,191.0,197.0,206.0,201.0,185.0,182.0,184.0,192.0,199.0,195.0,186.0,183.0,187.0,194.0,201.0,209.0,204.0,188.0,184.0,186.0,192.0,198.0,207.0,202.0,186.0,183.0,185.0]
  },
  "horizon_dates": ["2015-11-01","2015-11-02","2015-11-03","2015-11-04","2015-11-05","2015-11-06","2015-11-07","2015-11-08","2015-11-09","2015-11-10","2015-11-11","2015-11-12","2015-11-13","2015-11-14","2015-11-15","2015-11-16","2015-11-17","2015-11-18","2015-11-19","2015-11-20","2015-11-21","2015-11-22","2015-11-23","2015-11-24","2015-11-25","2015-11-26","2015-11-27","2015-11-28"],
  "actual": [193.0,200.0,208.0,203.0,187.0,184.0,186.0,193.0,199.0,208.0,203.0,187.0,183.0,185.0,192.0,199.0,207.0,202.0,186.0,189.0,196.0,205.0,214.0,222.0,210.0,228.0,198.0,188.0],
  "forecast": [192.0,199.0,207.0,202.0,186.0,183.0,185.0,192.0,198.0,207.0,202.0,186.0,182.0,184.0,191.0,198.0,206.0,201.0,185.0,188.0,195.0,204.0,213.0,221.0,209.0,227.0,197.0,187.0],
  "metrics": {
    "accuracy": 94.2,
    "coherence": 90.0,
    "coherence_label": "Strong",
    "smape": 5.8,
    "mae": 1.02,
    "rmse": 1.31
  },
  "velocity": { "value": 3.0, "status": "Stable" },
  "inventory": {
    "on_hand": 2716,
    "safety_stock": 96.0,
    "reorder_point": 1438.0,
    "horizon_demand": 5563.0,
    "cover_days": 13,
    "stockout_risk": "Medium",
    "overstock": false,
    "recommended_order_qty": 2943,
    "projected_stock": [2524.0,2325.0,2118.0,1916.0,1730.0,1547.0,1362.0,1170.0,972.0,765.0,563.0,377.0,195.0,11.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]
  },
  "explainability": {
    "event_contribution_pct": 1.0,
    "snap_days_in_horizon": 8,
    "narrative": [
      "Demand is Stable (+3% vs the prior 28 days).",
      "November is an average month for Fresh Whole Milk (~+2% vs average).",
      "Thanksgiving falls in this window — a small +9% staple swing.",
      "Events account for ~+1% of predicted demand in this window."
    ],
    "factors": [
      { "label": "Event uplift", "value": 1.0, "kind": "event" },
      { "label": "Seasonality", "value": 2.0, "kind": "seasonal" },
      { "label": "Trend", "value": 3.0, "kind": "trend" }
    ]
  },
  "events_in_horizon": [
    { "date": "2015-11-26", "name": "Thanksgiving", "type": "National" }
  ],
  "seasonal": {
    "month": 11,
    "month_vs_avg_pct": 2.0,
    "monthly_avg": [185.0,184.0,186.0,188.0,190.0,189.0,191.0,190.0,188.0,189.0,192.0,196.0],
    "weekday_avg": [201.4,189.6,185.2,186.1,191.8,198.7,206.3]
  },
  "event_uplift": { "Thanksgiving": 9.0, "Christmas": -100.0 }
}
```

#### `frontend/mock/fixtures/bread.json` (Stable baseline — flattest, slow decline, Low risk, `02` §2)
```json
{
  "series_id": "bread",
  "item_id": "FOODS_3_080",
  "product_name": "Sliced White Bread",
  "history": {
    "dates": ["2015-08-09","2015-08-10","2015-08-11","2015-08-12","2015-08-13","2015-08-14","2015-08-15","2015-08-16","2015-08-17","2015-08-18","2015-08-19","2015-08-20","2015-08-21","2015-08-22","2015-08-23","2015-08-24","2015-08-25","2015-08-26","2015-08-27","2015-08-28","2015-08-29","2015-08-30","2015-08-31","2015-09-01","2015-09-02","2015-09-03","2015-09-04","2015-09-05","2015-09-06","2015-09-07","2015-09-08","2015-09-09","2015-09-10","2015-09-11","2015-09-12","2015-09-13","2015-09-14","2015-09-15","2015-09-16","2015-09-17","2015-09-18","2015-09-19","2015-09-20","2015-09-21","2015-09-22","2015-09-23","2015-09-24","2015-09-25","2015-09-26","2015-09-27","2015-09-28","2015-09-29","2015-09-30","2015-10-01","2015-10-02","2015-10-03","2015-10-04","2015-10-05","2015-10-06","2015-10-07","2015-10-08","2015-10-09","2015-10-10","2015-10-11","2015-10-12","2015-10-13","2015-10-14","2015-10-15","2015-10-16","2015-10-17","2015-10-18","2015-10-19","2015-10-20","2015-10-21","2015-10-22","2015-10-23","2015-10-24","2015-10-25","2015-10-26","2015-10-27","2015-10-28","2015-10-29","2015-10-30","2015-10-31"],
    "units": [144.0,141.0,139.0,146.0,151.0,158.0,154.0,142.0,139.0,141.0,147.0,152.0,159.0,155.0,143.0,140.0,142.0,146.0,151.0,157.0,153.0,141.0,138.0,140.0,147.0,152.0,149.0,142.0,139.0,142.0,148.0,153.0,160.0,156.0,143.0,140.0,141.0,146.0,151.0,158.0,154.0,141.0,138.0,140.0,146.0,152.0,148.0,142.0,139.0,142.0,148.0,153.0,159.0,155.0,143.0,139.0,141.0,145.0,150.0,157.0,153.0,141.0,138.0,140.0,146.0,151.0,148.0,142.0,139.0,142.0,147.0,152.0,159.0,155.0,142.0,138.0,140.0,144.0,149.0,156.0,152.0,140.0,137.0,139.0]
  },
  "horizon_dates": ["2015-11-01","2015-11-02","2015-11-03","2015-11-04","2015-11-05","2015-11-06","2015-11-07","2015-11-08","2015-11-09","2015-11-10","2015-11-11","2015-11-12","2015-11-13","2015-11-14","2015-11-15","2015-11-16","2015-11-17","2015-11-18","2015-11-19","2015-11-20","2015-11-21","2015-11-22","2015-11-23","2015-11-24","2015-11-25","2015-11-26","2015-11-27","2015-11-28"],
  "actual": [146.0,151.0,158.0,154.0,141.0,138.0,140.0,145.0,150.0,157.0,153.0,140.0,137.0,139.0,144.0,149.0,156.0,152.0,140.0,142.0,148.0,154.0,161.0,167.0,158.0,172.0,150.0,142.0],
  "forecast": [145.0,150.0,157.0,153.0,140.0,137.0,139.0,144.0,149.0,156.0,152.0,139.0,136.0,138.0,143.0,148.0,155.0,151.0,139.0,141.0,147.0,153.0,160.0,166.0,157.0,171.0,149.0,141.0],
  "metrics": {
    "accuracy": 95.1,
    "coherence": 91.0,
    "coherence_label": "Strong",
    "smape": 4.9,
    "mae": 0.98,
    "rmse": 1.18
  },
  "velocity": { "value": 1.0, "status": "Stable" },
  "inventory": {
    "on_hand": 2044,
    "safety_stock": 78.0,
    "reorder_point": 1092.0,
    "horizon_demand": 4214.0,
    "cover_days": 13,
    "stockout_risk": "Medium",
    "overstock": false,
    "recommended_order_qty": 2248,
    "projected_stock": [1899.0,1749.0,1592.0,1439.0,1299.0,1162.0,1023.0,879.0,730.0,574.0,422.0,283.0,147.0,9.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]
  },
  "explainability": {
    "event_contribution_pct": 1.0,
    "snap_days_in_horizon": 8,
    "narrative": [
      "Demand is Stable (+1% vs the prior 28 days).",
      "November is an average month for Sliced White Bread (~+1% vs average).",
      "Thanksgiving falls in this window — a small +7% staple swing.",
      "Events account for ~+1% of predicted demand in this window."
    ],
    "factors": [
      { "label": "Event uplift", "value": 1.0, "kind": "event" },
      { "label": "Seasonality", "value": 1.0, "kind": "seasonal" },
      { "label": "Trend", "value": 1.0, "kind": "trend" }
    ]
  },
  "events_in_horizon": [
    { "date": "2015-11-26", "name": "Thanksgiving", "type": "National" }
  ],
  "seasonal": {
    "month": 11,
    "month_vs_avg_pct": 1.0,
    "monthly_avg": [142.0,141.0,142.0,143.0,144.0,143.0,144.0,143.0,142.0,143.0,144.0,146.0],
    "weekday_avg": [154.6,145.2,141.8,142.4,146.9,152.1,158.0]
  },
  "event_uplift": { "Thanksgiving": 7.0, "Christmas": -100.0 }
}
```

### Run command + pointing `VITE_API_BASE` at the mock (`05` §9)
```bash
# from frontend/ — no install needed (built-in http only)
node mock/server.mjs
# -> [MT-25] mock API server on http://localhost:8000 (CORS *)
```
In `frontend/.env` (created in MT-02/MT-31), set:
```dotenv
# during MT-30..MT-41 — frontend talks to the mock
VITE_API_BASE=http://localhost:8000
# for MT-46 integration — swap to the real backend (same value here since both use :8000)
# VITE_API_BASE=http://localhost:8000
```
The frontend reads `import.meta.env.VITE_API_BASE` (MT-31); swapping mock ↔ backend is a single
env change with **no code changes** (`05` §9).

## 6. Tests / Verification (exact commands)
Mock fixtures are also consumed by frontend tests (`07` §3) and by the MT-46 smoke test. Verify
shapes match `05`:
```bash
# terminal 1 — start the mock (from frontend/)
node mock/server.mjs

# terminal 2 — curl each endpoint
curl -s http://localhost:8000/api/health
# {"status":"ok","model_loaded":true,"version":"1.0.0"}

curl -s http://localhost:8000/api/calendar/bounds
# exact 05 §4 object

curl -s http://localhost:8000/api/products | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d).products;console.log('products:',p.length, p.map(x=>x.series_id).join(','));})"
# products: 8 turkey,candy,strawberries,icecream,cocoa,chips,milk,bread

curl -s -X POST http://localhost:8000/api/forecast -H "content-type: application/json" \
  -d '{"product_ids":["turkey","milk"],"start_date":"2015-11-01"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const b=JSON.parse(d);const r=b.results[0];console.log('start',b.start_date,'horizon',b.horizon,'results',b.results.length,'forecast',r.forecast.length,'history',r.history.units.length,'projected',r.inventory.projected_stock.length,'order',r.series_id===b.results[0].series_id);console.log('summary',JSON.stringify(b.summary));})"
# start 2015-11-01 horizon 28 results 2 forecast 28 history 84 projected 28 true
```
Optional length assertion across all fixtures:
```bash
# from frontend/ — verify every fixture has the locked array lengths (05 §5)
node -e "const fs=require('fs');for(const id of ['turkey','candy','strawberries','icecream','cocoa','chips','milk','bread']){const f=JSON.parse(fs.readFileSync('mock/fixtures/'+id+'.json'));const ok=f.history.dates.length===84&&f.history.units.length===84&&f.horizon_dates.length===28&&f.actual.length===28&&f.forecast.length===28&&f.inventory.projected_stock.length===28&&f.seasonal.monthly_avg.length===12&&f.seasonal.weekday_avg.length===7;console.log(id,ok?'OK':'BAD');}"
# every line ends OK
```

## 7. Acceptance checklist
- [ ] `frontend/mock/server.mjs` exists, uses **only** Node built-ins (no npm deps), listens on port **8000**, and prints a startup line.
- [ ] `GET /api/health`, `GET /api/products`, `GET /api/calendar/bounds` return the exact `05` §2/§3/§4 literals; products are 8 in `SERIES_IDS` order.
- [ ] `POST /api/forecast` loads `fixtures/<id>.json` per requested product (deduped, order-preserved, capped at 8), echoes `start_date`, returns `horizon:28`, and builds `summary` per the `05` §5 rules (`total_predicted_demand`, `high_risk_count`, `avg_velocity` capped at 999, `avg_accuracy`, `active_events` deduped+sorted).
- [ ] Invalid/empty `product_ids` → 422 `{error,message,field}`; unknown route → 404; thrown error → 500 (`05` §6/§7). `start_date` range is **not** enforced (`05` §9).
- [ ] CORS `*` + `OPTIONS` preflight handled so the Vite dev server can call it.
- [ ] All 8 fixtures (`turkey,candy,strawberries,icecream,cocoa,chips,milk,bread`) exist, are valid `ForecastResult`s (`05` §5), with array lengths 84/84/28/28/28/28 and 12/7, and metrics/velocity/inventory/explainability/seasonal/event_uplift consistent with each archetype (`02` §2).
- [ ] Run command documented (`node mock/server.mjs` from `frontend/`) and the `VITE_API_BASE` swap (`05` §9) — no frontend code change to switch mock ↔ backend.
- [ ] The verification curls return the shapes above; the fixture length-check prints OK for all 8.
