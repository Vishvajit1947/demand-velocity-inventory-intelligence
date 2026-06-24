/**
 * EventImpactPanel tests (MT-38).
 * 07 §3: Vitest + RTL, deterministic, offline.
 *
 * Recharts measures its container; under jsdom ResponsiveContainer has 0×0 size,
 * so recharts is mocked to capture data/Cell props deterministically (07 §3).
 * Tests assert on: row count, per-bar colors, label formatting.
 *
 * The horizon-strip / horizon-event section was removed from the component (UI
 * refinement). All tests that referenced those elements have been deleted.
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

  it("shows 'top 5 historical impact' subtitle", () => {
    render(<EventImpactPanel result={makeResult()} />);
    expect(screen.getByText("top 5 historical impact")).toBeInTheDocument();
  });

  it("shows 'Showing top N of M' caption when events are present", () => {
    render(<EventImpactPanel result={makeResult()} />);
    expect(screen.getByTestId("event-impact-caption")).toBeInTheDocument();
    expect(screen.getByTestId("event-impact-caption")).toHaveTextContent(
      "Showing top 3 of 3",
    );
  });

  it("shows the View All button with correct count when events are present", () => {
    render(<EventImpactPanel result={makeResult()} />);
    expect(screen.getByText("View All (3)")).toBeInTheDocument();
  });

  it("sorts events by absolute uplift descending (Thanksgiving first)", () => {
    render(<EventImpactPanel result={makeResult()} />);
    // Thanksgiving=517 has highest |value| → appears as first bar cell
    const chart = screen.getByTestId("barchart");
    expect(chart).toHaveAttribute("data-rows", "3");
    // Cell for Thanksgiving must be lime (positive, largest magnitude)
    expect(screen.getByTestId("bar-Thanksgiving")).toHaveAttribute(
      "data-fill",
      "#4DFFB0",
    );
  });

  it("does not render horizon-strip (section removed)", () => {
    render(<EventImpactPanel result={makeResult()} />);
    expect(screen.queryByTestId("horizon-strip")).not.toBeInTheDocument();
  });
});
