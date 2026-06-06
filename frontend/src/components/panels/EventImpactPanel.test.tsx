/**
 * EventImpactPanel tests (MT-38).
 * 07 §3: Vitest + RTL, deterministic, offline.
 *
 * Recharts measures its container; under jsdom ResponsiveContainer has 0×0 size,
 * so recharts is mocked to capture data/Cell props deterministically (07 §3).
 * Tests assert on: row count, per-bar colors, label formatting, horizon strip.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// ── Lightweight recharts mock ────────────────────────────────────────────────
// Renders Cells so we can read their fill; exposes data length on BarChart.
vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Pass,
    BarChart: ({
      data,
      children,
    }: {
      data: unknown[];
      children?: React.ReactNode;
    }) => (
      <div data-testid="barchart" data-rows={data.length}>
        {children}
      </div>
    ),
    Bar: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="bar">{children}</div>
    ),
    Cell: ({
      fill,
      "data-testid": tid,
    }: {
      fill: string;
      "data-testid"?: string;
    }) => <div data-testid={tid} data-fill={fill} />,
    XAxis: Pass,
    YAxis: Pass,
    CartesianGrid: Pass,
    Tooltip: () => null,
    LabelList: () => null,
  };
});

// ── Import AFTER mock ────────────────────────────────────────────────────────
import { EventImpactPanel } from "./EventImpactPanel";
import type { ForecastResult } from "../../lib/types";

// ── Fixture factory ──────────────────────────────────────────────────────────
function makeResult(): ForecastResult {
  return {
    series_id: "turkey",
    item_id: "FOODS_3_069",
    product_name: "Fresh Whole Turkey",
    // 28 dates: 2015-11-01 … 2015-11-28
    horizon_dates: Array.from({ length: 28 }, (_, i) => {
      const d = new Date(Date.UTC(2015, 10, 1 + i));
      return d.toISOString().slice(0, 10);
    }),
    events_in_horizon: [
      { date: "2015-11-26", name: "Thanksgiving", type: "National" },
    ],
    // Three entries: one positive, one negative, one positive — sorted by |value| desc.
    event_uplift: { Thanksgiving: 517, ValentinesDay: -37, Easter: 92 },
  } as unknown as ForecastResult;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("EventImpactPanel (MT-38)", () => {
  it("renders one Cell per event_uplift key (data-rows === 3)", () => {
    render(<EventImpactPanel result={makeResult()} />);
    expect(screen.getByTestId("barchart")).toHaveAttribute("data-rows", "3");
  });

  it("colors positive uplift bars lime (#4DFFB0)", () => {
    render(<EventImpactPanel result={makeResult()} />);
    expect(screen.getByTestId("bar-Thanksgiving")).toHaveAttribute(
      "data-fill",
      "#4DFFB0",
    );
  });

  it("colors negative uplift bars rose (#FF5C7A)", () => {
    render(<EventImpactPanel result={makeResult()} />);
    expect(screen.getByTestId("bar-ValentinesDay")).toHaveAttribute(
      "data-fill",
      "#FF5C7A",
    );
  });

  it("colors a second positive uplift bar lime", () => {
    render(<EventImpactPanel result={makeResult()} />);
    expect(screen.getByTestId("bar-Easter")).toHaveAttribute(
      "data-fill",
      "#4DFFB0",
    );
  });

  it("shows events_in_horizon names on the timeline strip", () => {
    render(<EventImpactPanel result={makeResult()} />);
    const strip = screen.getByTestId("horizon-strip");
    expect(strip).toHaveTextContent("Thanksgiving");
  });

  it("renders a horizon-event tick for each events_in_horizon entry", () => {
    render(<EventImpactPanel result={makeResult()} />);
    const horizonEvents = screen.getAllByTestId("horizon-event");
    expect(horizonEvents).toHaveLength(1);
  });

  it("shows 'No events in this 28-day window.' when events_in_horizon is empty", () => {
    const result = {
      ...makeResult(),
      events_in_horizon: [],
    } as unknown as ForecastResult;
    render(<EventImpactPanel result={result} />);
    expect(
      screen.getByText("No events in this 28-day window."),
    ).toBeInTheDocument();
  });

  it("shows 'No event uplift profile for this product.' when event_uplift is empty", () => {
    const result = {
      ...makeResult(),
      event_uplift: {},
    } as unknown as ForecastResult;
    render(<EventImpactPanel result={result} />);
    expect(
      screen.getByText("No event uplift profile for this product."),
    ).toBeInTheDocument();
    // Bar chart should NOT be rendered.
    expect(screen.queryByTestId("barchart")).not.toBeInTheDocument();
  });

  it("renders the panel container with the correct test id", () => {
    render(<EventImpactPanel result={makeResult()} />);
    expect(screen.getByTestId("event-impact-panel")).toBeInTheDocument();
  });

  it("renders the panel title 'Event Impact'", () => {
    render(<EventImpactPanel result={makeResult()} />);
    expect(screen.getByText("Event Impact")).toBeInTheDocument();
  });

  it("shows the horizon start and end dates as captions", () => {
    render(<EventImpactPanel result={makeResult()} />);
    const strip = screen.getByTestId("horizon-strip");
    expect(strip).toHaveTextContent("2015-11-01");
    expect(strip).toHaveTextContent("2015-11-28");
  });

  it("skips events_in_horizon entries whose date is not in horizon_dates", () => {
    const result = {
      ...makeResult(),
      events_in_horizon: [
        { date: "2015-11-26", name: "Thanksgiving", type: "National" },
        { date: "2020-01-01", name: "OutOfRange",   type: "National" },
      ],
    } as unknown as ForecastResult;
    render(<EventImpactPanel result={result} />);
    // Only the in-range event gets a tick.
    expect(screen.getAllByTestId("horizon-event")).toHaveLength(1);
    expect(screen.queryByTitle(/OutOfRange/)).not.toBeInTheDocument();
  });

  it("renders multiple horizon ticks when multiple events fall in the window", () => {
    const result = {
      ...makeResult(),
      events_in_horizon: [
        { date: "2015-11-05", name: "EventA", type: "Promo" },
        { date: "2015-11-26", name: "Thanksgiving", type: "National" },
      ],
    } as unknown as ForecastResult;
    render(<EventImpactPanel result={result} />);
    expect(screen.getAllByTestId("horizon-event")).toHaveLength(2);
    const strip = screen.getByTestId("horizon-strip");
    expect(strip).toHaveTextContent("EventA");
    expect(strip).toHaveTextContent("Thanksgiving");
  });
});
