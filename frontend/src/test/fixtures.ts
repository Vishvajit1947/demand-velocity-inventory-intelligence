// MT-44 — load committed fixtures (MT-25) and build a ForecastResponse (05 §5) for tests.
// Tests import from here; expected values are read from the fixtures, not hardcoded,
// so the test stays correct if MT-25 regenerates fixtures (07 §1 deterministic).
import type { ForecastResponse, ForecastResult, Summary, EventInfo } from "../lib/types";

import turkeyJson from "../../mock/fixtures/turkey.json";
import milkJson from "../../mock/fixtures/milk.json";

// Cast the imported JSON to the contract type (05 §5).
// If the cast were wrong the api.test.ts parse test would surface it.
export const turkeyResult = turkeyJson as unknown as ForecastResult;
export const milkResult = milkJson as unknown as ForecastResult;

/** Build a valid ForecastResponse from results, aggregating `summary` per 05 §5. */
export function buildForecastResponse(
  results: ForecastResult[],
  start_date = "2015-11-01",
): ForecastResponse {
  const summary: Summary = {
    total_predicted_demand: results.reduce((s, r) => s + r.inventory.horizon_demand, 0),
    high_risk_count: results.filter((r) => r.inventory.stockout_risk === "High").length,
    // avg_velocity: mean of min(velocity.value, 999) per 05 §5
    avg_velocity:
      results.reduce((s, r) => s + Math.min(r.velocity.value, 999), 0) / results.length,
    avg_accuracy: results.reduce((s, r) => s + r.metrics.accuracy, 0) / results.length,
    active_events: dedupeEvents(results.flatMap((r) => r.events_in_horizon)),
  };
  return { start_date, horizon: 28, summary, results };
}

function dedupeEvents(events: EventInfo[]): EventInfo[] {
  const seen = new Set<string>();
  const out: EventInfo[] = [];
  for (const e of events) {
    const key = `${e.date}|${e.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(e);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
