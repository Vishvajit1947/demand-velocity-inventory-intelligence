# MT-42 — States Polish: skeletons, empty/error, toasts, micro-animations

## 1. Context
Phase 6 polish (`MT-INDEX.md`; depends on **MT-33…MT-41** — the control bar and all 7 panels
exist and render given data). The individual panel tasks rendered the **Success** state; this task
makes every panel honor **all four states** from `06_UIUX_SPEC.md` §5 — **Idle**, **Loading**,
**Success**, **Error** — in one consistent way, and adds the locked micro-interactions from `06` §2.

Until now each panel assumed it had a `ForecastResult` (or `summary`) to render. After this task:
- **Idle** (no forecast run yet): each panel shows the empty prompt *"Select a date & products,
  then Forecast"* (`06` §5).
- **Loading** (the `POST /api/forecast` mutation is pending): each panel shows a **Skeleton**
  shimmer (the MT-30 primitive), and the control bar's Forecast button shows its spinner.
- **Success**: data renders with the **staggered entrance** animation (`06` §2).
- **Error**: a **Toast** (MT-30 primitive) shows the API error `message` (`05_API_CONTRACT.md` §7);
  panels keep their **last good data** if they have any, else fall back to the Idle prompt (`06` §5).

This task **owns** one new primitive — `src/components/ui/PanelState.tsx` (a wrapper that maps a
status to Idle/Loading/Success rendering) — plus a small `ToastHost` wired to the forecast
mutation error, and a thin `EntranceList` helper for the staggered entrance. It **imports** the
existing `Skeleton`, `Toast`, `GlassPanel` primitives (MT-30) and the `useForecast` hook (MT-31);
it does **not** redefine them. Each panel gets a tiny, precisely-described edit to wrap its body in
`PanelState`.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `06_UIUX_SPEC.md` §5 (the four states — the contract for this task), §2 (motion tokens:
  panel entrance fade+rise, stagger 0.06s, hover scale 1.01 + glow, chart line draw, count-up;
  and `prefers-reduced-motion`), §8 (component inventory), §10 (repo tree).
- `05_API_CONTRACT.md` §7 (error shape `{error, message, field?}` — the toast shows `message`),
  §5 (`ForecastResponse`/`ForecastResult` shapes the panels consume).
- `07_TESTING_STRATEGY.md` §3 (frontend tests: *loading shows skeleton; error shows toast text;
  idle shows the empty prompt*) and the committed fixtures note.

**Prior MT artifacts/modules that must already exist (do NOT redefine — import them):**
- **MT-30 → `frontend/src/components/ui/`** primitives (`06` §8):
  ```ts
  // Skeleton.tsx — shimmer placeholder; honors prefers-reduced-motion (renders static block).
  export function Skeleton(props: { className?: string }): JSX.Element

  // Toast.tsx — single toast + a context host. MT-30 exposes a hook-based API:
  export type ToastVariant = "error" | "info" | "success";
  export function useToast(): { show: (msg: string, variant?: ToastVariant) => void };
  export function ToastProvider(props: { children: React.ReactNode }): JSX.Element; // renders the toast viewport

  // GlassPanel.tsx — the frosted-glass container (06 §1/§2). Already used by every panel.
  export function GlassPanel(props: { title?: string; className?: string; children: React.ReactNode }): JSX.Element
  ```
- **MT-31 → `frontend/src/hooks/useForecast.ts`** — TanStack Query mutation wrapper:
  ```ts
  import type { ForecastResponse, ApiError } from "../lib/types";
  // useMutation<ForecastResponse, ApiError, { product_ids: string[]; start_date: string }>
  export function useForecast(): {
    mutate: (vars: { product_ids: string[]; start_date: string }) => void;
    data?: ForecastResponse;     // last successful response (kept across an error)
    error: ApiError | null;      // shape of 05 §7
    status: "idle" | "pending" | "error" | "success";
    isPending: boolean;
  }
  ```
  > TanStack Query keeps `data` from the **last successful** mutation while a later call is
  > `pending`/`error` — this is what lets error panels "keep last good data" (`06` §5).
- **MT-31 → `frontend/src/lib/types.ts`** mirrors `05` §1–§7, including:
  ```ts
  export type ApiError = { error: string; message: string; field?: string }; // 05 §7
  export type ForecastResponse = { start_date: string; horizon: number; summary: Summary; results: ForecastResult[] };
  ```
- **MT-30 → `frontend/src/theme/tokens.css`** exposes the `06` §2 CSS variables
  (`--accent-cyan`, `--accent-rose`, `--bg-panel`, …) and Tailwind maps them (e.g. `bg-panel`,
  `text-muted`, `border-glass`).
- **MT-33…MT-41 panels** (`frontend/src/components/panels/*` + `controls/ForecastControlBar.tsx`)
  exist and currently render their Success body. This task edits each to wrap that body.
- React 18 + TS + Vite, **Framer Motion**, TanStack Query, Tailwind (`06` §7). Run from `frontend/`.

> This task **owns** `PanelState.tsx`, `ToastHost.tsx`, `EntranceList.tsx` and the small panel
> edits. It imports — never redefines — `Skeleton`, `Toast`, `GlassPanel`, `useForecast`.

## 3. Goal
1. A reusable **`PanelState`** wrapper (`src/components/ui/PanelState.tsx`) taking
   `status` + `skeleton` + `children` (+ optional `hasData`) that renders the correct one of
   Idle / Loading / Success per `06` §5, with the staggered entrance on Success.
2. A **`ToastHost`** (`src/components/ui/ToastHost.tsx`) that watches the forecast mutation and
   shows the API `message` in a Toast on error (`05` §7, `06` §5).
3. An **`EntranceList`** helper (`src/components/ui/EntranceList.tsx`) implementing the locked
   panel-entrance motion (fade + 12px rise, `duration 0.5`, `ease [0.22,1,0.36,1]`, **stagger
   0.06s**) with full `prefers-reduced-motion` support (`06` §2).
4. The **micro-interactions** from `06` §2: hover `scale 1.01` + glow on panels (via a `hoverable`
   prop on `EntranceList` items / a `.panel-hover` utility), number count-up (already in MT-36
   cards — unchanged), chart line draw (already in MT-34 — unchanged; documented here as the
   "chart line draw" item so the state machine doesn't suppress it).
5. **Precise edits** to wrap each panel (MT-36…MT-41) and the control bar (MT-33) in `PanelState`
   and to mount `ToastHost` once at the app shell (MT-32).

## 4. Design (locked decisions; cite 06/07 sections)

### 4.1 The status the panels consume
The single source of truth for state is the `useForecast()` mutation (MT-31). The app shell
(MT-32) calls `useForecast()` once and passes derived props down. Map TanStack status → the four
`06` §5 states:

| `06` §5 state | condition | what `PanelState` renders |
|---|---|---|
| **Idle** | `status === "idle"` (no forecast ever run) **and** no data | the empty prompt |
| **Loading** | `isPending` (the POST is in flight) | the panel's `skeleton` |
| **Success** | `status === "success"` (or there is data to show) | `children` + entrance anim |
| **Error** | `status === "error"` | **Toast** with `error.message` (`ToastHost`) **and** panels keep last good data (`children` if `hasData`) or show the Idle prompt |

> **Error never blanks a populated panel** (`06` §5: *"panels keep last good data or show empty
> state"*). So in `PanelState`, the **error case is not its own branch** — when there's data we
> render `children`; when there isn't we render the Idle prompt. The *toast* (not the panel) is the
> error UI. This is why `ToastHost` is separate from `PanelState`.

So `PanelState` only needs three render branches — **Idle prompt**, **Loading skeleton**,
**Content** — selected by:
- show **Loading** when `loading` (i.e. `isPending`);
- else show **Content** when `hasData` (panel has something to render — success, or error-with-last-good-data);
- else show the **Idle prompt**.

This keeps the wrapper tiny and makes "keep last good data on error" automatic.

### 4.2 Idle prompt (`06` §5)
Exact copy: **"Select a date & products, then Forecast"** (verbatim from `06` §5). Rendered
centered, muted (`text-muted`), with a small `lucide-react` `Sparkles` icon, inside the panel's
reserved height (no layout shift — `06` §6). Each panel passes its own min-height so the prompt and
the eventual content occupy the same box.

### 4.3 Loading skeleton (`06` §5, §2)
The panel supplies its **own** skeleton shape via the `skeleton` prop (e.g. the chart panel passes
a tall block; the stat-card row passes four card-shaped blocks), composed from the MT-30
`Skeleton` primitive. `PanelState` just renders `{skeleton}` while loading. The MT-30 `Skeleton`
already honors `prefers-reduced-motion` (static block, no shimmer) per `06` §2/§6 — we do not
re-implement shimmer here.

### 4.4 Success entrance — `EntranceList` (LOCKED motion, `06` §2)
Panel entrance is **fade + 12px rise**, `duration 0.5`, `ease [0.22, 1, 0.36, 1]`, children
**staggered 0.06s**. Implemented with Framer Motion `motion.div` + a parent with
`staggerChildren: 0.06`. **`prefers-reduced-motion`** (detected with Framer's
`useReducedMotion()`): disable transforms — render instantly at the final state (opacity 1, y 0),
no stagger (`06` §2/§6). Hover micro-interaction = `whileHover={{ scale: 1.01 }}` **plus** a glow
class; under reduced motion, `whileHover` is omitted (no transform) but the glow class may remain
(it's a box-shadow, not a transform).

> **Count-up & chart line-draw are owned by MT-36 / MT-34** and are *not* re-implemented here. They
> run inside `children` on Success. We list them in §4 only to assert the state machine does not
> suppress them: on Success we render `children` once, mounted, so the count-up and line-draw fire
> exactly once on data load (`06` §2).

### 4.5 ToastHost (`05` §7, `06` §5)
`ToastHost` is a tiny effect component mounted once inside the app shell (MT-32), under the MT-30
`ToastProvider`. It takes the forecast `error` and `status`; on a *new* error it calls
`useToast().show(error.message, "error")` exactly once (guarded by a ref on the error identity so
re-renders don't re-fire). It renders nothing itself — the `ToastProvider` viewport (MT-30) shows
the toast. The text shown is **exactly** `error.message` from `05` §7 (e.g. *"start_date … is
outside the selectable range …"*). No reformatting.

### 4.6 Control-bar spinner (`06` §5, P0 in §4)
The Forecast button already shows a spinner + "Forecasting…" while pending (MT-33). This task only
**confirms** that wiring by passing `loading={isPending}` from the shell; no new spinner code.

### 4.7 Accessibility (`06` §6)
- Idle prompt and skeleton are **text/elements**, not color-only — the prompt is literal text; the
  skeleton has `role="status"` + `aria-label="Loading"` so screen readers announce loading.
- Toast container (MT-30) uses `role="status"` / `aria-live="polite"`; the error message is read.
- No layout shift: every `PanelState` usage passes a `minHeight` matching its content so Idle,
  Loading, and Success share one box (`06` §6 "reserve panel heights").

## 5. Implementation (exact file paths; FULL runnable code)

### 5.1 `frontend/src/components/ui/EntranceList.tsx` (new)
The locked panel-entrance + hover motion, reduced-motion-aware.

```tsx
// MT-42 — Staggered entrance + hover micro-interaction (06 §2).
// Fade + 12px rise, duration 0.5, ease [0.22,1,0.36,1], stagger 0.06s.
// prefers-reduced-motion: render instantly, no transforms (06 §2/§6).
import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]; // 06 §2 (LOCKED)

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } }, // 06 §2 stagger 0.06s
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },                              // fade + 12px rise
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

export function EntranceList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    // Reduced motion: no stagger, no transforms — render at final state instantly.
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

/** One animated, hoverable item (a panel). Use as a direct child of EntranceList. */
export function EntranceItem({
  children,
  className,
  hoverable = true,
}: {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    // No transforms under reduced motion; keep the glow utility (box-shadow only).
    return (
      <div className={[className, hoverable ? "panel-hover-glow" : ""].join(" ")}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      className={[className, hoverable ? "panel-hover-glow" : ""].join(" ")}
      variants={itemVariants}
      whileHover={hoverable ? { scale: 1.01 } : undefined} // 06 §2 hover scale 1.01
    >
      {children}
    </motion.div>
  );
}
```

Add the glow utility to `frontend/src/theme/tokens.css` (MT-30 owns the file; this is an additive
utility — append it):

```css
/* MT-42 — hover glow (06 §2). Box-shadow only (safe under reduced motion). */
.panel-hover-glow {
  transition: box-shadow 0.25s ease;
}
.panel-hover-glow:hover {
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45),
              0 0 0 1px var(--border-glass),
              0 0 28px rgba(47, 230, 255, 0.18); /* accent-cyan @18% (06 §2 glow) */
}
@media (prefers-reduced-motion: reduce) {
  .panel-hover-glow { transition: none; }
}
```

### 5.2 `frontend/src/components/ui/PanelState.tsx` (new — the reusable wrapper)
```tsx
// MT-42 — PanelState: maps forecast status to Idle / Loading / Success per 06 §5.
// Error is handled by ToastHost (05 §7); on error the panel keeps last good data
// (hasData=true) or falls back to the Idle prompt — never blanks populated data.
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export type PanelStateProps = {
  /** True while the POST /api/forecast mutation is in flight (06 §5 Loading). */
  loading: boolean;
  /** Does this panel have something to render? (success, or error-with-last-good-data) */
  hasData: boolean;
  /** Panel-specific skeleton (composed from the MT-30 Skeleton primitive). */
  skeleton: ReactNode;
  /** The success content. */
  children: ReactNode;
  /** Reserve height so Idle/Loading/Success share one box (06 §6 — no layout shift). */
  minHeight?: number;
  className?: string;
};

const IDLE_PROMPT = "Select a date & products, then Forecast"; // 06 §5 (verbatim)

export function PanelState({
  loading,
  hasData,
  skeleton,
  children,
  minHeight = 220,
  className,
}: PanelStateProps) {
  let body: ReactNode;
  if (loading) {
    // 06 §5 Loading — skeleton shimmer; role=status so SR announces (06 §6).
    body = (
      <div role="status" aria-label="Loading" className="h-full w-full">
        {skeleton}
      </div>
    );
  } else if (hasData) {
    // 06 §5 Success (or Error keeping last good data — toast shows the error).
    body = children;
  } else {
    // 06 §5 Idle — tasteful empty prompt (also the empty fallback on first error).
    body = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-muted">
        <Sparkles className="h-6 w-6 opacity-70" aria-hidden="true" />
        <p className="text-body">{IDLE_PROMPT}</p>
      </div>
    );
  }
  return (
    <div className={className} style={{ minHeight }}>
      {body}
    </div>
  );
}

export { IDLE_PROMPT };
```

### 5.3 `frontend/src/components/ui/ToastHost.tsx` (new — wires the mutation error to a toast)
```tsx
// MT-42 — ToastHost: shows the API error `message` (05 §7) in a Toast on forecast error
// (06 §5). Mounted once in the app shell under the MT-30 ToastProvider. Renders nothing.
import { useEffect, useRef } from "react";
import { useToast } from "./Toast";
import type { ApiError } from "../../lib/types";

export function ToastHost({
  error,
  status,
}: {
  error: ApiError | null;
  status: "idle" | "pending" | "error" | "success";
}) {
  const { show } = useToast();
  const lastShown = useRef<ApiError | null>(null);

  useEffect(() => {
    if (status === "error" && error && error !== lastShown.current) {
      lastShown.current = error;
      // 05 §7: show the API `message` verbatim. 06 §5 Error -> toast.
      show(error.message, "error");
    }
    if (status !== "error") {
      lastShown.current = null; // reset so the same message can show again on a later error
    }
  }, [error, status, show]);

  return null;
}
```

### 5.4 Wire `ToastHost` into the app shell (MT-32 edit)
`frontend/src/App.tsx` (MT-32) already calls `useForecast()` and wraps the tree in
`ToastProvider` (MT-30). Add `ToastHost` once, fed by the mutation. **Edit** (insert inside the
provider, alongside the grid):

```tsx
// in App.tsx — existing imports plus:
import { ToastHost } from "./components/ui/ToastHost";
// ...
const forecast = useForecast(); // already present (MT-32)
// ...
return (
  <ToastProvider>           {/* MT-30 — already present */}
    <ToastHost error={forecast.error} status={forecast.status} />  {/* MT-42 add */}
    {/* ...topbar, control bar, panel grid... */}
  </ToastProvider>
);
```

### 5.5 Wrap each panel in `PanelState` (MT-33…MT-41 edits — precise pattern)
The shell passes two booleans to every panel: `loading={forecast.isPending}` and the panel's own
`hasData` (does it have its slice yet?). Each panel wraps its existing Success body. Below is the
**exact pattern**; apply it to all 7 panels + the control bar. Example for the Forecast Result
panel (MT-34):

`frontend/src/components/panels/ForecastResult.tsx` — wrap the body:
```tsx
// MT-34 component, edited by MT-42 to honor 06 §5 states.
import { PanelState } from "../ui/PanelState";
import { Skeleton } from "../ui/Skeleton";
import { GlassPanel } from "../ui/GlassPanel";
import type { ForecastResult as FResult } from "../../lib/types";

export function ForecastResult({
  result,
  loading,
}: {
  result?: FResult;          // the selected product's slice (undefined until first success)
  loading: boolean;          // forecast.isPending (from the shell)
}) {
  const hasData = !!result;  // keep last good data on error -> hasData stays true
  return (
    <GlassPanel title="Forecast Result">
      <PanelState
        loading={loading}
        hasData={hasData}
        minHeight={360}                                  // 06 §6 reserve height
        skeleton={<Skeleton className="h-[320px] w-full rounded-card" />}
      >
        {/* ── existing MT-34 Success body (chart + dials) renders only when hasData ── */}
        {result && <ForecastChartBody result={result} />}
      </PanelState>
    </GlassPanel>
  );
}
```

Per-panel `minHeight` + skeleton shapes to use (compose from `Skeleton`):

| Panel (file) | `minHeight` | `skeleton` shape |
|---|---|---|
| `ExecutiveOverview.tsx` (MT-36) | 140 | a row of **4** `Skeleton` cards (`grid grid-cols-4 gap-6`, each `h-[120px] rounded-card`) |
| `ForecastResult.tsx` (MT-34) | 360 | one tall block `h-[320px] rounded-card` |
| `VelocityPanel.tsx` (MT-37) | 300 | a circle `h-[220px] w-[220px] rounded-full mx-auto` + a bar `h-6 w-32` |
| `EventImpactPanel.tsx` (MT-38) | 260 | 4 horizontal bars `h-6 w-full rounded` stacked `gap-3` |
| `SeasonalPanel.tsx` (MT-39) | 260 | a `h-[180px] w-full rounded-card` + a `h-12 w-full` row |
| `InventoryRiskPanel.tsx` (MT-40) | 300 | a `h-[160px] w-full rounded-card` + a big `h-16 w-40 rounded-card` |
| `ExplainabilityPanel.tsx` (MT-41) | 300 | 3 `h-16 w-full rounded-card` bullet cards `gap-3` |

> **`ExecutiveOverview`** consumes `summary` (not a per-product `result`); its `hasData` is
> `!!summary`. All others consume the **selected product's** `ForecastResult` slice; their
> `hasData` is `!!result`.

The shell renders the panels inside an `EntranceList` so the staggered entrance applies once on
Success (the panels themselves no longer animate individually):

`frontend/src/App.tsx` (MT-32 edit) — wrap the grid:
```tsx
import { EntranceList, EntranceItem } from "./components/ui/EntranceList";
// ...
<EntranceList className="grid grid-cols-12 gap-6">
  <EntranceItem className="col-span-12"><ExecutiveOverview summary={data?.summary} loading={forecast.isPending} /></EntranceItem>
  <EntranceItem className="col-span-8"><ForecastResult result={selected} loading={forecast.isPending} /></EntranceItem>
  <EntranceItem className="col-span-4"><VelocityPanel result={selected} loading={forecast.isPending} /></EntranceItem>
  <EntranceItem className="col-span-6"><EventImpactPanel result={selected} loading={forecast.isPending} /></EntranceItem>
  <EntranceItem className="col-span-6"><SeasonalPanel result={selected} loading={forecast.isPending} /></EntranceItem>
  <EntranceItem className="col-span-6"><InventoryRiskPanel result={selected} loading={forecast.isPending} /></EntranceItem>
  <EntranceItem className="col-span-6"><ExplainabilityPanel result={selected} loading={forecast.isPending} /></EntranceItem>
</EntranceList>
```
(`selected` = the currently-chosen product's `ForecastResult` from `data?.results`, per the
product switcher in `06` §3. `data` is `forecast.data`.)

### 5.6 Control-bar spinner (MT-33 — confirm wiring, no new code)
`ForecastControlBar` already renders `loading ? <Spinner/> "Forecasting…" : "Forecast"` on the
button (MT-33, `06` §4 P0). The shell passes `loading={forecast.isPending}`. No code added here —
this is a verification item in §6/§7.

## 6. Tests / Verification (Vitest + RTL; commands)
Create `frontend/src/components/ui/PanelState.test.tsx` and
`frontend/src/components/ui/ToastHost.test.tsx`. These cover the three `07` §3 state assertions:
*loading shows skeleton; error shows toast text; idle shows the prompt.* Fixtures are not needed
for the state machine itself (we pass props directly); the per-panel state tests live in MT-44 and
use `frontend/mock/fixtures/`.

### `frontend/src/components/ui/PanelState.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PanelState, IDLE_PROMPT } from "./PanelState";

describe("PanelState (06 §5 states)", () => {
  it("idle: shows the empty prompt when not loading and no data", () => {
    render(
      <PanelState loading={false} hasData={false} skeleton={<div data-testid="sk" />}>
        <div data-testid="content" />
      </PanelState>,
    );
    expect(screen.getByText(IDLE_PROMPT)).toBeInTheDocument();
    expect(screen.queryByTestId("content")).toBeNull();
    expect(screen.queryByTestId("sk")).toBeNull();
  });

  it("loading: renders the skeleton (role=status) and not the content/idle", () => {
    render(
      <PanelState loading={true} hasData={false} skeleton={<div data-testid="sk" />}>
        <div data-testid="content" />
      </PanelState>,
    );
    expect(screen.getByTestId("sk")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
    expect(screen.queryByText(IDLE_PROMPT)).toBeNull();
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("success / error-with-last-good-data: renders children when hasData", () => {
    render(
      <PanelState loading={false} hasData={true} skeleton={<div data-testid="sk" />}>
        <div data-testid="content">ok</div>
      </PanelState>,
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(screen.queryByText(IDLE_PROMPT)).toBeNull();
  });
});
```

### `frontend/src/components/ui/ToastHost.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "./Toast";        // MT-30 primitive
import { ToastHost } from "./ToastHost";
import type { ApiError } from "../../lib/types";

// 05 §7 error shape
const apiError: ApiError = {
  error: "validation_error",
  message: "start_date 2016-12-01 is outside the selectable range [2014-01-28, 2016-04-25].",
  field: "start_date",
};

describe("ToastHost (05 §7 / 06 §5 Error)", () => {
  it("shows the API error message in a toast on error", async () => {
    render(
      <ToastProvider>
        <ToastHost error={apiError} status="error" />
      </ToastProvider>,
    );
    // The toast viewport (MT-30) is role=status / aria-live; the message text appears verbatim.
    expect(await screen.findByText(apiError.message)).toBeInTheDocument();
  });

  it("shows nothing when status is not error", () => {
    render(
      <ToastProvider>
        <ToastHost error={null} status="idle" />
      </ToastProvider>,
    );
    expect(screen.queryByText(apiError.message)).toBeNull();
  });
});
```

### Commands (from `frontend/`)
```bash
npm run test -- PanelState ToastHost
# full suite + typecheck gate (07 §3):
npm run test
npm run build
```

## 7. Acceptance checklist
- [ ] `src/components/ui/PanelState.tsx`, `ToastHost.tsx`, `EntranceList.tsx` exist at those exact paths (`06` §10).
- [ ] **Idle**: with no forecast run and no data, every panel shows the verbatim prompt *"Select a date & products, then Forecast"* (`06` §5).
- [ ] **Loading**: while `forecast.isPending`, every panel shows its `Skeleton` shimmer (MT-30) and the control-bar button shows its spinner + "Forecasting…" (`06` §5, §4 P0).
- [ ] **Success**: panels render inside `EntranceList` with the locked entrance — fade + 12px rise, `duration 0.5`, `ease [0.22,1,0.36,1]`, stagger 0.06s (`06` §2); count-up (MT-36) and chart line-draw (MT-34) still fire once.
- [ ] **Error**: `ToastHost` shows `error.message` verbatim from `05` §7; panels keep last good data when `hasData`, else show the Idle prompt — populated panels are never blanked (`06` §5).
- [ ] Hover micro-interaction = `scale 1.01` + glow via `EntranceItem`/`.panel-hover-glow` (`06` §2).
- [ ] `prefers-reduced-motion`: `EntranceList`/`EntranceItem` render instantly with no transforms; the glow box-shadow is the only hover effect (`06` §2/§6).
- [ ] No layout shift: each `PanelState` is given a `minHeight` so Idle/Loading/Success share one box (`06` §6); skeleton uses `role="status"` + `aria-label="Loading"`.
- [ ] All MT-33…MT-41 panels + the control bar are wrapped via the §5.5 pattern; `ToastHost` is mounted once in the shell under `ToastProvider` (§5.4).
- [ ] `npm run test -- PanelState ToastHost` green; `npm run test` and `npm run build` clean (0 TS errors) (`07` §3, §5).
- [ ] Imports only — `Skeleton`, `Toast`, `GlassPanel`, `useForecast` are not redefined.
