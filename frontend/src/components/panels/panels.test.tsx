/**
 * MT-44 — panels.test.tsx
 * Each panel renders its headline number from the committed fixture (07 §3, 06 §4).
 * All tests are offline + deterministic — no running backend (07 §1).
 *
 * Recharts is mocked so jsdom's zero-size containers don't swallow content.
 * react-plotly.js is globally mocked in setup.ts (VelocityPanel, MT-37).
 * react-countup is mocked to render the final value synchronously.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Mock recharts globally for all panel renders in this file ─────────────
vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass,
    LineChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    BarChart: ({
      data,
      children,
    }: {
      data?: unknown[];
      children?: React.ReactNode;
    }) => (
      <div data-testid="barchart" data-rows={data?.length ?? 0}>
        {children}
      </div>
    ),
    Bar: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="bar">{children}</div>
    ),
    Line: () => <div />,
    Cell: ({
      fill,
      "data-testid": tid,
      "data-active": active,
    }: {
      fill?: string;
      "data-testid"?: string;
      "data-active"?: string;
    }) => <div data-testid={tid} data-fill={fill} data-active={active} />,
    XAxis: Pass,
    YAxis: Pass,
    CartesianGrid: Pass,
    Tooltip: () => null,
    ReferenceLine: (props: { "data-testid"?: string }) => (
      <div data-testid={props["data-testid"]} />
    ),
    LabelList: () => null,
    ReferenceArea: () => null,
    ReferenceDot: (props: { "data-testid"?: string }) => (
      <div data-testid={props["data-testid"]} />
    ),
  };
});

// ── Mock react-countup to render end value synchronously ──────────────────
vi.mock("react-countup", () => ({
  default: ({ end, separator = "," }: { end: number; separator?: string }) => (
    <span>
      {end.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        useGrouping: separator === ",",
      })}
    </span>
  ),
}));

// ── Import panels AFTER mocks ─────────────────────────────────────────────
import { ExecutiveOverview } from "./ExecutiveOverview";
import { VelocityPanel } from "./VelocityPanel";
import { EventImpactPanel } from "./EventImpactPanel";
import { SeasonalPanel } from "./SeasonalPanel";
import { InventoryRiskPanel } from "./InventoryRiskPanel";
import { ExplainabilityPanel } from "./ExplainabilityPanel";
import { buildForecastResponse, turkeyResult } from "../../test/fixtures";

const resp = buildForecastResponse([turkeyResult]);

describe("Panels render headline numbers from the fixture (06 §4; 07 §3)", () => {
  // ── ExecutiveOverview: total_predicted_demand ──────────────────────────
  it("ExecutiveOverview shows total_predicted_demand from the fixture", () => {
    render(<ExecutiveOverview summary={resp.summary} animate={false} />);
    // total_predicted_demand = turkey.inventory.horizon_demand = 1683.6 → rounds to 1684
    const total = Math.round(resp.summary.total_predicted_demand);
    // The countup mock renders the integer; allow comma-formatted match too
    const re = new RegExp(total.toLocaleString("en-US").replace(",", ",?"));
    expect(screen.getAllByText(re).length).toBeGreaterThan(0);
  });

  it("ExecutiveOverview shows high_risk_count from the fixture", () => {
    render(<ExecutiveOverview summary={resp.summary} animate={false} />);
    // turkey has stockout_risk=High → high_risk_count=1
    expect(resp.summary.high_risk_count).toBe(1);
    expect(screen.getByText("High-Risk Products")).toBeInTheDocument();
  });

  it("ExecutiveOverview shows avg_accuracy from the fixture", () => {
    render(<ExecutiveOverview summary={resp.summary} animate={false} />);
    // avg_accuracy = turkey.metrics.accuracy = 81.4 → rounds to 81
    expect(resp.summary.avg_accuracy).toBeCloseTo(turkeyResult.metrics.accuracy, 1);
  });

  // ── VelocityPanel: velocity.status badge ──────────────────────────────
  it("VelocityPanel shows the velocity.status text label (Plotly mocked in setup.ts)", () => {
    render(<VelocityPanel result={turkeyResult} />);
    // StatusBadge always shows the text label — never color alone (06 §6)
    expect(screen.getByText(turkeyResult.velocity.status)).toBeInTheDocument();
  });

  it("VelocityPanel renders the velocity-value overlay with the real un-clamped value", () => {
    render(<VelocityPanel result={turkeyResult} />);
    // turkey velocity.value = 412 → overlay shows "+412%"
    expect(screen.getByTestId("velocity-value")).toHaveTextContent("+412%");
  });

  // ── EventImpactPanel: chart renders all event_uplift rows ────────────
  it("EventImpactPanel renders all event_uplift rows in the chart", () => {
    render(<EventImpactPanel result={turkeyResult} />);
    // Turkey has Thanksgiving, VeteransDay, ValentinesDay in event_uplift (3 keys)
    const eventCount = Object.keys(turkeyResult.event_uplift).length;
    expect(screen.getByTestId("barchart")).toHaveAttribute(
      "data-rows",
      String(Math.min(eventCount, 5)),
    );
  });

  // ── SeasonalPanel: month_vs_avg_pct callout ───────────────────────────
  it("SeasonalPanel shows the month_vs_avg_pct callout from the fixture", () => {
    render(<SeasonalPanel result={turkeyResult} />);
    // turkey seasonal.month_vs_avg_pct = 220.0
    const pct = Math.round(turkeyResult.seasonal.month_vs_avg_pct).toString();
    const callout = screen.getByTestId("seasonal-callout");
    expect(callout.textContent).toMatch(new RegExp(pct));
  });

  it("SeasonalPanel shows the correct month name in the callout", () => {
    render(<SeasonalPanel result={turkeyResult} />);
    // turkey seasonal.month = 11 → "Nov"
    expect(screen.getByTestId("seasonal-callout").textContent).toMatch(/Nov/);
  });

  // ── InventoryRiskPanel: recommended_order_qty ─────────────────────────
  it("InventoryRiskPanel shows recommended_order_qty from the fixture (06 §4 P6)", () => {
    render(<InventoryRiskPanel result={turkeyResult} />);
    // turkey inventory.recommended_order_qty = 1543
    const qty = turkeyResult.inventory.recommended_order_qty;
    const reorderQty = screen.getByTestId("reorder-qty");
    expect(reorderQty.textContent).toMatch(new RegExp(qty.toLocaleString("en-US")));
  });

  it("InventoryRiskPanel shows the stockout_risk badge", () => {
    render(<InventoryRiskPanel result={turkeyResult} />);
    // turkey inventory.stockout_risk = "High"
    expect(screen.getByText(/High/i)).toBeInTheDocument();
  });

  // ── ExplainabilityPanel: first narrative bullet ───────────────────────
  it("ExplainabilityPanel shows the first narrative bullet from the fixture", () => {
    render(<ExplainabilityPanel result={turkeyResult} />);
    const firstBullet = turkeyResult.explainability.narrative[0];
    expect(screen.getByText(firstBullet)).toBeInTheDocument();
  });

  it("ExplainabilityPanel shows factor labels from the fixture", () => {
    render(<ExplainabilityPanel result={turkeyResult} />);
    // turkey has Event uplift, Seasonality, Trend factors
    expect(screen.getByText("Event uplift")).toBeInTheDocument();
    expect(screen.getByText("Seasonality")).toBeInTheDocument();
    expect(screen.getByText("Trend")).toBeInTheDocument();
  });
});
