/**
 * SeasonalPanel tests — MT-39.
 * 07 §3: Vitest + RTL. recharts mocked (jsdom gives ResponsiveContainer 0×0).
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock recharts so Cell props are rendered as DOM attrs and containers have a size.
vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass,
    BarChart: Pass,
    Bar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Cell: ({
      "data-testid": tid,
      "data-active": active,
      fill,
    }: {
      "data-testid"?: string;
      "data-active"?: string;
      fill?: string;
    }) => <div data-testid={tid} data-active={active} data-fill={fill} />,
    XAxis: Pass,
    YAxis: Pass,
    CartesianGrid: Pass,
    Tooltip: Pass,
  };
});

import { SeasonalPanel } from "./SeasonalPanel";
import type { ForecastResult } from "../../lib/types";

/** Minimal ForecastResult fixture with realistic seasonal data (turkey, Nov 2015). */
function makeResult(): ForecastResult {
  return {
    series_id: "turkey",
    item_id: "FOODS_3_069",
    product_name: "Fresh Whole Turkey",
    history: { dates: [], units: [] },
    horizon_dates: [],
    actual: [],
    forecast: [],
    metrics: {
      accuracy: 78.4,
      wape: 21.6,
      coherence: 71.0,
      coherence_label: "Moderate",
      smape: 24.1,
      mae: 3.21,
      rmse: 4.87,
    },
    velocity: { value: 412.0, status: "Accelerating" },
    inventory: {
      on_hand: 260,
      safety_stock: 41.0,
      reorder_point: 171.0,
      horizon_demand: 520.0,
      cover_days: 9,
      stockout_risk: "Medium",
      overstock: false,
      recommended_order_qty: 301,
      projected_stock: [],
    },
    explainability: {
      event_contribution_pct: 280.5,
      snap_days_in_horizon: 8,
      narrative: [],
      factors: [],
    },
    events_in_horizon: [],
    seasonal: {
      month: 11, // November — highlighted
      month_vs_avg_pct: 220.0,
      monthly_avg: [15, 13, 9, 10, 8, 7, 8, 8, 7, 12, 57, 92],
      weekday_avg: [22.1, 18.0, 16.4, 15.9, 17.2, 19.8, 24.0],
    },
    event_uplift: { Thanksgiving: 517.0, ValentinesDay: 92.0 },
  } as unknown as ForecastResult;
}

describe("SeasonalPanel", () => {
  it("renders 12 monthly bars and 7 weekday bars", () => {
    render(<SeasonalPanel result={makeResult()} />);

    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    months.forEach((m) =>
      expect(screen.getByTestId(`month-${m}`)).toBeInTheDocument(),
    );

    const wdays = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
    wdays.forEach((d) =>
      expect(screen.getByTestId(`weekday-${d}`)).toBeInTheDocument(),
    );
  });

  it("highlights the current month (Nov) with the accent fill", () => {
    render(<SeasonalPanel result={makeResult()} />);

    const novBar = screen.getByTestId("month-Nov");
    expect(novBar).toHaveAttribute("data-active", "true");
    expect(novBar).toHaveAttribute("data-fill", "#2FE6FF");

    // All other months should NOT be active
    const janBar = screen.getByTestId("month-Jan");
    expect(janBar).toHaveAttribute("data-active", "false");

    const decBar = screen.getByTestId("month-Dec");
    expect(decBar).toHaveAttribute("data-active", "false");
  });

  it("shows the month_vs_avg_pct callout with correct text", () => {
    render(<SeasonalPanel result={makeResult()} />);
    const callout = screen.getByTestId("seasonal-callout");
    expect(callout).toHaveTextContent("Nov runs +220% vs average");
  });

  it("renders the panel wrapper", () => {
    render(<SeasonalPanel result={makeResult()} />);
    expect(screen.getByTestId("seasonal-panel")).toBeInTheDocument();
  });

  it("renders monthly and weekday chart containers", () => {
    render(<SeasonalPanel result={makeResult()} />);
    expect(screen.getByTestId("monthly-chart")).toBeInTheDocument();
    expect(screen.getByTestId("weekday-chart")).toBeInTheDocument();
  });

  it("weekday bars use cyan fill at reduced opacity (not highlighted individually)", () => {
    render(<SeasonalPanel result={makeResult()} />);
    // All weekday bars use the same flat CYAN fill (no active/inactive distinction)
    const satBar = screen.getByTestId("weekday-Sat");
    expect(satBar).toHaveAttribute("data-fill", "#2FE6FF");
    const friBar = screen.getByTestId("weekday-Fri");
    expect(friBar).toHaveAttribute("data-fill", "#2FE6FF");
  });
});
