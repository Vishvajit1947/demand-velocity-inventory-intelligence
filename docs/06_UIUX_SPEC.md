# 06 — UI/UX Specification (SOURCE OF TRUTH for Frontend)

> The look, feel, layout, and interaction of the dashboard. The goal is a **futuristic,
> premium, "AI command center"** that impresses on sight. Every frontend micro-task (MT-30…MT-44)
> follows this file. Data shapes come from `05_API_CONTRACT.md`.

---

## 1. Design language

**Theme:** dark, glass, neon-accent "inventory command center." Think a SpaceX/Bloomberg-
terminal hybrid: deep navy background, frosted-glass panels, glowing data, restrained motion.

**Principles**
1. **Dark-first.** One dark theme (no light mode in v1).
2. **Depth via glass + glow,** not heavy borders. Panels float on a subtle animated backdrop.
3. **Data is the hero.** Charts and numbers glow; chrome stays muted.
4. **Motion with meaning.** Things animate in on data load; nothing animates idly/distractingly.
5. **One accent per state.** Color always pairs with a text label (accessibility).

---

## 2. Design tokens (LOCKED — `frontend/src/theme/tokens.css` + Tailwind config)

### Color
```css
--bg-base:        #070B14;   /* page background (near-black navy) */
--bg-panel:       rgba(18, 26, 44, 0.55);   /* glass panel fill */
--bg-panel-solid: #0E1626;
--border-glass:   rgba(120, 160, 255, 0.12);
--text-primary:   #E8EEF9;
--text-muted:     #8A97B2;
--accent-cyan:    #2FE6FF;   /* primary accent / forecast line */
--accent-violet:  #8B5CFF;   /* secondary accent */
--accent-lime:    #4DFFB0;   /* positive / growing / low risk */
--accent-amber:   #FFC24D;   /* warning / medium risk */
--accent-rose:    #FF5C7A;   /* danger / decline / high risk */
--grid-line:      rgba(120, 160, 255, 0.08);
```

### Status → color map (used by badges, gauges, risk)
| status | color |
|---|---|
| Accelerating / Growing / Low risk / positive | `--accent-lime` |
| Stable | `--accent-cyan` |
| Declining / Medium risk / warning | `--accent-amber` |
| Critical Decline / High risk / danger | `--accent-rose` |

### Typography
- Display/headings: **"Space Grotesk"** (Google Fonts).
- Body/UI: **"Inter"**.
- Numeric/tabular (KPIs, axis): **"JetBrains Mono"** with `font-variant-numeric: tabular-nums`.
- Scale: `display 32 / h1 24 / h2 18 / body 14 / caption 12` (px). Base ≥ 14.

### Shape / spacing / effects
- Radius: panels `20px`, cards `14px`, chips `9999px`.
- Panel: `backdrop-filter: blur(18px)`, 1px `--border-glass`, soft shadow
  `0 8px 40px rgba(0,0,0,0.45)`, plus a faint inner top highlight.
- Glow utility: accent-colored `box-shadow` at 18% opacity for active/hover.
- Spacing scale: 4/8/12/16/24/32. Grid gap 24.

### Motion (Framer Motion)
- Panel entrance: fade + 12px rise, `duration 0.5`, `ease [0.22,1,0.36,1]`, **staggered 0.06s**.
- Numbers count up on load (`CountUp`, 0.8s).
- Chart lines draw left→right on mount (0.9s).
- Hover: scale `1.01` + glow. Respect `prefers-reduced-motion` (disable transforms).

---

## 3. Page layout (desktop-first, ≥ 1280px)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  TOPBAR:  ◆ Demand Velocity & Inventory Intelligence      [status: live]   │
├──────────────────────────────────────────────────────────────────────────┤
│  CONTROL BAR (sticky):  [ Date picker ▾ ]  [ Products: chips multiselect ] │
│                                                  [  ⟶ FORECAST  ] (glow)    │
├──────────────────────────────────────────────────────────────────────────┤
│  EXECUTIVE OVERVIEW:  [card] [card] [card] [card]    (4 KPI stat cards)     │
├───────────────────────────────────────────┬──────────────────────────────┤
│  FORECAST RESULT (large, 2/3 width)        │  VELOCITY GAUGE (1/3)         │
│  actual vs forecast line chart             │  radial gauge + status badge │
│  + Accuracy dial + Coherence dial          │                              │
├───────────────────────────────────────────┴──────────────────────────────┤
│  EVENT IMPACT (1/2)            │  SEASONAL TREND (1/2)                      │
├───────────────────────────────┴──────────────────────────────────────────┤
│  INVENTORY RISK (1/2)          │  EXPLAINABILITY & DEEP DIVE (1/2)          │
└──────────────────────────────────────────────────────────────────────────┘
```

- Background: animated subtle gradient mesh + faint moving grid + a few drifting glow blobs
  (very low opacity; CSS/Canvas; must not hurt readability or perf).
- When **multiple products** are selected, the analytical panels (velocity/event/seasonal/
  risk/explainability) show a **product switcher** (segmented chips) to pick which product's
  detail is shown; the Forecast Result chart overlays all selected products as multiple lines;
  Executive Overview always aggregates across the selection (per `05` `summary`).
- Below 1280px: panels stack to a single column; nothing breaks (just scrolls).

---

## 4. Panel-by-panel spec

### P0 — Control Bar (MT-33)
- **Date picker:** calendar popover. Disabled outside `[first_selectable_date,
  last_selectable_date]` from `GET /api/calendar/bounds`. Default value = `last_selectable_date`.
  Also a "Week ▾" quick toggle that snaps the date to a week start (optional convenience).
- **Product multiselect:** 8 chips (from `GET /api/products`), toggle on/off, glowing when
  active. "Select all" / "Clear". At least 1 must be selected (Forecast disabled otherwise).
- **Forecast button:** primary glowing CTA; shows spinner + "Forecasting…" while the POST runs;
  disabled when no product selected.
- On submit → `POST /api/forecast`; on success, results animate in; on error, toast (MT-42).

### P1 — Executive Overview (MT-36)
Four glass **stat cards**, numbers count-up, each with an icon + sparkline/footnote:
1. **Total Predicted Demand** = `summary.total_predicted_demand` (units, next 28 days).
2. **High-Risk Products** = `summary.high_risk_count` (rose if > 0).
3. **Avg Velocity** = `summary.avg_velocity` (% with up/down arrow, colored by sign).
4. **Active Events** = count of `summary.active_events` (list them on hover/tooltip).

### P2 — Forecast Result (MT-34 chart, MT-35 dials)
- **Line chart (Recharts):** x = dates (`history.dates` + `horizon_dates`); series:
  - **Actual** (history + horizon `actual`): solid muted-cyan line.
  - **Forecast** (over horizon only): solid bright `--accent-cyan`, animated draw, with a soft
    glow; a vertical "now" divider at `start_date`.
  - Shade the horizon region faintly. Tooltip shows date, actual, forecast.
  - Multiple products → one forecast line each (distinct accent), legend with toggle.
- **Accuracy dial** + **Coherence dial:** two radial progress rings (0–100) with the number in
  the center and the label below; color by band (Strong/Moderate/Weak; high/low). Values from
  `metrics.accuracy` / `metrics.coherence`.

### P3 — Velocity Intelligence (MT-37)
- **Radial gauge (Plotly):** needle on a −100…+100 (clamped) arc, colored zones matching the
  velocity bands (Critical/Declining/Stable/Growing/Accelerating). Value = `velocity.value`.
- **Status badge** = `velocity.status`, colored per §2 map. Caption: "+412% vs prior 28 days."

### P4 — Event Impact (MT-38)
- **Horizontal bar chart:** top events for this product from `event_uplift` (sorted by |value|),
  bars colored green(+)/rose(−), value labels as `+517%`.
- **Horizon event markers:** a thin timeline strip showing `events_in_horizon` as labeled
  ticks over the 28-day window.

### P5 — Seasonal Trend (MT-39)
- **Monthly bars (12):** `seasonal.monthly_avg`; highlight the current `seasonal.month`; show
  `month_vs_avg_pct` as a callout ("Nov runs +220% vs average").
- **Weekday pattern (7):** `seasonal.weekday_avg` as a small bar row (Sat→Fri order = wday 1→7).

### P6 — Inventory Risk (MT-40)
- **Risk badge:** `inventory.stockout_risk` (Low/Medium/High) colored per §2; "Overstock" pill
  if `inventory.overstock`.
- **Projected stock chart:** line of `inventory.projected_stock` over 28 days vs a dashed
  `safety_stock` threshold; mark the stockout day (`cover_days`) if within 28.
- **Reorder card:** big number `recommended_order_qty` + supporting figures (on_hand,
  reorder_point, horizon_demand). Caption: "Simulated reorder model — illustrative."

### P7 — Explainability & Deep Dive (MT-41)
- **Narrative:** render `explainability.narrative` as glowing bullet cards (icon per `kind`).
- **Factor bars:** `explainability.factors` as labeled bars (event/seasonal/trend), value %.
- **Deep-Dive tab:** a secondary tab inside this panel showing the product's longer history
  (reuse the line chart over `history`) + the monthly/weekday profiles for context.

---

## 5. States (every panel must handle all four)
| state | behavior |
|---|---|
| **Idle** (no forecast yet) | panels show a tasteful empty prompt ("Select a date & products, then Forecast"). |
| **Loading** | skeleton shimmer in each panel; control bar shows spinner. |
| **Success** | data renders with entrance animation. |
| **Error** | toast with `message` from API; panels keep last good data or show empty state. |

---

## 6. Accessibility & quality bars
- Contrast ≥ 4.5:1 for text on glass (tune panel opacity to satisfy this).
- Status never conveyed by color alone — always a text label too.
- Keyboard: date picker, chips, and button are tabbable and operable by Enter/Space.
- `prefers-reduced-motion`: disable transforms/draw animations, keep instant render.
- No layout shift on data load (reserve panel heights).

---

## 7. Tech & libraries (LOCKED)
| concern | choice |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| Styling | TailwindCSS + a small set of shadcn/ui primitives |
| Animation | Framer Motion |
| Charts | Recharts (lines/bars/dials), Plotly (`react-plotly.js`) for the velocity gauge only |
| Data fetching | TanStack Query (`@tanstack/react-query`) |
| Count-up | `react-countup` |
| Icons | `lucide-react` |
| Fonts | Google Fonts: Space Grotesk, Inter, JetBrains Mono |

---

## 8. Component inventory (built across MT-30…MT-41)
Primitives (`src/components/ui/`): `GlassPanel`, `StatCard`, `StatusBadge`, `RadialDial`,
`Chip`, `Button`, `Skeleton`, `Toast`, `SectionTitle`, `ProductSwitcher`.
Panels (`src/components/panels/`): `ExecutiveOverview`, `ForecastResult`, `VelocityPanel`,
`EventImpactPanel`, `SeasonalPanel`, `InventoryRiskPanel`, `ExplainabilityPanel`.
Controls (`src/components/controls/`): `ForecastControlBar`, `DateField`, `ProductMultiSelect`.

---

## 9. Reference "wow" checklist (MT-07/MT-43 verify)
- [ ] Dark glass panels with blur + subtle glow.
- [ ] Animated background that doesn't hurt readability.
- [ ] KPI numbers count up; chart lines draw in.
- [ ] Velocity gauge looks like an instrument, not a default chart.
- [ ] Consistent accent system; statuses color-coded + labeled.
- [ ] Smooth, staggered entrance; hover micro-interactions.
- [ ] Looks intentional at 1280, 1440, and 1920px.

---

## 10. Frontend repository tree (canonical)
```
frontend/
├── Dockerfile                 # MT-45
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── .env                       # VITE_API_BASE
├── mock/                      # MT-25 mock server + fixtures
│   ├── server.mjs
│   └── fixtures/<series_id>.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── theme/tokens.css
    ├── lib/
    │   ├── api.ts             # typed client (MT-31)
    │   ├── types.ts           # mirrors 05 contract (MT-31)
    │   └── format.ts          # number/date formatting
    ├── hooks/useForecast.ts   # TanStack Query wrapper (MT-31)
    ├── components/ui/*        # primitives (MT-30)
    ├── components/controls/*  # control bar (MT-33)
    └── components/panels/*    # 7 panels (MT-34..41)
```
