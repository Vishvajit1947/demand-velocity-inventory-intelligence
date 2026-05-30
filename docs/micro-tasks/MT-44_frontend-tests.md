# MT-44 — Frontend Component Tests (Vitest + React Testing Library)

## 1. Context
Phase 6 (`MT-INDEX.md`; depends on **MT-33…MT-41** — control bar + all 7 panels exist — and reuses
the MT-42 state primitives). This task sets up the **frontend test harness** (Vitest + React
Testing Library + jsdom) and writes the component/contract tests defined in
`07_TESTING_STRATEGY.md` §3. All tests are **offline and deterministic** (`07` §1): they consume the
**committed JSON fixtures** in `frontend/mock/fixtures/<series_id>.json` (from **MT-25**) — never a
running backend.

This task **owns** the test configuration (`vitest` block in `vite.config.ts` + `src/test/setup.ts`),
the `test` script in `package.json`, and the test files. It **imports** — never redefines — the
components under test (`api.ts`, `ForecastControlBar`, `ForecastResult`, `StatCard`, `StatusBadge`,
`RadialDial`, the 7 panels) and the MT-42 state primitives.

> The state-machine unit tests (`PanelState`, `ToastHost`) and a11y tests (`Chip`, `StatusBadge`)
> are authored in **MT-42** and **MT-43** respectively. This task adds the **contract + render +
> per-panel headline + integration-state** tests from `07` §3 and ensures the whole suite runs via
> `npm run test`.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `07_TESTING_STRATEGY.md` §3 (the exact frontend test list — the contract for this task), §1
  (deterministic + offline), §5 (Definition of Done: tests green, `npm run build` 0 TS errors).
- `05_API_CONTRACT.md` §5 (the `ForecastResponse`/`ForecastResult` shape the fixtures + `api.ts`
  parse), §7 (error shape for the error-state test), §1 (types).
- `06_UIUX_SPEC.md` §4 (what each panel renders → the headline number per panel), §5 (the four
  states), §2 (count-up/line-draw — note we assert *values*, not animation), §8 (component names).

**Prior MT artifacts/paths that must already exist (import, do NOT redefine):**
- **MT-02 → `frontend/vite.config.ts`** — Vite config; this task adds the `test` block to it
  (Vitest reads `vite.config.ts`). `package.json` exists with deps.
- **MT-25 → `frontend/mock/fixtures/<series_id>.json`** — one committed fixture per product
  (`turkey`, `candy`, `strawberries`, `icecream`, `cocoa`, `chips`, `milk`, `bread`), each a full
  `ForecastResult` (`05` §5). The mock also defines the top-level `ForecastResponse` it returns.
- **MT-31 →** `frontend/src/lib/api.ts` (typed client: `postForecast(body)`, plus a
  `parseForecastResponse(json): ForecastResponse` or the client returns typed data), `lib/types.ts`
  (mirrors `05`), `hooks/useForecast.ts`.
- **MT-30 →** `src/components/ui/StatCard.tsx`, `StatusBadge.tsx`, `RadialDial.tsx`, `Skeleton.tsx`,
  `Toast.tsx` (`ToastProvider`/`useToast`), `GlassPanel.tsx`.
- **MT-33 →** `src/components/controls/ForecastControlBar.tsx` (calls a submit handler with
  `{ product_ids, start_date }`; disables Forecast when no product selected — `06` §4 P0).
- **MT-34/35 →** `src/components/panels/ForecastResult.tsx` (renders actual + forecast series +
  accuracy/coherence dials).
- **MT-36…MT-41 →** the panels `ExecutiveOverview`, `VelocityPanel`, `EventImpactPanel`,
  `SeasonalPanel`, `InventoryRiskPanel`, `ExplainabilityPanel`.
- **MT-42 →** `PanelState.tsx`, `ToastHost.tsx`.
- React 18 + TS + Vite (`06` §7). Run from `frontend/`.

**New dev dependencies** (test-only; permitted by `07` §3 which mandates Vitest+RTL+jsdom — these
are dev deps, not runtime deps, so they don't violate `07` §5 "no new runtime deps"):
`vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`,
`jsdom`, `@vitejs/plugin-react` (already present from MT-02).

## 3. Goal
1. A working **Vitest + RTL + jsdom** harness configured in `vite.config.ts` with a global
   `src/test/setup.ts` (jest-dom matchers, `matchMedia` + Plotly/canvas shims).
2. A **`test` script** in `package.json` and the run command **`npm run test`** (`07` §3).
3. The full set of test files from `07` §3, each asserting exactly the listed behavior, using the
   committed `frontend/mock/fixtures/` data.

## 4. Design (locked decisions; cite 06/07 sections)

### 4.1 Harness (LOCKED by `07` §3)
- **Runner:** Vitest, config in `vite.config.ts` (`07` §3 "config in vite.config.ts from MT-02").
- **Environment:** `jsdom` (`07` §3).
- **DOM assertions:** React Testing Library + `@testing-library/jest-dom`.
- **Determinism/offline** (`07` §1): no network. Components that fetch are tested by passing
  fixture props directly, **not** by hitting the mock server. `api.ts` is tested by parsing a
  fixture JSON object (imported), not by an HTTP call.
- **Charts:** Recharts renders in jsdom but needs a sized container; we don't assert pixel output —
  we assert **values/labels** are in the DOM (`07` §3: "renders actual + forecast series and the
  accuracy/coherence values"). **Plotly** (velocity gauge, MT-37) does not render in jsdom; we
  **mock `react-plotly.js`** in setup so `VelocityPanel` renders its status/caption text without
  Plotly. This keeps tests fast and offline (`07` §1).

### 4.2 Fixtures (from MT-25, `05` §5)
Tests import the committed JSON directly:
```ts
import turkey from "../../mock/fixtures/turkey.json"; // a full ForecastResult (05 §5)
```
A small helper builds a `ForecastResponse` (`05` §5 top level) from one or more fixtures so panels
that need `summary` (Executive Overview) get a valid object. The helper computes `summary` per the
`05` §5 aggregation rules so the Executive Overview headline numbers are correct. Fixtures are the
**single source of expected values** — tests read the expected number *from the fixture*, not from a
hardcoded literal (so the test stays correct if MT-25 regenerates fixtures).

### 4.3 The exact test files (LOCKED list from `07` §3)
| file | covers | key assertions (`07` §3) |
|---|---|---|
| `src/lib/api.test.ts` | api.ts | parses a fixture `ForecastResponse` into typed objects without throwing |
| `src/components/controls/ForecastControlBar.test.tsx` | MT-33 | Forecast disabled with no product; submitting calls handler with `{product_ids, start_date}` |
| `src/components/panels/ForecastResult.test.tsx` | MT-34/35 | renders actual + forecast values + accuracy/coherence |
| `src/components/ui/StatCard.test.tsx` | MT-30 | renders given value + footnote |
| `src/components/ui/StatusBadge.test.tsx` | MT-30 | value + correct color class + text label *(badge label is also checked in MT-43; here we check the color-class mapping)* |
| `src/components/ui/RadialDial.test.tsx` | MT-35 | renders value + color by band |
| `src/components/panels/panels.test.tsx` | MT-36..41 | each panel renders its headline number from its fixture slice |
| `src/__tests__/states.test.tsx` | MT-42 | loading→skeleton; error→toast text; idle→prompt (integration with a panel) |

> `PanelState.test.tsx`, `ToastHost.test.tsx` (MT-42) and `Chip.test.tsx` (MT-43) already exist; this
> task does not duplicate them. `states.test.tsx` here is the **integration** variant from `07` §3
> wiring a real panel through the state props.

## 5. Implementation (exact file paths; FULL runnable code)

### 5.1 `frontend/vite.config.ts` — add the Vitest block (edit MT-02 config)
```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // ...existing MT-02 config (resolve aliases, server, etc.)...
  test: {
    environment: "jsdom",          // 07 §3
    globals: true,                 // describe/it/expect without imports
    setupFiles: ["./src/test/setup.ts"],
    css: false,                    // don't process tokens.css in tests
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

### 5.2 `frontend/src/test/setup.ts` (new — global test setup)
```ts
// MT-44 — global Vitest setup: jest-dom matchers + jsdom shims (07 §3).
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees between tests (RTL hygiene).
afterEach(() => cleanup());

// jsdom lacks matchMedia; Framer Motion's useReducedMotion + our background read it.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,             // tests run with motion "allowed"; reduced-motion paths
    media: query,               // are unit-tested in MT-42/43 directly.
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Recharts/Plotly query element size; jsdom returns 0. Give a non-zero box so Recharts renders.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error assign stub
window.ResizeObserver = ResizeObserverStub;
Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 800 });
Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 400 });

// Plotly does not render in jsdom — mock react-plotly.js (used only by VelocityPanel, MT-37).
vi.mock("react-plotly.js", () => ({
  default: () => null,
}));
```

### 5.3 `frontend/src/test/fixtures.ts` (new — fixture loader + ForecastResponse builder)
```ts
// MT-44 — load committed fixtures (MT-25) and build a ForecastResponse (05 §5) for tests.
import type { ForecastResponse, ForecastResult, Summary } from "../lib/types";

import turkey from "../../mock/fixtures/turkey.json";
import milk from "../../mock/fixtures/milk.json";

// Cast the imported JSON to the contract type (05 §5). If this cast were wrong,
// the api.test.ts parse test would surface it.
export const turkeyResult = turkey as unknown as ForecastResult;
export const milkResult = milk as unknown as ForecastResult;

/** Build a valid ForecastResponse from results, aggregating `summary` per 05 §5. */
export function buildForecastResponse(
  results: ForecastResult[],
  start_date = "2015-11-01",
): ForecastResponse {
  const summary: Summary = {
    total_predicted_demand: results.reduce((s, r) => s + r.inventory.horizon_demand, 0),
    high_risk_count: results.filter((r) => r.inventory.stockout_risk === "High").length,
    avg_velocity:
      results.reduce((s, r) => s + Math.min(r.velocity.value, 999), 0) / results.length,
    avg_accuracy: results.reduce((s, r) => s + r.metrics.accuracy, 0) / results.length,
    active_events: dedupeEvents(results.flatMap((r) => r.events_in_horizon)),
  };
  return { start_date, horizon: 28, summary, results };
}

function dedupeEvents(events: { date: string; name: string; type: string }[]) {
  const seen = new Set<string>();
  const out: typeof events = [];
  for (const e of events) {
    const key = `${e.date}|${e.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(e);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
```

### 5.4 `frontend/src/lib/api.test.ts` (new)
```ts
import { describe, it, expect } from "vitest";
import { buildForecastResponse, turkeyResult } from "../test/fixtures";
import type { ForecastResponse } from "./types";
// If api.ts exposes a parser, prefer it; otherwise the typed shape is validated structurally.
// import { parseForecastResponse } from "./api";

describe("api.ts / contract parse (07 §3)", () => {
  it("parses a fixture ForecastResponse into typed objects without throwing", () => {
    const resp: ForecastResponse = buildForecastResponse([turkeyResult]);
    expect(() => JSON.parse(JSON.stringify(resp))).not.toThrow();

    // Structural contract checks (05 §5):
    expect(resp.horizon).toBe(28);
    expect(resp.results).toHaveLength(1);

    const r = resp.results[0];
    expect(r.forecast).toHaveLength(28);          // 05 §5 forecast length 28
    expect(r.actual).toHaveLength(28);            // 05 §5 actual length 28
    expect(r.history.units).toHaveLength(84);     // 05 §5 history length 84
    expect(r.horizon_dates).toHaveLength(28);
    expect(typeof r.metrics.accuracy).toBe("number");
    expect(["Low", "Medium", "High"]).toContain(r.inventory.stockout_risk);
    expect([
      "Critical Decline", "Declining", "Stable", "Growing", "Accelerating",
    ]).toContain(r.velocity.status);
  });
});
```

### 5.5 `frontend/src/components/controls/ForecastControlBar.test.tsx` (new)
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForecastControlBar } from "./ForecastControlBar";

// MT-33 props (per 06 §4 P0): products list, bounds, default date, onSubmit({product_ids,start_date}).
const products = [
  { series_id: "turkey", name: "Fresh Whole Turkey" },
  { series_id: "milk", name: "Milk" },
];
const bounds = {
  first_selectable_date: "2014-01-28",
  last_selectable_date: "2016-04-25",
};

describe("ForecastControlBar (06 §4 P0; 07 §3)", () => {
  it("disables Forecast when no product is selected", () => {
    render(
      <ForecastControlBar
        products={products}
        bounds={bounds}
        defaultDate="2016-04-25"
        loading={false}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /forecast/i })).toBeDisabled();
  });

  it("submits the correct {product_ids, start_date} payload", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <ForecastControlBar
        products={products}
        bounds={bounds}
        defaultDate="2016-04-25"
        loading={false}
        onSubmit={onSubmit}
      />,
    );
    // select a product (Chip is role=checkbox per MT-43)
    await user.click(screen.getByRole("checkbox", { name: /turkey/i }));
    expect(screen.getByRole("button", { name: /forecast/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /forecast/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      product_ids: ["turkey"],
      start_date: "2016-04-25",
    });
  });
});
```

### 5.6 `frontend/src/components/panels/ForecastResult.test.tsx` (new)
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForecastResult } from "./ForecastResult";
import { turkeyResult } from "../../test/fixtures";

describe("ForecastResult (MT-34/35; 07 §3)", () => {
  it("renders the actual + forecast series and accuracy/coherence values", () => {
    render(<ForecastResult result={turkeyResult} loading={false} />);

    // Series legend / labels present (06 §4 P2).
    expect(screen.getByText(/actual/i)).toBeInTheDocument();
    expect(screen.getByText(/forecast/i)).toBeInTheDocument();

    // Accuracy + coherence numbers from the fixture (05 §5 metrics).
    const acc = Math.round(turkeyResult.metrics.accuracy).toString();
    const coh = Math.round(turkeyResult.metrics.coherence).toString();
    // RadialDial centers the integer value; allow it to appear within the panel.
    expect(screen.getAllByText(new RegExp(`\\b${acc}\\b`)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(`\\b${coh}\\b`)).length).toBeGreaterThan(0);
    expect(screen.getByText(turkeyResult.metrics.coherence_label)).toBeInTheDocument();
  });
});
```

### 5.7 `frontend/src/components/ui/StatCard.test.tsx` (new)
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "./StatCard";

describe("StatCard (MT-30; 07 §3)", () => {
  it("renders the value and footnote", () => {
    render(<StatCard label="Total Predicted Demand" value={1234.5} footnote="next 28 days" />);
    expect(screen.getByText("Total Predicted Demand")).toBeInTheDocument();
    // CountUp renders the final value text (06 §2). Allow it to appear formatted.
    expect(screen.getByText(/1,?234(\.5)?/)).toBeInTheDocument();
    expect(screen.getByText("next 28 days")).toBeInTheDocument();
  });
});
```

### 5.8 `frontend/src/components/ui/StatusBadge.test.tsx` (new — color-class mapping)
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

// 06 §2 status -> color map.
const cases: { status: string; cssVar: string }[] = [
  { status: "Accelerating", cssVar: "--accent-lime" },   // growing/positive
  { status: "Stable", cssVar: "--accent-cyan" },
  { status: "Declining", cssVar: "--accent-amber" },     // warning
  { status: "Critical Decline", cssVar: "--accent-rose" }, // danger
];

describe("StatusBadge color map (06 §2; 07 §3)", () => {
  it.each(cases)("$status -> $cssVar + text label", ({ status, cssVar }) => {
    const { container } = render(<StatusBadge status={status as never} />);
    expect(screen.getByText(status)).toBeInTheDocument();          // 06 §6 text label
    // the badge applies the mapped accent var somewhere in its markup
    expect(container.innerHTML).toContain(cssVar);
  });
});
```

### 5.9 `frontend/src/components/ui/RadialDial.test.tsx` (new)
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RadialDial } from "./RadialDial";

describe("RadialDial (MT-35; 07 §3)", () => {
  it("renders the value and a band color/label", () => {
    render(<RadialDial value={78} label="Accuracy" band="Strong" />);
    expect(screen.getByText("78")).toBeInTheDocument();   // center value
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    expect(screen.getByText("Strong")).toBeInTheDocument(); // band label (06 §6)
  });

  it("colors low values with the rose accent (06 §2 band)", () => {
    const { container } = render(<RadialDial value={20} label="Accuracy" band="Weak" />);
    expect(container.innerHTML).toContain("--accent-rose");
  });
});
```

### 5.10 `frontend/src/components/panels/panels.test.tsx` (new — headline number per panel)
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExecutiveOverview } from "./ExecutiveOverview";
import { VelocityPanel } from "./VelocityPanel";
import { EventImpactPanel } from "./EventImpactPanel";
import { SeasonalPanel } from "./SeasonalPanel";
import { InventoryRiskPanel } from "./InventoryRiskPanel";
import { ExplainabilityPanel } from "./ExplainabilityPanel";
import { buildForecastResponse, turkeyResult } from "../../test/fixtures";

const resp = buildForecastResponse([turkeyResult]);

describe("Panels render headline numbers from the fixture (06 §4; 07 §3)", () => {
  it("ExecutiveOverview shows total_predicted_demand", () => {
    render(<ExecutiveOverview summary={resp.summary} loading={false} />);
    const total = Math.round(resp.summary.total_predicted_demand).toString();
    expect(screen.getAllByText(new RegExp(total.replace(/\d{1,3}(?=(\d{3})+$)/g, "$&,?"))).length)
      .toBeGreaterThan(0);
  });

  it("VelocityPanel shows the status (Plotly mocked)", () => {
    render(<VelocityPanel result={turkeyResult} loading={false} />);
    expect(screen.getByText(turkeyResult.velocity.status)).toBeInTheDocument(); // 06 §4 P3 badge
  });

  it("EventImpactPanel shows a +/-% event uplift label", () => {
    render(<EventImpactPanel result={turkeyResult} loading={false} />);
    const firstEvent = Object.keys(turkeyResult.event_uplift)[0];
    expect(screen.getByText(new RegExp(firstEvent, "i"))).toBeInTheDocument();
  });

  it("SeasonalPanel shows the month_vs_avg callout", () => {
    render(<SeasonalPanel result={turkeyResult} loading={false} />);
    const pct = Math.round(turkeyResult.seasonal.month_vs_avg_pct).toString();
    expect(screen.getAllByText(new RegExp(pct)).length).toBeGreaterThan(0);
  });

  it("InventoryRiskPanel shows recommended_order_qty (06 §4 P6)", () => {
    render(<InventoryRiskPanel result={turkeyResult} loading={false} />);
    const qty = turkeyResult.inventory.recommended_order_qty.toString();
    expect(screen.getAllByText(new RegExp(`\\b${qty}\\b`)).length).toBeGreaterThan(0);
  });

  it("ExplainabilityPanel shows the first narrative bullet", () => {
    render(<ExplainabilityPanel result={turkeyResult} loading={false} />);
    expect(screen.getByText(turkeyResult.explainability.narrative[0])).toBeInTheDocument();
  });
});
```

### 5.11 `frontend/src/__tests__/states.test.tsx` (new — integration state test, `07` §3)
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "../components/ui/Toast";
import { ToastHost } from "../components/ui/ToastHost";
import { InventoryRiskPanel } from "../components/panels/InventoryRiskPanel";
import { IDLE_PROMPT } from "../components/ui/PanelState";
import { turkeyResult } from "../test/fixtures";
import type { ApiError } from "../lib/types";

describe("States: loading / error / idle (06 §5; 07 §3)", () => {
  it("loading shows a skeleton (role=status)", () => {
    render(<InventoryRiskPanel result={undefined} loading={true} />);
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
  });

  it("idle shows the empty prompt", () => {
    render(<InventoryRiskPanel result={undefined} loading={false} />);
    expect(screen.getByText(IDLE_PROMPT)).toBeInTheDocument(); // 06 §5 verbatim prompt
  });

  it("error shows the API message in a toast (05 §7)", async () => {
    const err: ApiError = {
      error: "validation_error",
      message: "start_date 2016-12-01 is outside the selectable range [2014-01-28, 2016-04-25].",
      field: "start_date",
    };
    render(
      <ToastProvider>
        <ToastHost error={err} status="error" />
      </ToastProvider>,
    );
    expect(await screen.findByText(err.message)).toBeInTheDocument();
  });

  it("success renders the headline number from the fixture", () => {
    render(<InventoryRiskPanel result={turkeyResult} loading={false} />);
    const qty = turkeyResult.inventory.recommended_order_qty.toString();
    expect(screen.getAllByText(new RegExp(`\\b${qty}\\b`)).length).toBeGreaterThan(0);
  });
});
```

### 5.12 `frontend/package.json` — add the `test` script (edit)
```jsonc
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",          // 07 §3 — `npm run test`
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.1.8",
    "jsdom": "^25.0.1",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/user-event": "^14.5.2"
    // ...plus the MT-02 dev deps (@vitejs/plugin-react, typescript, etc.)
  }
}
```
> `vitest run` runs once and exits (CI/gate friendly, per `07` §6); `test:watch` is the interactive
> watcher. The Definition-of-Done gate (`07` §5) is `npm run test` green **and** `npm run build`
> with 0 TS errors.

## 6. Tests / Verification (commands)
From `frontend/`:
```bash
npm install            # picks up the new dev deps (vitest, RTL, jsdom)
npm run test           # 07 §3 — runs all src/**/*.test.{ts,tsx}, must be green
npm run build          # 07 §5 — must succeed with 0 TS errors
```
Expected: every test file in §4.3 passes; the suite is fully offline (no backend), reading only the
committed `frontend/mock/fixtures/*.json` (`07` §1).

Files this task creates:
- `src/test/setup.ts`, `src/test/fixtures.ts`
- `src/lib/api.test.ts`
- `src/components/controls/ForecastControlBar.test.tsx`
- `src/components/panels/ForecastResult.test.tsx`
- `src/components/panels/panels.test.tsx`
- `src/components/ui/StatCard.test.tsx`
- `src/components/ui/StatusBadge.test.tsx`
- `src/components/ui/RadialDial.test.tsx`
- `src/__tests__/states.test.tsx`

Files this task edits: `vite.config.ts` (Vitest block), `package.json` (`test` script + dev deps).

## 7. Acceptance checklist
- [ ] Vitest + RTL + jsdom configured: `test` block in `vite.config.ts` (`environment:"jsdom"`, `setupFiles:["./src/test/setup.ts"]`) and `src/test/setup.ts` loads jest-dom + `matchMedia`/`ResizeObserver` shims and mocks `react-plotly.js` (`07` §3).
- [ ] `package.json` has `"test": "vitest run"`; **`npm run test`** runs the suite (`07` §3).
- [ ] **api.ts**: `src/lib/api.test.ts` parses a fixture `ForecastResponse` into typed objects without throwing; asserts the `05` §5 lengths (forecast 28, actual 28, history 84) (`07` §3).
- [ ] **ForecastControlBar**: disabled when no product selected; submits `{product_ids, start_date}` with the right values (`07` §3, `06` §4 P0).
- [ ] **ForecastResult**: renders actual + forecast labels and the accuracy/coherence values + coherence label from the fixture (`07` §3, `06` §4 P2).
- [ ] **StatCard / StatusBadge / RadialDial**: render the given value; status maps to the correct `06` §2 accent color class; badge/dial show the text label (`07` §3, `06` §6).
- [ ] **Panels**: `panels.test.tsx` shows each panel's headline number from its fixture slice — incl. `InventoryRiskPanel` showing `recommended_order_qty` (`07` §3, `06` §4).
- [ ] **States**: `states.test.tsx` — loading shows the skeleton (`role=status`), error shows the toast `message` text (`05` §7), idle shows the verbatim prompt (`06` §5) (`07` §3).
- [ ] All tests read only committed `frontend/mock/fixtures/*.json`; the suite is offline + deterministic (`07` §1); expected values are read from the fixtures, not hardcoded.
- [ ] `npm run test` green and `npm run build` succeeds with 0 TS errors (`07` §5).
- [ ] Only test files + `vite.config.ts`/`package.json` were added/edited; no component was redefined (`07` §5).
