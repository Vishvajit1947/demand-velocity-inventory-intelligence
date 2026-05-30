# MT-34 — Forecast Result Line Chart (actual vs forecast)

## 1. Context
The **Forecast Result** is the hero panel of the dashboard (`06_UIUX_SPEC.md` §3 layout — "FORECAST RESULT (large, 2/3 width)"; §4 "P2 — Forecast Result"). It plots, for the active product, the **actual** demand (84-day history + the 28-day horizon actuals) against the model's **forecast** over the 28-day horizon, with a vertical "now" divider at `start_date` and a faintly shaded horizon region. When **multiple products** are selected, it overlays one **forecast line per product** in distinct accents with a toggleable legend, and exposes a **ProductSwitcher** so sibling panels (MT-35 dials, MT-37…41) can follow the same active selection.

Data is the array of `ForecastResult` objects returned by `POST /api/forecast` (`05_API_CONTRACT.md` §5). This task builds `src/components/panels/ForecastResult.tsx` using **Recharts** (`06` §7 — "Recharts for lines"). It consumes already-fetched data via props from the App (MT-32); it does not fetch.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/05_API_CONTRACT.md` — §5 `ForecastResult` exact shape: `history.dates[84]`, `history.units[84]`, `horizon_dates[28]`, `actual[28]`, `forecast[28]`, `metrics`, `product_name`, `series_id`; and the top-level `start_date`/`horizon`.
- `docs/06_UIUX_SPEC.md` — **§4 "P2 — Forecast Result" line-chart bullets** (locked: Actual solid muted-cyan; Forecast bright `--accent-cyan` animated draw + glow; vertical now-divider; shaded horizon; tooltip date/actual/forecast; multi-product overlay + legend toggle). §2 tokens/colors/motion, §3 multi-product ProductSwitcher, §5 states, §6 a11y/reduced-motion, §7 libs, §10 tree.
- `docs/07_TESTING_STRATEGY.md` — §3: "**ForecastResult:** given a fixture `ForecastResult`, renders actual + forecast series…"; deterministic + offline.

**Prior MT artifacts that MUST already exist (import — do NOT redefine):**
- **MT-30** primitives `src/components/ui/`: `GlassPanel`, `SectionTitle`, `ProductSwitcher` (segmented chip switcher — `06` §8 inventory), and the accent palette helper if MT-30 exposes one.
- **MT-31** `src/lib/types.ts`: `ForecastResult` type; `src/lib/format.ts`: `formatDate`, `formatNumber`.
- **MT-32** `App.tsx` owns the fetched `results` and the `activeSeriesId` selection state, passing them here as props.

**Deps (all in `06` §7 — no new deps):** `recharts`, `framer-motion`. React 18 + TS.

## 3. Goal
Implement `ForecastResult.tsx` that, given `results: ForecastResult[]`, an `activeSeriesId`, an `onActiveChange`, and `startDate`:
1. Builds a unified x-axis = `history.dates` **concat** `horizon_dates` for the active product.
2. Renders an **Actual** series (history `units` then horizon `actual`) as a solid **muted-cyan** line.
3. Renders a **Forecast** series over the **horizon only** as a bright **`--accent-cyan`** line with a soft glow and an **animated left→right draw** on mount.
4. Draws a faint **shaded horizon region** (`ReferenceArea` from `start_date` to the last horizon date) and a vertical **"now" `ReferenceLine`** at `start_date`.
5. **Multi-product:** overlays one forecast line per selected product (distinct accents), with a **legend that toggles** each line, and shows a **ProductSwitcher** to set the active product (which drives the actual line + sibling panels).
6. Custom **tooltip** showing date / actual / forecast.

## 4. Design (locked decisions; cite `06` sections)
- **Unified x-axis (`06` §4).** x = `active.history.dates` (84) **+** `active.horizon_dates` (28) = 112 categorical date ticks. Each row carries: `date`, `actual` (history `units[i]` for the first 84, then `actual[i]` for the horizon), `forecast` (`null` for history rows, `forecast[i]` for horizon rows), and per-product `forecast_<series_id>` columns for the multi overlay. `null` forecast on history rows yields the desired "forecast starts at now" behavior (Recharts `connectNulls={false}`).
- **Series styling (`06` §4, §2).**
  - **Actual** = `<Line>` `stroke` muted cyan. We use a dimmed cyan derived from `--accent-cyan` (locked literal `#7FD8E8` ≈ cyan at reduced saturation/value, matching "muted-cyan"), `strokeWidth 2`, `dot={false}`, drawn across all 112 points.
  - **Forecast (active)** = `<Line>` `stroke="var(--accent-cyan)"` (`#2FE6FF`), `strokeWidth 2.5`, glow via an SVG `filter` (`feGaussianBlur` drop-shadow in the accent color, `06` §2 "Glow utility"), `dot={false}`, **animated draw** (`isAnimationActive` + `animationDuration={900}`, `06` §2 "Chart lines draw left→right on mount, 0.9s"). Horizon-only (history rows are `null`).
  - **Multi-product overlay** = one `<Line>` per selected product keyed `forecast_<series_id>`, each `stroke` from the **distinct accent rotation** `[--accent-cyan, --accent-violet, --accent-lime, --accent-amber, --accent-rose, ...]` (`06` §2 accents). The active product's line uses the glow filter; others are thinner (`strokeWidth 2`).
- **Now divider + shaded horizon (`06` §4).** `<ReferenceLine x={startDate}>` styled `stroke="var(--accent-violet)"` dashed, with a label "now". `<ReferenceArea x1={startDate} x2={lastHorizonDate}>` `fill="var(--accent-cyan)"` at very low opacity (`fillOpacity 0.06`) to shade the forecast window.
- **Legend toggle (`06` §4).** Custom legend listing Actual + each forecast line. Clicking a legend entry toggles that series' visibility (local `hidden` set). The active forecast and Actual are visible by default. Color chip + text label per entry (color never alone, `06` §6).
- **ProductSwitcher (`06` §3, §8).** Rendered above/inside the panel header **only when `results.length > 1`**. It is the MT-30 `ProductSwitcher` (segmented chips of `product_name`); selecting sets `activeSeriesId` via `onActiveChange`. The **Actual line and tooltip follow the active product**; the multi overlay shows every product's forecast regardless.
- **Tooltip (`06` §4).** Custom component: header = formatted `date`; rows = `Actual: <units>` and `Forecast: <units>` (1 dp) for the active product, hidden if `null`. Glass background, accent-bordered.
- **Axes/grid (`06` §2).** `CartesianGrid stroke="var(--grid-line)"`; axis ticks `--text-muted`, JetBrains Mono, `tabular-nums`. X ticks thinned (show ~every 14th date) to avoid clutter; Y starts at 0.
- **States (`06` §5).** If `results` is empty → render the **idle empty prompt** ("Select a date & products, then Forecast"). (Loading skeleton is owned by MT-32/MT-42; this component only handles the empty/success render.) Reserve a fixed chart height (e.g. `h-[360px]`) so there's **no layout shift** (`06` §6).
- **Reduced motion (`06` §6).** When `prefers-reduced-motion`, disable the draw animation (`isAnimationActive={false}`). Detected via a tiny `useReducedMotion` from framer-motion.
- **No data fetching here** — pure presentational; App passes `results` (MT-32).

## 5. Implementation (exact file path from `06` §10; FULL runnable TSX)

### File: `src/components/panels/ForecastResult.tsx`
```tsx
import { useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { GlassPanel } from "../ui/glass-panel";
import { SectionTitle } from "../ui/section-title";
import { ProductSwitcher } from "../ui/product-switcher";
import type { ForecastResult as ForecastResultData } from "../../lib/types";
import { formatDate, formatNumber } from "../../lib/format";

/** Distinct accent rotation for multi-product forecast lines (06 §2 accents). */
const ACCENTS = [
  "var(--accent-cyan)",
  "var(--accent-violet)",
  "var(--accent-lime)",
  "var(--accent-amber)",
  "var(--accent-rose)",
  "#5AA0FF",
  "#FF9E5C",
  "#B45CFF",
];
const MUTED_CYAN = "#7FD8E8"; // "muted-cyan" actual line (06 §4)

export interface ForecastResultProps {
  /** All forecast results returned by POST /api/forecast (05 §5), in request order. */
  results: ForecastResultData[];
  /** The currently active product's series_id (drives Actual line + sibling panels). */
  activeSeriesId?: string;
  /** Notify App when the user switches the active product. */
  onActiveChange?: (seriesId: string) => void;
  /** The forecast start date (the "now" divider), top-level 05 §5. */
  startDate: string;
}

type Row = {
  date: string;
  actual: number | null;
  forecast: number | null;
  [k: `forecast_${string}`]: number | null | string;
};

export function ForecastResult({
  results,
  activeSeriesId,
  onActiveChange,
  startDate,
}: ForecastResultProps) {
  const reduce = useReducedMotion();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // --- Empty / idle state (06 §5) ---
  if (!results || results.length === 0) {
    return (
      <GlassPanel className="flex h-[420px] flex-col">
        <SectionTitle>Forecast Result</SectionTitle>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-body text-[var(--text-muted)]">
            Select a date &amp; products, then Forecast.
          </p>
        </div>
      </GlassPanel>
    );
  }

  const active =
    results.find((r) => r.series_id === activeSeriesId) ?? results[0];

  // --- Build the unified x-axis rows (06 §4) ---
  const rows = useMemo<Row[]>(() => {
    const byDate = new Map<string, Row>();

    // 1) history (84) + horizon (28) for the ACTIVE product -> actual + active forecast
    active.history.dates.forEach((d, i) => {
      byDate.set(d, {
        date: d,
        actual: active.history.units[i] ?? null,
        forecast: null,
      });
    });
    active.horizon_dates.forEach((d, i) => {
      const row =
        byDate.get(d) ?? ({ date: d, actual: null, forecast: null } as Row);
      row.actual = active.actual[i] ?? null;
      row.forecast = active.forecast[i] ?? null;
      byDate.set(d, row);
    });

    // 2) every product's horizon forecast as its own column (multi overlay)
    results.forEach((r) => {
      r.horizon_dates.forEach((d, i) => {
        const row =
          byDate.get(d) ?? ({ date: d, actual: null, forecast: null } as Row);
        row[`forecast_${r.series_id}`] = r.forecast[i] ?? null;
        byDate.set(d, row);
      });
    });

    return Array.from(byDate.values()).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    );
  }, [results, active]);

  const lastHorizonDate =
    active.horizon_dates[active.horizon_dates.length - 1];
  const isMulti = results.length > 1;

  const tickFormatter = (d: string) => formatDate(d);
  const xTicks = rows
    .filter((_, i) => i % 14 === 0)
    .map((r) => r.date)
    .concat(startDate, lastHorizonDate);

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <GlassPanel className="flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-4">
        <SectionTitle>Forecast Result</SectionTitle>
        {isMulti && (
          <ProductSwitcher
            options={results.map((r) => ({
              value: r.series_id,
              label: r.product_name,
            }))}
            value={active.series_id}
            onChange={(v) => onActiveChange?.(v)}
          />
        )}
      </div>

      {/* Custom legend with toggle (06 §4) */}
      <div className="mb-2 flex flex-wrap gap-3">
        <LegendItem
          color={MUTED_CYAN}
          label="Actual"
          dimmed={hidden.has("actual")}
          onClick={() => toggle("actual")}
        />
        {(isMulti ? results : [active]).map((r, idx) => {
          const key = `forecast_${r.series_id}`;
          return (
            <LegendItem
              key={key}
              color={ACCENTS[idx % ACCENTS.length]}
              label={isMulti ? `${r.product_name} (forecast)` : "Forecast"}
              dimmed={hidden.has(key)}
              onClick={() => toggle(key)}
            />
          );
        })}
      </div>

      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <defs>
              <filter id="forecast-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <CartesianGrid stroke="var(--grid-line)" vertical={false} />
            <XAxis
              dataKey="date"
              ticks={xTicks}
              tickFormatter={tickFormatter}
              tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "JetBrains Mono" }}
              stroke="var(--border-glass)"
              minTickGap={20}
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "JetBrains Mono" }}
              stroke="var(--border-glass)"
              allowDecimals={false}
              domain={[0, "auto"]}
            />
            <Tooltip
              content={<ForecastTooltip />}
              cursor={{ stroke: "var(--accent-violet)", strokeOpacity: 0.3 }}
            />

            {/* Shaded horizon region + now divider (06 §4) */}
            <ReferenceArea
              x1={startDate}
              x2={lastHorizonDate}
              fill="var(--accent-cyan)"
              fillOpacity={0.06}
              ifOverflow="extendDomain"
            />
            <ReferenceLine
              x={startDate}
              stroke="var(--accent-violet)"
              strokeDasharray="4 4"
              label={{ value: "now", fill: "var(--accent-violet)", fontSize: 11, position: "top" }}
            />

            {/* Actual (history + horizon) */}
            {!hidden.has("actual") && (
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke={MUTED_CYAN}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={!reduce}
                animationDuration={900}
              />
            )}

            {/* Forecast line(s) */}
            {(isMulti
              ? results.map((r, idx) => ({ r, idx }))
              : [{ r: active, idx: 0 }]
            ).map(({ r, idx }) => {
              const key = isMulti ? `forecast_${r.series_id}` : "forecast";
              if (hidden.has(key)) return null;
              const isActive = r.series_id === active.series_id;
              return (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={isMulti ? r.product_name : "Forecast"}
                  stroke={ACCENTS[idx % ACCENTS.length]}
                  strokeWidth={isActive ? 2.5 : 2}
                  dot={false}
                  connectNulls={false}
                  filter={isActive ? "url(#forecast-glow)" : undefined}
                  isAnimationActive={!reduce}
                  animationDuration={900}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </GlassPanel>
  );
}

function LegendItem({
  color,
  label,
  dimmed,
  onClick,
}: {
  color: string;
  label: string;
  dimmed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!dimmed}
      className={`flex items-center gap-2 text-caption transition focus:outline-none
        ${dimmed ? "opacity-40" : "opacity-100"}`}
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      <span className="text-[var(--text-primary)]">{label}</span>
    </button>
  );
}

function ForecastTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const actual = payload.find((p: any) => p.dataKey === "actual")?.value;
  const forecast = payload.find(
    (p: any) => p.dataKey === "forecast" || String(p.dataKey).startsWith("forecast_")
  )?.value;
  return (
    <div
      className="rounded-[10px] border border-[var(--border-glass)] bg-[var(--bg-panel-solid)]
                 px-3 py-2 text-caption shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
    >
      <p className="mb-1 font-[JetBrains_Mono] text-[var(--text-muted)]">
        {formatDate(String(label))}
      </p>
      {actual != null && (
        <p className="text-[var(--text-primary)]">
          Actual: <span className="font-[JetBrains_Mono]">{formatNumber(actual)}</span>
        </p>
      )}
      {forecast != null && (
        <p style={{ color: "var(--accent-cyan)" }}>
          Forecast: <span className="font-[JetBrains_Mono]">{formatNumber(forecast, 1)}</span>
        </p>
      )}
    </div>
  );
}

export default ForecastResult;
```

> **App wiring (reference; MT-32):** `activeSeriesId`/`setActiveSeriesId` is shared App state so MT-35 dials and MT-37…41 follow the same active product. Pass `results={response.results}` and `startDate={response.start_date}`.

## 6. Tests / Verification (Vitest + RTL; commands)
**File:** `src/components/panels/ForecastResult.test.tsx` (colocated, `07` §3). Recharts renders inside an SVG; RTL/jsdom has no layout, so `ResponsiveContainer` needs a width — we render in a fixed-size wrapper and assert on legend/labels/series presence rather than pixel geometry (deterministic + offline, `07` §1). Fixtures mirror `05` §5.

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForecastResult } from "./ForecastResult";
import type { ForecastResult as FR } from "../../lib/types";

function makeResult(seriesId: string, name: string): FR {
  const histDates = Array.from({ length: 84 }, (_, i) => `2015-08-${String((i % 28) + 1).padStart(2, "0")}`);
  const horizonDates = Array.from({ length: 28 }, (_, i) => `2015-11-${String(i + 1).padStart(2, "0")}`);
  return {
    series_id: seriesId as any,
    item_id: "FOODS_3_069",
    product_name: name,
    history: { dates: histDates, units: histDates.map((_, i) => i % 10) },
    horizon_dates: horizonDates,
    actual: horizonDates.map((_, i) => 10 + (i % 5)),
    forecast: horizonDates.map((_, i) => 11 + (i % 5)),
    metrics: { accuracy: 78.4, coherence: 71, coherence_label: "Moderate", smape: 21.6, mae: 3.21, rmse: 4.87 },
    velocity: { value: 412, status: "Accelerating" },
    inventory: { on_hand: 260, safety_stock: 41, reorder_point: 171, horizon_demand: 520, cover_days: 9, stockout_risk: "Medium", overstock: false, recommended_order_qty: 301, projected_stock: horizonDates.map(() => 200) },
    explainability: { event_contribution_pct: 280.5, snap_days_in_horizon: 8, narrative: [], factors: [] },
    events_in_horizon: [],
    seasonal: { month: 11, month_vs_avg_pct: 220, monthly_avg: Array(12).fill(10), weekday_avg: Array(7).fill(10) },
    event_uplift: {},
  };
}

// Give the ResponsiveContainer a size in jsdom.
function renderSized(ui: React.ReactElement) {
  return render(<div style={{ width: 800, height: 400 }}>{ui}</div>);
}

describe("ForecastResult (MT-34)", () => {
  it("renders the actual and forecast series for a single product", () => {
    renderSized(
      <ForecastResult results={[makeResult("turkey", "Fresh Whole Turkey")]} activeSeriesId="turkey" startDate="2015-11-01" />
    );
    expect(screen.getByText("Forecast Result")).toBeInTheDocument();
    // legend entries prove both series are present
    expect(screen.getByText("Actual")).toBeInTheDocument();
    expect(screen.getByText("Forecast")).toBeInTheDocument();
  });

  it("covers a 28-day horizon (28 horizon dates feed the forecast line)", () => {
    const r = makeResult("turkey", "Fresh Whole Turkey");
    expect(r.horizon_dates).toHaveLength(28);
    expect(r.forecast).toHaveLength(28);
    renderSized(<ForecastResult results={[r]} activeSeriesId="turkey" startDate="2015-11-01" />);
    expect(screen.getByText("Forecast")).toBeInTheDocument();
  });

  it("renders without crashing for 3 products and shows the ProductSwitcher", () => {
    const results = [
      makeResult("turkey", "Fresh Whole Turkey"),
      makeResult("milk", "Whole Milk"),
      makeResult("candy", "Candy"),
    ];
    renderSized(<ForecastResult results={results} activeSeriesId="turkey" startDate="2015-11-01" />);
    // one legend entry per product (multi mode labels include "(forecast)")
    expect(screen.getByText(/Fresh Whole Turkey \(forecast\)/)).toBeInTheDocument();
    expect(screen.getByText(/Whole Milk \(forecast\)/)).toBeInTheDocument();
    expect(screen.getByText(/Candy \(forecast\)/)).toBeInTheDocument();
  });

  it("shows the idle empty prompt when results are empty", () => {
    renderSized(<ForecastResult results={[]} startDate="2015-11-01" />);
    expect(screen.getByText(/Select a date & products, then Forecast/i)).toBeInTheDocument();
  });
});
```

**Commands (run from `frontend/`):**
```powershell
cd frontend
npm run test -- ForecastResult
npm run build   # 0 TS errors (07 §3 build gate)
```

## 7. Acceptance checklist
- [ ] File exists at `src/components/panels/ForecastResult.tsx` (`06` §10).
- [ ] `GlassPanel`, `SectionTitle`, `ProductSwitcher` imported from MT-30; `ForecastResult` type + `formatDate`/`formatNumber` from MT-31 — none redefined.
- [ ] x-axis = `history.dates` + `horizon_dates` for the active product (`06` §4).
- [ ] **Actual** = solid muted-cyan over history+horizon; **Forecast** = bright `--accent-cyan` over horizon only, with glow filter and 0.9s draw animation (disabled under `prefers-reduced-motion`).
- [ ] Vertical "now" `ReferenceLine` at `start_date` and a faint shaded horizon `ReferenceArea`.
- [ ] Multi-product: one forecast line per product in distinct accents (`06` §2 palette), a legend that toggles each series, and a `ProductSwitcher` when `results.length > 1`.
- [ ] Custom tooltip shows date / actual / forecast.
- [ ] Empty `results` → idle empty prompt; fixed chart height (no layout shift); uses only `--token` colors.
- [ ] Tests pass (`single product renders actual+forecast`, `28-day horizon`, `3 products no crash`, `empty prompt`); `npm run build` clean.
