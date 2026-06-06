/**
 * VelocityPanel tests (MT-37).
 * 07 §3: Vitest + RTL, deterministic, offline.
 *
 * react-plotly.js is heavy and DOM-canvas based; it is mocked so tests assert
 * on the props passed to <Plot> (gauge config, clamped value, band colors) plus
 * the text content rendered by the component itself (badge, value overlay, caption).
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// ── Mock react-plotly.js ─────────────────────────────────────────────────────
// Captures the latest rendered props so tests can inspect the Plotly config.
const plotProps: { current: Record<string, unknown> } = { current: {} };

vi.mock("react-plotly.js", () => ({
  default: (props: Record<string, unknown>) => {
    plotProps.current = props;
    return <div data-testid="velocity-gauge" />;
  },
}));

// ── Import component AFTER mock is set up ────────────────────────────────────
import { VelocityPanel } from "./VelocityPanel";
import type { ForecastResult } from "../../lib/types";

// ── Fixture factory ──────────────────────────────────────────────────────────
function makeResult(
  value: number,
  status: ForecastResult["velocity"]["status"],
): ForecastResult {
  return {
    series_id: "turkey",
    item_id: "FOODS_3_069",
    product_name: "Fresh Whole Turkey",
    velocity: { value, status },
    // Remaining ForecastResult fields are not read by VelocityPanel:
  } as unknown as ForecastResult;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("VelocityPanel (MT-37)", () => {
  it("renders the status badge with the correct text label", () => {
    render(<VelocityPanel result={makeResult(412, "Accelerating")} />);
    // StatusBadge always shows a text label — never color alone (06 §6).
    expect(screen.getByText("Accelerating")).toBeInTheDocument();
  });

  it("passes the CLAMPED gauge value to Plotly but shows the REAL value as overlay text", () => {
    render(<VelocityPanel result={makeResult(412, "Accelerating")} />);

    const trace = (plotProps.current.data as Record<string, unknown>[])[0];

    // Needle stays on arc — clamped to 100 (06 §4 P3 "axis range [−100,100]").
    expect(trace.value).toBe(100);

    // Axis range is always [−100, 100].
    const gauge = trace.gauge as Record<string, unknown>;
    const axis = gauge.axis as Record<string, unknown>;
    expect(axis.range).toEqual([-100, 100]);

    // Overlay div shows the REAL un-clamped value (06 §4 P3).
    expect(screen.getByTestId("velocity-value")).toHaveTextContent("+412%");

    // Caption also uses the real value.
    expect(screen.getByTestId("velocity-caption")).toHaveTextContent("+412% vs prior 28 days");
  });

  it("needle threshold color matches the band color for the active status", () => {
    render(<VelocityPanel result={makeResult(-72, "Critical Decline")} />);

    const trace = (plotProps.current.data as Record<string, unknown>[])[0];

    // Within arc — not clamped.
    expect(trace.value).toBe(-72);

    // Rose for Critical Decline (06 §2 / MT-37 §4 color table).
    const gauge = trace.gauge as Record<string, unknown>;
    const threshold = gauge.threshold as Record<string, unknown>;
    const line = threshold.line as Record<string, unknown>;
    expect(line.color).toBe("#FF5C7A");

    // Overlay shows the actual value.
    expect(screen.getByTestId("velocity-value")).toHaveTextContent("-72%");
  });

  it("defines exactly five band zones with boundaries at −50, −10, 10, 40", () => {
    render(<VelocityPanel result={makeResult(5, "Stable")} />);

    const trace = (plotProps.current.data as Record<string, unknown>[])[0];
    const gauge = trace.gauge as Record<string, unknown>;
    const steps = gauge.steps as Array<{ range: [number, number]; color: string }>;

    expect(steps).toHaveLength(5);
    expect(steps.map((s) => s.range)).toEqual([
      [-100, -50],
      [-50,  -10],
      [-10,   10],
      [10,    40],
      [40,   100],
    ]);
  });

  it("colors the needle lime for Growing status", () => {
    render(<VelocityPanel result={makeResult(25, "Growing")} />);

    const trace = (plotProps.current.data as Record<string, unknown>[])[0];
    const gauge = trace.gauge as Record<string, unknown>;
    const threshold = gauge.threshold as Record<string, unknown>;
    const line = threshold.line as Record<string, unknown>;

    // Growing maps to lime — same as Accelerating (06 §2 status→color map).
    expect(line.color).toBe("#4DFFB0");
  });

  it("colors the needle amber for Declining status", () => {
    render(<VelocityPanel result={makeResult(-30, "Declining")} />);

    const trace = (plotProps.current.data as Record<string, unknown>[])[0];
    const gauge = trace.gauge as Record<string, unknown>;
    const threshold = gauge.threshold as Record<string, unknown>;
    const line = threshold.line as Record<string, unknown>;

    expect(line.color).toBe("#FFC24D");
  });

  it("colors the needle cyan for Stable status", () => {
    render(<VelocityPanel result={makeResult(0, "Stable")} />);

    const trace = (plotProps.current.data as Record<string, unknown>[])[0];
    const gauge = trace.gauge as Record<string, unknown>;
    const threshold = gauge.threshold as Record<string, unknown>;
    const line = threshold.line as Record<string, unknown>;

    expect(line.color).toBe("#2FE6FF");
  });

  it("clamps a large negative value to −100 for the needle position", () => {
    render(<VelocityPanel result={makeResult(-250, "Critical Decline")} />);

    const trace = (plotProps.current.data as Record<string, unknown>[])[0];
    // Clamped to arc minimum.
    expect(trace.value).toBe(-100);
    // But the real value is still shown as text.
    expect(screen.getByTestId("velocity-value")).toHaveTextContent("-250%");
  });

  it("renders the panel container and title", () => {
    render(<VelocityPanel result={makeResult(10, "Growing")} />);
    expect(screen.getByTestId("velocity-panel")).toBeInTheDocument();
    expect(screen.getByText("Velocity Intelligence")).toBeInTheDocument();
  });
});
