import { render, screen } from "@testing-library/react";
import { StatCard } from "../StatCard";
import { StatusBadge } from "../StatusBadge";
import { RadialDial } from "../RadialDial";

describe("StatCard (MT-30)", () => {
  it("renders title and value", () => {
    render(<StatCard title="Total Demand" value={1234} />);
    expect(screen.getByText(/Total Demand/i)).toBeInTheDocument();
    // count-up may animate; reduced-motion test env renders final value
    expect(screen.getByText(/1,?234/)).toBeInTheDocument();
  });
});

describe("StatusBadge (MT-30)", () => {
  it("maps Accelerating velocity to lime + shows the label", () => {
    render(<StatusBadge kind="velocity" status="Accelerating" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("Accelerating");
    expect(badge).toHaveClass("text-accent-lime");
    expect(badge).toHaveAttribute("data-accent", "lime");
  });

  it("maps High risk to rose", () => {
    render(<StatusBadge kind="risk" status="High" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("data-accent", "rose");
    expect(badge).toHaveTextContent(/High/i);
  });

  it("maps Stable to cyan", () => {
    render(<StatusBadge kind="velocity" status="Stable" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-accent", "cyan");
  });
});

describe("RadialDial (MT-30)", () => {
  it("shows the value and an accessible label", () => {
    render(<RadialDial value={78} label="Accuracy" />);
    expect(screen.getByText("78")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Accuracy: 78 out of 100/i }),
    ).toBeInTheDocument();
  });

  it("clamps out-of-range values", () => {
    render(<RadialDial value={140} label="Coherence" />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});
