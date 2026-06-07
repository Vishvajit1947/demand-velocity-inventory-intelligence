/**
 * StatusBadge tests — MT-43 §6 (06 §6 — status never color-only).
 * Verifies that every badge always renders a visible text label alongside the color.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge (06 §6 — status never color-only)", () => {
  // ── VelocityStatus labels (05 §1) ───────────────────────────────────────
  it("always renders the text label for Accelerating", () => {
    render(<StatusBadge kind="velocity" status="Accelerating" />);
    expect(screen.getByText("Accelerating")).toBeInTheDocument();
  });

  it("renders the text label for Growing", () => {
    render(<StatusBadge kind="velocity" status="Growing" />);
    expect(screen.getByText("Growing")).toBeInTheDocument();
  });

  it("renders the text label for Stable", () => {
    render(<StatusBadge kind="velocity" status="Stable" />);
    expect(screen.getByText("Stable")).toBeInTheDocument();
  });

  it("renders the text label for Declining", () => {
    render(<StatusBadge kind="velocity" status="Declining" />);
    expect(screen.getByText("Declining")).toBeInTheDocument();
  });

  it("renders the text label for Critical Decline", () => {
    render(<StatusBadge kind="velocity" status="Critical Decline" />);
    expect(screen.getByText("Critical Decline")).toBeInTheDocument();
  });

  // ── RiskLevel labels (05 §1) ─────────────────────────────────────────────
  it("renders the text label for High risk", () => {
    render(<StatusBadge kind="risk" status="High" />);
    // The badge appends " risk" to the level
    expect(screen.getByText(/High/i)).toBeInTheDocument();
  });

  it("renders the text label for Medium risk", () => {
    render(<StatusBadge kind="risk" status="Medium" />);
    expect(screen.getByText(/Medium/i)).toBeInTheDocument();
  });

  it("renders the text label for Low risk", () => {
    render(<StatusBadge kind="risk" status="Low" />);
    expect(screen.getByText(/Low/i)).toBeInTheDocument();
  });

  // ── Color-accent map (06 §2) ─────────────────────────────────────────────
  it("maps Accelerating → data-accent=lime", () => {
    render(<StatusBadge kind="velocity" status="Accelerating" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-accent", "lime");
  });

  it("maps Stable → data-accent=cyan", () => {
    render(<StatusBadge kind="velocity" status="Stable" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-accent", "cyan");
  });

  it("maps Declining → data-accent=amber", () => {
    render(<StatusBadge kind="velocity" status="Declining" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-accent", "amber");
  });

  it("maps Critical Decline → data-accent=rose", () => {
    render(<StatusBadge kind="velocity" status="Critical Decline" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-accent", "rose");
  });

  it("maps High risk → data-accent=rose", () => {
    render(<StatusBadge kind="risk" status="High" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-accent", "rose");
  });

  it("maps Low risk → data-accent=lime", () => {
    render(<StatusBadge kind="risk" status="Low" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-accent", "lime");
  });

  // ── Custom label override ────────────────────────────────────────────────
  it("renders a custom label when provided", () => {
    render(<StatusBadge kind="velocity" status="Growing" label="Positive trend" />);
    expect(screen.getByText("Positive trend")).toBeInTheDocument();
  });

  // ── Decorative dot is aria-hidden (color never the only signal) ──────────
  it("the colored dot is aria-hidden so text carries the meaning", () => {
    const { container } = render(<StatusBadge kind="velocity" status="Stable" />);
    const dot = container.querySelector("[aria-hidden]");
    expect(dot).not.toBeNull();
  });
});
