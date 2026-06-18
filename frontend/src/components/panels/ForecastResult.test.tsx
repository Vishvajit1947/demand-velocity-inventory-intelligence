/**
 * ForecastResult tests (MT-34).
 * 07 §3: "given a fixture ForecastResult, renders actual + forecast series…"
 * Deterministic, offline. Recharts / ResponsiveContainer needs a sized wrapper in jsdom.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForecastResult } from "./ForecastResult";
import type { ForecastResult as FR } from "../../lib/types";

// ── Fixture factory ──────────────────────────────────────────────────────────
function makeResult(seriesId: string, name: string): FR {
  // 84 history dates: cycling through 3 months of August/September/October
  const histDates = Array.from({ length: 84 }, (_, i) => {
    const month = Math.floor(i / 28) + 8; // 8, 9, 10
    const day = (i % 28) + 1;
    return `2015-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
  // 28 horizon dates in November
  const horizonDates = Array.from({ length: 28 }, (_, i) =>
    `2015-11-${String(i + 1).padStart(2, "0")}`,
  );

  return {
    series_id: seriesId as FR["series_id"],
    item_id: "FOODS_3_069",
    product_name: name,
    history: {
      dates: histDates,
      units: histDates.map((_, i) => i % 10),
    },
    horizon_dates: horizonDates,
    actual: horizonDates.map((_, i) => 10 + (i % 5)),
    forecast: horizonDates.map((_, i) => 11 + (i % 5)),
    metrics: {
      accuracy: 78.4,
      coherence: 71,
      coherence_label: "Moderate",
      smape: 21.6,
      mae: 3.21,
      rmse: 4.87,
    },
    velocity: { value: 412, status: "Accelerating" },
    inventory: {
      on_hand: 260,
      safety_stock: 41,
      reorder_point: 171,
      horizon_demand: 520,
      cover_days: 9,
      stockout_risk: "Medium",
      overstock: false,
      recommended_order_qty: 301,
      projected_stock: horizonDates.map(() => 200),
    },
    explainability: {
      event_contribution_pct: 280.5,
      snap_days_in_horizon: 8,
      narrative: [],
      factors: [],
    },
    events_in_horizon: [],
    seasonal: {
      month: 11,
      month_vs_avg_pct: 220,
      monthly_avg: Array(12).fill(10),
      weekday_avg: Array(7).fill(10),
    },
    event_uplift: {},
  };
}

/** Wrap in a sized container so ResponsiveContainer can resolve dimensions in jsdom. */
function renderSized(ui: React.ReactElement) {
  return render(<div style={{ width: 800, height: 400 }}>{ui}</div>);
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("ForecastResult (MT-34)", () => {
  it("renders the actual and forecast series for a single product", () => {
    renderSized(
      <ForecastResult
        results={[makeResult("turkey", "Fresh Whole Turkey")]}
        activeSeriesId="turkey"
        startDate="2015-11-01"
      />,
    );

    // Panel heading
    expect(screen.getByText("Forecast Result")).toBeInTheDocument();
    // Legend entries prove both series are mounted
    expect(screen.getByText("Actual")).toBeInTheDocument();
    expect(screen.getByText("Forecast")).toBeInTheDocument();
  });

  it("covers a 28-day horizon (28 horizon dates feed the forecast line)", () => {
    const r = makeResult("turkey", "Fresh Whole Turkey");

    // Fixture integrity
    expect(r.horizon_dates).toHaveLength(28);
    expect(r.forecast).toHaveLength(28);

    renderSized(
      <ForecastResult
        results={[r]}
        activeSeriesId="turkey"
        startDate="2015-11-01"
      />,
    );
    // Forecast legend entry confirms the series is rendered
    expect(screen.getByText("Forecast")).toBeInTheDocument();
  });

  it("renders without crashing for 3 products and shows the ProductSwitcher", () => {
    const results = [
      makeResult("turkey", "Fresh Whole Turkey"),
      makeResult("milk", "Whole Milk"),
      makeResult("candy", "Candy"),
    ];

    renderSized(
      <ForecastResult
        results={results}
        activeSeriesId="turkey"
        startDate="2015-11-01"
      />,
    );

    // Multi-mode: legend entries include product name + "(forecast)" suffix
    // In normalized mode the label also includes "(avg Xu)" — match flexibly
    expect(
      screen.getByText(/Fresh Whole Turkey.*\(forecast\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Whole Milk.*\(forecast\)/)).toBeInTheDocument();
    expect(screen.getByText(/Candy.*\(forecast\)/)).toBeInTheDocument();

    // ProductSwitcher chips appear (product names in the switcher)
    // The switcher renders chip labels matching product_name values
    const turkeys = screen.getAllByText("Fresh Whole Turkey");
    expect(turkeys.length).toBeGreaterThanOrEqual(1);
  });

  it("shows the idle empty prompt when results are empty", () => {
    renderSized(<ForecastResult results={[]} startDate="2015-11-01" />);

    expect(
      screen.getByText(/Select a date & products, then Forecast/i),
    ).toBeInTheDocument();
  });
});
