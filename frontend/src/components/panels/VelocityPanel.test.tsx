/**
 * VelocityPanel tests (MT-37).
 * 07 §3: Vitest + RTL, deterministic, offline.
 *
 * The gauge is now a pure SVG implementation — no Plotly dependency.
 * Tests assert on DOM output: data-testid attributes, text content,
 * badge label, value overlay, and caption. Visual/geometry tests
 * are not needed here (SVG paths are implementation detail).
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

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
  } as unknown as ForecastResult;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("VelocityPanel (MT-37)", () => {
  it("renders the status badge with the correct text label", () => {
    render(<VelocityPanel result={makeResult(412, "Accelerating")} />);
    // StatusBadge always shows a text label — never color alone (06 §6).
    expect(screen.getByText("Accelerating")).toBeInTheDocument();
  });

  it("shows the REAL un-clamped value in the overlay even when it exceeds the arc", () => {
    render(<VelocityPanel result={makeResult(412, "Accelerating")} />);
    // Overlay div shows the real un-clamped value (06 §4 P3).
    expect(screen.getByTestId("velocity-value")).toHaveTextContent("+412%");
    // Caption also uses the real value.
    expect(screen.getByTestId("velocity-caption")).toHaveTextContent(
      "+412% vs prior 28 days",
    );
  });

  it("shows the correct signed value for a negative velocity", () => {
    render(<VelocityPanel result={makeResult(-72, "Critical Decline")} />);
    expect(screen.getByTestId("velocity-value")).toHaveTextContent("-72%");
    expect(screen.getByTestId("velocity-caption")).toHaveTextContent(
      "-72% vs prior 28 days",
    );
  });

  it("shows the correct label for Critical Decline status", () => {
    render(<VelocityPanel result={makeResult(-72, "Critical Decline")} />);
    expect(screen.getByText("Critical Decline")).toBeInTheDocument();
  });

  it("shows the correct label for Growing status", () => {
    render(<VelocityPanel result={makeResult(25, "Growing")} />);
    expect(screen.getByText("Growing")).toBeInTheDocument();
  });

  it("shows the correct label for Declining status", () => {
    render(<VelocityPanel result={makeResult(-30, "Declining")} />);
    expect(screen.getByText("Declining")).toBeInTheDocument();
  });

  it("shows the correct label for Stable status", () => {
    render(<VelocityPanel result={makeResult(0, "Stable")} />);
    expect(screen.getByText("Stable")).toBeInTheDocument();
  });

  it("shows the real value for a large negative (clamped on arc, real in overlay)", () => {
    render(<VelocityPanel result={makeResult(-250, "Critical Decline")} />);
    // Real value shown in overlay — arc needle is clamped but text is not.
    expect(screen.getByTestId("velocity-value")).toHaveTextContent("-250%");
  });

  it("renders the panel container and title", () => {
    render(<VelocityPanel result={makeResult(10, "Growing")} />);
    expect(screen.getByTestId("velocity-panel")).toBeInTheDocument();
    expect(screen.getByText("Velocity Intelligence")).toBeInTheDocument();
  });
});

// ── Status color tests ───────────────────────────────────────────────────────
// Browsers normalize hex colors to rgb/rgba in inline styles, so we assert
// on the rgb() representation of each hex rather than the hex string itself.
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

describe("VelocityPanel status-aware colors (MT-37 color update)", () => {
  const cases: Array<{
    status: ForecastResult["velocity"]["status"];
    value: number;
    hex: string;
    glowAlpha: number;
  }> = [
    { status: "Critical Decline", value: -72, hex: "#FF5C7A", glowAlpha: 0.45 },
    { status: "Declining",        value: -30, hex: "#FFC24D", glowAlpha: 0.45 },
    { status: "Stable",           value:   0, hex: "#2FE6FF", glowAlpha: 0.45 },
    { status: "Growing",          value:  25, hex: "#4DFFB0", glowAlpha: 0.45 },
    { status: "Accelerating",     value: 412, hex: "#4DFFB0", glowAlpha: 0.60 },
  ];

  cases.forEach(({ status, value, hex, glowAlpha }) => {
    it(`${status} → value overlay color is ${hex}`, () => {
      render(<VelocityPanel result={makeResult(value, status)} />);
      const overlay = screen.getByTestId("velocity-value");
      // haveStyle resolves hex → rgb automatically
      expect(overlay).toHaveStyle({ color: hex });
    });

    it(`${status} → value overlay textShadow contains glow rgba(alpha=${glowAlpha})`, () => {
      render(<VelocityPanel result={makeResult(value, status)} />);
      const overlay = screen.getByTestId("velocity-value");
      const style = overlay.getAttribute("style") ?? "";
      // Inline style string contains the rgba representation produced by withAlpha()
      expect(style).toContain(hexToRgba(hex, glowAlpha));
    });
  });
});
