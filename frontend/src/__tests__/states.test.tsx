/**
 * MT-44 — states.test.tsx
 * Integration state tests wiring a real panel through the four states (06 §5; 07 §3).
 *
 * Uses InventoryRiskPanel as the representative panel (it has a clear headline number,
 * a skeleton, and supports idle/loading/success/error via PanelState + ToastHost).
 *
 * react-countup is mocked to render final values synchronously.
 * recharts is mocked so jsdom's zero-size containers don't swallow content.
 * react-plotly.js is globally mocked in setup.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "../components/ui/Toast";
import { ToastHost } from "../components/ui/ToastHost";
import { InventoryRiskPanel } from "../components/panels/InventoryRiskPanel";
import { IDLE_PROMPT } from "../components/ui/PanelState";
import { ApiError } from "../lib/api";
import { turkeyResult } from "../test/fixtures";

// ── Mock react-countup to render end values synchronously ─────────────────
vi.mock("react-countup", () => ({
  default: ({ end }: { end: number }) => (
    <span>{end.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
  ),
}));

// ── Mock recharts to avoid jsdom layout issues ────────────────────────────
vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass,
    LineChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Line: (props: { "data-testid"?: string }) => (
      <div data-testid={props["data-testid"]} />
    ),
    ReferenceLine: (props: { "data-testid"?: string }) => (
      <div data-testid={props["data-testid"]} />
    ),
    ReferenceDot: (props: { "data-testid"?: string }) => (
      <div data-testid={props["data-testid"]} />
    ),
    XAxis: Pass,
    YAxis: Pass,
    CartesianGrid: Pass,
    Tooltip: Pass,
  };
});

// ── Helper: build a real ApiError instance (05 §7) ────────────────────────
function makeApiError(message: string, field?: string): ApiError {
  return new ApiError(
    { error: "validation_error", message, field },
    422,
  );
}

const API_ERROR_MSG =
  "start_date 2016-12-01 is outside the selectable range [2014-01-28, 2016-04-25].";

// ── Tests ─────────────────────────────────────────────────────────────────
describe("States: loading / error / idle / success (06 §5; 07 §3)", () => {
  // ── Loading state: skeleton with role=status ──────────────────────────
  it("loading shows a skeleton (role=status, aria-label=Loading)", () => {
    render(<InventoryRiskPanel result={undefined} loading={true} />);
    // PanelState wraps the skeleton in role=status aria-label="Loading" (06 §5)
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
    // Content and idle prompt must NOT be shown while loading
    expect(screen.queryByText(IDLE_PROMPT)).toBeNull();
    expect(screen.queryByTestId("reorder-qty")).toBeNull();
  });

  // ── Idle state: empty prompt ──────────────────────────────────────────
  it("idle shows the verbatim empty prompt when no result and not loading", () => {
    render(<InventoryRiskPanel result={undefined} loading={false} />);
    // 06 §5 verbatim prompt; IDLE_PROMPT = "Select a date & products, then Forecast"
    expect(screen.getByText(IDLE_PROMPT)).toBeInTheDocument();
    // Neither skeleton nor success content should show
    expect(screen.queryByRole("status", { name: /loading/i })).toBeNull();
    expect(screen.queryByTestId("reorder-qty")).toBeNull();
  });

  // ── Success state: headline number from fixture ───────────────────────
  it("success renders the recommended_order_qty headline from the fixture", () => {
    render(<InventoryRiskPanel result={turkeyResult} loading={false} />);
    // turkey inventory.recommended_order_qty = 1543
    const qty = turkeyResult.inventory.recommended_order_qty;
    const reorderQty = screen.getByTestId("reorder-qty");
    expect(reorderQty.textContent).toMatch(new RegExp(qty.toLocaleString("en-US")));
    // Idle prompt must NOT show when data is present
    expect(screen.queryByText(IDLE_PROMPT)).toBeNull();
  });

  // ── Error state: toast shows the API error message ────────────────────
  it("error shows the API message verbatim in a toast (05 §7)", async () => {
    const err = makeApiError(API_ERROR_MSG, "start_date");
    render(
      <ToastProvider>
        <ToastHost error={err} status="error" />
        {/* Panel retains last good data on error (06 §5) — here result is undefined */}
        <InventoryRiskPanel result={undefined} loading={false} />
      </ToastProvider>,
    );
    // Toast uses role=alert; the message text appears verbatim (05 §7)
    expect(await screen.findByText(API_ERROR_MSG)).toBeInTheDocument();
    // Panel falls back to idle prompt (no prior data)
    expect(screen.getByText(IDLE_PROMPT)).toBeInTheDocument();
  });

  // ── Error with last good data: panel keeps success content ────────────
  it("error while retaining last good data keeps success content visible", async () => {
    const err = makeApiError(API_ERROR_MSG, "start_date");
    render(
      <ToastProvider>
        <ToastHost error={err} status="error" />
        {/* Simulate: result still provided (last successful response retained) */}
        <InventoryRiskPanel result={turkeyResult} loading={false} />
      </ToastProvider>,
    );
    // Toast shows error
    expect(await screen.findByText(API_ERROR_MSG)).toBeInTheDocument();
    // Panel shows last good data — not the idle prompt
    expect(screen.queryByText(IDLE_PROMPT)).toBeNull();
    expect(screen.getByTestId("reorder-qty")).toBeInTheDocument();
  });

  // ── No toast when error is null ───────────────────────────────────────
  it("shows no toast when status is idle with no error", () => {
    render(
      <ToastProvider>
        <ToastHost error={null} status="idle" />
      </ToastProvider>,
    );
    expect(screen.queryByText(API_ERROR_MSG)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
