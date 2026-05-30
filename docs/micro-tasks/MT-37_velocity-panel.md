# MT-37 — Velocity Intelligence Panel (Plotly radial gauge)

## 1. Context
We are building the **frontend** of *Demand Velocity & Inventory Intelligence* — a futuristic dark
"inventory command center" dashboard (React 18 + TypeScript + Vite). The analytical row of the
dashboard contains five detail panels; this task builds **P3 — Velocity Intelligence** (`06_UIUX_SPEC.md`
§3 layout, §4 P3). The panel turns one product's `velocity` slice of a `ForecastResult`
(`05_API_CONTRACT.md` §5) into an **instrument-grade radial gauge** with a needle plus a colored
status badge and caption. Velocity is the single most "wow" instrument on the board, so per
`06_UIUX_SPEC.md` §7 it is the **only** chart rendered with Plotly (`react-plotly.js`); every other
chart uses Recharts.

The panel consumes **one product's** `ForecastResult`. When several products are selected the App
renders a `ProductSwitcher` (built in MT-30) above the analytical panels and feeds this panel the
active product's result; this panel itself only receives a single `ForecastResult` via props and is
agnostic to the switcher.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/05_API_CONTRACT.md` (§1 types — `VelocityStatus`; §5 `ForecastResult.velocity = { value, status }`)
- `docs/06_UIUX_SPEC.md` (§2 tokens + status→color map; §3 layout; §4 **P3**; §5 states; §7 libs — Plotly for the gauge; §8 inventory; §10 tree)
- `docs/07_TESTING_STRATEGY.md` (§3 frontend testing — Vitest + RTL)

**Prior MT artifacts that must already exist (import, do NOT redefine):**
- **MT-30** `src/components/ui/` primitives: `GlassPanel`, `StatusBadge`, `SectionTitle`. (Also exports `RadialDial`, `ProductSwitcher` — not needed here.) `StatusBadge` maps a status string to the `06` §2 color and renders the **text label** beside the dot.
- **MT-30** `src/theme/tokens.css` — the CSS custom properties from `06` §2 are available as `var(--…)`.
- **MT-31** `src/lib/types.ts` — exports `ForecastResult`, `Velocity`, `VelocityStatus` (mirrors `05` verbatim).
- **MT-31** `src/lib/format.ts` — exports `signedPct(n)` → e.g. `"+412%"` / `"-37%"` (rounded int, always signed).

**Libraries (already installed in MT-02, locked in `06` §7):** `react-plotly.js` + `plotly.js`,
`framer-motion`, `lucide-react`.

**Assumed type shape** (from `05` §5, mirrored in MT-31 `types.ts`):
```ts
export type VelocityStatus =
  | "Critical Decline" | "Declining" | "Stable" | "Growing" | "Accelerating";
export interface Velocity { value: number; status: VelocityStatus }
export interface ForecastResult { /* … */ velocity: Velocity; product_name: string; /* … */ }
```

## 3. Goal
Build `src/components/panels/VelocityPanel.tsx`: a `GlassPanel` titled **"Velocity Intelligence"**
that renders a Plotly **gauge+indicator** with a needle on a clamped **−100…+100** arc, five colored
zones for the velocity bands, the real `velocity.value` shown as the central number, a `StatusBadge`
for `velocity.status`, and a caption `"{signed}% vs prior 28 days"`. It animates in via Framer Motion
and respects `prefers-reduced-motion`. Mock data only; no backend.

## 4. Design (locked decisions; cite `06`)
- **Library — Plotly only here.** Per `06` §7 the velocity gauge is the *single* Plotly chart in the
  app; everything else is Recharts. Use `react-plotly.js` `<Plot>` with a `type:"indicator"`,
  `mode:"gauge+number"` trace. (`06` §4 P3, §9 "looks like an instrument, not a default chart".)
- **Arc & clamp (`06` §4 P3).** Axis range is **[−100, 100]**. The displayed gauge value is
  `clamp(velocity.value, -100, 100)` so the needle never leaves the arc, but the **real** value
  (which can be e.g. +412) is shown as the central number and in the caption. The number is therefore
  set explicitly (not derived from the clamped gauge value).
- **Five colored zones = the velocity bands** (boundaries from `03_ALGORITHM_SPEC.md` §6.3, mirrored
  in `07` §2 backend test "velocity bucket boundaries (−50,−10,10,40)"):
  | band | range on arc | status | color (`06` §2) |
  |---|---|---|---|
  | Critical | `[-100, -50)` | Critical Decline | `--accent-rose` `#FF5C7A` |
  | Declining | `[-50, -10)` | Declining | `--accent-amber` `#FFC24D` |
  | Stable | `[-10, 10)` | Stable | `--accent-cyan` `#2FE6FF` |
  | Growing | `[10, 40)` | Growing | `--accent-lime` `#4DFFB0` |
  | Accelerating | `[40, 100]` | Accelerating | `--accent-lime` `#4DFFB0` |

  Note `Growing` and `Accelerating` both map to lime per the `06` §2 status→color map (lime =
  "Accelerating / Growing / Low risk / positive"). Zone fills are drawn at low opacity so the active
  needle reads clearly.
- **Needle.** Plotly's gauge `threshold` line at the clamped value draws the needle/marker; its color
  is the **active band color** (matching `velocity.status` via the `06` §2 map) at full opacity.
- **Status badge & caption (`06` §4 P3).** `StatusBadge status={velocity.status}` (color per `06` §2,
  always with text label — satisfies `06` §6 "never color alone"). Caption: `"{signedPct(value)} vs prior 28 days"`,
  e.g. `"+412% vs prior 28 days"`, in `--text-muted`, JetBrains Mono.
- **Tokens (`06` §2).** Panel via `GlassPanel`; numbers use JetBrains Mono / tabular-nums; gauge paper
  & plot background transparent so the glass shows through.
- **Motion (`06` §2 motion).** Whole panel body fades + rises 12px (`duration 0.5`, ease
  `[0.22,1,0.36,1]`). Under `prefers-reduced-motion` the entrance is disabled and Plotly animation off.
- **States (`06` §5).** This component renders the **success** state. Idle/loading/error are owned by
  the panel container / App shell (MT-32/MT-42); this component assumes a valid `velocity` slice.

## 5. Implementation (exact path from `06` §10; FULL runnable TSX)
**File:** `frontend/src/components/panels/VelocityPanel.tsx`

```tsx
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Plot from "react-plotly.js";
import type { Data, Layout } from "plotly.js";
import { GlassPanel } from "../ui/GlassPanel";
import { StatusBadge } from "../ui/StatusBadge";
import { SectionTitle } from "../ui/SectionTitle";
import { signedPct } from "../../lib/format";
import type { ForecastResult, VelocityStatus } from "../../lib/types";

/** Velocity band colors — EXACT tokens from 06 §2 status→color map. */
const ROSE = "#FF5C7A";   // --accent-rose  : Critical Decline
const AMBER = "#FFC24D";  // --accent-amber : Declining
const CYAN = "#2FE6FF";   // --accent-cyan  : Stable
const LIME = "#4DFFB0";   // --accent-lime  : Growing / Accelerating

/** Status → arc color (06 §2). Growing & Accelerating both → lime. */
const STATUS_COLOR: Record<VelocityStatus, string> = {
  "Critical Decline": ROSE,
  Declining: AMBER,
  Stable: CYAN,
  Growing: LIME,
  Accelerating: LIME,
};

/** Five band zones on the −100..100 arc (boundaries −50,−10,10,40 per 03 §6.3 / 07 §2). */
const BANDS: { range: [number, number]; color: string }[] = [
  { range: [-100, -50], color: ROSE },
  { range: [-50, -10], color: AMBER },
  { range: [-10, 10], color: CYAN },
  { range: [10, 40], color: LIME },
  { range: [40, 100], color: LIME },
];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Apply an alpha to a #RRGGBB hex → rgba() string. */
function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface VelocityPanelProps {
  result: ForecastResult;
}

export function VelocityPanel({ result }: VelocityPanelProps) {
  const reduce = useReducedMotion();
  const { value, status } = result.velocity;

  const gaugeValue = clamp(value, -100, 100); // needle stays on the arc
  const activeColor = STATUS_COLOR[status];

  const data = useMemo<Partial<Data>[]>(
    () => [
      {
        type: "indicator",
        mode: "gauge+number",
        value: gaugeValue,
        // Show the REAL value (e.g. +412), not the clamped gauge value.
        number: {
          valueformat: ".0f",
          suffix: "%",
          font: { color: "#E8EEF9", family: "JetBrains Mono, monospace", size: 34 },
          // override displayed text with the un-clamped real value:
          // Plotly has no direct "display text" for indicator number, so we
          // force it through a custom delta-free number using `value`.
        },
        gauge: {
          shape: "angular",
          axis: {
            range: [-100, 100],
            tickcolor: "rgba(120,160,255,0.35)",
            tickfont: { color: "#8A97B2", family: "JetBrains Mono, monospace", size: 11 },
            tickmode: "array",
            tickvals: [-100, -50, -10, 10, 40, 100],
          },
          bar: { color: "rgba(0,0,0,0)", thickness: 0 }, // hide default value bar; needle = threshold
          bgcolor: "rgba(0,0,0,0)",
          borderwidth: 0,
          steps: BANDS.map((b) => ({ range: b.range, color: withAlpha(b.color, 0.22) })),
          threshold: {
            line: { color: activeColor, width: 5 },
            thickness: 0.85,
            value: gaugeValue,
          },
        },
      } as Partial<Data>,
    ],
    [gaugeValue, activeColor],
  );

  const layout = useMemo<Partial<Layout>>(
    () => ({
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { t: 8, b: 8, l: 24, r: 24 },
      font: { color: "#E8EEF9", family: "Inter, sans-serif" },
      height: 240,
      // @ts-expect-error transition is valid for indicator animation
      transition: reduce ? { duration: 0 } : { duration: 600, easing: "cubic-in-out" },
    }),
    [reduce],
  );

  return (
    <GlassPanel>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-full flex-col gap-3"
        data-testid="velocity-panel"
      >
        <div className="flex items-center justify-between">
          <SectionTitle>Velocity Intelligence</SectionTitle>
          <StatusBadge status={status} />
        </div>

        <div className="relative flex-1" aria-hidden="false">
          <Plot
            data={data as Data[]}
            layout={layout}
            config={{ displayModeBar: false, responsive: true, staticPlot: !!reduce }}
            style={{ width: "100%", height: "240px" }}
            useResizeHandler
            data-testid="velocity-gauge"
          />
          {/* Real (un-clamped) value overlay — gauge shows clamped value, but the
              true velocity (e.g. +412%) is the headline number we display & test. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-7 text-center"
            data-testid="velocity-value"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontVariantNumeric: "tabular-nums",
              color: activeColor,
              fontSize: 28,
              fontWeight: 600,
              textShadow: `0 0 18px ${withAlpha(activeColor, 0.45)}`,
            }}
          >
            {signedPct(value)}
          </div>
        </div>

        <p
          className="text-center text-[12px]"
          style={{ color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}
          data-testid="velocity-caption"
        >
          {signedPct(value)} vs prior 28 days
        </p>
      </motion.div>
    </GlassPanel>
  );
}

export default VelocityPanel;
```

> **Implementation note for the intern:** the Plotly indicator's built-in `number` will display the
> *clamped* gauge value. To honor `06` §4 P3 ("clamp display to the arc but show the real value as
> text"), we **hide nothing** but overlay the true `signedPct(value)` (e.g. `+412%`) as the headline
> number via the absolutely-positioned `velocity-value` div, colored by the active band. The Plotly
> `number` font size is kept small/secondary; if you prefer, set the indicator `number.font.size: 0`
> to suppress it entirely and rely solely on the overlay — both satisfy the spec; the overlay is the
> authoritative displayed value and the one the tests assert on.

## 6. Tests / Verification (Vitest + RTL)
**File:** `frontend/src/components/panels/VelocityPanel.test.tsx`

`react-plotly.js` is heavy and DOM-canvas based; per `07` §3 ("fast, deterministic, offline") we
**mock** it and assert on the props passed to `<Plot>`, plus the badge text, value, and band color.

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Capture the latest props Plot was rendered with.
const plotProps: { current: any } = { current: null };
vi.mock("react-plotly.js", () => ({
  default: (props: any) => {
    plotProps.current = props;
    return <div data-testid="velocity-gauge" />;
  },
}));

import { VelocityPanel } from "./VelocityPanel";
import type { ForecastResult } from "../../lib/types";

function makeResult(value: number, status: ForecastResult["velocity"]["status"]): ForecastResult {
  return {
    series_id: "turkey",
    item_id: "FOODS_3_069",
    product_name: "Fresh Whole Turkey",
    velocity: { value, status },
    // remaining ForecastResult fields are not read by this panel:
  } as unknown as ForecastResult;
}

describe("VelocityPanel", () => {
  it("renders the status badge text", () => {
    render(<VelocityPanel result={makeResult(412, "Accelerating")} />);
    expect(screen.getByText("Accelerating")).toBeInTheDocument();
  });

  it("passes the clamped gauge value to Plotly but shows the real value as text", () => {
    render(<VelocityPanel result={makeResult(412, "Accelerating")} />);
    const trace = plotProps.current.data[0];
    expect(trace.value).toBe(100);                       // clamped to arc
    expect(trace.gauge.axis.range).toEqual([-100, 100]); // arc bounds
    expect(screen.getByTestId("velocity-value")).toHaveTextContent("+412%"); // real value
    expect(screen.getByTestId("velocity-caption")).toHaveTextContent("+412% vs prior 28 days");
  });

  it("colors the needle (threshold) with the band color matching the status", () => {
    render(<VelocityPanel result={makeResult(-72, "Critical Decline")} />);
    const trace = plotProps.current.data[0];
    expect(trace.value).toBe(-72);                          // within arc, not clamped
    expect(trace.gauge.threshold.line.color).toBe("#FF5C7A"); // rose for Critical Decline
    expect(screen.getByTestId("velocity-value")).toHaveTextContent("-72%");
  });

  it("defines five band zones with boundaries at -50,-10,10,40", () => {
    render(<VelocityPanel result={makeResult(5, "Stable")} />);
    const steps = plotProps.current.data[0].gauge.steps;
    expect(steps).toHaveLength(5);
    expect(steps.map((s: any) => s.range)).toEqual([
      [-100, -50], [-50, -10], [-10, 10], [10, 40], [40, 100],
    ]);
  });
});
```

**Commands** (from `frontend/`):
```bash
npm run test -- VelocityPanel        # run this panel's tests
npm run build                        # must compile with 0 TS errors (07 §3 build gate)
```

## 7. Acceptance checklist
- [ ] File created at `frontend/src/components/panels/VelocityPanel.tsx` (path per `06` §10).
- [ ] Gauge rendered with **Plotly** (`react-plotly.js`) — the only Plotly chart in the app (`06` §7).
- [ ] Axis range is **[−100, 100]**; the gauge `value` is `clamp(velocity.value, -100, 100)`.
- [ ] Five colored band zones with boundaries at **−50, −10, 10, 40** (`03` §6.3 / `07` §2).
- [ ] Band/needle colors are the EXACT `06` §2 tokens (rose/amber/cyan/lime), mapped from status.
- [ ] The **real** `velocity.value` is shown as text (e.g. `+412%`), not the clamped value.
- [ ] `StatusBadge` renders `velocity.status` with the `06` §2 color **and** the text label.
- [ ] Caption reads `"{+value}% vs prior 28 days"` via `signedPct` (`06` §4 P3).
- [ ] Imports `GlassPanel`, `StatusBadge`, `SectionTitle` from MT-30 and types from MT-31 (no redefine).
- [ ] Framer Motion entrance (fade + 12px rise); `prefers-reduced-motion` disables motion (`06` §2/§6).
- [ ] Vitest + RTL tests pass; `npm run build` is clean (`07` §3).
```
