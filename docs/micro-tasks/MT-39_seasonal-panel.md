# MT-39 — Seasonal Trend Panel (monthly + weekday Recharts bars)

## 1. Context
We are building the **frontend** of *Demand Velocity & Inventory Intelligence* — a futuristic dark
"inventory command center" dashboard (React 18 + TypeScript + Vite). This task builds **P5 —
Seasonal Trend** (`06_UIUX_SPEC.md` §3 layout, §4 P5). It visualizes one product's seasonal profile:
a 12-bar **monthly** chart (Jan…Dec) with the current month highlighted and a `month_vs_avg_pct`
callout, plus a small 7-bar **weekday** row. Data comes from the `seasonal` slice of a
`ForecastResult` (`05_API_CONTRACT.md` §5).

The panel consumes **one product's** `ForecastResult`; the App's `ProductSwitcher` (MT-30) chooses
the active product when several are selected and feeds it in via props.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/05_API_CONTRACT.md` (§5 `ForecastResult.seasonal` = `{ month, month_vs_avg_pct, monthly_avg[12], weekday_avg[7] }`)
- `docs/06_UIUX_SPEC.md` (§2 tokens; §3 layout; §4 **P5**; §5 states; §7 libs — Recharts; §10 tree)
- `docs/07_TESTING_STRATEGY.md` (§3 frontend testing — Vitest + RTL)

**Prior MT artifacts that must already exist (import, do NOT redefine):**
- **MT-30** `src/components/ui/`: `GlassPanel`, `SectionTitle`.
- **MT-30** `src/theme/tokens.css` — `06` §2 CSS vars available as `var(--…)`.
- **MT-31** `src/lib/types.ts` — exports `ForecastResult`, `Seasonal`.
- **MT-31** `src/lib/format.ts` — exports `signedPct(n)` → `"+220%"`.

**Libraries (locked `06` §7):** `recharts`, `framer-motion`.

**Assumed type shape** (from `05` §5, mirrored in MT-31):
```ts
export interface Seasonal {
  month: number;             // 1..12 (the start_date's month, highlighted)
  month_vs_avg_pct: number;  // e.g. 220.0
  monthly_avg: number[];     // length 12, index 0 = January … 11 = December
  weekday_avg: number[];     // length 7, index 0 = wday 1 = Saturday … 6 = wday 7 = Friday
}
export interface ForecastResult { /* … */ seasonal: Seasonal; /* … */ }
```

## 3. Goal
Build `src/components/panels/SeasonalPanel.tsx`: a `GlassPanel` titled **"Seasonal Trend"** with
(a) a Recharts `BarChart` of `seasonal.monthly_avg` labeled **Jan…Dec**, highlighting `seasonal.month`
with the accent color while the others are muted, and a callout like **"Nov runs +220% vs average"**
using `month_vs_avg_pct`; and (b) a smaller `BarChart` of `seasonal.weekday_avg` in **Sat→Fri** order
(wday 1→7). Animates in via Framer Motion; respects `prefers-reduced-motion`. Mock data only.

## 4. Design (locked decisions; cite `06`)
- **Library — Recharts (`06` §7).** Both bar rows are Recharts.
- **Monthly bars (`06` §4 P5).**
  - Map `monthly_avg[0..11]` → `{ label, value, idx }` with `MONTHS = ["Jan",…,"Dec"]`. `idx` is the
    **1-based** month number so we can compare against `seasonal.month`.
  - **Highlight the current month:** the bar where `idx === seasonal.month` is filled with
    `--accent-cyan` `#2FE6FF` (primary accent) and given a glow; every other bar is the muted
    `--accent-violet` `#8B5CFF` at reduced opacity. Highlight via per-bar `<Cell>`.
  - **Callout:** `"{MONTHS[month-1]} runs {signedPct(month_vs_avg_pct)} vs average"` →
    e.g. `"Nov runs +220% vs average"`, in `--text-primary`, the percentage emphasized in the accent
    color. `month_vs_avg_pct` sign drives nothing else here (always shown signed via `signedPct`).
- **Weekday bars (`06` §4 P5).** The contract's `weekday_avg` is in M5 `wday` order **1→7 =
  Saturday→Friday** (per `02_DATA_SPEC.md` / `05` profile). So
  `WEEKDAYS = ["Sat","Sun","Mon","Tue","Wed","Thu","Fri"]` maps **directly** to indices 0→6 — render
  in array order; do **not** re-sort. Bars use `--accent-cyan` at a flat low opacity (this row is a
  secondary "pattern" read, not a status). A small `SectionTitle`/caption labels it "Weekday pattern
  (Sat→Fri)".
- **Tokens (`06` §2).** `GlassPanel` shell; axis ticks `--text-muted`; grid `--grid-line`; values
  mono/tabular in tooltips.
- **Motion (`06` §2).** Panel fade + 12px rise (`0.5s`, ease `[0.22,1,0.36,1]`); bar animation unless
  `prefers-reduced-motion`.
- **States (`06` §5).** Success state only; idle/loading/error owned by container (MT-32/MT-42).

## 5. Implementation (exact path from `06` §10; FULL runnable TSX)
**File:** `frontend/src/components/panels/SeasonalPanel.tsx`

```tsx
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { GlassPanel } from "../ui/GlassPanel";
import { SectionTitle } from "../ui/SectionTitle";
import { signedPct } from "../../lib/format";
import type { ForecastResult } from "../../lib/types";

const CYAN = "#2FE6FF";   // --accent-cyan   : highlighted month / weekday bars
const VIOLET = "#8B5CFF"; // --accent-violet : non-current months
const MUTED = "#8A97B2";
const GRID = "rgba(120, 160, 255, 0.08)";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// M5 wday 1..7 = Saturday..Friday (05 profile / 02 data spec). Array index 0..6 maps directly.
const WEEKDAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

const tooltipStyle = {
  background: "#0E1626",
  border: "1px solid rgba(120,160,255,0.12)",
  borderRadius: 10,
  color: "#E8EEF9",
  fontFamily: "JetBrains Mono, monospace",
} as const;

export interface SeasonalPanelProps {
  result: ForecastResult;
}

export function SeasonalPanel({ result }: SeasonalPanelProps) {
  const reduce = useReducedMotion();
  const { month, month_vs_avg_pct, monthly_avg, weekday_avg } = result.seasonal;

  const monthRows = useMemo(
    () => (monthly_avg ?? []).map((value, i) => ({ label: MONTHS[i], value, idx: i + 1 })),
    [monthly_avg],
  );
  const weekdayRows = useMemo(
    () => (weekday_avg ?? []).map((value, i) => ({ label: WEEKDAYS[i], value })),
    [weekday_avg],
  );

  const monthName = MONTHS[(month - 1 + 12) % 12];

  return (
    <GlassPanel>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-full flex-col gap-4"
        data-testid="seasonal-panel"
      >
        <SectionTitle>Seasonal Trend</SectionTitle>

        {/* Callout */}
        <p className="text-[14px]" style={{ color: "#E8EEF9", fontFamily: "Inter, sans-serif" }} data-testid="seasonal-callout">
          {monthName} runs{" "}
          <span style={{ color: CYAN, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>
            {signedPct(month_vs_avg_pct)}
          </span>{" "}
          vs average
        </p>

        {/* (a) Monthly bars (12) */}
        <div style={{ width: "100%", height: 170 }} data-testid="monthly-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthRows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={{ fill: MUTED, fontFamily: "Inter, sans-serif", fontSize: 11 }} stroke={GRID} interval={0} />
              <YAxis tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 10 }} stroke={GRID} />
              <Tooltip cursor={{ fill: "rgba(120,160,255,0.06)" }} contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={!reduce}>
                {monthRows.map((r) => {
                  const active = r.idx === month;
                  return (
                    <Cell
                      key={r.label}
                      fill={active ? CYAN : VIOLET}
                      fillOpacity={active ? 1 : 0.35}
                      data-testid={`month-${r.label}`}
                      data-active={active ? "true" : "false"}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* (b) Weekday bars (7), Sat→Fri */}
        <div className="flex flex-col gap-1">
          <span className="text-[12px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
            Weekday pattern (Sat→Fri)
          </span>
          <div style={{ width: "100%", height: 110 }} data-testid="weekday-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayRows} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={{ fill: MUTED, fontFamily: "Inter, sans-serif", fontSize: 11 }} stroke={GRID} interval={0} />
                <YAxis tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 10 }} stroke={GRID} />
                <Tooltip cursor={{ fill: "rgba(120,160,255,0.06)" }} contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[5, 5, 0, 0]} isAnimationActive={!reduce}>
                  {weekdayRows.map((r) => (
                    <Cell key={r.label} fill={CYAN} fillOpacity={0.55} data-testid={`weekday-${r.label}`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>
    </GlassPanel>
  );
}

export default SeasonalPanel;
```

## 6. Tests / Verification (Vitest + RTL)
**File:** `frontend/src/components/panels/SeasonalPanel.test.tsx`

We mock `recharts` (jsdom gives `ResponsiveContainer` 0×0) to deterministically count `<Cell>`s and
read the highlighted month's `data-active` flag (`07` §3).

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("recharts", () => {
  const Pass = ({ children }: any) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass,
    BarChart: Pass,
    Bar: ({ children }: any) => <div>{children}</div>,
    Cell: ({ "data-testid": tid, "data-active": active, fill }: any) => (
      <div data-testid={tid} data-active={active} data-fill={fill} />
    ),
    XAxis: Pass, YAxis: Pass, CartesianGrid: Pass, Tooltip: Pass,
  };
});

import { SeasonalPanel } from "./SeasonalPanel";
import type { ForecastResult } from "../../lib/types";

function makeResult(): ForecastResult {
  return {
    series_id: "turkey",
    product_name: "Fresh Whole Turkey",
    seasonal: {
      month: 11, // November
      month_vs_avg_pct: 220.0,
      monthly_avg: [15, 13, 9, 10, 8, 7, 8, 8, 7, 12, 57, 92],
      weekday_avg: [22.1, 18.0, 16.4, 15.9, 17.2, 19.8, 24.0],
    },
  } as unknown as ForecastResult;
}

describe("SeasonalPanel", () => {
  it("renders 12 monthly bars and 7 weekday bars", () => {
    render(<SeasonalPanel result={makeResult()} />);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    months.forEach((m) => expect(screen.getByTestId(`month-${m}`)).toBeInTheDocument());
    const wdays = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
    wdays.forEach((d) => expect(screen.getByTestId(`weekday-${d}`)).toBeInTheDocument());
  });

  it("highlights the current month (Nov) with the accent fill", () => {
    render(<SeasonalPanel result={makeResult()} />);
    expect(screen.getByTestId("month-Nov")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("month-Nov")).toHaveAttribute("data-fill", "#2FE6FF");
    expect(screen.getByTestId("month-Jan")).toHaveAttribute("data-active", "false");
  });

  it("shows the month_vs_avg_pct callout", () => {
    render(<SeasonalPanel result={makeResult()} />);
    expect(screen.getByTestId("seasonal-callout")).toHaveTextContent("Nov runs +220% vs average");
  });
});
```

**Commands** (from `frontend/`):
```bash
npm run test -- SeasonalPanel
npm run build
```

## 7. Acceptance checklist
- [ ] File created at `frontend/src/components/panels/SeasonalPanel.tsx` (path per `06` §10).
- [ ] Recharts `BarChart` with **12 monthly bars** labeled Jan…Dec from `seasonal.monthly_avg`.
- [ ] Current `seasonal.month` bar highlighted with `--accent-cyan`; others muted violet (`06` §4 P5).
- [ ] Callout reads `"{Mon} runs {+pct}% vs average"` using `month_vs_avg_pct` (`06` §4 P5).
- [ ] Recharts `BarChart` with **7 weekday bars** in **Sat→Fri** order (wday 1→7) — array order, no re-sort.
- [ ] Exact `06` §2 hex tokens (cyan / violet); axis/grid use muted/grid tokens.
- [ ] Imports `GlassPanel`, `SectionTitle` from MT-30 and types from MT-31 (no redefine).
- [ ] Framer Motion entrance; `prefers-reduced-motion` disables motion/bar animation (`06` §2/§6).
- [ ] Vitest + RTL tests pass; `npm run build` is clean (`07` §3).
```
