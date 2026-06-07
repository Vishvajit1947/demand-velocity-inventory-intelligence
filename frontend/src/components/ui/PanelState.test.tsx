import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PanelState, IDLE_PROMPT } from "./PanelState";

describe("PanelState (06 §5 states)", () => {
  it("idle: shows the empty prompt when not loading and no data", () => {
    render(
      <PanelState loading={false} hasData={false} skeleton={<div data-testid="sk" />}>
        <div data-testid="content" />
      </PanelState>,
    );
    expect(screen.getByText(IDLE_PROMPT)).toBeInTheDocument();
    expect(screen.queryByTestId("content")).toBeNull();
    expect(screen.queryByTestId("sk")).toBeNull();
  });

  it("loading: renders the skeleton (role=status) and not the content/idle", () => {
    render(
      <PanelState loading={true} hasData={false} skeleton={<div data-testid="sk" />}>
        <div data-testid="content" />
      </PanelState>,
    );
    expect(screen.getByTestId("sk")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
    expect(screen.queryByText(IDLE_PROMPT)).toBeNull();
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("success / error-with-last-good-data: renders children when hasData", () => {
    render(
      <PanelState loading={false} hasData={true} skeleton={<div data-testid="sk" />}>
        <div data-testid="content">ok</div>
      </PanelState>,
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(screen.queryByText(IDLE_PROMPT)).toBeNull();
  });

  it("loading takes priority over hasData (loading spinner beats stale data)", () => {
    render(
      <PanelState loading={true} hasData={true} skeleton={<div data-testid="sk" />}>
        <div data-testid="content">stale</div>
      </PanelState>,
    );
    // While loading, show skeleton — not content
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).toBeNull();
  });
});
