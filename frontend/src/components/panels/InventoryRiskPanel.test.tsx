/**
 * InventoryRiskPanel tests — MT-40.
 * 07 §3: "InventoryRiskPanel shows recommended_order_qty".
 * Vitest + RTL; recharts and react-countup mocked for jsdom compatibility.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// ── Mock react-countup: render end value immediately so it's assertable ──
vi.mock("react-countup", () => ({
  default: ({ end, separator: _sep = "," }: { end: number; separator?: string }) => (
    <span>{end.toLocaleString("en-US")}</span>
  ),
}));

// ── Mock recharts: jsdom has no layout engine, so containers are 0×0.
//    We render enough DOM nodes for test-id and text assertions to work.
vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Pass,
    LineChart: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="linechart">{children}</div>
    ),
    // Forward data-testid exactly — component uses "stock-line-safe" and "stock-line-danger"
    Line: (props: { "data-testid"?: string }) => (
      <div data-testid={props["data-testid"]} />
    ),
    ReferenceLine: (props: { "data-testid"?: string }) => (
      <div data-testid={props["data-testid"]} />
    ),
    ReferenceDot: (props: { "data-testid"?: string }) => (
      <div data-testid={props["data-testid"]} />
    ),
    XAxis: Pass,
    YAxis: Pass,
    CartesianGrid: Pass,
    Tooltip: Pass,
  };
});

import { InventoryRiskPanel } from "./InventoryRiskPanel";
import type { ForecastResult, RiskLevel } from "../../lib/types";

// ── Fixture builder ──────────────────────────────────────────────────────────
function makeResult(
  over: { risk?: RiskLevel; overstock?: boolean; coverDays?: number } = {},
): ForecastResult {
  return {
    series_id: "turkey",
    item_id: "FOODS_3_069",
    product_name: "Fresh Whole Turkey",
    horizon_dates: Array.from({ length: 28 }, (_, i) =>
      `2015-11-${String(i + 1).padStart(2, "0")}`,
    ),
    history: { dates: [], units: [] },
    actual:   Array.from({ length: 28 }, () => 10),
    forecast: Array.from({ length: 28 }, () => 11),
    metrics: {
      accuracy: 78.4,
      coherence: 71.0,
      coherence_label: "Moderate",
      smape: 24.1,
      mae: 3.21,
      rmse: 4.87,
    },
    velocity: { value: 412, status: "Accelerating" },
    inventory: {
      on_hand: 260,
      safety_stock: 41,
      reorder_point: 171,
      horizon_demand: 520,
      cover_days: over.coverDays ?? 9,
      stockout_risk: over.risk ?? "Medium",
      overstock: over.overstock ?? false,
      recommended_order_qty: 301,
      projected_stock: Array.from({ length: 28 }, (_, i) => 260 - i * 8),
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
  } as ForecastResult;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("InventoryRiskPanel", () => {
  it("renders the stockout-risk badge text", () => {
    render(<InventoryRiskPanel result={makeResult({ risk: "High" })} />);
    // StatusBadge kind="risk" renders label as "{risk} risk" — check for "High"
    expect(screen.getByText(/High/i)).toBeInTheDocument();
  });

  it("shows the recommended_order_qty headline number", () => {
    render(<InventoryRiskPanel result={makeResult()} />);
    expect(screen.getByTestId("reorder-qty")).toHaveTextContent("301");
  });

  it("renders the projected stock line and a safety-stock reference line", () => {
    render(<InventoryRiskPanel result={makeResult()} />);
    expect(screen.getByTestId("stock-line-safe")).toBeInTheDocument();
    expect(screen.getByTestId("safety-ref")).toBeInTheDocument();
  });

  it("draws the stockout marker only when cover_days <= 28", () => {
    const { rerender } = render(
      <InventoryRiskPanel result={makeResult({ coverDays: 9 })} />,
    );
    expect(screen.getByTestId("stockout-ref")).toBeInTheDocument();

    rerender(<InventoryRiskPanel result={makeResult({ coverDays: 99 })} />);
    expect(screen.queryByTestId("stockout-ref")).not.toBeInTheDocument();
  });

  it("toggles the Overstock pill on inventory.overstock", () => {
    const { rerender } = render(
      <InventoryRiskPanel result={makeResult({ overstock: false })} />,
    );
    expect(screen.queryByTestId("overstock-pill")).not.toBeInTheDocument();

    rerender(<InventoryRiskPanel result={makeResult({ overstock: true })} />);
    expect(screen.getByTestId("overstock-pill")).toHaveTextContent("Overstock");
  });

  it("renders the reorder card with supporting figures and caption", () => {
    render(<InventoryRiskPanel result={makeResult()} />);
    expect(screen.getByTestId("reorder-card")).toBeInTheDocument();
    expect(screen.getByText("On hand")).toBeInTheDocument();
    expect(screen.getByText("Reorder pt")).toBeInTheDocument();
    expect(screen.getByText("28d demand")).toBeInTheDocument();
    expect(
      screen.getByText("Simulated reorder model — illustrative."),
    ).toBeInTheDocument();
  });

  it("renders the chart container", () => {
    render(<InventoryRiskPanel result={makeResult()} />);
    expect(screen.getByTestId("projected-stock-chart")).toBeInTheDocument();
    expect(screen.getByTestId("linechart")).toBeInTheDocument();
  });
});
