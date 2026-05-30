# MT-38 — Event Impact Panel (Recharts horizontal bars + horizon timeline)

## 1. Context
We are building the **frontend** of *Demand Velocity & Inventory Intelligence* — a futuristic dark
"inventory command center" dashboard (React 18 + TypeScript + Vite). This task builds **P4 — Event
Impact** (`06_UIUX_SPEC.md` §3 layout, §4 P4). The panel quantifies how calendar events move demand
for one product: a **horizontal bar chart** of `event_uplift` (per-event % swing) plus a **thin
horizon timeline** that places the `events_in_horizon` as labeled ticks across the 28-day window.
Both come from one product's `ForecastResult` (`05_API_CONTRACT.md` §5).

The panel consumes **one product's** `ForecastResult`. When multiple products are selected the App's
`ProductSwitcher` (MT-30) picks the active product and feeds it in via props; this panel is agnostic
to the switcher.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/05_API_CONTRACT.md` (§1 `EventInfo`; §5 `ForecastResult.event_uplift` = `map<string,number>`,
  `events_in_horizon` = `EventInfo[]`, `horizon_dates` = `string[28]`)
- `docs/06_UIUX_SPEC.md` (§2 tokens; §3 layout; §4 **P4**; §5 states; §7 libs — Recharts; §10 tree)
- `docs/07_TESTING_STRATEGY.md` (§3 frontend testing — Vitest + RTL)

**Prior MT artifacts that must already exist (import, do NOT redefine):**
- **MT-30** `src/components/ui/`: `GlassPanel`, `SectionTitle`. (`StatusBadge`, `RadialDial`,
  `ProductSwitcher` exist but are not used here.)
- **MT-30** `src/theme/tokens.css` — `06` §2 CSS custom properties available as `var(--…)`.
- **MT-31** `src/lib/types.ts` — exports `ForecastResult`, `EventInfo`.
- **MT-31** `src/lib/format.ts` — exports `signedPct(n)` → `"+517%"` / `"-37%"`.

**Libraries (locked `06` §7):** `recharts`, `framer-motion`, `lucide-react`.

**Assumed type shape** (from `05` §5, mirrored in MT-31):
```ts
export interface EventInfo { date: string; name: string; type: string }
export interface ForecastResult {
  /* … */
  horizon_dates: string[];                 // length 28, ISO YYYY-MM-DD
  events_in_horizon: EventInfo[];
  event_uplift: Record<string, number>;    // e.g. { Thanksgiving: 517, ValentinesDay: 92 }
  /* … */
}
```

## 3. Goal
Build `src/components/panels/EventImpactPanel.tsx`: a `GlassPanel` titled **"Event Impact"** with
(a) a Recharts **horizontal** `BarChart` of `event_uplift` entries sorted by **|value| desc**, bars
colored **lime for ≥0 / rose for <0**, each labeled like `+517%`; and (b) a **thin horizon timeline
strip** showing `events_in_horizon` as labeled ticks positioned by their index within
`horizon_dates`. Animates in via Framer Motion; respects `prefers-reduced-motion`. Mock data only.

## 4. Design (locked decisions; cite `06`)
- **Library — Recharts (`06` §7).** All bars use Recharts; Plotly is reserved for the velocity gauge
  only.
- **Uplift bar chart (`06` §4 P4).**
  - Transform `event_uplift` (a `Record<string,number>`) into an array `{ name, value }[]`, **sorted
    by `|value|` descending**.
  - `BarChart` with `layout="vertical"` (Recharts term for **horizontal bars**): `XAxis type="number"`
    (the % value), `YAxis type="category" dataKey="name"` (event names on the left).
  - **Per-bar color via `<Cell>`:** `value >= 0` → `--accent-lime` `#4DFFB0`; `value < 0` →
    `--accent-rose` `#FF5C7A` (positive/negative semantics from `06` §2 status→color map).
  - **Value labels** rendered via a `<LabelList>` custom formatter using `signedPct` → e.g. `+517%`,
    `-37%`. Labels use JetBrains Mono, `--text-primary`.
  - Axes: `--text-muted` ticks, `--grid-line` grid; tooltip shows event name + `signedPct(value)`.
- **Horizon timeline strip (`06` §4 P4).**
  - A thin full-width track representing the **28-day horizon**. For each `events_in_horizon` item,
    compute its **fractional position** = `idx / (horizon_dates.length - 1)` where
    `idx = horizon_dates.indexOf(event.date)`; render a glowing tick (cyan dot) at `left: pct%` with
    the event **name** as a small label. Events whose date is not found in `horizon_dates`
    (`idx < 0`) are skipped defensively.
  - Track styled with `--border-glass` border; ticks glow with `--accent-cyan`. A start/end caption
    shows the first and last `horizon_dates` (the 28-day window bounds), `--text-muted`.
  - If `events_in_horizon` is empty, show a muted "No events in this 28-day window." line.
- **Tokens (`06` §2).** `GlassPanel` shell; mono tabular numerals for values; colors are the exact
  hex tokens.
- **Motion (`06` §2).** Panel body fade + 12px rise (`0.5s`, ease `[0.22,1,0.36,1]`); Recharts bar
  animation enabled unless `prefers-reduced-motion`.
- **States (`06` §5).** Success state only; idle/loading/error owned by container (MT-32/MT-42).

## 5. Implementation (exact path from `06` §10; FULL runnable TSX)
**File:** `frontend/src/components/panels/EventImpactPanel.tsx`

```tsx
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer,
} from "recharts";
import { GlassPanel } from "../ui/GlassPanel";
import { SectionTitle } from "../ui/SectionTitle";
import { signedPct } from "../../lib/format";
import type { ForecastResult } from "../../lib/types";

const LIME = "#4DFFB0"; // --accent-lime  : positive uplift
const ROSE = "#FF5C7A"; // --accent-rose  : negative uplift
const CYAN = "#2FE6FF"; // --accent-cyan  : horizon ticks
const MUTED = "#8A97B2";
const GRID = "rgba(120, 160, 255, 0.08)";

const barColor = (v: number) => (v >= 0 ? LIME : ROSE);

interface UpliftRow { name: string; value: number }

export interface EventImpactPanelProps {
  result: ForecastResult;
}

export function EventImpactPanel({ result }: EventImpactPanelProps) {
  const reduce = useReducedMotion();
  const { event_uplift, events_in_horizon, horizon_dates } = result;

  // event_uplift map → rows sorted by |value| desc (06 §4 P4).
  const rows = useMemo<UpliftRow[]>(
    () =>
      Object.entries(event_uplift ?? {})
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    [event_uplift],
  );

  // Horizon ticks: fractional position of each event within the 28-day window.
  const lastIdx = Math.max(1, (horizon_dates?.length ?? 1) - 1);
  const ticks = useMemo(
    () =>
      (events_in_horizon ?? [])
        .map((ev) => {
          const idx = horizon_dates?.indexOf(ev.date) ?? -1;
          return { ...ev, idx, pct: (idx / lastIdx) * 100 };
        })
        .filter((t) => t.idx >= 0),
    [events_in_horizon, horizon_dates, lastIdx],
  );

  const chartHeight = Math.max(140, rows.length * 38);

  return (
    <GlassPanel>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-full flex-col gap-4"
        data-testid="event-impact-panel"
      >
        <SectionTitle>Event Impact</SectionTitle>

        {/* (a) Uplift horizontal bar chart */}
        {rows.length === 0 ? (
          <p className="text-[13px]" style={{ color: MUTED }}>
            No event uplift profile for this product.
          </p>
        ) : (
          <div style={{ width: "100%", height: chartHeight }} data-testid="event-uplift-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={rows}
                margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
              >
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis
                  type="number"
                  tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}
                  tickFormatter={(v) => signedPct(Number(v))}
                  stroke={GRID}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fill: "#E8EEF9", fontFamily: "Inter, sans-serif", fontSize: 12 }}
                  stroke={GRID}
                />
                <Tooltip
                  cursor={{ fill: "rgba(120,160,255,0.06)" }}
                  contentStyle={{
                    background: "#0E1626",
                    border: "1px solid rgba(120,160,255,0.12)",
                    borderRadius: 10,
                    color: "#E8EEF9",
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  formatter={(v: number) => [signedPct(v), "uplift"]}
                />
                <Bar
                  dataKey="value"
                  radius={[0, 6, 6, 0]}
                  isAnimationActive={!reduce}
                  data-testid="event-bar"
                >
                  {rows.map((r) => (
                    <Cell key={r.name} fill={barColor(r.value)} data-testid={`bar-${r.name}`} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    formatter={(v: number) => signedPct(v)}
                    style={{ fill: "#E8EEF9", fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* (b) Horizon timeline strip */}
        <div className="mt-1" data-testid="horizon-strip">
          <div className="mb-2 flex items-center justify-between text-[11px]" style={{ color: MUTED, fontFamily: "JetBrains Mono, monospace" }}>
            <span>{horizon_dates?.[0] ?? "—"}</span>
            <span>28-day horizon</span>
            <span>{horizon_dates?.[horizon_dates.length - 1] ?? "—"}</span>
          </div>

          <div
            className="relative h-9 w-full rounded-full"
            style={{ border: "1px solid var(--border-glass)", background: "rgba(18,26,44,0.4)" }}
          >
            {ticks.length === 0 ? (
              <span
                className="absolute inset-0 flex items-center justify-center text-[11px]"
                style={{ color: MUTED }}
              >
                No events in this 28-day window.
              </span>
            ) : (
              ticks.map((t) => (
                <div
                  key={`${t.date}-${t.name}`}
                  className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                  style={{ left: `${t.pct}%` }}
                  data-testid="horizon-event"
                  title={`${t.name} — ${t.date}`}
                >
                  <span
                    className="block h-3 w-3 rounded-full"
                    style={{ background: CYAN, boxShadow: `0 0 10px ${CYAN}` }}
                  />
                  <span
                    className="mt-1 whitespace-nowrap text-[10px]"
                    style={{ color: "#E8EEF9", fontFamily: "Inter, sans-serif" }}
                  >
                    {t.name}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </GlassPanel>
  );
}

export default EventImpactPanel;
```

## 6. Tests / Verification (Vitest + RTL)
**File:** `frontend/src/components/panels/EventImpactPanel.test.tsx`

Recharts measures its container; under jsdom `ResponsiveContainer` has 0×0 size, so we **mock**
`recharts` to capture `data`/`Cell` props deterministically (per `07` §3) and assert the row count,
per-bar colors, and that horizon event names render in the strip.

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Lightweight recharts mock: render Cells so we can read their fill, and expose the data length.
vi.mock("recharts", () => {
  const Pass = ({ children }: any) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass,
    BarChart: ({ data, children }: any) => (
      <div data-testid="barchart" data-rows={data.length}>{children}</div>
    ),
    Bar: ({ children }: any) => <div data-testid="bar">{children}</div>,
    Cell: ({ fill, "data-testid": tid }: any) => <div data-testid={tid} data-fill={fill} />,
    XAxis: Pass, YAxis: Pass, CartesianGrid: Pass, Tooltip: Pass, LabelList: () => null,
  };
});

import { EventImpactPanel } from "./EventImpactPanel";
import type { ForecastResult } from "../../lib/types";

function makeResult(): ForecastResult {
  return {
    series_id: "turkey",
    product_name: "Fresh Whole Turkey",
    horizon_dates: Array.from({ length: 28 }, (_, i) => {
      const d = new Date(Date.UTC(2015, 10, 1 + i)); // 2015-11-01 .. 11-28
      return d.toISOString().slice(0, 10);
    }),
    events_in_horizon: [{ date: "2015-11-26", name: "Thanksgiving", type: "National" }],
    event_uplift: { Thanksgiving: 517, ValentinesDay: -37, Easter: 92 },
  } as unknown as ForecastResult;
}

describe("EventImpactPanel", () => {
  it("renders one bar (Cell) per event_uplift key", () => {
    render(<EventImpactPanel result={makeResult()} />);
    expect(screen.getByTestId("barchart")).toHaveAttribute("data-rows", "3");
  });

  it("colors positive uplift lime and negative uplift rose", () => {
    render(<EventImpactPanel result={makeResult()} />);
    expect(screen.getByTestId("bar-Thanksgiving")).toHaveAttribute("data-fill", "#4DFFB0"); // +
    expect(screen.getByTestId("bar-ValentinesDay")).toHaveAttribute("data-fill", "#FF5C7A"); // -
  });

  it("shows events_in_horizon names on the timeline strip", () => {
    render(<EventImpactPanel result={makeResult()} />);
    const strip = screen.getByTestId("horizon-strip");
    expect(strip).toHaveTextContent("Thanksgiving");
    expect(screen.getByTestId("horizon-event")).toBeInTheDocument();
  });
});
```

**Commands** (from `frontend/`):
```bash
npm run test -- EventImpactPanel
npm run build
```

## 7. Acceptance checklist
- [ ] File created at `frontend/src/components/panels/EventImpactPanel.tsx` (path per `06` §10).
- [ ] Recharts horizontal `BarChart` (Recharts `layout="vertical"`) of `event_uplift` entries.
- [ ] Rows sorted by **|value| descending** (`06` §4 P4).
- [ ] Bars colored **lime for ≥0 / rose for <0** via `<Cell>` (exact `06` §2 hex tokens).
- [ ] Value labels formatted like `+517%` / `-37%` via `signedPct` (`06` §4 P4).
- [ ] Horizon timeline strip places `events_in_horizon` as labeled ticks, positioned from
      `horizon_dates` index (`06` §4 P4); start/end dates shown.
- [ ] Empty-events case handled (muted "No events…" message).
- [ ] Imports `GlassPanel`, `SectionTitle` from MT-30 and types from MT-31 (no redefine).
- [ ] Framer Motion entrance; `prefers-reduced-motion` disables motion/bar animation (`06` §2/§6).
- [ ] Vitest + RTL tests pass; `npm run build` is clean (`07` §3).
```
