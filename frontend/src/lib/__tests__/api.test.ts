import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, postForecast } from "../api";
import type { ForecastResponse } from "../types";
import turkeyFixture from "../../../mock/fixtures/turkey.json";

// Build a minimal ForecastResponse around the committed per-product fixture.
function buildResponse(): ForecastResponse {
  const result = turkeyFixture as unknown as ForecastResponse["results"][number];
  return {
    start_date: "2015-11-01",
    horizon: 28,
    summary: {
      total_predicted_demand: result.inventory.horizon_demand,
      high_risk_count: result.inventory.stockout_risk === "High" ? 1 : 0,
      avg_velocity: result.velocity.value,
      avg_accuracy: result.metrics.accuracy,
      active_events: result.events_in_horizon,
    },
    results: [result],
  };
}

afterEach(() => vi.restoreAllMocks());

describe("api.ts (MT-31)", () => {
  it("parses a fixture ForecastResponse into typed objects without throwing", async () => {
    const payload = buildResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );

    const res = await postForecast({ product_ids: ["turkey"], start_date: "2015-11-01" });
    expect(res.horizon).toBe(28);
    expect(res.results).toHaveLength(1);
    const r = res.results[0];
    expect(r.forecast).toHaveLength(28);
    expect(r.history.units).toHaveLength(84);
    expect(["Strong", "Moderate", "Weak"]).toContain(r.metrics.coherence_label);
    expect(typeof r.velocity.value).toBe("number");
  });

  it("throws a typed ApiError carrying the 05 §7 body on non-2xx", async () => {
    const errBody = {
      error: "validation_error",
      message: "start_date 2016-12-01 is outside the selectable range [2014-01-28, 2016-04-25].",
      field: "start_date",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(errBody), { status: 422 })),
    );

    await expect(
      postForecast({ product_ids: ["turkey"], start_date: "2016-12-01" }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      error: "validation_error",
      field: "start_date",
      message: errBody.message,
    });

    await expect(
      postForecast({ product_ids: ["turkey"], start_date: "2016-12-01" }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
