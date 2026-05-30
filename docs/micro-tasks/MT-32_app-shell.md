# MT-32 — App Shell / Layout (TopBar, AnimatedBackground, responsive grid, state orchestration)

## 1. Context
We are building **Demand Velocity & Inventory Intelligence**, a futuristic dark dashboard. This task assembles the application shell that everything else slots into: the **TopBar** (title + live status), a sticky **ControlBar** slot (filled by MT-33), the **Executive Overview** slot (MT-36), and the responsive **panel grid** — Forecast Result (2/3) + Velocity (1/3), then Event Impact / Seasonal Trend, then Inventory Risk / Explainability — exactly per `06_UIUX_SPEC.md` §3. It adds an **AnimatedBackground** (gradient mesh + faint grid + drifting glow blobs, low opacity, `prefers-reduced-motion`-aware) and the **state orchestration**: it holds the selected products + date + forecast result, drives the global idle/loading/error/success states (`06` §5), and passes the relevant data slice (or a loading/empty flag) to each panel. Panels are wired as graceful placeholders that import the real components later MTs implement.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/06_UIUX_SPEC.md` (§1 design language; §3 page layout — the canonical grid; §5 states; §6 a11y incl. reduced motion + no layout shift; §8 inventory; §10 tree)
- `docs/05_API_CONTRACT.md` (§5 `ForecastResponse`/`ForecastResult`/`summary`; §9 mock + `VITE_API_BASE`)

**Prior MT artifacts/paths that must already exist:**
- **MT-30** — UI primitives + tokens + glass/glow + motion helper (`src/components/ui/*`, `src/lib/{status,motion,cn}.ts`, `src/theme/*`). Depends on MT-30.
- **MT-31** — `src/lib/{types,api,format}.ts` + `src/hooks/useForecast.ts` (`useProducts`, `useBounds`, `useForecastMutation`). Depends on MT-31.
- **MT-02/MT-25** — running frontend against the mock server (`VITE_API_BASE`).

## 3. Goal
Replace `src/App.tsx` with the full shell from `06` §3 (TopBar, sticky ControlBar slot, Executive Overview slot, responsive panel grid in the exact order/spans), add an `AnimatedBackground` component (reduced-motion-aware), and orchestrate state — selected products + date + forecast result + global idle/loading/error/success — passing each panel its data slice or a loading/empty flag — such that the app renders the **idle** state cleanly, the layout matches `06` §3 at 1280/1440/1920, and `tsc --noEmit`/`npm run build` are clean.

## 4. Design (locked decisions; cite `06_UIUX_SPEC` sections)
- **Layout (LOCKED, `06` §3):** desktop-first ≥ 1280px. Top→bottom: **TopBar** → sticky **ControlBar** → **Executive Overview** (4 KPI cards) → grid row **Forecast Result (2/3) + Velocity (1/3)** → row **Event Impact (1/2) + Seasonal Trend (1/2)** → row **Inventory Risk (1/2) + Explainability (1/2)**. Below 1280px everything **stacks to a single column** (`06` §3 last bullet). Grid gap **24px** (`06` §2 spacing).
- **TopBar (`06` §3):** `◆ Demand Velocity & Inventory Intelligence` (display font) on the left; a **live status** chip on the right driven by `useProducts`/`useBounds` readiness (or `getHealth`) — green dot "live" when reachable, amber "connecting", rose "offline".
- **AnimatedBackground (`06` §3, §6):** fixed, behind everything (`z -10`), pointer-events none. Layers: a subtle radial **gradient mesh** (cyan/violet at very low opacity), a faint **grid** (`--grid-line`), and 2–3 **drifting glow blobs** (slow CSS keyframe translate, blurred, ~8–12% opacity). Must not hurt readability/perf (`06` §3). Under `prefers-reduced-motion` the blobs are static (no animation) — `06` §6.
- **Product selection + switcher (`06` §3):** state holds `selectedProductIds: SeriesId[]` and a `start_date`. When **multiple** products are selected, the analytical panels show a **ProductSwitcher** (built MT-30) to choose which product's detail renders; the Forecast Result chart overlays all selected; **Executive Overview always aggregates** across the selection (`05` `summary`). MT-32 owns the `activeProductId` switcher state and passes the chosen `ForecastResult` slice down.
- **State machine (LOCKED, `06` §5):** derive a single `viewState` from `useForecastMutation`:
  - no result yet → **idle** (panels show the empty prompt "Select a date & products, then Forecast").
  - mutation pending → **loading** (panels show skeleton; control bar spinner).
  - success → **success** (data renders with staggered entrance).
  - error → **error** (toast with `ApiError.message`; panels keep last good data or empty). Use `useToast` (MT-30) to surface `error.message` (`05` §7).
  No layout shift on load — panel containers **reserve height** (`06` §6).
- **Panel wiring (graceful placeholders):** MT-32 renders each panel inside a `GlassPanel` container with the correct span and passes props. It imports the real panel components from `src/components/panels/` (MT-34…41). Because those may not exist yet when MT-32 runs, use a **safe local placeholder** pattern: a `PanelShell` that renders the section title + state-aware body (idle prompt / skeleton / a "Panel arrives in MT-XX" note when the real export is absent), and swap each to the real import as that MT lands. This keeps MT-32 independently runnable (idle state) per the verification bar.
- **Data flow down:** Executive Overview ← `response.summary`. Each analytical panel ← the active `ForecastResult` (`results.find(r => r.series_id === activeProductId)`). Forecast Result chart ← **all** `results` + `start_date`. Every panel also receives `viewState` so it can render its own skeleton/empty.
- **Files (`06` §10):** `src/App.tsx`; new `src/components/AnimatedBackground.tsx`, `src/components/TopBar.tsx`, `src/components/PanelShell.tsx` (shell-local components live under `src/components/`).

## 5. Implementation (exact paths from `06` §10; FULL runnable code)
All paths relative to `frontend/`.

### 5.1 `src/components/AnimatedBackground.tsx`
```tsx
import { useReducedMotion } from "framer-motion";
import { cn } from "../lib/cn";

/** Subtle gradient mesh + faint grid + drifting glow blobs (06 §3, §6). */
export function AnimatedBackground() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* gradient mesh */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 10%, rgba(47,230,255,0.08), transparent 60%)," +
            "radial-gradient(50% 50% at 85% 20%, rgba(139,92,255,0.08), transparent 60%)," +
            "radial-gradient(60% 60% at 60% 100%, rgba(77,255,176,0.05), transparent 60%)",
        }}
      />
      {/* faint grid */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(var(--grid-line) 1px, transparent 1px)," +
            "linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(120% 100% at 50% 0%, black, transparent 80%)",
        }}
      />
      {/* drifting glow blobs */}
      <div
        className={cn(
          "absolute -left-32 top-20 h-80 w-80 rounded-full bg-accent-cyan/10 blur-3xl",
          !reduce && "animate-[drift1_22s_ease-in-out_infinite]",
        )}
      />
      <div
        className={cn(
          "absolute right-0 top-1/3 h-96 w-96 rounded-full bg-accent-violet/10 blur-3xl",
          !reduce && "animate-[drift2_28s_ease-in-out_infinite]",
        )}
      />
    </div>
  );
}
```

Add the keyframes to `src/theme/global.css` (append):
```css
@layer utilities {
  @keyframes drift1 {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(60px, 40px); }
  }
  @keyframes drift2 {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(-50px, -30px); }
  }
}
@media (prefers-reduced-motion: reduce) {
  .animate-\[drift1_22s_ease-in-out_infinite\],
  .animate-\[drift2_28s_ease-in-out_infinite\] {
    animation: none;
  }
}
```

### 5.2 `src/components/TopBar.tsx`
```tsx
import { Activity } from "lucide-react";
import { StatusBadge } from "./ui";
import { useBounds, useProducts } from "../hooks/useForecast";

/** TopBar: title + live status (06 §3). */
export function TopBar() {
  const products = useProducts();
  const bounds = useBounds();

  const live = products.isSuccess && bounds.isSuccess;
  const connecting = products.isPending || bounds.isPending;

  const badge = live ? (
    <StatusBadge kind="accent" accent="lime" label="live" />
  ) : connecting ? (
    <StatusBadge kind="accent" accent="amber" label="connecting…" />
  ) : (
    <StatusBadge kind="accent" accent="rose" label="offline" />
  );

  return (
    <header className="flex items-center justify-between py-5">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-accent-cyan" aria-hidden />
        <h1 className="font-display text-h1 text-text-primary">
          Demand Velocity &amp; Inventory Intelligence
        </h1>
      </div>
      <div className="flex items-center gap-2 text-caption text-text-muted">
        <span>status</span>
        {badge}
      </div>
    </header>
  );
}
```

### 5.3 `src/components/PanelShell.tsx`
State-aware panel container used until the real panels (MT-34…41) land, and as a wrapper around them.

```tsx
import type { ReactNode } from "react";
import { GlassPanel, SectionTitle, Skeleton } from "./ui";
import type { ViewState } from "../App";

export interface PanelShellProps {
  title: string;
  caption?: string;
  icon?: ReactNode;
  right?: ReactNode;
  state: ViewState;
  /** Rendered only in the success state when data is present. */
  children?: ReactNode;
  /** Reserve height to avoid layout shift on load (06 §6). */
  minHeight?: number;
  className?: string;
}

export function PanelShell({
  title,
  caption,
  icon,
  right,
  state,
  children,
  minHeight = 280,
  className,
}: PanelShellProps) {
  return (
    <GlassPanel className={className} style={{ minHeight }}>
      <SectionTitle title={title} caption={caption} icon={icon} right={right} />
      {state === "loading" ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : state === "idle" ? (
        <div className="flex h-40 items-center justify-center text-center text-body text-text-muted">
          Select a date &amp; products, then Forecast.
        </div>
      ) : children ? (
        children
      ) : (
        <div className="flex h-40 items-center justify-center text-center text-caption text-text-muted">
          Panel content arrives in a later micro-task.
        </div>
      )}
    </GlassPanel>
  );
}
```

### 5.4 `src/App.tsx` (OWNED by MT-32 — full shell)
```tsx
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, CalendarRange, Gauge, LineChart, Package, Sparkles } from "lucide-react";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { TopBar } from "./components/TopBar";
import { PanelShell } from "./components/PanelShell";
import { GlassPanel, ProductSwitcher, ToastProvider, useToast } from "./components/ui";
import { staggerContainer } from "./lib/motion";
import { useForecastMutation } from "./hooks/useForecast";
import type { ForecastResult, SeriesId } from "./lib/types";

export type ViewState = "idle" | "loading" | "success" | "error";

function Dashboard() {
  const { toast } = useToast();
  const forecast = useForecastMutation();

  // Selection state (the control bar in MT-33 will drive these setters).
  const [selectedProductIds, setSelectedProductIds] = useState<SeriesId[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [activeProductId, setActiveProductId] = useState<SeriesId | null>(null);

  // Derive the global view state (06 §5).
  const viewState: ViewState = forecast.isError
    ? "error"
    : forecast.isPending
      ? "loading"
      : forecast.data
        ? "success"
        : "idle";

  // Surface API errors as a toast (05 §7, 06 §5).
  if (forecast.isError && forecast.error) {
    // fire once per error object; React Query keeps the same error ref until next mutate
    queueToast(toast, forecast.error.message);
  }

  const response = forecast.data;
  const results = response?.results ?? [];

  // Resolve the active product's slice for the analytical panels (06 §3).
  const activeId: SeriesId | null =
    activeProductId && results.some((r) => r.series_id === activeProductId)
      ? activeProductId
      : (results[0]?.series_id ?? null);
  const activeResult: ForecastResult | undefined = results.find((r) => r.series_id === activeId);

  const switcherOptions = useMemo(
    () => results.map((r) => ({ id: r.series_id, label: r.product_name })),
    [results],
  );

  // The control bar (MT-33) calls this with {product_ids, start_date}.
  function runForecast(productIds: SeriesId[], date: string) {
    setSelectedProductIds(productIds);
    setStartDate(date);
    forecast.mutate({ product_ids: productIds, start_date: date });
  }

  return (
    <div className="relative min-h-screen">
      <AnimatedBackground />

      <div className="mx-auto max-w-[1600px] px-6 lg:px-8">
        <TopBar />

        {/* CONTROL BAR slot (sticky) — filled by MT-33 */}
        <div className="sticky top-0 z-20 -mx-2 mb-6 px-2 py-3 backdrop-blur-sm">
          <GlassPanel animate={false} className="p-4">
            {/* TODO(MT-33): <ForecastControlBar onSubmit={runForecast} loading={forecast.isPending} /> */}
            <ControlBarPlaceholder
              loading={forecast.isPending}
              selectedCount={selectedProductIds.length}
              startDate={startDate}
              onDemo={() => runForecast(["turkey", "milk"], "2015-11-01")}
            />
          </GlassPanel>
        </div>

        {/* EXECUTIVE OVERVIEW slot — filled by MT-36 */}
        <section className="mb-6">
          {/* TODO(MT-36): <ExecutiveOverview summary={response?.summary} state={viewState} /> */}
          <ExecutiveOverviewPlaceholder state={viewState} summary={response?.summary} />
        </section>

        {/* Product switcher (visible only when >1 product selected) — 06 §3 */}
        {results.length > 1 && activeId && (
          <div className="mb-4 flex items-center gap-3">
            <span className="text-caption text-text-muted">Detail for:</span>
            <ProductSwitcher
              options={switcherOptions}
              value={activeId}
              onChange={(id) => setActiveProductId(id as SeriesId)}
            />
          </div>
        )}

        {/* PANEL GRID — 06 §3 (gap 24 = gap-6) */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-6 lg:grid-cols-3"
        >
          {/* Row 1: Forecast Result (2/3) + Velocity (1/3) */}
          <PanelShell
            className="lg:col-span-2"
            title="Forecast Result"
            caption="Actual vs forecast — next 28 days"
            icon={<LineChart className="h-4 w-4" />}
            state={viewState}
            minHeight={420}
          >
            {/* TODO(MT-34/35): <ForecastResult results={results} startDate={startDate} /> */}
            <ReadyNote text={`${results.length} product line(s) ready to chart.`} />
          </PanelShell>

          <PanelShell
            title="Velocity Intelligence"
            icon={<Gauge className="h-4 w-4" />}
            state={viewState}
            minHeight={420}
          >
            {/* TODO(MT-37): <VelocityPanel result={activeResult} /> */}
            <ReadyNote text={activeResult ? `Velocity ${activeResult.velocity.value}` : ""} />
          </PanelShell>

          {/* Row 2: Event Impact (1/2) + Seasonal (1/2) */}
          <PanelShell
            className="lg:col-span-3 xl:col-span-3"
            title="Event Impact"
            icon={<CalendarRange className="h-4 w-4" />}
            state={viewState}
          >
            {/* TODO(MT-38): <EventImpactPanel result={activeResult} /> */}
            <ReadyNote text={activeResult ? `${activeResult.events_in_horizon.length} event(s)` : ""} />
          </PanelShell>

          <PanelShell
            className="lg:col-span-3 xl:col-span-3"
            title="Seasonal Trend"
            icon={<BarChart3 className="h-4 w-4" />}
            state={viewState}
          >
            {/* TODO(MT-39): <SeasonalPanel result={activeResult} /> */}
            <ReadyNote text={activeResult ? `Month ${activeResult.seasonal.month}` : ""} />
          </PanelShell>

          {/* Row 3: Inventory Risk (1/2) + Explainability (1/2) */}
          <PanelShell
            className="lg:col-span-3 xl:col-span-3"
            title="Inventory Risk"
            icon={<Package className="h-4 w-4" />}
            state={viewState}
          >
            {/* TODO(MT-40): <InventoryRiskPanel result={activeResult} /> */}
            <ReadyNote
              text={activeResult ? `Reorder ${activeResult.inventory.recommended_order_qty}` : ""}
            />
          </PanelShell>

          <PanelShell
            className="lg:col-span-3 xl:col-span-3"
            title="Explainability & Deep Dive"
            icon={<Sparkles className="h-4 w-4" />}
            state={viewState}
          >
            {/* TODO(MT-41): <ExplainabilityPanel result={activeResult} /> */}
            <ReadyNote text={activeResult ? `${activeResult.explainability.factors.length} factors` : ""} />
          </PanelShell>
        </motion.div>

        <footer className="py-10 text-center text-caption text-text-muted">
          Simulated reorder model — illustrative. Built against the mock API ({import.meta.env.VITE_API_BASE}).
        </footer>
      </div>
    </div>
  );
}

/* ── Shell-local placeholders (replaced by their owning MTs) ───────────────── */

function ReadyNote({ text }: { text: string }) {
  if (!text) return null;
  return <p className="tabular text-body text-accent-cyan">{text}</p>;
}

function ControlBarPlaceholder({
  loading,
  selectedCount,
  startDate,
  onDemo,
}: {
  loading: boolean;
  selectedCount: number;
  startDate: string;
  onDemo: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-body text-text-muted">
        Control bar arrives in MT-33 ({selectedCount} selected{startDate ? `, ${startDate}` : ""}).
      </span>
      <button
        onClick={onDemo}
        disabled={loading}
        className="rounded-card border border-accent-cyan/50 bg-accent-cyan/15 px-4 py-2 text-body text-accent-cyan glow-cyan disabled:opacity-40"
      >
        {loading ? "Forecasting…" : "⟶ Demo forecast"}
      </button>
    </div>
  );
}

import type { Summary } from "./lib/types";
import { StatCard } from "./components/ui";
function ExecutiveOverviewPlaceholder({ state, summary }: { state: ViewState; summary?: Summary }) {
  if (state === "idle" || !summary) {
    return (
      <GlassPanel animate={false} className="flex h-28 items-center justify-center">
        <span className="text-body text-text-muted">
          Executive overview (MT-36) — run a forecast to populate KPIs.
        </span>
      </GlassPanel>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Total Predicted Demand" value={summary.total_predicted_demand} suffix=" u" />
      <StatCard title="High-Risk Products" value={summary.high_risk_count} />
      <StatCard title="Avg Velocity" value={summary.avg_velocity} suffix="%" delta={summary.avg_velocity} />
      <StatCard title="Active Events" value={summary.active_events.length} />
    </div>
  );
}

/* ── Fire-once toast helper (avoids re-toasting on every render) ───────────── */
let lastToastMessage = "";
function queueToast(toast: (m: string, k?: "error" | "success" | "info") => void, message: string) {
  if (message && message !== lastToastMessage) {
    lastToastMessage = message;
    queueMicrotask(() => toast(message, "error"));
  }
}

export default function App() {
  return (
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  );
}
```

> **Wiring note for later MTs:** as each panel MT lands, replace its `// TODO(MT-XX)` line with the real import + component and delete the adjacent `<ReadyNote/>`/placeholder. The `runForecast(productIds, date)` callback and `viewState` are the stable contract MT-33…41 consume — do not change their signatures.

### 5.5 Confirm `main.tsx`
No change needed — `QueryClientProvider` (MT-02) + `App` (this file). `ToastProvider` is mounted inside `App`.

## 6. Tests / Verification (Vitest + RTL where relevant; build/typecheck)
Colocate `src/App.test.tsx` (replace the MT-02 smoke test):

```tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App shell (MT-32)", () => {
  it("renders the TopBar title", () => {
    renderApp();
    expect(
      screen.getByRole("heading", { name: /Demand Velocity & Inventory Intelligence/i }),
    ).toBeInTheDocument();
  });

  it("renders the idle empty prompt in panels", () => {
    renderApp();
    expect(screen.getAllByText(/Select a date & products, then Forecast/i).length).toBeGreaterThan(0);
  });

  it("renders all six panel titles from 06 §3", () => {
    renderApp();
    for (const t of [
      "Forecast Result",
      "Velocity Intelligence",
      "Event Impact",
      "Seasonal Trend",
      "Inventory Risk",
      "Explainability & Deep Dive",
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });
});
```

Manual / build verification:
1. `npm run dev` → app renders the **idle** state: TopBar, sticky control-bar slot, executive-overview prompt, all six panels with the empty prompt. AnimatedBackground is visible but subtle and does not impair text contrast (`06` §6).
2. Resize the window to **1280 / 1440 / 1920** — the grid matches `06` §3 (Forecast 2/3 + Velocity 1/3 on the first row at ≥1280; single column below 1280). No horizontal scroll; no layout shift when the demo forecast loads (panels reserved height).
3. Click **Demo forecast** (placeholder CTA) → state goes loading→success; placeholders show the ready notes (proving data flows down). Force an error (point `VITE_API_BASE` at a bad URL) → a rose toast shows the error message.
4. `npm run typecheck` (`tsc --noEmit`, strict) and `npm run build` are clean.

```powershell
npm run test
npm run typecheck
npm run build
```

## 7. Acceptance checklist
- [ ] `src/App.tsx` implements the `06` §3 layout: TopBar, sticky ControlBar slot, Executive Overview slot, then the grid — Forecast Result (2/3) + Velocity (1/3), Event Impact + Seasonal, Inventory Risk + Explainability — gap 24.
- [ ] Below 1280px the panels stack to a single column; nothing breaks at 1280 / 1440 / 1920 (`06` §3).
- [ ] `AnimatedBackground` renders gradient mesh + faint grid + drifting glow blobs at low opacity behind content, pointer-events none, and is static under `prefers-reduced-motion` (`06` §3, §6).
- [ ] TopBar shows the title + a live/connecting/offline status chip driven by query readiness (`06` §3).
- [ ] State orchestration derives idle/loading/success/error from `useForecastMutation` (`06` §5); panels receive `viewState` + their data slice (or empty/loading flag).
- [ ] Idle shows the empty prompt; loading shows skeletons (PanelShell); error surfaces `ApiError.message` via a toast (`05` §7, `06` §5).
- [ ] Executive Overview always aggregates `summary`; analytical panels show the **active** product's `ForecastResult`; ProductSwitcher appears only when >1 product is selected (`06` §3).
- [ ] Panels are wired as graceful placeholders importing the real `src/components/panels/*` later; `runForecast(productIds, date)` + `viewState` are the stable contract for MT-33…41.
- [ ] No layout shift on data load (panel heights reserved, `06` §6).
- [ ] Vitest renders the shell (title + idle prompt + all six panel titles); `tsc --noEmit` (strict) and `npm run build` are clean.
