# MT-43 — Responsive + Accessibility Pass

## 1. Context
Phase 6 polish (`MT-INDEX.md`; depends on **MT-42**, which itself depends on MT-33…MT-41). The
dashboard renders and handles all four states (MT-42); this task makes it **responsive** below the
desktop breakpoint and **accessible**, exactly to `06_UIUX_SPEC.md` §3 (layout/responsive) and §6
(accessibility & quality bars), and verifies the §9 "wow" checklist at 1280/1440/1920px.

This is **mostly verification + targeted edits**: a small number of precise Tailwind/CSS and ARIA
changes to **existing** files (referenced by exact path), plus a manual checklist mapping each fix
to `06` §6/§9. It introduces **no new components**. The concrete code work is:
1. Make the 12-column grid **collapse to a single column below 1280px** without breaking (`06` §3).
2. Tune **panel opacity** so text on glass meets **contrast ≥ 4.5:1** (`06` §6).
3. Ensure status is **never color-only** — every status has a text label (`06` §6).
4. Make **DateField, Chips, Button keyboard-operable** (Tab + Enter/Space) with correct ARIA
   (`06` §6).
5. **Reserve panel heights** to avoid layout shift on data load (`06` §6) — confirm MT-42's
   `minHeight`s and add a fixed grid-area sizing where needed.
6. Full **`prefers-reduced-motion`** support across the app (`06` §6/§2).

## 2. Prerequisites
**Foundation docs to load into the session:**
- `06_UIUX_SPEC.md` §3 (page layout, *"Below 1280px: panels stack to a single column; nothing
  breaks"*), §6 (accessibility & quality bars — the contract for this task), §2 (motion tokens +
  `prefers-reduced-motion`), §9 (the "wow" checklist this task verifies), §1 (`bg-panel` opacity),
  §10 (repo tree).
- `05_API_CONTRACT.md` §1 (`VelocityStatus`, `RiskLevel` — the status labels that must always be
  text), §5 (`velocity.status`, `inventory.stockout_risk`, `metrics.coherence_label`).
- `07_TESTING_STRATEGY.md` §3 (a11y/state tests live in MT-44; this task adds a couple of targeted
  RTL checks for keyboard + label presence) and §5 (Definition of Done: `npm run build` 0 TS errors).

**Prior MT artifacts/paths that must already exist (edit, do NOT redefine):**
- **MT-30 →** `frontend/src/theme/tokens.css` (the `06` §2 tokens incl. `--bg-panel`),
  `tailwind.config.ts` (token → class mapping), and the primitives
  `GlassPanel.tsx`, `StatusBadge.tsx`, `RadialDial.tsx`, `Chip.tsx`, `Button.tsx`, `Skeleton.tsx`.
- **MT-32 →** `frontend/src/App.tsx` (the app shell + the 12-col panel grid; MT-42 wrapped it in
  `EntranceList`).
- **MT-33 →** `frontend/src/components/controls/ForecastControlBar.tsx`, `DateField.tsx`,
  `ProductMultiSelect.tsx` (which renders `Chip`s).
- **MT-42 →** `PanelState.tsx` (already sets per-panel `minHeight`), `EntranceList.tsx`
  (reduced-motion-aware).
- React 18 + TS + Vite + Tailwind + Framer Motion (`06` §7). Run from `frontend/`.

> This task **edits** existing files with the precise changes below. It defines no new component.

## 3. Goal
A dashboard that:
1. Lays out in the desktop 12-col grid at **≥ 1280px** and **stacks to one column below 1280px**
   with nothing overflowing or breaking (`06` §3).
2. Has **≥ 4.5:1** text contrast on every glass panel (`06` §6), achieved by setting the panel fill
   opacity and text colors precisely.
3. Conveys **every status with a text label**, never color alone (`06` §6).
4. Is fully **keyboard operable**: Tab order is logical; DateField opens/closes and selects by
   keyboard; Chips toggle on Enter/Space; the Forecast Button activates on Enter/Space (`06` §6).
5. Has **reserved panel heights** (no layout shift on data load) (`06` §6).
6. Honors **`prefers-reduced-motion`** everywhere (`06` §6/§2).
7. Passes a **manual a11y/responsive checklist** mapped to `06` §6 and §9 at 1280/1440/1920px.

## 4. Design (locked decisions; cite 06/07 sections)

### 4.1 Responsive breakpoint (LOCKED at 1280px, `06` §3)
The single breakpoint is **1280px** (`06` §3: desktop-first ≥1280; below, single column). Use
Tailwind's `xl` (1280px) breakpoint. The grid is **`grid-cols-1` by default** (mobile-first base =
the "below 1280" case) and **`xl:grid-cols-12`** at ≥1280. Column spans are `xl:`-prefixed so they
only apply on desktop; below `xl` every panel is full-width (`col-span-1` implicit). Gap stays `24`
(`gap-6`, `06` §2 "Grid gap 24"). This guarantees "nothing breaks — just scrolls" (`06` §3).

> We do **not** introduce intermediate breakpoints (no `md`/`lg` columns). `06` §3 specifies exactly
> two layouts: full 12-col (≥1280) and single column (<1280). Keep it to those two.

### 4.2 Contrast ≥ 4.5:1 (`06` §6, panel opacity tuning)
`06` §2 sets `--bg-panel: rgba(18,26,44,0.55)` over `--bg-base:#070B14`, with body text
`--text-primary:#E8EEF9` and muted `--text-muted:#8A97B2`.
- **Primary text on the panel:** the panel fill composited over the near-black base yields an
  effective panel background near `#0D1525`. `#E8EEF9` on that is ≈ **15:1** — passes comfortably.
- **Muted text** `#8A97B2` on the same is ≈ **6.3:1** — passes ≥4.5 for the ≥14px body/caption
  scale (`06` §2 "Base ≥ 14"). **Locked decision:** keep `--text-muted` but **never** use it below
  12px and **never** for the Idle prompt at <14px. Captions (12px) that use muted text are
  acceptable because 6.3:1 ≥ 4.5:1.
- **Panel opacity:** raising panel opacity increases contrast but reduces the glass look. To
  guarantee ≥4.5:1 even where the animated background mesh brightens behind a panel, **bump the
  panel fill opacity from 0.55 → 0.62** (still glassy) so the worst-case composited background stays
  dark enough. This is the one token change permitted by this task and is additive to `06` §2's
  intent ("tune panel opacity to satisfy" contrast — `06` §6 explicitly authorizes this).
- Verify with a contrast checker (DevTools / axe) on `--text-primary` and `--text-muted` over the
  brightest point of the animated background behind a panel.

### 4.3 Status never color-only (`06` §6)
Every status surface already pairs color with text per `06` §1 principle 5, but this task
**audits** and enforces:
- `StatusBadge` (MT-30): renders the **label text** (`velocity.status`, e.g. "Accelerating") *and*
  the color. Confirm the text node is always present.
- `RadialDial` (MT-35): the **coherence dial** shows `coherence_label`
  (Strong/Moderate/Weak) as text under the ring, not just the band color.
- Inventory **risk** (MT-40): the Low/Medium/High word is shown next to the colored pill; the
  "Overstock" pill includes the word "Overstock".
- Velocity **arrow** (MT-36 Avg Velocity card): the up/down arrow is paired with the signed number
  text (e.g. "+12.3%"), not arrow-only.
- Add `aria-label` to colored-only glyphs (e.g. the arrow icon) restating the status in words.

### 4.4 Keyboard operability + ARIA (`06` §6)
Locked requirements (`06` §6: *"date picker, chips, and button are tabbable and operable by
Enter/Space"*):
- **Button** (MT-30 `Button.tsx`): render as a native `<button>` (default `type="button"`, the
  submit CTA uses `type="submit"`). Native buttons are tabbable and fire on Enter/Space already.
  Ensure `disabled` is a real attribute (no `aria-disabled`-only) so it's correctly skipped, and add
  a visible focus ring (`focus-visible:ring-2 focus-visible:ring-[color:var(--accent-cyan)]`).
- **Chip** (MT-30 `Chip.tsx`, used by `ProductMultiSelect`): render each as a
  `role="checkbox"` (a multiselect toggle) with `aria-checked={active}`, `tabIndex={0}`, and a
  `onKeyDown` that toggles on **Enter** and **Space** (preventing Space scroll). Visible focus ring.
  The group has `role="group"` + `aria-label="Products"`.
- **DateField** (MT-33 `DateField.tsx`): the trigger is a `<button>` with
  `aria-haspopup="dialog"`, `aria-expanded`, `aria-label="Choose start date"`. The popover calendar
  is reachable by Tab; **Escape** closes it and returns focus to the trigger; day buttons are
  native `<button>`s (Enter/Space select). Disabled days (outside
  `[first_selectable_date,last_selectable_date]`, `05` §4) use the `disabled` attribute so they're
  skipped in Tab order.
- **Tab order** is DOM order: Date trigger → product chips (in product order) → Select all → Clear →
  Forecast button. The control bar is a `<form>` so Enter submits when focus is in it.

### 4.5 Reserve panel heights — no layout shift (`06` §6)
MT-42 already passes a `minHeight` to every `PanelState`. This task confirms those values and
ensures the **grid cells** don't reflow: each `EntranceItem` panel cell uses `min-h-[…]` matching
its `PanelState.minHeight` so the grid's row heights are stable from Idle → Loading → Success. The
control bar is `sticky top-0` (`06` §3) with a fixed height so it never jumps.

### 4.6 prefers-reduced-motion (`06` §6/§2)
Three layers, all already partially in place — this task makes them complete:
- **Framer Motion**: `EntranceList`/`EntranceItem` (MT-42) and the chart line-draw (MT-34) /
  count-up (MT-36) check `useReducedMotion()` and render at the final state instantly.
- **CSS**: a global `@media (prefers-reduced-motion: reduce)` rule in `tokens.css` neutralizes
  transitions/animations (skeleton shimmer, hover transitions, animated background).
- **Animated background** (MT-32): under reduced motion, freeze the drifting blobs / moving grid
  (render a static gradient). Add the guard in the background component.

## 5. Implementation (exact file paths; FULL runnable code/edits)

### 5.1 Grid collapse — `frontend/src/App.tsx` (MT-32/MT-42 grid; edit)
Change the grid container and each item's span to be `xl:`-gated. Replace the MT-42 grid block with:

```tsx
// 06 §3 — single column below 1280px (xl), full 12-col grid at >= 1280px. Gap 24 (06 §2).
<EntranceList className="grid grid-cols-1 gap-6 xl:grid-cols-12">
  <EntranceItem className="min-h-[140px] xl:col-span-12">
    <ExecutiveOverview summary={data?.summary} loading={forecast.isPending} />
  </EntranceItem>
  <EntranceItem className="min-h-[360px] xl:col-span-8">
    <ForecastResult result={selected} loading={forecast.isPending} />
  </EntranceItem>
  <EntranceItem className="min-h-[300px] xl:col-span-4">
    <VelocityPanel result={selected} loading={forecast.isPending} />
  </EntranceItem>
  <EntranceItem className="min-h-[260px] xl:col-span-6">
    <EventImpactPanel result={selected} loading={forecast.isPending} />
  </EntranceItem>
  <EntranceItem className="min-h-[260px] xl:col-span-6">
    <SeasonalPanel result={selected} loading={forecast.isPending} />
  </EntranceItem>
  <EntranceItem className="min-h-[300px] xl:col-span-6">
    <InventoryRiskPanel result={selected} loading={forecast.isPending} />
  </EntranceItem>
  <EntranceItem className="min-h-[300px] xl:col-span-6">
    <ExplainabilityPanel result={selected} loading={forecast.isPending} />
  </EntranceItem>
</EntranceList>
```

Inside the Executive Overview (MT-36), its 4 stat cards must also collapse: their inner grid is
`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6` so the KPI row goes 1→2→4 columns and never
overflows below 1280px (`06` §3).

### 5.2 Panel opacity for contrast — `frontend/src/theme/tokens.css` (edit one value)
```css
/* MT-43 — bump panel fill opacity 0.55 -> 0.62 to guarantee >= 4.5:1 text contrast (06 §6).
   Still glassy; worst-case background-behind-panel stays dark enough for #E8EEF9 / #8A97B2. */
:root {
  --bg-panel: rgba(18, 26, 44, 0.62); /* was 0.55 (06 §2) — tuned per 06 §6 */
}
```
(Leave every other token from `06` §2 unchanged.)

### 5.3 Global reduced-motion + control-bar height — `tokens.css` (append)
```css
/* MT-43 — full prefers-reduced-motion support (06 §6/§2). */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
/* Sticky control bar with a fixed height so it never shifts (06 §3). */
.control-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  min-height: 72px;
}
```

### 5.4 Button — focus ring + native semantics — `frontend/src/components/ui/Button.tsx` (edit)
```tsx
// MT-30 Button, edited by MT-43 for keyboard a11y (06 §6).
import type { ButtonHTMLAttributes } from "react";

export function Button({
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}                       // native button: Tab + Enter/Space for free (06 §6)
      className={[
        "inline-flex items-center justify-center gap-2 rounded-card px-4 py-2",
        "transition-shadow disabled:opacity-50 disabled:cursor-not-allowed",
        // visible keyboard focus ring (06 §6)
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg-base)]",
        className,
      ].join(" ")}
      {...props}
    />
  );
}
```

### 5.5 Chip — checkbox role + keyboard toggle — `frontend/src/components/ui/Chip.tsx` (edit)
```tsx
// MT-30 Chip, edited by MT-43: keyboard-operable multiselect toggle (06 §6).
import type { KeyboardEvent, ReactNode } from "react";

export function Chip({
  active,
  onToggle,
  children,
  className = "",
}: {
  active: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();   // Space must toggle, not scroll (06 §6)
      onToggle();
    }
  }
  return (
    <div
      role="checkbox"               // a toggle in a multiselect group (06 §6)
      aria-checked={active}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      className={[
        "cursor-pointer select-none rounded-full px-3 py-1 text-body",
        active
          ? "bg-[color:var(--accent-cyan)]/15 text-primary shadow-[0_0_18px_rgba(47,230,255,0.18)]"
          : "bg-panel text-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-cyan)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
```

The `ProductMultiSelect` group wrapper (MT-33) gets the group role:
```tsx
// in ProductMultiSelect.tsx — wrap the chips:
<div role="group" aria-label="Products" className="flex flex-wrap gap-2">
  {/* ...Chip per product... */}
</div>
```

### 5.6 DateField — popover ARIA + Escape — `frontend/src/components/controls/DateField.tsx` (edit)
```tsx
// MT-33 DateField, edited by MT-43 for keyboard a11y (06 §6). Calendar internals unchanged;
// only trigger semantics, Escape-to-close, and disabled-day attribute are added.
import { useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../ui/Button";

export function DateField({
  value,
  onChange,
  min,                 // first_selectable_date (05 §4)
  max,                 // last_selectable_date  (05 §4)
  isDisabledDate,      // (iso: string) => boolean
  renderCalendar,      // existing MT-33 calendar body; receives select + disabled checks
}: {
  value: string;
  onChange: (iso: string) => void;
  min: string;
  max: string;
  isDisabledDate: (iso: string) => boolean;
  renderCalendar: (args: {
    onSelect: (iso: string) => void;
    isDisabledDate: (iso: string) => boolean;
    min: string;
    max: string;
  }) => JSX.Element;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function onPopoverKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus(); // return focus to trigger (06 §6)
    }
  }

  return (
    <div className="relative">
      <Button
        ref={triggerRef as never}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Choose start date"
        onClick={() => setOpen((o) => !o)}
      >
        {value}
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Calendar"
          onKeyDown={onPopoverKeyDown}
          className="absolute z-30 mt-2 rounded-card bg-panel-solid p-3 shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
        >
          {renderCalendar({
            min,
            max,
            isDisabledDate, // disabled days render <button disabled> -> skipped in Tab order
            onSelect: (iso) => {
              onChange(iso);
              setOpen(false);
              triggerRef.current?.focus();
            },
          })}
        </div>
      )}
    </div>
  );
}
```
> The day cells inside `renderCalendar` (MT-33) must be native `<button>` elements with the
> `disabled` attribute when `isDisabledDate(iso)` is true — this satisfies both `05` §4 (disable
> out-of-range dates) and `06` §6 (keyboard skips them).

### 5.7 Status always labeled — audit edits
- `StatusBadge.tsx` (MT-30): ensure the label is a text node, e.g.
  ```tsx
  <span className="...">{/* dot */}</span>
  <span>{label}</span>   {/* 06 §6 — text label always present */}
  ```
- Avg-Velocity card (MT-36): the arrow icon gets an aria-label:
  ```tsx
  <ArrowUpRight aria-label="up" className="text-[color:var(--accent-lime)]" />
  <span>{sign}{value}%</span>   {/* number text accompanies the arrow */}
  ```
- Coherence dial (MT-35): show `coherence_label` text under the ring; risk pill (MT-40) shows the
  Low/Medium/High word and an "Overstock" word when `inventory.overstock`.

### 5.8 Animated background — reduced-motion guard — `frontend/src/components/ui/Background.tsx` (or MT-32 shell; edit)
```tsx
// MT-32 animated background, edited by MT-43: freeze under reduced motion (06 §6).
import { useReducedMotion } from "framer-motion";

export function Background() {
  const reduce = useReducedMotion();
  return (
    <div
      aria-hidden="true"
      className={[
        "pointer-events-none fixed inset-0 -z-10 bg-base",
        reduce ? "" : "bg-mesh-animated", // animation class only when motion is allowed
      ].join(" ")}
    />
  );
}
```
(The `bg-mesh-animated` keyframes already exist from MT-32; under reduced motion we render the
static gradient only. The global CSS rule in §5.3 also neutralizes any residual animation.)

## 6. Tests / Verification (Vitest + RTL; commands)
Most of this task is **manual** verification (§6.2). Add two targeted RTL tests for the
keyboard/label invariants that are cheap to assert in jsdom.

### `frontend/src/components/ui/Chip.test.tsx`
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Chip } from "./Chip";

describe("Chip a11y (06 §6)", () => {
  it("is a focusable checkbox reflecting active state", () => {
    render(<Chip active={true} onToggle={() => {}}>Turkey</Chip>);
    const chip = screen.getByRole("checkbox", { name: "Turkey" });
    expect(chip).toHaveAttribute("aria-checked", "true");
    expect(chip).toHaveAttribute("tabindex", "0");
  });

  it("toggles on Enter and Space", () => {
    const onToggle = vi.fn();
    render(<Chip active={false} onToggle={onToggle}>Milk</Chip>);
    const chip = screen.getByRole("checkbox", { name: "Milk" });
    fireEvent.keyDown(chip, { key: "Enter" });
    fireEvent.keyDown(chip, { key: " " });
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
```

### `frontend/src/components/ui/StatusBadge.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge (06 §6 — status never color-only)", () => {
  it("always renders the status text label", () => {
    render(<StatusBadge status="Accelerating" />); // 05 §1 VelocityStatus
    expect(screen.getByText("Accelerating")).toBeInTheDocument();
  });
});
```

### Commands (from `frontend/`)
```bash
npm run test -- Chip StatusBadge
npm run build     # 06/07 — must succeed with 0 TS errors
```

### 6.2 Manual a11y / responsive checklist → `06` §6 and §9
Run the app (`npm run dev`) and verify each row; tick in §7.

| Check | Maps to | How to verify |
|---|---|---|
| Grid is 12-col at 1280/1440/1920; single column below 1280 — nothing overflows | `06` §3, §9 "intentional at 1280/1440/1920" | Resize browser; DevTools device toolbar at 1279px and 1280px |
| Text on glass ≥ 4.5:1 (primary and muted) | `06` §6 | axe DevTools / contrast checker on `#E8EEF9` and `#8A97B2` over a panel atop the brightest background point |
| Every status shows a text label (velocity, risk, coherence, overstock, velocity arrow) | `06` §6, §1 | Tab through; confirm words present, not color-only; check with grayscale filter |
| Keyboard: Tab reaches Date → chips → Select all → Clear → Forecast; Enter/Space operate each; Escape closes the calendar | `06` §6 | Keyboard-only pass, no mouse |
| Focus is always visible (ring) on interactive elements | `06` §6 | Tab and watch the focus ring |
| No layout shift Idle → Loading → Success | `06` §6 | Run a forecast; panels don't jump (reserved `min-h-[…]`) |
| `prefers-reduced-motion`: entrances/draw/count-up/background freeze; instant render | `06` §6/§2 | OS "reduce motion" on (or DevTools Rendering → emulate); reload + forecast |
| "Wow" visuals hold: glass+glow, animated bg readable, count-up + line-draw, instrument gauge, accent system, staggered entrance + hover | `06` §9 | Visual pass at all three widths |

## 7. Acceptance checklist
- [ ] Grid uses `grid-cols-1 ... xl:grid-cols-12` with `xl:col-span-*` per panel; below 1280px every panel is single-column and nothing breaks/overflows (`06` §3, §9). Executive Overview cards collapse `1→2→4`.
- [ ] `--bg-panel` opacity tuned to `0.62`; primary `#E8EEF9` and muted `#8A97B2` text both measure **≥ 4.5:1** on glass over the brightest background point (`06` §6).
- [ ] Status is **never color-only**: velocity status, inventory risk (Low/Medium/High), coherence label, "Overstock", and the velocity arrow all carry a text label/`aria-label` (`06` §6, §1).
- [ ] `Button` is a native `<button>` with a visible `focus-visible` ring and real `disabled`; activates on Enter/Space (`06` §6).
- [ ] `Chip` is `role="checkbox"` + `aria-checked` + `tabIndex=0`, toggles on Enter **and** Space (Space doesn't scroll), inside a `role="group" aria-label="Products"` (`06` §6).
- [ ] `DateField` trigger has `aria-haspopup="dialog"`/`aria-expanded`/`aria-label`; popover closes on Escape and restores focus; out-of-range days are `disabled` and skipped in Tab order (`06` §6, `05` §4).
- [ ] Tab order is Date → chips → Select all → Clear → Forecast; the control bar `<form>` submits on Enter (`06` §6).
- [ ] Panel heights reserved (`min-h-[…]` on each grid item matching MT-42 `PanelState.minHeight`); sticky control bar fixed height — no layout shift on data load (`06` §6, §3).
- [ ] Full `prefers-reduced-motion`: Framer entrances/line-draw/count-up + the global CSS rule + the animated background all freeze and render instantly (`06` §6/§2).
- [ ] `npm run test -- Chip StatusBadge` green; `npm run build` succeeds with 0 TS errors (`07` §3, §5).
- [ ] Manual §6.2 checklist verified at **1280/1440/1920px** against `06` §6 and §9 ("wow") — all rows ticked.
- [ ] No new components introduced; only the listed existing files were edited (`07` §5 "nothing outside scope").
