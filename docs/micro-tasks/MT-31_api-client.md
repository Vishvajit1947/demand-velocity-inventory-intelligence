# MT-31 — API Client (types.ts, api.ts, format.ts, useForecast hook)

## 1. Context
We are building **Demand Velocity & Inventory Intelligence**, a futuristic dark dashboard whose frontend talks to a backend **only** through `05_API_CONTRACT.md`. During frontend development the data comes from the **mock server** (MT-25) over `VITE_API_BASE` — the same shapes the real backend returns. This task builds the typed data layer: `src/lib/types.ts` mirrors `05` §1 + the full `/api/forecast` response (every field, exact shape), `src/lib/api.ts` provides typed fetch wrappers (`getHealth`, `getProducts`, `getBounds`, `postForecast`) that read `import.meta.env.VITE_API_BASE` and throw a typed `ApiError` carrying the `05` §7 `{error,message,field}` on any non-2xx, `src/lib/format.ts` adds number/percent/date formatters, and `src/hooks/useForecast.ts` wraps everything in TanStack Query (`useProducts`, `useBounds`, `useForecastMutation`) exposing idle/loading/success/error states. No UI here.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/05_API_CONTRACT.md` (§1 shared types; §2 health; §3 products; §4 calendar/bounds; §5 forecast request + full `ForecastResult` + `summary`; §6 status codes; §7 error shape; §9 mock + `VITE_API_BASE`)
- `docs/06_UIUX_SPEC.md` (§7 TanStack Query locked; §10 tree)
- `docs/07_TESTING_STRATEGY.md` (§3 frontend tests — api.ts parses a fixture without throwing; uses `frontend/mock/fixtures/`)

**Prior MT artifacts/paths that must already exist:**
- **MT-02** scaffolded `frontend/` with `@tanstack/react-query` installed and `QueryClientProvider` wired in `main.tsx`; placeholder `src/lib/{types,api,format}.ts` and `src/hooks/useForecast.ts`. Depends on MT-02 + MT-25 (per `MT-INDEX.md`).
- **MT-25** produced `frontend/mock/server.mjs` + `frontend/mock/fixtures/<series_id>.json` serving the byte-for-byte `05` fixtures. The tests in §6 import one fixture JSON.

> If MT-30 already added the two unions to `types.ts`, this task **replaces** that file with the full version below (which still exports them identically).

## 3. Goal
Ship `src/lib/types.ts` (mirroring `05` §1 + every response/result type), `src/lib/api.ts` (typed `getHealth`/`getProducts`/`getBounds`/`postForecast` reading `VITE_API_BASE`, throwing a typed `ApiError` from the `05` §7 body on non-2xx), `src/lib/format.ts` (`formatNumber`/`formatPct`/`formatDate`), and `src/hooks/useForecast.ts` (`useProducts`/`useBounds`/`useForecastMutation` exposing idle/loading/success/error) — such that `tsc --noEmit` is clean and the Vitest tests (parses a fixture `ForecastResponse` into typed objects; `ApiError` thrown on a simulated error body) pass.

## 4. Design (locked decisions; cite sections)
- **Types mirror `05` exactly (`05` §1, §3, §4, §5, §7).** Field names, array lengths (as comments), unions, and the error shape are verbatim. No renames, no extra fields. Optional `field` on errors (`05` §7: omitted for 500s).
- **Base URL (`05` §1, §9):** every call reads `import.meta.env.VITE_API_BASE`; endpoints are under `/api`. No hard-coded host. Build the URL as `${BASE}/api/...`.
- **Error handling (`05` §6, §7):** any non-2xx → parse the JSON body `{error, message, field?}` and `throw new ApiError(...)`. If the body is unparseable, throw an `ApiError` with a generic message and the HTTP status. The frontend shows `message` in a toast (MT-42); the typed `field` lets the control bar highlight the offending input (e.g. `start_date`).
- **Data fetching (`06` §7 LOCKED):** TanStack Query. `useProducts` + `useBounds` are **queries** (static, cache long). `useForecastMutation` is a **mutation** (`POST /api/forecast`) so it has explicit idle→pending→success→error states matching `06` §5. Expose those states for the panels' state machine (MT-32).
- **Determinism (`05` intro):** identical requests return identical bodies — safe to cache aggressively; no timestamps in bodies.
- **`format.ts` (`06` §2 typography uses tabular numerics; §4 panels show signed % like `+412%`):**
  - `formatNumber(n, decimals=0)` → grouped thousands.
  - `formatPct(n, decimals=0, withSign=true)` → e.g. `+412%`, `-12%`, `0%`.
  - `formatDate(iso, style)` → from an ISO `YYYY-MM-DD` string; `"short"` → `Nov 1`, `"medium"` → `Nov 1, 2015`, `"weekday"` → `Sun, Nov 1`. Parse as **UTC** to avoid TZ drift (dates are plain ISO dates per `05` intro).
- **File locations (`06` §10):** `src/lib/types.ts`, `src/lib/api.ts`, `src/lib/format.ts`, `src/hooks/useForecast.ts`.

## 5. Implementation (exact paths from `06` §10; FULL runnable code)
All paths relative to `frontend/`.

### 5.1 `src/lib/types.ts` — mirrors `05` exactly
```ts
// Mirrors 05_API_CONTRACT.md §1, §3, §4, §5, §7 — EXACT shapes. Do not add/rename fields.

// ── 05 §1 shared vocabulary ───────────────────────────────────────────────
export type SeriesId =
  | "turkey"
  | "candy"
  | "strawberries"
  | "icecream"
  | "cocoa"
  | "chips"
  | "milk"
  | "bread";

export type VelocityStatus =
  | "Critical Decline"
  | "Declining"
  | "Stable"
  | "Growing"
  | "Accelerating";

export type RiskLevel = "Low" | "Medium" | "High";

export interface EventInfo {
  date: string; // ISO YYYY-MM-DD
  name: string;
  type: string;
}

// ── 05 §2 GET /api/health ─────────────────────────────────────────────────
export interface HealthResponse {
  status: string; // "ok"
  model_loaded: boolean;
  version: string; // "1.0.0"
}

// ── 05 §3 GET /api/products ───────────────────────────────────────────────
export type Archetype =
  | "Event-driven"
  | "Seasonal"
  | "Perishable seasonal"
  | "Stable baseline";

export interface ProductInfo {
  series_id: SeriesId;
  item_id: string; // e.g. "FOODS_3_069"
  name: string;
  dept_id: string; // e.g. "FOODS_3"
  archetype: Archetype;
  overall_mean: number;
  seasonal_cv: number;
}

export interface ProductsResponse {
  products: ProductInfo[]; // 8, in SERIES_IDS order
}

// ── 05 §4 GET /api/calendar/bounds ────────────────────────────────────────
export interface BoundsResponse {
  train_start: string;
  train_end: string;
  test_start: string;
  test_end: string;
  first_selectable_date: string;
  last_selectable_date: string;
  horizon: number; // 28
  history_window: number; // 84
}

// ── 05 §5 POST /api/forecast ──────────────────────────────────────────────
export interface ForecastRequest {
  product_ids: SeriesId[]; // non-empty, max 8, dedup'd
  start_date: string; // ISO, within [first_selectable_date, last_selectable_date]
}

export interface History {
  dates: string[]; // length 84, ending start_date - 1
  units: number[]; // length 84
}

export interface Metrics {
  accuracy: number; // max(0, 100 - sMAPE)
  coherence: number;
  coherence_label: "Strong" | "Moderate" | "Weak";
  smape: number;
  mae: number;
  rmse: number;
}

export interface Velocity {
  value: number;
  status: VelocityStatus;
}

export interface Inventory {
  on_hand: number;
  safety_stock: number;
  reorder_point: number;
  horizon_demand: number;
  cover_days: number;
  stockout_risk: RiskLevel;
  overstock: boolean;
  recommended_order_qty: number;
  projected_stock: number[]; // length 28
}

export type FactorKind = "event" | "seasonal" | "trend";

export interface Factor {
  label: string;
  value: number;
  kind: FactorKind;
}

export interface Explainability {
  event_contribution_pct: number;
  snap_days_in_horizon: number;
  narrative: string[];
  factors: Factor[];
}

export interface Seasonal {
  month: number; // 1–12
  month_vs_avg_pct: number;
  monthly_avg: number[]; // length 12 (Jan..Dec)
  weekday_avg: number[]; // length 7 (wday 1..7)
}

/** Map of event name → uplift percent (05 §5 event_uplift). */
export type EventUplift = Record<string, number>;

export interface ForecastResult {
  series_id: SeriesId;
  item_id: string;
  product_name: string;

  history: History;
  horizon_dates: string[]; // length 28

  actual: number[]; // length 28
  forecast: number[]; // length 28, 1 decimal

  metrics: Metrics;
  velocity: Velocity;
  inventory: Inventory;
  explainability: Explainability;

  events_in_horizon: EventInfo[];
  seasonal: Seasonal;
  event_uplift: EventUplift;
}

export interface Summary {
  total_predicted_demand: number;
  high_risk_count: number;
  avg_velocity: number;
  avg_accuracy: number;
  active_events: EventInfo[];
}

export interface ForecastResponse {
  start_date: string;
  horizon: number; // 28
  summary: Summary;
  results: ForecastResult[]; // one per requested product, in request order
}

// ── 05 §7 error shape (422 / 500) ─────────────────────────────────────────
export interface ApiErrorBody {
  error: string; // e.g. "validation_error"
  message: string; // shown in a toast (MT-42)
  field?: string; // omitted for 500s
}
```

### 5.2 `src/lib/api.ts` — typed fetch client + `ApiError`
```ts
import type {
  ApiErrorBody,
  BoundsResponse,
  ForecastRequest,
  ForecastResponse,
  HealthResponse,
  ProductsResponse,
} from "./types";

/** Base URL from .env (05 §1, §9). Never hard-code the host. */
export const API_BASE = import.meta.env.VITE_API_BASE as string;

/** Typed error carrying the 05 §7 body. */
export class ApiError extends Error {
  readonly error: string;
  readonly field?: string;
  readonly status: number;

  constructor(body: ApiErrorBody, status: number) {
    super(body.message);
    this.name = "ApiError";
    this.error = body.error;
    this.field = body.field;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
  } catch (networkErr) {
    throw new ApiError(
      { error: "network_error", message: "Could not reach the server. Is it running?" },
      0,
    );
  }

  if (!res.ok) {
    let body: ApiErrorBody;
    try {
      body = (await res.json()) as ApiErrorBody;
      if (typeof body?.message !== "string") throw new Error("bad error body");
    } catch {
      body = { error: "http_error", message: `Request failed (${res.status}).` };
    }
    throw new ApiError(body, res.status);
  }

  return (await res.json()) as T;
}

/** GET /api/health (05 §2). */
export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health");
}

/** GET /api/products (05 §3). */
export function getProducts(): Promise<ProductsResponse> {
  return request<ProductsResponse>("/api/products");
}

/** GET /api/calendar/bounds (05 §4). */
export function getBounds(): Promise<BoundsResponse> {
  return request<BoundsResponse>("/api/calendar/bounds");
}

/** POST /api/forecast (05 §5). Throws ApiError on 422/500. */
export function postForecast(req: ForecastRequest): Promise<ForecastResponse> {
  return request<ForecastResponse>("/api/forecast", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
```

### 5.3 `src/lib/format.ts`
```ts
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Grouped thousands, fixed decimals. */
export function formatNumber(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Signed percent like "+412%", "-12%", "0%" (06 §4). */
export function formatPct(n: number, decimals = 0, withSign = true): string {
  if (!Number.isFinite(n)) return "—";
  const sign = withSign && n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

export type DateStyle = "short" | "medium" | "weekday";

/** Format an ISO YYYY-MM-DD date. Parsed as UTC to avoid TZ drift (05 intro). */
export function formatDate(iso: string, style: DateStyle = "short"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, monthIdx, day));
  const mon = MONTHS_SHORT[monthIdx];
  const wd = WEEKDAYS_SHORT[d.getUTCDay()];
  switch (style) {
    case "medium":
      return `${mon} ${day}, ${year}`;
    case "weekday":
      return `${wd}, ${mon} ${day}`;
    case "short":
    default:
      return `${mon} ${day}`;
  }
}
```

### 5.4 `src/hooks/useForecast.ts` — TanStack Query wrappers
```ts
import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import { getBounds, getProducts, postForecast } from "../lib/api";
import type {
  BoundsResponse,
  ForecastRequest,
  ForecastResponse,
  ProductsResponse,
} from "../lib/types";
import type { ApiError } from "../lib/api";

/** GET /api/products — static, cached long (05 §3). */
export function useProducts(): UseQueryResult<ProductsResponse, ApiError> {
  return useQuery<ProductsResponse, ApiError>({
    queryKey: ["products"],
    queryFn: getProducts,
    staleTime: Infinity,
  });
}

/** GET /api/calendar/bounds — static, cached long (05 §4). */
export function useBounds(): UseQueryResult<BoundsResponse, ApiError> {
  return useQuery<BoundsResponse, ApiError>({
    queryKey: ["bounds"],
    queryFn: getBounds,
    staleTime: Infinity,
  });
}

/**
 * POST /api/forecast — mutation exposing idle/pending/success/error (06 §5).
 * Call .mutate(req) / .mutateAsync(req); read .status, .data, .error.
 */
export function useForecastMutation(): UseMutationResult<
  ForecastResponse,
  ApiError,
  ForecastRequest
> {
  return useMutation<ForecastResponse, ApiError, ForecastRequest>({
    mutationKey: ["forecast"],
    mutationFn: postForecast,
  });
}
```

> TanStack Query v5 mutation status values are `"idle" | "pending" | "success" | "error"` — these map directly onto the `06` §5 panel states (idle / loading / success / error) consumed by MT-32.

## 6. Tests / Verification (Vitest + RTL)
Colocate `src/lib/__tests__/api.test.ts`. Uses the committed mock fixture (`05` §9 / MT-25) so it never needs a server.

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, postForecast } from "../api";
import type { ForecastResponse } from "../types";
import turkeyFixture from "../../../mock/fixtures/turkey.json";

// Build a minimal ForecastResponse around the committed per-product fixture.
function buildResponse(): ForecastResponse {
  const result = turkeyFixture as unknown as ForecastResponse["results"][number];
  return {
    start_date: "2015-11-01",
    horizon: 28,
    summary: {
      total_predicted_demand: result.inventory.horizon_demand,
      high_risk_count: result.inventory.stockout_risk === "High" ? 1 : 0,
      avg_velocity: result.velocity.value,
      avg_accuracy: result.metrics.accuracy,
      active_events: result.events_in_horizon,
    },
    results: [result],
  };
}

afterEach(() => vi.restoreAllMocks());

describe("api.ts (MT-31)", () => {
  it("parses a fixture ForecastResponse into typed objects without throwing", async () => {
    const payload = buildResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );

    const res = await postForecast({ product_ids: ["turkey"], start_date: "2015-11-01" });
    expect(res.horizon).toBe(28);
    expect(res.results).toHaveLength(1);
    const r = res.results[0];
    expect(r.forecast).toHaveLength(28);
    expect(r.history.units).toHaveLength(84);
    expect(["Strong", "Moderate", "Weak"]).toContain(r.metrics.coherence_label);
    expect(typeof r.velocity.value).toBe("number");
  });

  it("throws a typed ApiError carrying the 05 §7 body on non-2xx", async () => {
    const errBody = {
      error: "validation_error",
      message: "start_date 2016-12-01 is outside the selectable range [2014-01-28, 2016-04-25].",
      field: "start_date",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(errBody), { status: 422 })),
    );

    await expect(
      postForecast({ product_ids: ["turkey"], start_date: "2016-12-01" }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      error: "validation_error",
      field: "start_date",
      message: errBody.message,
    });

    await expect(
      postForecast({ product_ids: ["turkey"], start_date: "2016-12-01" }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
```

> The test imports `mock/fixtures/turkey.json`; `resolveJsonModule` is on (MT-02 tsconfig) and Vitest resolves JSON natively. If MT-25's fixture path differs, adjust the import path — the assertions still hold against any conformant `05` §5 fixture.

Run / gate:
```powershell
npm run test
npm run typecheck   # tsc --noEmit, strict
npm run build
```

## 7. Acceptance checklist
- [ ] `src/lib/types.ts` mirrors `05` §1 + every `/api/forecast` type exactly: `SeriesId`, `VelocityStatus`, `RiskLevel`, `EventInfo`, `ProductInfo`, `BoundsResponse`, `Metrics`, `Velocity`, `Inventory`, `Factor`, `Explainability`, `Seasonal`, `ForecastResult`, `Summary`, `ForecastResponse`, `ForecastRequest` (+ `HealthResponse`, `ProductsResponse`, `ApiErrorBody`).
- [ ] `src/lib/api.ts` reads `import.meta.env.VITE_API_BASE`, calls `/api/...`, and exports `getHealth`, `getProducts`, `getBounds`, `postForecast`.
- [ ] `ApiError` carries `{error, message, field?, status}` per `05` §7 and is thrown on any non-2xx (and on network failure).
- [ ] `src/lib/format.ts` exports `formatNumber`, `formatPct` (signed), `formatDate` (UTC-parsed, short/medium/weekday).
- [ ] `src/hooks/useForecast.ts` exports `useProducts`, `useBounds` (queries) and `useForecastMutation` (mutation) exposing idle/pending/success/error.
- [ ] Vitest: api parses a fixture `ForecastResponse` into typed objects without throwing; `ApiError` is thrown (and is `instanceof ApiError`) on a simulated 422 body with the correct `field`.
- [ ] `tsc --noEmit` (strict) and `npm run build` are clean.
- [ ] No host is hard-coded; no UI was added; only `06` §10 data-layer paths were touched.
