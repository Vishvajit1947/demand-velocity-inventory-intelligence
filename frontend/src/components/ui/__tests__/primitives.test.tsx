/**
 * MT-30 primitives — Vitest + RTL tests.
 * Covers StatCard, StatusBadge, and RadialDial per 07 §3.
 * Uses jsdom + the matchMedia stub from src/test/setup.ts.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatCard } from "../StatCard";
import { StatusBadge } from "../StatusBadge";
import { RadialDial } from "../RadialDial";

// ── StatCard ─────────────────────────────────────────────────────────────────

describe("StatCard (MT-30)", () => {
  it("renders the title", () => {
    render(<StatCard title="Total Demand" value={1234} />);
    expect(screen.getByText(/Total Demand/i)).toBeInTheDocument();
  });

  it("renders the value in the document (may start at 0 while count-up animates in jsdom)", () => {
    render(<StatCard title="Total Demand" value={1234} />);
    // The title is always present; CountUp renders asynchronously but the container is there.
    expect(screen.getByText(/Total Demand/i)).toBeInTheDocument();
    // Under reduced-motion (setup.ts sets prefers-reduced-motion=true) CountUp is bypassed
    // and the value renders as toFixed(0) = "1,234" or "1234".
    expect(screen.getByText(/1[,.]?234/)).toBeInTheDocument();
  });

  it("renders prefix and suffix as text nodes around the CountUp span", () => {
    render(<StatCard title="Rate" value={42} prefix="$" suffix="k" />);
    // Under reduced-motion the value renders synchronously; the parent div contains all text.
    expect(screen.getByText(/\$/)).toBeInTheDocument();
    expect(screen.getByText(/k/)).toBeInTheDocument();
  });

  it("renders a positive delta with ▲ arrow", () => {
    render(<StatCard title="Growth" value={100} delta={12} />);
    expect(screen.getByText(/▲/)).toBeInTheDocument();
  });

  it("renders a negative delta with ▼ arrow", () => {
    render(<StatCard title="Decline" value={50} delta={-8} />);
    expect(screen.getByText(/▼/)).toBeInTheDocument();
  });
});

// ── StatusBadge ───────────────────────────────────────────────────────────────

describe("StatusBadge (MT-30)", () => {
  it("maps Accelerating velocity to lime and shows the label", () => {
    render(<StatusBadge kind="velocity" status="Accelerating" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("Accelerating");
    expect(badge).toHaveClass("text-accent-lime");
    expect(badge).toHaveAttribute("data-accent", "lime");
  });

  it("maps Growing velocity to lime", () => {
    render(<StatusBadge kind="velocity" status="Growing" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-accent", "lime");
  });

  it("maps Stable velocity to cyan", () => {
    render(<StatusBadge kind="velocity" status="Stable" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("data-accent", "cyan");
    expect(badge).toHaveClass("text-accent-cyan");
  });

  it("maps Declining velocity to amber", () => {
    render(<StatusBadge kind="velocity" status="Declining" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-accent", "amber");
  });

  it("maps Critical Decline velocity to rose", () => {
    render(<StatusBadge kind="velocity" status="Critical Decline" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-accent", "rose");
  });

  it("maps High risk to rose and shows the label", () => {
    render(<StatusBadge kind="risk" status="High" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("data-accent", "rose");
    expect(badge).toHaveTextContent(/High/i);
  });

  it("maps Medium risk to amber", () => {
    render(<StatusBadge kind="risk" status="Medium" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-accent", "amber");
  });

  it("maps Low risk to lime", () => {
    render(<StatusBadge kind="risk" status="Low" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-accent", "lime");
  });

  it("renders a custom label when provided", () => {
    render(<StatusBadge kind="velocity" status="Stable" label="On Track" />);
    expect(screen.getByRole("status")).toHaveTextContent("On Track");
  });

  it("accent kind renders the provided label", () => {
    render(<StatusBadge kind="accent" accent="violet" label="Custom" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("Custom");
    expect(badge).toHaveAttribute("data-accent", "violet");
  });
});

// ── RadialDial ────────────────────────────────────────────────────────────────

describe("RadialDial (MT-30)", () => {
  it("shows the numeric value and an accessible role=img label", () => {
    render(<RadialDial value={78} label="Accuracy" />);
    expect(screen.getByText("78")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Accuracy: 78 out of 100/i }),
    ).toBeInTheDocument();
  });

  it("clamps values above 100 to 100", () => {
    render(<RadialDial value={140} label="Coherence" />);
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Coherence: 100 out of 100/i }),
    ).toBeInTheDocument();
  });

  it("clamps values below 0 to 0", () => {
    render(<RadialDial value={-20} label="Score" />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows the label text inside the dial", () => {
    render(<RadialDial value={55} label="My Label" />);
    expect(screen.getByText("My Label")).toBeInTheDocument();
  });

  it("respects the decimals prop", () => {
    render(<RadialDial value={72.4} label="Rate" decimals={1} />);
    expect(screen.getByText("72.4")).toBeInTheDocument();
  });
});
