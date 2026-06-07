/**
 * Chip a11y tests — MT-43 §6 (06 §6).
 * Verifies: focusable checkbox role, aria-checked, Enter/Space keyboard toggle.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Chip } from "./Chip";

describe("Chip a11y (06 §6)", () => {
  it("is a focusable checkbox reflecting active state", () => {
    render(
      <Chip active={true} onToggle={() => {}}>
        Turkey
      </Chip>,
    );
    const chip = screen.getByRole("checkbox", { name: "Turkey" });
    expect(chip).toHaveAttribute("aria-checked", "true");
    expect(chip).toHaveAttribute("tabindex", "0");
  });

  it("reflects inactive state via aria-checked=false", () => {
    render(
      <Chip active={false} onToggle={() => {}}>
        Milk
      </Chip>,
    );
    const chip = screen.getByRole("checkbox", { name: "Milk" });
    expect(chip).toHaveAttribute("aria-checked", "false");
  });

  it("toggles on Enter", () => {
    const onToggle = vi.fn();
    render(
      <Chip active={false} onToggle={onToggle}>
        Milk
      </Chip>,
    );
    const chip = screen.getByRole("checkbox", { name: "Milk" });
    fireEvent.keyDown(chip, { key: "Enter" });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("toggles on Space and prevents default scroll", () => {
    const onToggle = vi.fn();
    render(
      <Chip active={false} onToggle={onToggle}>
        Milk
      </Chip>,
    );
    const chip = screen.getByRole("checkbox", { name: "Milk" });
    const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    chip.dispatchEvent(event);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it("does not toggle on other keys", () => {
    const onToggle = vi.fn();
    render(
      <Chip active={false} onToggle={onToggle}>
        Candy
      </Chip>,
    );
    const chip = screen.getByRole("checkbox", { name: "Candy" });
    fireEvent.keyDown(chip, { key: "Tab" });
    fireEvent.keyDown(chip, { key: "ArrowDown" });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("calls onToggle on click", () => {
    const onToggle = vi.fn();
    render(
      <Chip active={false} onToggle={onToggle}>
        Bread
      </Chip>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Bread" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
