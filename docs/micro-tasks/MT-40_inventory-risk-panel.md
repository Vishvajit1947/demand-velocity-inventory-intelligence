# MT-40 — Inventory Risk Panel (risk badge + projected-stock line + reorder card)

## 1. Context
We are building the **frontend** of *Demand Velocity & Inventory Intelligence* — a futuristic dark
"inventory command center" dashboard (React 18 + TypeScript + Vite). This task builds **P6 —
Inventory Risk** (`06_UIUX_SPEC.md` §3 layout, §4 P6). It turns one product's `inventory` slice of a
`ForecastResult` (`05_API_CONTRACT.md` §5) into: a **stockout-risk badge** (+ optional Overstock
pill), a 28-day **projected-stock line chart** with a dashed safety-stock threshold and a stockout-day
marker, and a **reorder card** with a count-up `recommended_order_qty`.

The panel consumes **one product's** `ForecastResult`; the App's `ProductSwitcher` (MT-30) chooses the
active product when several are selected and feeds it in via props.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/05_API_CONTRACT.md` (§1 `RiskLevel`; §5 `ForecastResult.inventory` =
  `{ on_hand, safety_stock, reorder_point, horizon_demand, cover_days, stockout_risk, overstock, recommended_order_qty, projected_stock[28] }`;
  `horizon_dates[28]`)
- `docs/06_UIUX_SPEC.md` (§2 tokens + status→color map; §3 layout; §4 **P6**; §5 states; §7 libs —
  Recharts, `react-countup`; §10 tree)
- `docs/07_TESTING_STRATEGY.md` (§3 frontend testing — Vitest + RTL; "InventoryRiskPanel shows `recommended_order_qty`")

**Prior MT artifacts that must already exist (import, do NOT redefine):**
- **MT-30** `src/components/ui/`: `GlassPanel`, `StatusBadge`, `SectionTitle`.
- **MT-30** `src/theme/tokens.css` — `06` §2 CSS vars available as `var(--…)`.
- **MT-31** `src/lib/types.ts` — exports `ForecastResult`, `Inventory`, `RiskLevel`.
- **MT-31** `src/lib/format.ts` — exports `fmtInt(n)` (thousands-grouped integer) and `fmtNum(n)`
  (1-dp number).

**Libraries (locked `06` §7):** `recharts`, `react-countup`, `framer-motion`.

**Assumed type shape** (from `05` §5, mirrored in MT-31):
```ts
export type RiskLevel = "Low" | "Medium" | "High";
export interface Inventory {
  on_hand: number; safety_stock: number; reorder_point: number; horizon_demand: number;
  cover_days: number; stockout_risk: RiskLevel; overstock: boolean;
  recommended_order_qty: number; projected_stock: number[]; // length 28
}
export interface ForecastResult { /* … */ inventory: Inventory; horizon_dates: string[]; /* … */ }
```

> **Status→color (`06` §2):** Low risk → `--accent-lime`; Medium → `--accent-amber`; High →
> `--accent-rose`. `StatusBadge` already encodes this mapping (built in MT-30) — pass the raw
> `stockout_risk` string.

## 3. Goal
Build `src/components/panels/InventoryRiskPanel.tsx`: a `GlassPanel` titled **"Inventory Risk"** with
(a) a `StatusBadge` for `inventory.stockout_risk` plus an **"Overstock"** pill when
`inventory.overstock`; (b) a Recharts `LineChart` of `inventory.projected_stock` (28 days) with a
**dashed `safety_stock` `ReferenceLine`** and a marker on the **stockout day** (`cover_days`) when
`cover_days <= 28`; and (c) a **reorder card** showing a count-up `recommended_order_qty` with
supporting `on_hand` / `reorder_point` / `horizon_demand` and the caption **"Simulated reorder model —
illustrative."** Animates in via Framer Motion; respects `prefers-reduced-motion`. Mock data only.

## 4. Design (locked decisions; cite `06`)
- **Library — Recharts (`06` §7).** The projected-stock chart is Recharts; count-up uses
  `react-countup`.
- **Risk badge + Overstock pill (`06` §4 P6).** `StatusBadge status={inventory.stockout_risk}` →
  Low=lime / Medium=amber / High=rose (`06` §2), always with text label (`06` §6). When
  `inventory.overstock === true`, render an extra **"Overstock"** chip (rounded `9999px` per `06` §2
  shape) tinted `--accent-violet`. The pill is omitted entirely when `overstock` is false.
- **Projected-stock line (`06` §4 P6).**
  - Build chart rows `{ day, date, stock }` from `projected_stock[0..27]` zipped with
    `horizon_dates[0..27]`; `day` is 1-based (Day 1 … Day 28).
  - `Line` in `--accent-cyan` `#2FE6FF` with a soft glow; `XAxis` shows day index, `YAxis` units.
  - **Dashed safety-stock threshold:** a horizontal `ReferenceLine y={safety_stock}` with
    `strokeDasharray="6 4"` in `--accent-amber`, labeled "Safety stock".
  - **Stockout-day marker:** if `cover_days <= 28`, draw a vertical `ReferenceLine x={Day cover_days}`
    in `--accent-rose` labeled `"Stockout ~D{cover_days}"`. If `cover_days > 28`, omit the marker.
- **Reorder card (`06` §4 P6).** A card (`14px` radius per `06` §2) with:
  - Big **`recommended_order_qty`** counted up via `react-countup` (0.8s per `06` §2 motion; disabled
    under reduced-motion → render the final integer directly), JetBrains Mono / tabular-nums,
    `--text-primary`.
  - Three supporting figures: **On hand** = `on_hand`, **Reorder point** = `reorder_point`,
    **28-day demand** = `horizon_demand` (1-dp via `fmtNum`).
  - Caption: **"Simulated reorder model — illustrative."** in `--text-muted`.
- **Tokens (`06` §2).** `GlassPanel` shell; exact hex tokens; mono/tabular numerals.
- **Motion (`06` §2).** Panel fade + 12px rise (`0.5s`, ease `[0.22,1,0.36,1]`); line draw + count-up
  unless `prefers-reduced-motion`.
- **States (`06` §5).** Success state only; idle/loading/error owned by container (MT-32/MT-42).

## 5. Implementation (exact path from `06` §10; FULL runnable TSX)
**File:** `frontend/src/components/panels/InventoryRiskPanel.tsx`

```tsx
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import CountUp from "react-countup";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { GlassPanel } from "../ui/GlassPanel";
import { StatusBadge } from "../ui/StatusBadge";
import { SectionTitle } from "../ui/SectionTitle";
import { fmtInt, fmtNum } from "../../lib/format";
import type { ForecastResult } from "../../lib/types";

const CYAN = "#2FE6FF";   // --accent-cyan   : projected stock line
const AMBER = "#FFC24D";  // --accent-amber  : safety-stock threshold
const ROSE = "#FF5C7A";   // --accent-rose   : stockout-day marker
const VIOLET = "#8B5CFF"; // --accent-violet : overstock pill
const MUTED = "#8A97B2";
const GRID = "rgba(120, 160, 255, 0.08)";

interface StockRow { day: number; date: string; stock: number }

export interface InventoryRiskPanelProps {
  result: ForecastResult;
}

export function InventoryRiskPanel({ result }: InventoryRiskPanelProps) {
  const reduce = useReducedMotion();
  const inv = result.inventory;
  const dates = result.horizon_dates ?? [];

  const rows = useMemo<StockRow[]>(
    () => (inv.projected_stock ?? []).map((stock, i) => ({ day: i + 1, date: dates[i] ?? "", stock })),
    [inv.projected_stock, dates],
  );

  const showStockoutMarker = inv.cover_days <= 28;

  return (
    <GlassPanel>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-full flex-col gap-4"
        data-testid="inventory-risk-panel"
      >
        <div className="flex items-center justify-between">
          <SectionTitle>Inventory Risk</SectionTitle>
          <div className="flex items-center gap-2">
            <StatusBadge status={inv.stockout_risk} />
            {inv.overstock && (
              <span
                className="rounded-full px-3 py-1 text-[12px]"
                style={{
                  color: VIOLET,
                  border: `1px solid ${VIOLET}`,
                  background: "rgba(139,92,255,0.12)",
                  fontFamily: "Inter, sans-serif",
                }}
                data-testid="overstock-pill"
              >
                Overstock
              </span>
            )}
          </div>
        </div>

        {/* (b) Projected stock line */}
        <div style={{ width: "100%", height: 180 }} data-testid="projected-stock-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={GRID} />
              <XAxis
                dataKey="day"
                tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}
                stroke={GRID}
                tickFormatter={(d) => `D${d}`}
              />
              <YAxis tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 10 }} stroke={GRID} />
              <Tooltip
                cursor={{ stroke: "rgba(120,160,255,0.3)" }}
                contentStyle={{
                  background: "#0E1626",
                  border: "1px solid rgba(120,160,255,0.12)",
                  borderRadius: 10,
                  color: "#E8EEF9",
                  fontFamily: "JetBrains Mono, monospace",
                }}
                labelFormatter={(d) => `Day ${d}`}
                formatter={(v: number) => [fmtNum(v), "projected stock"]}
              />
              <ReferenceLine
                y={inv.safety_stock}
                stroke={AMBER}
                strokeDasharray="6 4"
                label={{ value: "Safety stock", position: "insideTopRight", fill: AMBER, fontSize: 11 }}
                data-testid="safety-ref"
              />
              {showStockoutMarker && (
                <ReferenceLine
                  x={inv.cover_days}
                  stroke={ROSE}
                  strokeDasharray="2 3"
                  label={{ value: `Stockout ~D${inv.cover_days}`, position: "top", fill: ROSE, fontSize: 11 }}
                  data-testid="stockout-ref"
                />
              )}
              <Line
                type="monotone"
                dataKey="stock"
                stroke={CYAN}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={!reduce}
                style={{ filter: `drop-shadow(0 0 6px ${CYAN})` }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* (c) Reorder card */}
        <div
          className="rounded-[14px] p-4"
          style={{ border: "1px solid var(--border-glass)", background: "rgba(18,26,44,0.4)" }}
          data-testid="reorder-card"
        >
          <div className="flex items-end justify-between">
            <div className="flex flex-col">
              <span className="text-[12px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
                Recommended order qty
              </span>
              <span
                className="leading-none"
                style={{
                  color: "#E8EEF9",
                  fontFamily: "JetBrains Mono, monospace",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 36,
                  fontWeight: 600,
                }}
                data-testid="reorder-qty"
              >
                {reduce ? (
                  fmtInt(inv.recommended_order_qty)
                ) : (
                  <CountUp end={inv.recommended_order_qty} duration={0.8} separator="," />
                )}
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <Figure label="On hand" value={fmtInt(inv.on_hand)} />
            <Figure label="Reorder point" value={fmtNum(inv.reorder_point)} />
            <Figure label="28-day demand" value={fmtNum(inv.horizon_demand)} />
          </div>

          <p className="mt-3 text-[11px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
            Simulated reorder model — illustrative.
          </p>
        </div>
      </motion.div>
    </GlassPanel>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px]" style={{ color: "#8A97B2", fontFamily: "Inter, sans-serif" }}>{label}</span>
      <span
        style={{ color: "#E8EEF9", fontFamily: "JetBrains Mono, monospace", fontVariantNumeric: "tabular-nums", fontSize: 16 }}
      >
        {value}
      </span>
    </div>
  );
}

export default InventoryRiskPanel;
```

## 6. Tests / Verification (Vitest + RTL)
**File:** `frontend/src/components/panels/InventoryRiskPanel.test.tsx`

We mock `recharts` (jsdom 0×0 container) to assert the line + reference lines render, and mock
`react-countup` to render its `end` immediately so the headline number is assertable (per `07` §3 —
"InventoryRiskPanel shows `recommended_order_qty`").

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("react-countup", () => ({
  default: ({ end, separator = "," }: any) => <span>{end.toLocaleString("en-US")}</span>,
}));

vi.mock("recharts", () => {
  const Pass = ({ children }: any) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass,
    LineChart: ({ children }: any) => <div data-testid="linechart">{children}</div>,
    Line: () => <div data-testid="stock-line" />,
    ReferenceLine: ({ "data-testid": tid }: any) => <div data-testid={tid} />,
    XAxis: Pass, YAxis: Pass, CartesianGrid: Pass, Tooltip: Pass,
  };
});

import { InventoryRiskPanel } from "./InventoryRiskPanel";
import type { ForecastResult, RiskLevel } from "../../lib/types";

function makeResult(over: { risk?: RiskLevel; overstock?: boolean; coverDays?: number } = {}): ForecastResult {
  return {
    series_id: "turkey",
    product_name: "Fresh Whole Turkey",
    horizon_dates: Array.from({ length: 28 }, (_, i) => `2015-11-${String(i + 1).padStart(2, "0")}`),
    inventory: {
      on_hand: 260,
      safety_stock: 41,
      reorder_point: 171,
      horizon_demand: 520,
      cover_days: over.coverDays ?? 9,
      stockout_risk: over.risk ?? "Medium",
      overstock: over.overstock ?? false,
      recommended_order_qty: 301,
      projected_stock: Array.from({ length: 28 }, (_, i) => 260 - i * 8),
    },
  } as unknown as ForecastResult;
}

describe("InventoryRiskPanel", () => {
  it("renders the stockout-risk badge text", () => {
    render(<InventoryRiskPanel result={makeResult({ risk: "High" })} />);
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("shows the recommended_order_qty headline number", () => {
    render(<InventoryRiskPanel result={makeResult()} />);
    expect(screen.getByTestId("reorder-qty")).toHaveTextContent("301");
  });

  it("renders the projected stock line and a safety-stock reference line", () => {
    render(<InventoryRiskPanel result={makeResult()} />);
    expect(screen.getByTestId("stock-line")).toBeInTheDocument();
    expect(screen.getByTestId("safety-ref")).toBeInTheDocument();
  });

  it("draws the stockout marker only when cover_days <= 28", () => {
    const { rerender } = render(<InventoryRiskPanel result={makeResult({ coverDays: 9 })} />);
    expect(screen.getByTestId("stockout-ref")).toBeInTheDocument();
    rerender(<InventoryRiskPanel result={makeResult({ coverDays: 99 })} />);
    expect(screen.queryByTestId("stockout-ref")).not.toBeInTheDocument();
  });

  it("toggles the Overstock pill on inventory.overstock", () => {
    const { rerender } = render(<InventoryRiskPanel result={makeResult({ overstock: false })} />);
    expect(screen.queryByTestId("overstock-pill")).not.toBeInTheDocument();
    rerender(<InventoryRiskPanel result={makeResult({ overstock: true })} />);
    expect(screen.getByTestId("overstock-pill")).toHaveTextContent("Overstock");
  });
});
```

**Commands** (from `frontend/`):
```bash
npm run test -- InventoryRiskPanel
npm run build
```

## 7. Acceptance checklist
- [ ] File created at `frontend/src/components/panels/InventoryRiskPanel.tsx` (path per `06` §10).
- [ ] `StatusBadge` renders `inventory.stockout_risk` (Low=lime / Medium=amber / High=rose per `06` §2) with text label.
- [ ] "Overstock" pill shown **only** when `inventory.overstock` is true.
- [ ] Recharts `LineChart` of `projected_stock` (28 days) with `--accent-cyan` line.
- [ ] Dashed `safety_stock` `ReferenceLine` (amber) and stockout-day marker drawn **iff** `cover_days <= 28` (`06` §4 P6).
- [ ] Reorder card shows count-up `recommended_order_qty` + `on_hand` / `reorder_point` / `horizon_demand`.
- [ ] Caption reads exactly **"Simulated reorder model — illustrative."** (`06` §4 P6).
- [ ] Exact `06` §2 hex tokens used; mono/tabular numerals.
- [ ] Imports `GlassPanel`, `StatusBadge`, `SectionTitle` from MT-30 and types from MT-31 (no redefine); count-up via `react-countup`.
- [ ] Framer Motion entrance; `prefers-reduced-motion` disables motion, line draw, and count-up (`06` §2/§6).
- [ ] Vitest + RTL tests pass; `npm run build` is clean (`07` §3).
```
