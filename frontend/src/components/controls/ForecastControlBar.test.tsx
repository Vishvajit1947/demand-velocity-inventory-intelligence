/**
 * ForecastControlBar tests — MT-33.
 * Covers the three assertions from 07 §3:
 *   1. Disables Forecast when no product selected.
 *   2. Disables out-of-range dates (clamps/ignores values outside the window).
 *   3. Calls the submit handler with { product_ids, start_date }.
 * Plus spinner/pending state, Select all, and snapshot of constraint attributes.
 *
 * All MT-31 hooks are mocked → offline + deterministic (07 §1).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForecastControlBar } from "./ForecastControlBar";
import type { BoundsResponse, ProductInfo } from "../../lib/types";

// ── Fixture data — mirrors 05 §3/§4 ────────────────────────────────────────
const BOUNDS: BoundsResponse = {
  train_start: "2011-01-29",
  train_end: "2014-01-27",
  test_start: "2014-01-28",
  test_end: "2016-05-22",
  first_selectable_date: "2014-01-28",
  last_selectable_date: "2016-04-25",
  horizon: 28,
  history_window: 84,
};

const PRODUCTS: ProductInfo[] = [
  {
    series_id: "turkey",
    item_id: "FOODS_3_069",
    name: "Fresh Whole Turkey",
    dept_id: "FOODS_3",
    archetype: "Event-driven",
    overall_mean: 18.6,
    seasonal_cv: 1.25,
  },
  {
    series_id: "candy",
    item_id: "FOODS_3_090",
    name: "Candy",
    dept_id: "FOODS_3",
    archetype: "Seasonal",
    overall_mean: 10,
    seasonal_cv: 1.0,
  },
  {
    series_id: "milk",
    item_id: "FOODS_3_120",
    name: "Whole Milk",
    dept_id: "FOODS_3",
    archetype: "Stable baseline",
    overall_mean: 30,
    seasonal_cv: 0.2,
  },
];

// ── Mock MT-31 hooks so the bar renders fully offline ───────────────────────
vi.mock("../../hooks/useForecast", () => ({
  useBounds: () => ({ data: BOUNDS, isLoading: false }),
  useProducts: () => ({ data: { products: PRODUCTS }, isLoading: false }),
  useForecastMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

// ── Helper: renders with sane defaults, returns spies ───────────────────────
function setup(
  overrides: Partial<React.ComponentProps<typeof ForecastControlBar>> = {},
) {
  const onSubmit = vi.fn();
  const onDateChange = vi.fn();
  const onProductsChange = vi.fn();
  render(
    <ForecastControlBar
      selectedDate="2016-04-25"
      selectedIds={[]}
      isPending={false}
      onDateChange={onDateChange}
      onProductsChange={onProductsChange}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { onSubmit, onDateChange, onProductsChange };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("ForecastControlBar (MT-33)", () => {
  beforeEach(() => vi.clearAllMocks());

  // 07 §3 — "disables Forecast when no product selected"
  it("disables Forecast when no product is selected", () => {
    setup({ selectedIds: [] });
    const btn = screen.getByRole("button", { name: /run forecast/i });
    expect(btn).toBeDisabled();
  });

  // 07 §3 — "calls the submit handler with { product_ids, start_date }"
  it("enables Forecast and submits the correct payload when products are selected", () => {
    const { onSubmit } = setup({
      selectedIds: ["turkey", "milk"],
      selectedDate: "2015-11-01",
    });
    const btn = screen.getByRole("button", { name: /run forecast/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      product_ids: ["turkey", "milk"],
      start_date: "2015-11-01",
    });
  });

  // 07 §3 — "disables out-of-range dates"
  it("constrains the date input to the selectable range (min/max attributes)", () => {
    setup({ selectedIds: ["turkey"] });
    // Open the popover
    fireEvent.click(screen.getByLabelText(/Choose start date/i));
    const input = screen.getByLabelText(
      /forecast start date input/i,
    ) as HTMLInputElement;
    expect(input.min).toBe("2014-01-28");
    expect(input.max).toBe("2016-04-25");
  });

  it("clamps an out-of-range date value and never emits it as-is", () => {
    const { onDateChange } = setup({ selectedIds: ["turkey"] });
    fireEvent.click(screen.getByLabelText(/Choose start date/i));
    const input = screen.getByLabelText(
      /forecast start date input/i,
    ) as HTMLInputElement;
    // Simulate a value beyond last_selectable_date.
    fireEvent.change(input, { target: { value: "2016-12-01" } });
    // Should be clamped to last_selectable_date, never emitted as "2016-12-01".
    expect(onDateChange).toHaveBeenCalledWith("2016-04-25");
  });

  it("clamps a date before first_selectable_date to the lower bound", () => {
    const { onDateChange } = setup({ selectedIds: ["turkey"] });
    fireEvent.click(screen.getByLabelText(/Choose start date/i));
    const input = screen.getByLabelText(
      /forecast start date input/i,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2013-01-01" } });
    expect(onDateChange).toHaveBeenCalledWith("2014-01-28");
  });

  // Spinner + "Forecasting…" while mutation is pending (06 §5)
  it("shows Forecasting… and disables the button while isPending", () => {
    setup({ selectedIds: ["turkey"], isPending: true });
    expect(screen.getByText(/forecasting…/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run forecast/i })).toBeDisabled();
  });

  // Select all selects all available products in API order
  it("Select all calls onChange with all product series_ids in API order", () => {
    const { onProductsChange } = setup({ selectedIds: [] });
    fireEvent.click(screen.getByText(/select all/i));
    expect(onProductsChange).toHaveBeenCalledWith(["turkey", "candy", "milk"]);
  });

  // Clear empties the selection
  it("Clear calls onChange with an empty array", () => {
    const { onProductsChange } = setup({ selectedIds: ["turkey"] });
    fireEvent.click(screen.getByText(/clear/i));
    expect(onProductsChange).toHaveBeenCalledWith([]);
  });

  // Individual chip toggle adds / removes a product
  it("clicking a chip toggles it into selectedIds", () => {
    const { onProductsChange } = setup({ selectedIds: [] });
    // Click the "Candy" chip
    fireEvent.click(screen.getByRole("checkbox", { name: /candy/i }));
    expect(onProductsChange).toHaveBeenCalledWith(["candy"]);
  });

  it("clicking an already-active chip removes it from selectedIds", () => {
    const { onProductsChange } = setup({ selectedIds: ["turkey", "candy"] });
    // Click the "Candy" chip to deselect it
    fireEvent.click(screen.getByRole("checkbox", { name: /candy/i }));
    expect(onProductsChange).toHaveBeenCalledWith(["turkey"]);
  });

  // Date popover opens and shows range hint
  it("date popover shows the selectable range hint", () => {
    setup({ selectedIds: [] });
    fireEvent.click(screen.getByLabelText(/Choose start date/i));
    // The popover hint paragraph contains both bound dates.
    // "Apr 25, 2016" also appears in the trigger button, so we look
    // specifically for the hint paragraph that contains BOTH dates.
    const hint = screen.getByText((content, el) =>
      el?.tagName === "P" &&
      content.includes("Jan 28, 2014") &&
      content.includes("Apr 25, 2016"),
    );
    expect(hint).toBeInTheDocument();
  });
});
