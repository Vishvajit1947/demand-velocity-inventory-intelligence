/**
 * ExplainabilityPanel tests — MT-41 (07 §3 frontend testing).
 *
 * Mocks recharts so jsdom (0×0 container) doesn't cause ResponsiveContainer
 * to render nothing. Uses @testing-library/user-event to switch tabs.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

// ── Mock recharts — replace charts with plain divs so RTL can query children ─
vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass,
    LineChart: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="history-line">{children}</div>
    ),
    BarChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Line:          () => <div />,
    Bar:           ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Cell:          () => <div />,
    XAxis:         Pass,
    YAxis:         Pass,
    CartesianGrid: Pass,
    Tooltip:       Pass,
  };
});

import { ExplainabilityPanel } from "./ExplainabilityPanel";
import type { ForecastResult } from "../../lib/types";

// ── Fixture factory (mirrors the turkey fixture from 05 §5) ──────────────────
function makeResult(): ForecastResult {
  return {
    series_id:    "turkey",
    item_id:      "FOODS_3_069",
    product_name: "Fresh Whole Turkey",
    history: {
      dates: Array.from({ length: 84 }, (_, i) =>
        `2015-08-${String((i % 28) + 1).padStart(2, "0")}`,
      ),
      units: Array.from({ length: 84 }, (_, i) => 10 + (i % 5)),
    },
    horizon_dates: Array.from({ length: 28 }, (_, i) =>
      `2015-11-${String(i + 1).padStart(2, "0")}`,
    ),
    actual:   Array.from({ length: 28 }, () => 12),
    forecast: Array.from({ length: 28 }, () => 13),
    metrics: {
      accuracy: 78.4,
      coherence: 71.0,
      coherence_label: "Moderate",
      smape: 24.1,
      mae: 3.21,
      rmse: 4.87,
      wape: 21.6,
    } as ForecastResult["metrics"],
    velocity: { value: 412.0, status: "Accelerating" },
    inventory: {
      on_hand: 260,
      safety_stock: 41,
      reorder_point: 171,
      horizon_demand: 520,
      cover_days: 9,
      stockout_risk: "Medium",
      overstock: false,
      recommended_order_qty: 301,
      projected_stock: Array.from({ length: 28 }, (_, i) => 260 - i * 5),
    },
    seasonal: {
      month: 11,
      month_vs_avg_pct: 220,
      monthly_avg: [15, 13, 9, 10, 8, 7, 8, 8, 7, 12, 57, 92],
      weekday_avg: [22.1, 18, 16.4, 15.9, 17.2, 19.8, 24],
    },
    explainability: {
      event_contribution_pct: 280.5,
      snap_days_in_horizon: 8,
      narrative: [
        "Demand is Accelerating (+412% vs the prior 28 days).",
        "November is a high-demand month (~+220% vs average).",
        "Thanksgiving falls in this window — historically a +517% swing.",
      ],
      factors: [
        { label: "Event uplift", value: 280.5, kind: "event" },
        { label: "Seasonality",  value: 220.0, kind: "seasonal" },
        { label: "Trend",        value: 412.0, kind: "trend" },
      ],
    },
    events_in_horizon: [
      { date: "2015-11-26", name: "Thanksgiving", type: "National" },
    ],
    event_uplift: { Thanksgiving: 517.0 },
  } as unknown as ForecastResult;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("ExplainabilityPanel", () => {
  it("renders the Insights tab by default with narrative cards", () => {
    render(<ExplainabilityPanel result={makeResult()} />);
    // Default tab is "Insights"
    expect(screen.getByTestId("insights-tab")).toBeInTheDocument();
    // Three narrative bullets
    expect(screen.getAllByTestId("narrative-card")).toHaveLength(3);
  });

  it("renders each narrative bullet text", () => {
    render(<ExplainabilityPanel result={makeResult()} />);
    expect(screen.getByText(/Thanksgiving falls in this window/)).toBeInTheDocument();
    expect(screen.getByText(/Demand is Accelerating/)).toBeInTheDocument();
    expect(screen.getByText(/November is a high-demand month/)).toBeInTheDocument();
  });

  it("renders a factor bar per factor", () => {
    render(<ExplainabilityPanel result={makeResult()} />);
    expect(screen.getAllByTestId("factor-bar")).toHaveLength(3);
  });

  it("shows factor labels and signedPct values in the factor bars", () => {
    render(<ExplainabilityPanel result={makeResult()} />);
    expect(screen.getByText("Event uplift")).toBeInTheDocument();
    expect(screen.getByText("Seasonality")).toBeInTheDocument();
    expect(screen.getByText("Trend")).toBeInTheDocument();
    // signedPct(280.5) rounds to +281%, signedPct(220) → +220%, signedPct(412) → +412%
    expect(screen.getByText("+281%")).toBeInTheDocument();
    expect(screen.getByText("+220%")).toBeInTheDocument();
    expect(screen.getByText("+412%")).toBeInTheDocument();
  });

  it("Deep Dive content is NOT shown on the default Insights tab", () => {
    render(<ExplainabilityPanel result={makeResult()} />);
    expect(screen.queryByTestId("deep-tab")).not.toBeInTheDocument();
  });

  it("switches to the Deep Dive tab and shows history chart + profile minis", async () => {
    const user = userEvent.setup();
    render(<ExplainabilityPanel result={makeResult()} />);

    // Insights is default; switch to Deep Dive
    await user.click(screen.getByRole("tab", { name: "Deep Dive" }));

    expect(screen.getByTestId("deep-tab")).toBeInTheDocument();
    expect(screen.getByTestId("history-chart")).toBeInTheDocument();
    expect(screen.getByTestId("monthly-mini")).toBeInTheDocument();
    expect(screen.getByTestId("weekday-mini")).toBeInTheDocument();

    // Insights tab panel is gone
    expect(screen.queryByTestId("insights-tab")).not.toBeInTheDocument();
  });

  it("switching back to Insights tab hides Deep Dive content", async () => {
    const user = userEvent.setup();
    render(<ExplainabilityPanel result={makeResult()} />);

    await user.click(screen.getByRole("tab", { name: "Deep Dive" }));
    expect(screen.getByTestId("deep-tab")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Insights" }));
    expect(screen.getByTestId("insights-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("deep-tab")).not.toBeInTheDocument();
  });

  it("both tab buttons are keyboard-operable (have role=tab and aria-selected)", () => {
    render(<ExplainabilityPanel result={makeResult()} />);
    const insightsTab  = screen.getByRole("tab", { name: "Insights" });
    const deepDiveTab  = screen.getByRole("tab", { name: "Deep Dive" });

    // Insights is active by default
    expect(insightsTab).toHaveAttribute("aria-selected", "true");
    expect(deepDiveTab).toHaveAttribute("aria-selected", "false");
  });

  it("factor bars container is rendered", () => {
    render(<ExplainabilityPanel result={makeResult()} />);
    expect(screen.getByTestId("factor-bars")).toBeInTheDocument();
  });
});
