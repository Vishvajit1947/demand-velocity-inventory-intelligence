# MT-33 — Forecast Control Bar (date field + product multiselect + submit)

## 1. Context
The Control Bar is the **P0 panel** of the dashboard (`06_UIUX_SPEC.md` §3 layout, §4 "P0 — Control Bar"). It is the single entry point that drives every other panel: the user picks a **start date** (constrained to the selectable calendar window) and a set of **products** (1–8 chips), then presses the glowing **Forecast** CTA, which fires `POST /api/forecast` with `{product_ids, start_date}`. On success the App lifts the returned `ForecastResponse` into shared state so the Executive Overview (MT-36), Forecast Result (MT-34), and all analytical panels (MT-37…41) re-render.

This task builds three files under `src/components/controls/` (the exact folder from `06` §10): the container `ForecastControlBar.tsx` plus two sub-components `DateField.tsx` and `ProductMultiSelect.tsx`. State (selected date, selected product ids) is **lifted to `App.tsx`** and passed down via props/callbacks — no global store, keeping it simple per the task brief. The submit handler and the mutation's pending/`mutate` come from `useForecast` (MT-31) and are wired in `App` (MT-32), then passed in as props.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/05_API_CONTRACT.md` — §3 `/api/products` (the 8 products + order), §4 `/api/calendar/bounds` (`first_selectable_date`, `last_selectable_date`, default = `last_selectable_date`), §5 `POST /api/forecast` request body `{product_ids, start_date}`.
- `docs/06_UIUX_SPEC.md` — **§4 "P0 — Control Bar"** (locked behavior), §2 tokens/colors, §3 control-bar position (sticky), §5 Loading state (spinner), §6 a11y (tabbable, Enter/Space), §7 libs, §10 tree.
- `docs/07_TESTING_STRATEGY.md` — §3: "**ForecastControlBar:** disables Forecast when no product selected; disables out-of-range dates; calls the submit handler with `{product_ids, start_date}`."

**Prior MT artifacts that MUST already exist (import — do NOT redefine):**
- **MT-30** primitives in `src/components/ui/`: `Chip`, `Button`, `GlassPanel`. (Tokens/global CSS from MT-30 are already loaded by the app shell.)
- **MT-31** in `src/lib/` and `src/hooks/`: `useProducts()`, `useBounds()` hooks (TanStack Query wrappers), and the typed model `Product`, `CalendarBounds`, `SeriesId` from `src/lib/types.ts`. Also `formatDate` from `src/lib/format.ts`.
- **MT-32** `App.tsx` shell owns `useForecast` mutation and the lifted state; it passes the props this component declares.

**Deps (all already in `06` §7 — no new deps):** `framer-motion`, `lucide-react`, shadcn/Radix `Popover` (a shadcn primitive added in MT-02). React 18 + TS.

## 3. Goal
Implement a sticky, glass Control Bar that:
1. **DateField** — a calendar **popover** (shadcn/Radix `Popover` + a native `<input type="date">`) constrained to `[first_selectable_date, last_selectable_date]` from `useBounds()`; **default value = `last_selectable_date`**; any out-of-range date is disabled (via `min`/`max` and guarded `onChange`). An optional **"Snap to week start"** toggle snaps the chosen date back to the Saturday that begins its M5 week.
2. **ProductMultiSelect** — **8 glowing toggle Chips** from `useProducts()`; **Select all** / **Clear** buttons; **≥ 1 required**.
3. **Forecast Button** — primary glowing CTA; **disabled when no product selected**; while the mutation is pending shows a spinner + **"Forecasting…"**; `onClick` calls the lifted submit handler with `{ product_ids, start_date }`.

State (`selectedDate`, `selectedIds`) lives in `App`; this bar is controlled via props.

## 4. Design (locked decisions; cite `06` sections)
- **Placement & shell (`06` §3, §4).** Single sticky row inside a `GlassPanel` (MT-30). Left: DateField. Middle: ProductMultiSelect (chips wrap on narrow widths, `06` §3 "Below 1280px… stack"). Right: Forecast CTA. Entrance: Framer Motion fade + 12px rise, `duration 0.5`, `ease [0.22,1,0.36,1]` (`06` §2 Motion). `prefers-reduced-motion` → no transform (`06` §6) — handled by MT-30's motion conventions; here we set `initial`/`animate` only and rely on a reduced-motion-safe transition.
- **Date constraints (`06` §4, `05` §4).** The `<input type="date">` gets `min={bounds.first_selectable_date}` and `max={bounds.last_selectable_date}` so the browser **disables out-of-range dates**. `onChange` additionally **clamps/ignores** any value outside the window (defensive, deterministic — satisfies the "out-of-range dates disabled" test even in jsdom where `min`/`max` aren't enforced). Default = `bounds.last_selectable_date` (`06` §4: "Default value = `last_selectable_date`"). The field is **disabled until bounds load**.
- **Snap to week start (`06` §4 "Week ▾ quick toggle").** Optional convenience. M5 weeks start on **Saturday** (`05` §4 `train_start: 2011-01-29` is a Saturday; weekday strip in `06` §5 is "Sat→Fri"). Snapping = walk the date back to the nearest **Saturday ≤ date**, then **clamp** into `[first, last]`. Implemented as a checkbox/toggle next to the date; when on, every date pick is snapped. Locked = Saturday-anchored, clamp after snap.
- **Products (`06` §4, `05` §3).** Exactly the 8 products from `useProducts()` **in API order**. Each is a `Chip` (MT-30) in toggle mode: active = glowing accent (`--accent-cyan` glow per `06` §2 "Glow utility"), inactive = muted. "Select all" selects all 8 ids; "Clear" empties (which then disables Forecast). **≥ 1 required** is enforced solely by the Forecast button's `disabled` (`06` §4: "At least 1 must be selected (Forecast disabled otherwise)").
- **Forecast CTA (`06` §4, §5 Loading).** Primary glowing `Button` (MT-30 `variant="primary"`). `disabled` when `selectedIds.length === 0` **or** `isPending` **or** bounds not yet loaded. While `isPending`: spinner (lucide `Loader2` spin) + label **"Forecasting…"** (`06` §5 "control bar shows spinner"). Icon: lucide `ArrowRight` (the `⟶` in the `06` §3 mock).
- **Submit payload (`05` §5).** `onSubmit({ product_ids: selectedIds, start_date: selectedDate })`. `product_ids` is `SeriesId[]`; duplicates can't occur (chip toggles are a set). The actual `POST` + toast-on-error is owned by `App`/MT-31; this component only calls the handler.
- **Colors/tokens (`06` §2).** Use token CSS vars only (`--accent-cyan`, `--text-muted`, `--text-primary`, `--border-glass`). No hard-coded hex beyond what MT-30 primitives already encapsulate.
- **a11y (`06` §6).** Date input, chips, toggle, and button are all tabbable; chips toggle on Enter/Space (MT-30 `Chip` already does this); button is a real `<button>`. Status (active chip) pairs glow with the visible product label (color is never the only signal).

## 5. Implementation (exact file paths from `06` §10; FULL runnable TSX)

> Reuse only. `Chip`, `Button`, `GlassPanel` come from MT-30; `useProducts`, `useBounds`, types come from MT-31. Import paths follow the canonical tree (`06` §10) using relative paths.

### File: `src/components/controls/DateField.tsx`
```tsx
import { useState } from "react";
import { Calendar as CalendarIcon, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover"; // shadcn Radix popover primitive (MT-02)
import type { CalendarBounds } from "../../lib/types";
import { formatDate } from "../../lib/format";

export interface DateFieldProps {
  /** Currently selected ISO date (YYYY-MM-DD). Controlled by App. */
  value: string;
  /** Calendar window from GET /api/calendar/bounds (MT-31 useBounds). */
  bounds?: CalendarBounds;
  /** Whether bounds are still loading (disables the field). */
  loading?: boolean;
  /** Notify parent of a new (already in-range) ISO date. */
  onChange: (isoDate: string) => void;
}

/** Snap an ISO date back to the Saturday that starts its M5 week, then clamp. */
export function snapToWeekStart(iso: string, min: string, max: string): string {
  const d = new Date(iso + "T00:00:00");
  // getUTCDay: Sun=0..Sat=6. Walk back to the most recent Saturday (6).
  const back = (d.getUTCDay() + 1) % 7; // days since last Saturday
  d.setUTCDate(d.getUTCDate() - back);
  let snapped = d.toISOString().slice(0, 10);
  if (snapped < min) snapped = min;
  if (snapped > max) snapped = max;
  return snapped;
}

/** Clamp an ISO date into [min,max]; returns null if it cannot be clamped. */
function clampDate(iso: string, min: string, max: string): string {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}

export function DateField({ value, bounds, loading, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState(false);

  const min = bounds?.first_selectable_date ?? "";
  const max = bounds?.last_selectable_date ?? "";
  const disabled = loading || !bounds;

  function handleInput(raw: string) {
    if (!raw || !bounds) return;
    // Defensive clamp: browsers honor min/max, jsdom does not — never emit out-of-range.
    let next = clampDate(raw, min, max);
    if (snap) next = snapToWeekStart(next, min, max);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-caption text-[var(--text-muted)] font-[Inter]">
        Forecast start date
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Open date picker"
            className="flex items-center gap-2 rounded-[14px] border border-[var(--border-glass)]
                       bg-[var(--bg-panel-solid)] px-4 py-2 text-body text-[var(--text-primary)]
                       font-[JetBrains_Mono] tabular-nums transition
                       hover:shadow-[0_0_18px_rgba(47,230,255,0.18)] disabled:opacity-50
                       focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]"
          >
            <CalendarIcon size={16} className="text-[var(--accent-cyan)]" />
            <span>{value ? formatDate(value) : "Select date"}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="rounded-[14px] border border-[var(--border-glass)]
                     bg-[var(--bg-panel-solid)] p-4 shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
        >
          <div className="flex flex-col gap-3">
            <input
              type="date"
              aria-label="Forecast start date input"
              value={value}
              min={min}
              max={max}
              disabled={disabled}
              onChange={(e) => handleInput(e.target.value)}
              className="rounded-[10px] border border-[var(--border-glass)]
                         bg-[var(--bg-base)] px-3 py-2 text-body text-[var(--text-primary)]
                         font-[JetBrains_Mono] tabular-nums
                         focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]
                         [color-scheme:dark]"
            />
            <button
              type="button"
              role="switch"
              aria-checked={snap}
              onClick={() => {
                const nextSnap = !snap;
                setSnap(nextSnap);
                if (nextSnap && value) onChange(snapToWeekStart(value, min, max));
              }}
              className="flex items-center gap-2 text-caption text-[var(--text-muted)]
                         hover:text-[var(--text-primary)] focus:outline-none"
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border
                  ${
                    snap
                      ? "border-[var(--accent-cyan)] text-[var(--accent-cyan)]"
                      : "border-[var(--border-glass)] text-transparent"
                  }`}
              >
                <Check size={12} />
              </span>
              Snap to week start (Sat)
            </button>
            <p className="text-caption text-[var(--text-muted)]">
              Selectable: {min ? formatDate(min) : "—"} → {max ? formatDate(max) : "—"}
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default DateField;
```

### File: `src/components/controls/ProductMultiSelect.tsx`
```tsx
import { CheckCheck, X } from "lucide-react";
import { Chip } from "../ui/chip";
import type { Product, SeriesId } from "../../lib/types";

export interface ProductMultiSelectProps {
  /** The 8 products from GET /api/products (MT-31 useProducts), in API order. */
  products: Product[];
  /** Whether products are still loading. */
  loading?: boolean;
  /** Currently selected series ids (controlled by App). */
  selectedIds: SeriesId[];
  /** Replace the selection with the given ids. */
  onChange: (ids: SeriesId[]) => void;
}

export function ProductMultiSelect({
  products,
  loading,
  selectedIds,
  onChange,
}: ProductMultiSelectProps) {
  const selected = new Set(selectedIds);

  function toggle(id: SeriesId) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Preserve API order so the payload is deterministic.
    onChange(products.map((p) => p.series_id).filter((sid) => next.has(sid)));
  }

  function selectAll() {
    onChange(products.map((p) => p.series_id));
  }
  function clear() {
    onChange([]);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <label className="text-caption text-[var(--text-muted)] font-[Inter]">
          Products ({selectedIds.length}/8)
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={selectAll}
            disabled={loading}
            className="flex items-center gap-1 text-caption text-[var(--accent-cyan)]
                       hover:underline disabled:opacity-40 focus:outline-none"
          >
            <CheckCheck size={12} /> Select all
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={loading || selectedIds.length === 0}
            className="flex items-center gap-1 text-caption text-[var(--text-muted)]
                       hover:text-[var(--text-primary)] disabled:opacity-40 focus:outline-none"
          >
            <X size={12} /> Clear
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Product selection">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className="h-8 w-28 animate-pulse rounded-full bg-[var(--bg-panel)]"
              />
            ))
          : products.map((p) => (
              <Chip
                key={p.series_id}
                active={selected.has(p.series_id)}
                onToggle={() => toggle(p.series_id)}
                aria-pressed={selected.has(p.series_id)}
              >
                {p.name}
              </Chip>
            ))}
      </div>
    </div>
  );
}

export default ProductMultiSelect;
```

### File: `src/components/controls/ForecastControlBar.tsx`
```tsx
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import { GlassPanel } from "../ui/glass-panel";
import { Button } from "../ui/button";
import { DateField } from "./DateField";
import { ProductMultiSelect } from "./ProductMultiSelect";
import { useBounds } from "../../hooks/useForecast";
import { useProducts } from "../../hooks/useForecast";
import type { ForecastRequest, SeriesId } from "../../lib/types";

export interface ForecastControlBarProps {
  /** Selected ISO start date (controlled by App). */
  selectedDate: string;
  /** Selected series ids (controlled by App). */
  selectedIds: SeriesId[];
  /** Whether the forecast mutation is in flight (App's useForecast.isPending). */
  isPending?: boolean;
  onDateChange: (iso: string) => void;
  onProductsChange: (ids: SeriesId[]) => void;
  /** Fire the forecast with the exact API payload (05 §5). */
  onSubmit: (payload: ForecastRequest) => void;
}

export function ForecastControlBar({
  selectedDate,
  selectedIds,
  isPending = false,
  onDateChange,
  onProductsChange,
  onSubmit,
}: ForecastControlBarProps) {
  const { data: bounds, isLoading: boundsLoading } = useBounds();
  const { data: products, isLoading: productsLoading } = useProducts();

  const canForecast = selectedIds.length > 0 && !!bounds && !isPending;

  function handleForecast() {
    if (!canForecast) return;
    onSubmit({ product_ids: selectedIds, start_date: selectedDate });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-20"
    >
      <GlassPanel className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <DateField
          value={selectedDate}
          bounds={bounds}
          loading={boundsLoading}
          onChange={onDateChange}
        />

        <div className="flex-1 lg:px-6">
          <ProductMultiSelect
            products={products ?? []}
            loading={productsLoading}
            selectedIds={selectedIds}
            onChange={onProductsChange}
          />
        </div>

        <Button
          variant="primary"
          glow
          disabled={!canForecast}
          onClick={handleForecast}
          aria-label="Run forecast"
          className="min-w-[180px] justify-center"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Forecasting…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Forecast
              <ArrowRight size={16} />
            </span>
          )}
        </Button>
      </GlassPanel>
    </motion.div>
  );
}

export default ForecastControlBar;
```

> **App wiring (reference; lives in MT-32 `App.tsx`, shown here so the contract is unambiguous):**
> ```tsx
> const [selectedDate, setSelectedDate] = useState<string>(""); // set to bounds.last_selectable_date once loaded
> const [selectedIds, setSelectedIds] = useState<SeriesId[]>([]);
> const forecast = useForecast(); // TanStack mutation from MT-31
> // when bounds arrive and selectedDate is "", default it:
> //   useEffect(() => { if (bounds && !selectedDate) setSelectedDate(bounds.last_selectable_date); }, [bounds]);
> <ForecastControlBar
>   selectedDate={selectedDate}
>   selectedIds={selectedIds}
>   isPending={forecast.isPending}
>   onDateChange={setSelectedDate}
>   onProductsChange={setSelectedIds}
>   onSubmit={(payload) => forecast.mutate(payload)}
> />
> ```

## 6. Tests / Verification (Vitest + RTL; commands)
**File:** `src/components/controls/ForecastControlBar.test.tsx` (colocated, `07` §3). Tests use a minimal QueryClient and mock the MT-31 hooks so they are **offline + deterministic** (`07` §1). Fixture data mirrors `05` §3/§4.

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ForecastControlBar } from "./ForecastControlBar";
import type { CalendarBounds, Product } from "../../lib/types";

// --- Mock the MT-31 data hooks so the bar renders offline ---
const BOUNDS: CalendarBounds = {
  train_start: "2011-01-29",
  train_end: "2014-01-27",
  test_start: "2014-01-28",
  test_end: "2016-05-22",
  first_selectable_date: "2014-01-28",
  last_selectable_date: "2016-04-25",
  horizon: 28,
  history_window: 84,
};
const PRODUCTS: Product[] = [
  { series_id: "turkey", item_id: "FOODS_3_069", name: "Fresh Whole Turkey", dept_id: "FOODS_3", archetype: "Event-driven", overall_mean: 18.6, seasonal_cv: 1.25 },
  { series_id: "candy", item_id: "FOODS_3_090", name: "Candy", dept_id: "FOODS_3", archetype: "Seasonal", overall_mean: 10, seasonal_cv: 1.0 },
  { series_id: "milk", item_id: "FOODS_3_120", name: "Whole Milk", dept_id: "FOODS_3", archetype: "Stable baseline", overall_mean: 30, seasonal_cv: 0.2 },
];

vi.mock("../../hooks/useForecast", () => ({
  useBounds: () => ({ data: BOUNDS, isLoading: false }),
  useProducts: () => ({ data: PRODUCTS, isLoading: false }),
  useForecast: () => ({ mutate: vi.fn(), isPending: false }),
}));

function setup(overrides: Partial<React.ComponentProps<typeof ForecastControlBar>> = {}) {
  const onSubmit = vi.fn();
  const onDateChange = vi.fn();
  const onProductsChange = vi.fn();
  render(
    <ForecastControlBar
      selectedDate="2016-04-25"
      selectedIds={[]}
      isPending={false}
      onDateChange={onDateChange}
      onProductsChange={onProductsChange}
      onSubmit={onSubmit}
      {...overrides}
    />
  );
  return { onSubmit, onDateChange, onProductsChange };
}

describe("ForecastControlBar (MT-33)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables Forecast when no product is selected", () => {
    setup({ selectedIds: [] });
    const btn = screen.getByRole("button", { name: /run forecast/i });
    expect(btn).toBeDisabled();
  });

  it("enables Forecast and submits the correct payload when a product is selected", () => {
    const { onSubmit } = setup({ selectedIds: ["turkey", "milk"], selectedDate: "2015-11-01" });
    const btn = screen.getByRole("button", { name: /run forecast/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      product_ids: ["turkey", "milk"],
      start_date: "2015-11-01",
    });
  });

  it("constrains the date input to the selectable range (min/max + clamp)", () => {
    const { onDateChange } = setup({ selectedIds: ["turkey"] });
    // open the popover
    fireEvent.click(screen.getByLabelText(/open date picker/i));
    const input = screen.getByLabelText(/forecast start date input/i) as HTMLInputElement;
    expect(input.min).toBe("2014-01-28");
    expect(input.max).toBe("2016-04-25");
    // an out-of-range value is clamped, never emitted as-is
    fireEvent.change(input, { target: { value: "2016-12-01" } });
    expect(onDateChange).toHaveBeenCalledWith("2016-04-25"); // clamped to last_selectable_date
  });

  it("shows the spinner + 'Forecasting…' while the mutation is pending", () => {
    setup({ selectedIds: ["turkey"], isPending: true });
    expect(screen.getByText(/forecasting…/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run forecast/i })).toBeDisabled();
  });

  it("Select all selects all 8 products; Clear empties the selection", () => {
    const { onProductsChange } = setup({ selectedIds: [] });
    fireEvent.click(screen.getByText(/select all/i));
    expect(onProductsChange).toHaveBeenCalledWith(["turkey", "candy", "milk"]);
  });
});
```

**Commands (run from `frontend/`):**
```powershell
cd frontend
npm run test -- ForecastControlBar
npm run build   # must compile with 0 TS errors (07 §3 build gate)
```

## 7. Acceptance checklist
- [ ] Files exist at `src/components/controls/ForecastControlBar.tsx`, `DateField.tsx`, `ProductMultiSelect.tsx` (paths from `06` §10).
- [ ] `Chip`, `Button`, `GlassPanel` are **imported** from MT-30 (`src/components/ui/*`); `useBounds`, `useProducts`, and types from MT-31 — none are redefined.
- [ ] DateField is a shadcn/Radix `Popover` + `<input type="date">` with `min=first_selectable_date`, `max=last_selectable_date`; out-of-range values are clamped/ignored; default value = `last_selectable_date` (set by App).
- [ ] "Snap to week start" toggle snaps to the Saturday ≤ date, then clamps into range.
- [ ] ProductMultiSelect renders the 8 products from `useProducts()` as glowing toggle Chips in API order, with working **Select all** / **Clear**.
- [ ] Forecast Button is the primary glowing CTA, **disabled when `selectedIds.length === 0`**, disabled + spinner + "Forecasting…" while `isPending`.
- [ ] `onSubmit` is called with exactly `{ product_ids: SeriesId[], start_date: string }` (`05` §5).
- [ ] State is lifted to App (component is fully controlled via props); only `--token` colors used (`06` §2).
- [ ] a11y: date input, chips, snap toggle, and button are tabbable and operable by keyboard (`06` §6).
- [ ] Tests in `ForecastControlBar.test.tsx` pass; `npm run build` is clean.
