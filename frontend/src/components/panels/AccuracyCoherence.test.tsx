/**
 * Tests for AccuracyCoherence (MT-35).
 * Covers: band mapping logic (accuracyBand, coherenceBand) and rendered output.
 * 07 §3: "given metrics, both dials show the right numbers and band colors."
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccuracyCoherence, accuracyBand, coherenceBand } from "./AccuracyCoherence";
import type { Metrics } from "../../lib/types";

/** Build a Metrics object with defaults, allow partial overrides. */
function metrics(over: Partial<Metrics> = {}): Metrics {
  return {
    accuracy: 78.4,
    coherence: 71,
    coherence_label: "Moderate",
    smape: 21.6,
    mae: 3.21,
    rmse: 4.87,
    ...over,
  };
}

// ── accuracyBand ────────────────────────────────────────────────────────────

describe("accuracyBand (MT-35 §4)", () => {
  it("maps >= 75 to lime / Strong", () => {
    expect(accuracyBand(90).accent.hex).toBe("#4DFFB0");
    expect(accuracyBand(90).word).toBe("Strong");
    expect(accuracyBand(75).accent.hex).toBe("#4DFFB0");
  });

  it("maps 60–74 to cyan / Solid", () => {
    expect(accuracyBand(74).accent.hex).toBe("#2FE6FF");
    expect(accuracyBand(74).word).toBe("Solid");
    expect(accuracyBand(60).accent.hex).toBe("#2FE6FF");
  });

  it("maps 40–59 to amber / Weak", () => {
    expect(accuracyBand(59).accent.hex).toBe("#FFC24D");
    expect(accuracyBand(59).word).toBe("Weak");
    expect(accuracyBand(40).accent.hex).toBe("#FFC24D");
  });

  it("maps < 40 to rose / Poor", () => {
    expect(accuracyBand(39).accent.hex).toBe("#FF5C7A");
    expect(accuracyBand(39).word).toBe("Poor");
    expect(accuracyBand(0).accent.hex).toBe("#FF5C7A");
  });
});

// ── coherenceBand ───────────────────────────────────────────────────────────

describe("coherenceBand (MT-35 §4)", () => {
  it("drives color from the API label (Strong → lime)", () => {
    expect(coherenceBand(71, "Strong").accent.hex).toBe("#4DFFB0");
    expect(coherenceBand(71, "Strong").word).toBe("Strong");
  });

  it("drives color from the API label (Moderate → amber)", () => {
    expect(coherenceBand(71, "Moderate").accent.hex).toBe("#FFC24D");
    expect(coherenceBand(71, "Moderate").word).toBe("Moderate");
  });

  it("drives color from the API label (Weak → rose)", () => {
    expect(coherenceBand(71, "Weak").accent.hex).toBe("#FF5C7A");
    expect(coherenceBand(71, "Weak").word).toBe("Weak");
  });

  it("falls back to numeric >= 75 → Strong when label is absent", () => {
    expect(coherenceBand(80).word).toBe("Strong");
    expect(coherenceBand(80).accent.hex).toBe("#4DFFB0");
  });

  it("falls back to numeric >= 50 → Moderate when label is absent", () => {
    expect(coherenceBand(60).word).toBe("Moderate");
    expect(coherenceBand(60).accent.hex).toBe("#FFC24D");
  });

  it("falls back to numeric < 50 → Weak when label is absent", () => {
    expect(coherenceBand(20).word).toBe("Weak");
    expect(coherenceBand(20).accent.hex).toBe("#FF5C7A");
  });

  it("ignores unknown label strings and falls back to numeric", () => {
    // Unknown label should not crash and should use numeric fallback
    expect(coherenceBand(80, "Unknown" as never).word).toBe("Strong");
  });
});

// ── <AccuracyCoherence /> ───────────────────────────────────────────────────

describe("<AccuracyCoherence /> (MT-35)", () => {
  it("renders both dial labels (Accuracy / Coherence)", () => {
    render(<AccuracyCoherence metrics={metrics()} />);
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    expect(screen.getByText("Coherence")).toBeInTheDocument();
  });

  it("shows correct band words: accuracy 78.4 → Strong, coherence label Moderate → Moderate", () => {
    render(
      <AccuracyCoherence
        metrics={metrics({ accuracy: 78.4, coherence: 71, coherence_label: "Moderate" })}
      />,
    );
    expect(screen.getByText("Strong")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();
  });

  it("renders the numeric values in each dial center", () => {
    render(
      <AccuracyCoherence
        metrics={metrics({ accuracy: 78.4, coherence: 71 })}
      />,
    );
    // RadialDial renders clamped.toFixed(0) by default → "78" and "71"
    expect(screen.getByText(/78/)).toBeInTheDocument();
    expect(screen.getByText(/71/)).toBeInTheDocument();
  });

  it("renders the sMAPE / MAE / RMSE caption", () => {
    render(<AccuracyCoherence metrics={metrics()} />);
    expect(screen.getByText(/sMAPE 21\.6/)).toBeInTheDocument();
    expect(screen.getByText(/MAE 3\.21/)).toBeInTheDocument();
    expect(screen.getByText(/RMSE 4\.87/)).toBeInTheDocument();
  });

  it("turns the accuracy dial rose (Poor) when accuracy is very low", () => {
    render(<AccuracyCoherence metrics={metrics({ accuracy: 30 })} />);
    expect(accuracyBand(30).accent.hex).toBe("#FF5C7A");
    expect(screen.getByText("Poor")).toBeInTheDocument();
  });

  it("turns the coherence dial lime (Strong) when label is Strong", () => {
    render(
      // Use accuracy=30 (Poor) so only coherence produces "Strong", avoiding duplicate text
      <AccuracyCoherence
        metrics={metrics({ accuracy: 30, coherence: 90, coherence_label: "Strong" })}
      />,
    );
    // accuracy=30 → Poor; coherence label Strong → Strong (exactly one "Strong" in the DOM)
    expect(screen.getByText("Strong")).toBeInTheDocument();
    expect(screen.getByText("Poor")).toBeInTheDocument();
  });

  it("uses numeric coherence fallback when label drives the color", () => {
    // Low coherence with no label should show Weak
    render(
      <AccuracyCoherence
        // @ts-expect-error: testing undefined label fallback path
        metrics={{ ...metrics({ coherence: 30 }), coherence_label: undefined }}
      />,
    );
    expect(screen.getByText("Weak")).toBeInTheDocument();
  });

  it("renders testid containers for both dials", () => {
    render(<AccuracyCoherence metrics={metrics()} />);
    expect(screen.getByTestId("dial-accuracy")).toBeInTheDocument();
    expect(screen.getByTestId("dial-coherence")).toBeInTheDocument();
  });
});
