# MT-36 — Executive Overview (4 stat cards from `summary`)

## 1. Context
The **Executive Overview** is the **P1** band directly under the Control Bar (`06_UIUX_SPEC.md` §3 layout — "EXECUTIVE OVERVIEW: [card][card][card][card]"; §4 "P1"). It gives a one-glance, **aggregate-across-the-selection** read of the forecast via four glass **stat cards** built from `ForecastResponse.summary` (`05_API_CONTRACT.md` §5):
1. **Total Predicted Demand** = `summary.total_predicted_demand`
2. **High-Risk Products** = `summary.high_risk_count` (rose if `> 0`)
3. **Avg Velocity** = `summary.avg_velocity` (% with up/down arrow, sign-colored)
4. **Active Events** = count of `summary.active_events` (list on hover/tooltip)

Numbers **count up**, cards enter with a **staggered** animation, each has a **lucide** icon. This task builds `src/components/panels/ExecutiveOverview.tsx`, reusing the **`StatCard`** primitive from MT-30. It is presentational — the App passes `summary` from the forecast response.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/05_API_CONTRACT.md` — §5 `summary` shape: `total_predicted_demand`, `high_risk_count`, `avg_velocity`, `avg_accuracy`, `active_events: EventInfo[]`; and §1 `EventInfo = { date, name, type }`. §5 aggregation notes (summary aggregates across `results`).
- `docs/06_UIUX_SPEC.md` — **§4 "P1 — Executive Overview"** (locked: the four cards, count-up, icon + footnote; rose if high-risk>0; velocity arrow + sign color; events list on hover). §2 tokens + status→color map + motion (staggered entrance 0.06s, count-up 0.8s), §3 "Executive Overview always aggregates across the selection", §6 a11y, §7 libs, §10 tree.
- `docs/07_TESTING_STRATEGY.md` — §3: "renders four cards with the summary values; high-risk card turns rose when count>0."

**Prior MT artifacts that MUST already exist (import — do NOT redefine):**
- **MT-30** primitives `src/components/ui/`: **`StatCard`** (props assumed: `label`, `value`, `icon`, `accent`, `countUp`, `decimals?`, `suffix?`, `prefix?`, `footnote?`, `tooltip?`, `delay?`). `StatCard` already integrates `react-countup` + Framer Motion entrance per `06` §2. Also `SectionTitle` if used.
- **MT-31** `src/lib/types.ts`: `ForecastSummary` type (the `summary` slice) and `EventInfo`; `src/lib/format.ts`: `formatNumber`, `formatDate`.

**Deps:** none new — `react-countup`, `framer-motion`, `lucide-react` are all in `06` §7 (count-up/motion consumed inside `StatCard`). React 18 + TS.

## 3. Goal
Implement `ExecutiveOverview.tsx` that, given `summary: ForecastSummary`, renders the four `StatCard`s:
1. **Total Predicted Demand** — value `total_predicted_demand` (units, "next 28 days" footnote), icon `Package`, accent cyan, count-up.
2. **High-Risk Products** — value `high_risk_count`, icon `AlertTriangle`, accent **rose when `> 0`** else muted/lime; footnote "stockout risk = High".
3. **Avg Velocity** — value `avg_velocity` as a **percentage** with an **up/down arrow** and **sign color** (lime ≥ 0, rose < 0), icon `Gauge`/`TrendingUp`; footnote "vs prior 28 days".
4. **Active Events** — value = `active_events.length`, icon `CalendarClock`, accent violet; the event names listed **on hover** (tooltip/title from `active_events`).

Cards enter **staggered**; numbers **count up**.

## 4. Design (locked decisions; cite `06` sections)
- **Layout (`06` §3).** A responsive 4-column grid (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`, gap 24 per `06` §2 spacing). Each cell is an MT-30 `StatCard`. The whole band aggregates across the selection — values come straight from `summary` (`06` §3, `05` §5).
- **Card 1 — Total Predicted Demand (`06` §4.1).** `value={summary.total_predicted_demand}`, `decimals={0}` (units), `accent="cyan"` (`--accent-cyan`), icon lucide `Package`, footnote "Units · next 28 days". Count-up.
- **Card 2 — High-Risk Products (`06` §4.2).** `value={summary.high_risk_count}`, `decimals={0}`, icon lucide `AlertTriangle`. **Accent = rose when `high_risk_count > 0`, else lime** ("Low risk/positive" → lime per `06` §2 map). Footnote "Stockout risk = High". `decimals={0}`.
- **Card 3 — Avg Velocity (`06` §4.3).** `value={summary.avg_velocity}`, `suffix="%"`, `decimals={1}`. **Sign drives arrow + color** (`06` §2 map: positive→lime, negative→rose): if `avg_velocity >= 0` → `accent="lime"`, icon `TrendingUp`, `prefix="+"`; else → `accent="rose"`, icon `TrendingDown`, prefix "−" implied by the negative value (so we pass `prefix=""` and let the sign show). Footnote "Avg velocity · vs prior 28 days".
  - **Sign color rule is locked:** color is `--accent-lime` for `>= 0`, `--accent-rose` for `< 0`. The arrow icon mirrors the sign. Always paired with the visible signed number (`06` §6 — never color-only).
- **Card 4 — Active Events (`06` §4.4).** `value={summary.active_events.length}`, `decimals={0}`, icon lucide `CalendarClock`, `accent="violet"`. The **event list shows on hover** — passed as a `tooltip` of formatted `"<date> — <name> (<type>)"` lines (`06` §4: "list them on hover/tooltip"). Footnote "Events in this window". If zero events, tooltip "No events in this window".
- **Motion (`06` §2).** Staggered entrance handled by passing an increasing `delay` to each `StatCard` (`index * 0.06`s, matching "staggered 0.06s"). Count-up 0.8s is internal to `StatCard`. Both respect `prefers-reduced-motion` inside the primitive.
- **Empty/idle (`06` §5).** If `summary` is undefined (no forecast yet), render four **placeholder cards** with em-dash values and the idle accent (muted) — keeps panel heights reserved (no layout shift, `06` §6). The App may instead show MT-42 skeletons during loading; this component handles the success render and a graceful undefined-summary fallback.
- **Tokens only (`06` §2).** Accent names map to `--accent-*`; no raw hex. `StatCard` owns glass styling.
- **No data fetching** — App passes `summary` from `useForecast` data (MT-31/MT-32).

## 5. Implementation (exact file path from `06` §10; FULL runnable TSX)

### File: `src/components/panels/ExecutiveOverview.tsx`
```tsx
import {
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  CalendarClock,
} from "lucide-react";
import { StatCard } from "../ui/stat-card";
import type { ForecastSummary, EventInfo } from "../../lib/types";
import { formatDate } from "../../lib/format";

export interface ExecutiveOverviewProps {
  /** The summary slice of the forecast response (05 §5). Undefined when no forecast yet. */
  summary?: ForecastSummary;
  /** Disable count-up/entrance for tests/idle. Defaults to animated. */
  animate?: boolean;
}

/** Render the active_events list as a hover tooltip string (06 §4.4). */
function eventsTooltip(events: EventInfo[]): string {
  if (!events || events.length === 0) return "No events in this window";
  return events
    .map((e) => `${formatDate(e.date)} — ${e.name} (${e.type})`)
    .join("\n");
}

export function ExecutiveOverview({ summary, animate = true }: ExecutiveOverviewProps) {
  // --- Idle fallback: reserve heights, no layout shift (06 §5/§6) ---
  if (!summary) {
    const placeholders = [
      { label: "Total Predicted Demand", icon: <Package size={18} /> },
      { label: "High-Risk Products", icon: <AlertTriangle size={18} /> },
      { label: "Avg Velocity", icon: <TrendingUp size={18} /> },
      { label: "Active Events", icon: <CalendarClock size={18} /> },
    ];
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {placeholders.map((p, i) => (
          <StatCard
            key={p.label}
            label={p.label}
            value={0}
            icon={p.icon}
            accent="muted"
            countUp={false}
            footnote="—"
            delay={animate ? i * 0.06 : 0}
            placeholder
          />
        ))}
      </div>
    );
  }

  const highRisk = summary.high_risk_count;
  const velocity = summary.avg_velocity;
  const velocityPositive = velocity >= 0;
  const events = summary.active_events ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1 — Total Predicted Demand */}
      <StatCard
        label="Total Predicted Demand"
        value={summary.total_predicted_demand}
        decimals={0}
        accent="cyan"
        icon={<Package size={18} />}
        footnote="Units · next 28 days"
        countUp={animate}
        delay={animate ? 0 : 0}
      />

      {/* 2 — High-Risk Products (rose if > 0) */}
      <StatCard
        label="High-Risk Products"
        value={highRisk}
        decimals={0}
        accent={highRisk > 0 ? "rose" : "lime"}
        icon={<AlertTriangle size={18} />}
        footnote="Stockout risk = High"
        countUp={animate}
        delay={animate ? 0.06 : 0}
        data-testid="card-high-risk"
      />

      {/* 3 — Avg Velocity (% with arrow + sign color) */}
      <StatCard
        label="Avg Velocity"
        value={velocity}
        decimals={1}
        suffix="%"
        prefix={velocityPositive ? "+" : ""}
        accent={velocityPositive ? "lime" : "rose"}
        icon={velocityPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
        footnote="Avg velocity · vs prior 28 days"
        countUp={animate}
        delay={animate ? 0.12 : 0}
        data-testid="card-velocity"
      />

      {/* 4 — Active Events (count; list on hover) */}
      <StatCard
        label="Active Events"
        value={events.length}
        decimals={0}
        accent="violet"
        icon={<CalendarClock size={18} />}
        footnote="Events in this window"
        tooltip={eventsTooltip(events)}
        countUp={animate}
        delay={animate ? 0.18 : 0}
        data-testid="card-events"
      />
    </div>
  );
}

export default ExecutiveOverview;
```

> **Note on `StatCard` props.** MT-30 owns the glass card, count-up, Framer entrance, accent→`--accent-*` mapping, icon slot, footnote, optional `tooltip` (hover title) and `placeholder` state. This component only **selects** the values, accents, icons, prefixes, and stagger `delay`. If MT-30's `StatCard` names a prop differently (e.g. `title` vs `label`, or `accent` taking a token string), match the primitive's signature — do not fork it.

## 6. Tests / Verification (Vitest + RTL; commands)
**File:** `src/components/panels/ExecutiveOverview.test.tsx` (colocated, `07` §3). Count-up/entrance disabled (`animate={false}`) so final values render synchronously and deterministically (`07` §1). Fixture mirrors `05` §5 `summary`.

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExecutiveOverview } from "./ExecutiveOverview";
import type { ForecastSummary } from "../../lib/types";

function summary(over: Partial<ForecastSummary> = {}): ForecastSummary {
  return {
    total_predicted_demand: 1234.5,
    high_risk_count: 1,
    avg_velocity: 12.3,
    avg_accuracy: 78.4,
    active_events: [{ date: "2015-11-26", name: "Thanksgiving", type: "National" }],
    ...over,
  };
}

describe("<ExecutiveOverview /> (MT-36)", () => {
  it("renders four cards with the summary values", () => {
    render(<ExecutiveOverview summary={summary()} animate={false} />);
    expect(screen.getByText("Total Predicted Demand")).toBeInTheDocument();
    expect(screen.getByText("High-Risk Products")).toBeInTheDocument();
    expect(screen.getByText("Avg Velocity")).toBeInTheDocument();
    expect(screen.getByText("Active Events")).toBeInTheDocument();
    // headline numbers (count-up off -> final values)
    expect(screen.getByText(/1,?234|1234/)).toBeInTheDocument(); // total_predicted_demand
    expect(screen.getByText(/12\.3/)).toBeInTheDocument();       // avg_velocity
    // active events count = 1
    const eventsCard = screen.getByTestId("card-events");
    expect(eventsCard).toHaveTextContent("1");
  });

  it("turns the high-risk card rose when count > 0", () => {
    const { rerender } = render(
      <ExecutiveOverview summary={summary({ high_risk_count: 2 })} animate={false} />
    );
    const card = screen.getByTestId("card-high-risk");
    // MT-30 StatCard maps accent='rose' to a rose color class/var; assert presence of the rose token usage.
    expect(card.className + card.innerHTML).toMatch(/rose/i);

    // count == 0 -> not rose (lime instead)
    rerender(<ExecutiveOverview summary={summary({ high_risk_count: 0 })} animate={false} />);
    const safeCard = screen.getByTestId("card-high-risk");
    expect(safeCard.className + safeCard.innerHTML).toMatch(/lime/i);
  });

  it("shows the active events list on hover via the tooltip", () => {
    render(<ExecutiveOverview summary={summary()} animate={false} />);
    const card = screen.getByTestId("card-events");
    // tooltip text is passed as a title-like attribute on the card; assert Thanksgiving is reachable
    expect(card).toHaveTextContent("Active Events");
    // the tooltip string is rendered as a title attr somewhere in the card subtree
    expect(card.querySelector('[title*="Thanksgiving"]') || card.getAttribute("title"))
      .toBeTruthy();
  });

  it("renders idle placeholders when summary is undefined", () => {
    render(<ExecutiveOverview animate={false} />);
    expect(screen.getByText("Total Predicted Demand")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
```

> **Accent-class assertions** rely on MT-30 `StatCard` rendering its accent as a class or inline `--accent-*` var that includes the word `rose`/`lime`. If MT-30 instead applies the color via a mapped class name (e.g. `text-accent-rose`), these regexes still match. Adjust only the regex to MT-30's actual class naming if needed — do not change the card.

**Commands (run from `frontend/`):**
```powershell
cd frontend
npm run test -- ExecutiveOverview
npm run build   # 0 TS errors (07 §3 build gate)
```

## 7. Acceptance checklist
- [ ] File exists at `src/components/panels/ExecutiveOverview.tsx` (`06` §10).
- [ ] Uses MT-30 **`StatCard`** four times (not a reimplemented card); `ForecastSummary`/`EventInfo` types from MT-31, `formatDate` from MT-31 — none redefined.
- [ ] Card values come straight from `summary`: `total_predicted_demand`, `high_risk_count`, `avg_velocity`, `active_events.length` (`05` §5).
- [ ] High-Risk card accent is **rose when `high_risk_count > 0`**, else lime.
- [ ] Avg Velocity shows `%` with up/down arrow and **sign color** (lime ≥ 0, rose < 0), signed number visible.
- [ ] Active Events shows the count and **lists the events on hover** (tooltip from `active_events`).
- [ ] Numbers **count up**; cards enter **staggered** (`delay = index * 0.06`s); reduced-motion respected by the primitive.
- [ ] lucide icons per card; tokens only (`06` §2); aggregate-across-selection (`06` §3); undefined-summary → reserved-height placeholders (no layout shift).
- [ ] Tests pass (four cards + values; high-risk rose when >0; events tooltip; idle placeholders); `npm run build` clean.
