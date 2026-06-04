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
  { series_id: "turkey",       item_id: "FOODS_3_069", name: "Fresh Whole Turkey",  dept_id: "FOODS_3", archetype: "Event-driven",        overall_mean: 18.6,  seasonal_cv: 1.25 },
  { series_id: "candy",        item_id: "FOODS_1_206", name: "Halloween Candy",     dept_id: "FOODS_1", archetype: "Event-driven",        overall_mean: 14.2,  seasonal_cv: 1.10 },
  { series_id: "strawberries", item_id: "FOODS_1_123", name: "Fresh Strawberries",  dept_id: "FOODS_1", archetype: "Perishable seasonal", overall_mean: 22.4,  seasonal_cv: 0.62 },
  { series_id: "icecream",     item_id: "FOODS_3_660", name: "Vanilla Ice Cream",   dept_id: "FOODS_3", archetype: "Seasonal",            overall_mean: 31.7,  seasonal_cv: 0.55 },
  { series_id: "cocoa",        item_id: "FOODS_1_116", name: "Hot Cocoa Mix",       dept_id: "FOODS_1", archetype: "Seasonal",            overall_mean: 9.8,   seasonal_cv: 0.95 },
  { series_id: "chips",        item_id: "FOODS_2_022", name: "Tortilla Chips",      dept_id: "FOODS_2", archetype: "Event-driven",        overall_mean: 27.5,  seasonal_cv: 0.34 },
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
