# MT-41 — Explainability & Deep Dive Panel (narrative cards + factor bars + tabs)

## 1. Context
We are building the **frontend** of *Demand Velocity & Inventory Intelligence* — a futuristic dark
"inventory command center" dashboard (React 18 + TypeScript + Vite). This task builds **P7 —
Explainability & Deep Dive** (`06_UIUX_SPEC.md` §3 layout, §4 P7). It explains *why* the forecast
looks the way it does for one product: glowing **narrative bullet cards** (icon per factor kind),
**factor bars** (event / seasonal / trend, value %), and a secondary **"Deep Dive" tab** with a longer
history line chart plus the monthly/weekday profile mini-charts. Data comes from the `explainability`,
`history`, and `seasonal` slices of a `ForecastResult` (`05_API_CONTRACT.md` §5).

The panel consumes **one product's** `ForecastResult`; the App's `ProductSwitcher` (MT-30) chooses the
active product when several are selected and feeds it in via props.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/05_API_CONTRACT.md` (§5 `explainability` = `{ narrative: string[], factors: {label,value,kind}[] }`
  where `kind ∈ {"event","seasonal","trend"}`; `history` = `{ dates[84], units[84] }`;
  `seasonal.monthly_avg[12]`, `seasonal.weekday_avg[7]`)
- `docs/06_UIUX_SPEC.md` (§2 tokens; §3 layout; §4 **P7**; §5 states; §7 libs — Recharts, lucide,
  shadcn primitives; §8 inventory; §10 tree)
- `docs/07_TESTING_STRATEGY.md` (§3 frontend testing — Vitest + RTL)

**Prior MT artifacts that must already exist (import, do NOT redefine):**
- **MT-30** `src/components/ui/`: `GlassPanel`, `SectionTitle`. (A `Tabs` primitive is **not** part of
  the MT-30 inventory in `06` §8, so this task defines a tiny **local** toggle — see Design.)
- **MT-30** `src/theme/tokens.css` — `06` §2 CSS vars available as `var(--…)`.
- **MT-31** `src/lib/types.ts` — exports `ForecastResult`, `Explainability`, `Factor`, `FactorKind`.
- **MT-31** `src/lib/format.ts` — exports `signedPct(n)` and `fmtNum(n)`.

**Libraries (locked `06` §7):** `recharts`, `framer-motion`, `lucide-react`.

**Assumed type shape** (from `05` §5, mirrored in MT-31):
```ts
export type FactorKind = "event" | "seasonal" | "trend";
export interface Factor { label: string; value: number; kind: FactorKind }
export interface Explainability {
  event_contribution_pct: number; snap_days_in_horizon: number;
  narrative: string[]; factors: Factor[];
}
export interface ForecastResult {
  /* … */
  history: { dates: string[]; units: number[] };       // length 84
  seasonal: { /* … */ monthly_avg: number[]; weekday_avg: number[] };
  explainability: Explainability;
  /* … */
}
```

## 3. Goal
Build `src/components/panels/ExplainabilityPanel.tsx`: a `GlassPanel` titled **"Explainability"** with
a **local two-tab toggle** (`Insights` | `Deep Dive`). The **Insights** tab renders each
`explainability.narrative` string as a glowing bullet card (lucide icon chosen by the matching
factor's `kind`) and `explainability.factors` as labeled horizontal bars (value %). The **Deep Dive**
tab renders a Recharts `LineChart` over the full `history` (84 days) plus two profile mini bar charts
(monthly 12 / weekday 7 from `seasonal`). Animates in via Framer Motion; respects
`prefers-reduced-motion`. Mock data only.

## 4. Design (locked decisions; cite `06`)
- **Tabs — local toggle (`06` §4 P7, §7).** `06` §8 does not list a `Tabs` primitive among MT-30
  components, so define a **small local segmented toggle** in this file (two glass chips, `9999px`
  radius per `06` §2; the active chip glows `--accent-cyan`). State via `useState<"insights"|"deep">`.
  Both chips are real `<button>`s (keyboard-operable per `06` §6). This is the "simple Tabs primitive
  (… or a local toggle)" the brief allows.
- **Narrative cards (`06` §4 P7).** Render each `narrative[i]` as a glass card with a leading **lucide
  icon by kind** — mapping factor kinds to the corresponding `narrative` entry **by index** (the
  contract lists narrative bullets and factors in the same logical order; when there is no factor at
  that index, fall back to a neutral `Sparkles` icon). Icon → kind map:
  | kind | lucide icon | accent (`06` §2) |
  |---|---|---|
  | `event` | `CalendarClock` | `--accent-rose` `#FF5C7A` |
  | `seasonal` | `Snowflake` | `--accent-cyan` `#2FE6FF` |
  | `trend` | `TrendingUp` | `--accent-lime` `#4DFFB0` |
  | (none) | `Sparkles` | `--accent-violet` `#8B5CFF` |

  Each card glows with its accent at low opacity (`06` §2 glow utility).
- **Factor bars (`06` §4 P7).** `explainability.factors` as labeled **horizontal** bars; bar width
  ∝ `value` relative to the max `|value|` across factors; color by `kind` (same map above); value
  label `signedPct(value)`. Implemented as simple CSS-width divs (deterministic, no chart lib needed)
  so tests can read one bar per factor.
- **Deep Dive (`06` §4 P7).**
  - **History line:** Recharts `LineChart` over `history.dates`/`history.units` (84 pts), `--accent-cyan`
    line, muted axes — the "longer context" view (`06` §4 P7).
  - **Profile mini-charts:** two small Recharts `BarChart`s — monthly (`seasonal.monthly_avg`, 12,
    Jan…Dec) and weekday (`seasonal.weekday_avg`, 7, **Sat→Fri** = wday 1→7, consistent with MT-39).
    Bars `--accent-violet` low opacity. These reuse the same data the Seasonal panel uses, shown here
    purely for context.
- **Tokens (`06` §2).** `GlassPanel` shell; exact hex tokens; mono/tabular numerals; chip radius 9999.
- **Motion (`06` §2).** Panel fade + 12px rise (`0.5s`, ease `[0.22,1,0.36,1]`); narrative cards
  stagger 0.06s; line/bars animate unless `prefers-reduced-motion`.
- **States (`06` §5).** Success state only; idle/loading/error owned by container (MT-32/MT-42).

## 5. Implementation (exact path from `06` §10; FULL runnable TSX)
**File:** `frontend/src/components/panels/ExplainabilityPanel.tsx`

```tsx
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarClock, Snowflake, TrendingUp, Sparkles, type LucideIcon } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { GlassPanel } from "../ui/GlassPanel";
import { SectionTitle } from "../ui/SectionTitle";
import { signedPct, fmtNum } from "../../lib/format";
import type { ForecastResult, FactorKind } from "../../lib/types";

const ROSE = "#FF5C7A";
const CYAN = "#2FE6FF";
const LIME = "#4DFFB0";
const VIOLET = "#8B5CFF";
const MUTED = "#8A97B2";
const GRID = "rgba(120, 160, 255, 0.08)";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]; // wday 1..7 (consistent w/ MT-39)

const KIND_ICON: Record<FactorKind, LucideIcon> = {
  event: CalendarClock,
  seasonal: Snowflake,
  trend: TrendingUp,
};
const KIND_COLOR: Record<FactorKind, string> = {
  event: ROSE,
  seasonal: CYAN,
  trend: LIME,
};

const tooltipStyle = {
  background: "#0E1626",
  border: "1px solid rgba(120,160,255,0.12)",
  borderRadius: 10,
  color: "#E8EEF9",
  fontFamily: "JetBrains Mono, monospace",
} as const;

type TabKey = "insights" | "deep";

export interface ExplainabilityPanelProps {
  result: ForecastResult;
}

export function ExplainabilityPanel({ result }: ExplainabilityPanelProps) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<TabKey>("insights");
  const { explainability, history, seasonal } = result;
  const { narrative, factors } = explainability;

  const maxAbs = useMemo(
    () => Math.max(1, ...factors.map((f) => Math.abs(f.value))),
    [factors],
  );

  const monthRows = useMemo(
    () => (seasonal.monthly_avg ?? []).map((value, i) => ({ label: MONTHS[i], value })),
    [seasonal.monthly_avg],
  );
  const weekdayRows = useMemo(
    () => (seasonal.weekday_avg ?? []).map((value, i) => ({ label: WEEKDAYS[i], value })),
    [seasonal.weekday_avg],
  );
  const historyRows = useMemo(
    () => (history.dates ?? []).map((date, i) => ({ date, units: history.units?.[i] ?? 0 })),
    [history.dates, history.units],
  );

  return (
    <GlassPanel>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-full flex-col gap-4"
        data-testid="explainability-panel"
      >
        <div className="flex items-center justify-between">
          <SectionTitle>Explainability</SectionTitle>
          {/* Local two-tab toggle (06 §4 P7 — simple local toggle) */}
          <div className="flex gap-1 rounded-full p-1" style={{ border: "1px solid var(--border-glass)" }} role="tablist">
            <TabChip active={tab === "insights"} onClick={() => setTab("insights")} id="tab-insights">
              Insights
            </TabChip>
            <TabChip active={tab === "deep"} onClick={() => setTab("deep")} id="tab-deep">
              Deep Dive
            </TabChip>
          </div>
        </div>

        {tab === "insights" ? (
          <div className="flex flex-col gap-4" data-testid="insights-tab">
            {/* Narrative cards */}
            <div className="flex flex-col gap-2">
              {narrative.map((text, i) => {
                const kind = factors[i]?.kind as FactorKind | undefined;
                const Icon = kind ? KIND_ICON[kind] : Sparkles;
                const color = kind ? KIND_COLOR[kind] : VIOLET;
                return (
                  <motion.div
                    key={i}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    className="flex items-start gap-3 rounded-[14px] p-3"
                    style={{
                      border: "1px solid var(--border-glass)",
                      background: "rgba(18,26,44,0.4)",
                      boxShadow: `0 0 18px ${color}2E`, // ~18% alpha glow
                    }}
                    data-testid="narrative-card"
                  >
                    <Icon size={18} color={color} style={{ marginTop: 2, flexShrink: 0 }} aria-hidden />
                    <p className="text-[13px]" style={{ color: "#E8EEF9", fontFamily: "Inter, sans-serif" }}>
                      {text}
                    </p>
                  </motion.div>
                );
              })}
            </div>

            {/* Factor bars */}
            <div className="flex flex-col gap-2" data-testid="factor-bars">
              {factors.map((f) => {
                const color = KIND_COLOR[f.kind] ?? VIOLET;
                const widthPct = (Math.abs(f.value) / maxAbs) * 100;
                return (
                  <div key={f.label} className="flex flex-col gap-1" data-testid="factor-bar">
                    <div className="flex items-center justify-between text-[12px]">
                      <span style={{ color: "#E8EEF9", fontFamily: "Inter, sans-serif" }}>{f.label}</span>
                      <span style={{ color, fontFamily: "JetBrains Mono, monospace", fontVariantNumeric: "tabular-nums" }}>
                        {signedPct(f.value)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "rgba(120,160,255,0.10)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${widthPct}%`, background: color, boxShadow: `0 0 8px ${color}` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4" data-testid="deep-tab">
            {/* History line (84-day longer context) */}
            <div className="flex flex-col gap-1">
              <span className="text-[12px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
                History (last 84 days)
              </span>
              <div style={{ width: "100%", height: 150 }} data-testid="history-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyRows} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke={GRID} />
                    <XAxis dataKey="date" tick={false} stroke={GRID} />
                    <YAxis tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 10 }} stroke={GRID} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtNum(v), "units"]} />
                    <Line type="monotone" dataKey="units" stroke={CYAN} strokeWidth={2} dot={false} isAnimationActive={!reduce} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Monthly + weekday profile mini-charts */}
            <div className="grid grid-cols-2 gap-4">
              <ProfileMini title="Monthly profile" rows={monthRows} reduce={!!reduce} testid="monthly-mini" />
              <ProfileMini title="Weekday profile (Sat→Fri)" rows={weekdayRows} reduce={!!reduce} testid="weekday-mini" />
            </div>
          </div>
        )}
      </motion.div>
    </GlassPanel>
  );
}

function TabChip({
  active, onClick, id, children,
}: { active: boolean; onClick: () => void; id: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      onClick={onClick}
      className="rounded-full px-3 py-1 text-[12px] transition-colors"
      style={{
        color: active ? "#070B14" : "#8A97B2",
        background: active ? "#2FE6FF" : "transparent",
        fontFamily: "Inter, sans-serif",
        boxShadow: active ? "0 0 14px rgba(47,230,255,0.4)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function ProfileMini({
  title, rows, reduce, testid,
}: { title: string; rows: { label: string; value: number }[]; reduce: boolean; testid: string }) {
  return (
    <div className="flex flex-col gap-1" data-testid={testid}>
      <span className="text-[11px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>{title}</span>
      <div style={{ width: "100%", height: 110 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontFamily: "Inter, sans-serif", fontSize: 9 }} stroke={GRID} interval={0} />
            <YAxis tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 9 }} stroke={GRID} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={!reduce}>
              {rows.map((r) => (
                <Cell key={r.label} fill={VIOLET} fillOpacity={0.5} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ExplainabilityPanel;
```

## 6. Tests / Verification (Vitest + RTL)
**File:** `frontend/src/components/panels/ExplainabilityPanel.test.tsx`

We mock `recharts` (jsdom 0×0 container) so the Deep Dive charts render as plain divs, and use
`@testing-library/user-event` to switch tabs (per `07` §3).

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

vi.mock("recharts", () => {
  const Pass = ({ children }: any) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass,
    LineChart: ({ children }: any) => <div data-testid="history-line">{children}</div>,
    BarChart: ({ children }: any) => <div>{children}</div>,
    Line: () => <div />, Bar: ({ children }: any) => <div>{children}</div>, Cell: () => <div />,
    XAxis: Pass, YAxis: Pass, CartesianGrid: Pass, Tooltip: Pass,
  };
});

import { ExplainabilityPanel } from "./ExplainabilityPanel";
import type { ForecastResult } from "../../lib/types";

function makeResult(): ForecastResult {
  return {
    series_id: "turkey",
    product_name: "Fresh Whole Turkey",
    history: {
      dates: Array.from({ length: 84 }, (_, i) => `2015-08-${String((i % 28) + 1).padStart(2, "0")}`),
      units: Array.from({ length: 84 }, (_, i) => 10 + (i % 5)),
    },
    seasonal: {
      month: 11, month_vs_avg_pct: 220,
      monthly_avg: [15, 13, 9, 10, 8, 7, 8, 8, 7, 12, 57, 92],
      weekday_avg: [22.1, 18, 16.4, 15.9, 17.2, 19.8, 24],
    },
    explainability: {
      event_contribution_pct: 280.5,
      snap_days_in_horizon: 8,
      narrative: [
        "Demand is Accelerating (+412% vs the prior 28 days).",
        "November is a high-demand month (~+220% vs average).",
        "Thanksgiving falls in this window — historically a +517% swing.",
      ],
      factors: [
        { label: "Event uplift", value: 280.5, kind: "event" },
        { label: "Seasonality", value: 220.0, kind: "seasonal" },
        { label: "Trend", value: 412.0, kind: "trend" },
      ],
    },
  } as unknown as ForecastResult;
}

describe("ExplainabilityPanel", () => {
  it("renders each narrative bullet", () => {
    render(<ExplainabilityPanel result={makeResult()} />);
    expect(screen.getAllByTestId("narrative-card")).toHaveLength(3);
    expect(screen.getByText(/Thanksgiving falls in this window/)).toBeInTheDocument();
  });

  it("renders a factor bar per factor", () => {
    render(<ExplainabilityPanel result={makeResult()} />);
    expect(screen.getAllByTestId("factor-bar")).toHaveLength(3);
    expect(screen.getByText("Event uplift")).toBeInTheDocument();
    expect(screen.getByText("+280%")).toBeInTheDocument();
  });

  it("switches to the Deep Dive tab and shows the history line + profile minis", async () => {
    const user = userEvent.setup();
    render(<ExplainabilityPanel result={makeResult()} />);
    // Insights is default; Deep Dive content not yet shown.
    expect(screen.queryByTestId("deep-tab")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Deep Dive" }));
    expect(screen.getByTestId("deep-tab")).toBeInTheDocument();
    expect(screen.getByTestId("history-chart")).toBeInTheDocument();
    expect(screen.getByTestId("monthly-mini")).toBeInTheDocument();
    expect(screen.getByTestId("weekday-mini")).toBeInTheDocument();
    expect(screen.queryByTestId("insights-tab")).not.toBeInTheDocument();
  });
});
```

**Commands** (from `frontend/`):
```bash
npm run test -- ExplainabilityPanel
npm run build
```

## 7. Acceptance checklist
- [ ] File created at `frontend/src/components/panels/ExplainabilityPanel.tsx` (path per `06` §10).
- [ ] Local two-tab toggle (`Insights` | `Deep Dive`); both are keyboard-operable `<button role="tab">` (`06` §4 P7, §6).
- [ ] Each `explainability.narrative` string renders as a glowing bullet card with a **lucide icon by factor kind** (event/seasonal/trend; fallback Sparkles).
- [ ] `explainability.factors` render as labeled horizontal bars colored by kind, value `signedPct` (`06` §4 P7).
- [ ] Deep Dive tab shows a Recharts `LineChart` over the 84-day `history` + monthly(12)/weekday(7) profile mini bar charts (`06` §4 P7).
- [ ] Weekday order is **Sat→Fri** (wday 1→7), consistent with MT-39.
- [ ] Exact `06` §2 hex tokens (rose/cyan/lime/violet); glow at ~18% (`06` §2 glow utility).
- [ ] Imports `GlassPanel`, `SectionTitle` from MT-30, types from MT-31, icons from `lucide-react`, charts from Recharts (no redefine; no Plotly).
- [ ] Framer Motion entrance + staggered narrative cards; `prefers-reduced-motion` disables motion (`06` §2/§6).
- [ ] Vitest + RTL tests pass (including tab switch); `npm run build` is clean (`07` §3).
```
