# MT-30 — Design System (tokens.css, global utilities, UI primitives)

## 1. Context
We are building **Demand Velocity & Inventory Intelligence**, a futuristic, premium, animated **dark** dashboard (`06_UIUX_SPEC.md`). This task lays the visual foundation every later frontend task reuses: it emits **all** the locked CSS design tokens (`06` §2), adds the glass-panel and glow Tailwind utilities, and implements the ten UI **primitives** from the component inventory (`06` §8) — `GlassPanel`, `StatCard`, `StatusBadge`, `RadialDial`, `Chip`, `Button`, `Skeleton`, `Toast`, `SectionTitle`, `ProductSwitcher` — with full runnable TSX. It also centralizes the **status → accent color** map (`06` §2) in `src/lib/status.ts` and a Framer Motion entrance-variants helper, so panels (MT-34…41) and controls (MT-33) just consume these. No data fetching here — pure presentation.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/06_UIUX_SPEC.md` (§1 design language; §2 tokens — colors / status map / typography / shape / motion; §5 states; §6 a11y; §8 component inventory; §10 tree)
- `docs/05_API_CONTRACT.md` (§1 `VelocityStatus`, `RiskLevel` — the status strings the maps must cover; §5 `coherence_label`)
- `docs/07_TESTING_STRATEGY.md` (§3 frontend tests — StatCard / StatusBadge / RadialDial)

**Prior MT artifacts/paths that must already exist:**
- **MT-02** scaffolded `frontend/` (Vite + React-TS + Tailwind), `tailwind.config.ts` with the `06` §2 colors/fonts/radius extended, `src/theme/global.css` importing Tailwind layers, and placeholder `src/components/ui/index.ts`. Depends on MT-02 (per `MT-INDEX.md`).
- `clsx`, `tailwind-merge`, `class-variance-authority`, `framer-motion`, `react-countup`, `lucide-react` are installed (MT-02 §5.2).

**Tooling:** Node 20, the running MT-02 frontend (`npm run dev`).

## 3. Goal
Ship `src/theme/tokens.css` (every CSS variable from `06` §2) imported globally, glass/glow Tailwind component classes, a single `src/lib/status.ts` status→accent helper, a Framer Motion entrance-variants helper, and the ten typed UI primitives from `06` §8 with full TSX — such that `tsc --noEmit` is clean and the Vitest tests (StatCard / StatusBadge / RadialDial render + correct color class + value shown) pass.

## 4. Design (locked decisions; cite `06_UIUX_SPEC` sections)
Every value is locked by `06` §2 / §8; do not re-decide.

- **Tokens (`06` §2):** `src/theme/tokens.css` defines `:root` CSS variables for **all** colors in `06` §2 (`--bg-base`, `--bg-panel`, `--bg-panel-solid`, `--border-glass`, `--text-primary`, `--text-muted`, `--accent-cyan`, `--accent-violet`, `--accent-lime`, `--accent-amber`, `--accent-rose`, `--grid-line`) plus radius and shadow vars. Imported once in `main.tsx`. Tailwind already maps the same hexes (MT-02 §5.7), so components prefer Tailwind utilities; `tokens.css` backs raw-CSS needs (glass, glow, animated bg in MT-32) and is the canonical variable source.
- **Glass + glow utilities (`06` §2 Shape/Effects, §1 principle 2):**
  - `.glass-panel`: `background: var(--bg-panel)`, `backdrop-filter: blur(18px)`, `1px solid var(--border-glass)`, `border-radius: 20px`, `box-shadow: 0 8px 40px rgba(0,0,0,0.45)`, plus a faint inner top highlight (inset highlight via a pseudo-element or layered box-shadow).
  - `.glow-cyan` / `.glow-lime` / `.glow-amber` / `.glow-rose` / `.glow-violet`: accent `box-shadow` at ~18% opacity for active/hover (`06` §2 "Glow utility").
- **Status → accent (LOCKED, `06` §2 status map):** one helper module `src/lib/status.ts`. Mapping (covers every `VelocityStatus` and `RiskLevel` from `05` §1 + generic sign):
  | input | accent |
  |---|---|
  | `Accelerating`, `Growing`, `Low` (risk), positive sign | `lime` (`--accent-lime`) |
  | `Stable` | `cyan` (`--accent-cyan`) |
  | `Declining`, `Medium` (risk), warning | `amber` (`--accent-amber`) |
  | `Critical Decline`, `High` (risk), danger | `rose` (`--accent-rose`) |
  The helper returns a small descriptor `{ accent, textClass, bgClass, borderClass, glowClass, hex }` so every primitive resolves one consistent set of classes. **Color is always paired with a text label** (`06` §6 — never color alone).
- **RadialDial (`06` §2, §8; used by accuracy/coherence dials MT-35):** an **SVG** ring, 0–100, with the numeric value + label in the center, **colored by band**. Bands (per `06` §2 P2 dials "Strong/Moderate/Weak; high/low"): value ≥ 75 → lime (Strong), 50–74 → cyan (Moderate-high)…; the exact band thresholds are fixed in §5 below and reused for both accuracy and coherence. Ring animates its stroke-dashoffset on mount (respect reduced motion, `06` §6).
- **Typography classes (`06` §2):** headings → `font-display`; body → `font-sans`; numerics → `font-mono` + `tabular-nums` (the `.tabular` helper from MT-02).
- **Motion (`06` §2 Motion):** entrance = fade + 12px rise, `duration 0.5`, ease `[0.22,1,0.36,1]`, stagger `0.06`. Numbers count up `0.8s` (`react-countup`). Hover scale `1.01` + glow. All transforms disabled under `prefers-reduced-motion` (`06` §6). A `src/lib/motion.ts` helper exports the shared `variants` + a `useReducedMotionSafe` flag.
- **StatusBadge (`06` §8):** pill (radius `9999px`) showing a colored dot + the **text label**; color from `status.ts`. Used for velocity status (`05` velocity.status) and risk (`05` inventory.stockout_risk).
- **StatCard (`06` §8, used by Executive Overview MT-36):** glass card with icon, title, big count-up value (mono/tabular), optional delta (signed, colored) + footnote.
- **Chip (`06` §8):** rounded-full toggle chip (product multiselect MT-33 + ProductSwitcher); `active` → glow + accent border.
- **ProductSwitcher (`06` §3, §8):** segmented row of chips to pick which product's detail a panel shows when multiple products are selected.
- **Button (`06` §8):** primary glowing CTA + ghost/secondary variants; supports `loading` (spinner) for the Forecast button (`06` §4 P0).
- **Skeleton (`06` §5 Loading):** shimmer block for panel loading state.
- **Toast (`06` §5 Error, §8):** transient message surface; MT-42 wires the global toaster, but the primitive + a minimal `ToastProvider`/`useToast` live here so error states (`05` §7 `message`) can render.
- **SectionTitle (`06` §8):** panel header (display font) + optional caption/right slot.
- **File locations (`06` §10):** `src/theme/tokens.css`, `src/lib/{status.ts,motion.ts,cn.ts}`, `src/components/ui/<Name>.tsx`, re-exported from `src/components/ui/index.ts`.

## 5. Implementation (exact paths from `06` §10; FULL runnable code)
All paths relative to `frontend/`.

### 5.1 `src/theme/tokens.css`
All `06` §2 variables + radius/shadow. Imported in `main.tsx` (add the import — MT-02 left it commented).

```css
:root {
  /* Color — 06 §2 (LOCKED) */
  --bg-base: #070b14;
  --bg-panel: rgba(18, 26, 44, 0.55);
  --bg-panel-solid: #0e1626;
  --border-glass: rgba(120, 160, 255, 0.12);
  --text-primary: #e8eef9;
  --text-muted: #8a97b2;
  --accent-cyan: #2fe6ff;
  --accent-violet: #8b5cff;
  --accent-lime: #4dffb0;
  --accent-amber: #ffc24d;
  --accent-rose: #ff5c7a;
  --grid-line: rgba(120, 160, 255, 0.08);

  /* Shape / effects — 06 §2 */
  --radius-panel: 20px;
  --radius-card: 14px;
  --radius-chip: 9999px;
  --shadow-panel: 0 8px 40px rgba(0, 0, 0, 0.45);
  --blur-panel: 18px;
}
```

### 5.2 Glass + glow utilities — append to `src/theme/global.css`
Add inside the existing file (after the `@layer base` block from MT-02). Uses `@layer components`.

```css
@layer components {
  /* Glass panel — 06 §2 Shape/Effects + §1 principle 2 */
  .glass-panel {
    position: relative;
    background: var(--bg-panel);
    backdrop-filter: blur(var(--blur-panel));
    -webkit-backdrop-filter: blur(var(--blur-panel));
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }
  /* Faint inner top highlight (06 §2) */
  .glass-panel::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.06);
  }

  /* Accent glow — box-shadow at ~18% opacity (06 §2 "Glow utility") */
  .glow-cyan {
    box-shadow: 0 0 24px rgba(47, 230, 255, 0.18);
  }
  .glow-violet {
    box-shadow: 0 0 24px rgba(139, 92, 255, 0.18);
  }
  .glow-lime {
    box-shadow: 0 0 24px rgba(77, 255, 176, 0.18);
  }
  .glow-amber {
    box-shadow: 0 0 24px rgba(255, 194, 77, 0.18);
  }
  .glow-rose {
    box-shadow: 0 0 24px rgba(255, 92, 122, 0.18);
  }

  /* Shimmer for skeletons (06 §5 Loading) */
  .shimmer {
    background: linear-gradient(
      90deg,
      rgba(120, 160, 255, 0.06) 25%,
      rgba(120, 160, 255, 0.14) 37%,
      rgba(120, 160, 255, 0.06) 63%
    );
    background-size: 400% 100%;
    animation: shimmer 1.4s ease infinite;
  }
  @keyframes shimmer {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: 0 0;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .shimmer {
    animation: none;
  }
}
```

### 5.3 `src/lib/cn.ts` — class merge helper
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, resolving Tailwind conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

### 5.4 `src/lib/status.ts` — the single status→accent helper
```ts
import type { VelocityStatus, RiskLevel } from "./types";

export type AccentName = "lime" | "cyan" | "amber" | "rose" | "violet";

export interface AccentStyle {
  accent: AccentName;
  hex: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  glowClass: string;
}

const ACCENTS: Record<AccentName, AccentStyle> = {
  lime: {
    accent: "lime",
    hex: "#4DFFB0",
    textClass: "text-accent-lime",
    bgClass: "bg-accent-lime/10",
    borderClass: "border-accent-lime/40",
    glowClass: "glow-lime",
  },
  cyan: {
    accent: "cyan",
    hex: "#2FE6FF",
    textClass: "text-accent-cyan",
    bgClass: "bg-accent-cyan/10",
    borderClass: "border-accent-cyan/40",
    glowClass: "glow-cyan",
  },
  amber: {
    accent: "amber",
    hex: "#FFC24D",
    textClass: "text-accent-amber",
    bgClass: "bg-accent-amber/10",
    borderClass: "border-accent-amber/40",
    glowClass: "glow-amber",
  },
  rose: {
    accent: "rose",
    hex: "#FF5C7A",
    textClass: "text-accent-rose",
    bgClass: "bg-accent-rose/10",
    borderClass: "border-accent-rose/40",
    glowClass: "glow-rose",
  },
  violet: {
    accent: "violet",
    hex: "#8B5CFF",
    textClass: "text-accent-violet",
    bgClass: "bg-accent-violet/10",
    borderClass: "border-accent-violet/40",
    glowClass: "glow-violet",
  },
};

export function accentStyle(name: AccentName): AccentStyle {
  return ACCENTS[name];
}

/** Velocity status → accent (06 §2 status map). */
export function velocityAccent(status: VelocityStatus): AccentStyle {
  switch (status) {
    case "Accelerating":
    case "Growing":
      return ACCENTS.lime;
    case "Stable":
      return ACCENTS.cyan;
    case "Declining":
      return ACCENTS.amber;
    case "Critical Decline":
      return ACCENTS.rose;
  }
}

/** Risk level → accent (06 §2 status map). */
export function riskAccent(risk: RiskLevel): AccentStyle {
  switch (risk) {
    case "Low":
      return ACCENTS.lime;
    case "Medium":
      return ACCENTS.amber;
    case "High":
      return ACCENTS.rose;
  }
}

/** Numeric sign → accent (positive=lime, negative=rose, ~zero=cyan). 06 §2. */
export function signAccent(value: number): AccentStyle {
  if (value > 0.5) return ACCENTS.lime;
  if (value < -0.5) return ACCENTS.rose;
  return ACCENTS.cyan;
}

/** Dial band (accuracy/coherence 0–100) → accent. Used by RadialDial / MT-35. */
export function dialAccent(value: number): AccentStyle {
  if (value >= 75) return ACCENTS.lime; // Strong
  if (value >= 50) return ACCENTS.cyan; // Moderate
  if (value >= 30) return ACCENTS.amber; // Weak
  return ACCENTS.rose; // Poor
}

/** coherence_label (05 §5: Strong|Moderate|Weak) → accent. */
export function coherenceAccent(label: string): AccentStyle {
  switch (label) {
    case "Strong":
      return ACCENTS.lime;
    case "Moderate":
      return ACCENTS.cyan;
    case "Weak":
      return ACCENTS.amber;
    default:
      return ACCENTS.cyan;
  }
}
```

> `status.ts` imports `VelocityStatus` / `RiskLevel` from `./types`. Those are authored in **MT-31**. If MT-30 runs before MT-31, add the two unions temporarily at the top of `types.ts` (they are verbatim from `05` §1) — MT-31 will define the full file. The placeholder `types.ts` from MT-02 should be replaced with at minimum:
> ```ts
> export type VelocityStatus = "Critical Decline" | "Declining" | "Stable" | "Growing" | "Accelerating";
> export type RiskLevel = "Low" | "Medium" | "High";
> ```

### 5.5 `src/lib/motion.ts` — Framer Motion entrance helper
```ts
import { useReducedMotion, type Variants } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Panel/element entrance: fade + 12px rise, 0.5s (06 §2 Motion). */
export const entranceVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** Stagger container: children animate 0.06s apart (06 §2 Motion). */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/** Hover micro-interaction: scale 1.01 + glow (06 §2). */
export const hoverLift = { scale: 1.01 };

/**
 * Returns motion props that collapse to an instant render under
 * prefers-reduced-motion (06 §6). Spread onto a motion.<el>.
 */
export function useEntrance() {
  const reduce = useReducedMotion();
  if (reduce) {
    return { initial: false as const, animate: { opacity: 1, y: 0 } };
  }
  return { variants: entranceVariants, initial: "hidden" as const, animate: "visible" as const };
}
```

### 5.6 `src/components/ui/GlassPanel.tsx`
```tsx
import { forwardRef } from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/cn";
import { entranceVariants, hoverLift } from "../../lib/motion";

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Apply the staggered entrance animation (default true). */
  animate?: boolean;
  /** Enable hover scale + glow (default false). */
  interactive?: boolean;
}

/** Frosted glass container — 06 §1 principle 2, §2 Shape/Effects. */
export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, animate = true, interactive = false, children, ...rest }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={cn("glass-panel p-5", className)}
        variants={animate ? entranceVariants : undefined}
        whileHover={interactive ? hoverLift : undefined}
        {...(rest as React.ComponentProps<typeof motion.div>)}
      >
        {children}
      </motion.div>
    );
  },
);
GlassPanel.displayName = "GlassPanel";
```

### 5.7 `src/components/ui/SectionTitle.tsx`
```tsx
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface SectionTitleProps {
  title: string;
  caption?: string;
  icon?: ReactNode;
  right?: ReactNode;
  className?: string;
}

/** Panel header (display font) — 06 §8. */
export function SectionTitle({ title, caption, icon, right, className }: SectionTitleProps) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="flex items-center gap-2">
        {icon && <span className="text-accent-cyan">{icon}</span>}
        <div>
          <h2 className="font-display text-h2 text-text-primary">{title}</h2>
          {caption && <p className="mt-0.5 text-caption text-text-muted">{caption}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
```

### 5.8 `src/components/ui/StatusBadge.tsx`
```tsx
import { cn } from "../../lib/cn";
import {
  velocityAccent,
  riskAccent,
  accentStyle,
  type AccentName,
  type AccentStyle,
} from "../../lib/status";
import type { VelocityStatus, RiskLevel } from "../../lib/types";

type StatusBadgeProps =
  | { kind: "velocity"; status: VelocityStatus; className?: string; label?: string }
  | { kind: "risk"; status: RiskLevel; className?: string; label?: string }
  | { kind: "accent"; accent: AccentName; label: string; className?: string };

/** Color + TEXT label pill — never color alone (06 §6, §2 status map). */
export function StatusBadge(props: StatusBadgeProps) {
  let style: AccentStyle;
  let label: string;

  if (props.kind === "velocity") {
    style = velocityAccent(props.status);
    label = props.label ?? props.status;
  } else if (props.kind === "risk") {
    style = riskAccent(props.status);
    label = props.label ?? `${props.status} risk`;
  } else {
    style = accentStyle(props.accent);
    label = props.label;
  }

  return (
    <span
      role="status"
      data-accent={style.accent}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1 text-caption font-medium",
        style.bgClass,
        style.borderClass,
        style.textClass,
        props.className,
      )}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: style.hex }}
      />
      {label}
    </span>
  );
}
```

### 5.9 `src/components/ui/RadialDial.tsx`
SVG ring 0–100, center value + label, color by band.

```tsx
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "../../lib/cn";
import { dialAccent, type AccentStyle } from "../../lib/status";

export interface RadialDialProps {
  /** 0–100. */
  value: number;
  label: string;
  /** Override the band accent (e.g. drive from coherence_label). */
  accent?: AccentStyle;
  size?: number;
  className?: string;
  /** Decimals on the centre number (default 0). */
  decimals?: number;
}

/** Radial progress ring (0–100) — 06 §2 P2 dials, §8. */
export function RadialDial({
  value,
  label,
  accent,
  size = 132,
  className,
  decimals = 0,
}: RadialDialProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const style = accent ?? dialAccent(clamped);
  const reduce = useReducedMotion();

  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const [progress, setProgress] = useState(reduce ? clamped : 0);
  useEffect(() => {
    if (reduce) {
      setProgress(clamped);
      return;
    }
    const id = requestAnimationFrame(() => setProgress(clamped));
    return () => cancelAnimationFrame(id);
  }, [clamped, reduce]);

  const offset = c - (progress / 100) * c;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${clamped.toFixed(decimals)} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--grid-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={style.hex}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: reduce ? "none" : "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("tabular text-h1 font-semibold", style.textClass)}>
          {clamped.toFixed(decimals)}
        </span>
        <span className="text-caption text-text-muted">{label}</span>
      </div>
    </div>
  );
}
```

### 5.10 `src/components/ui/StatCard.tsx`
```tsx
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import CountUp from "react-countup";
import { useReducedMotion } from "framer-motion";
import { cn } from "../../lib/cn";
import { entranceVariants } from "../../lib/motion";
import { signAccent, type AccentStyle } from "../../lib/status";

export interface StatCardProps {
  title: string;
  value: number;
  /** Count-up decimals (default 0). */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  icon?: ReactNode;
  /** Signed delta shown below, colored by sign. */
  delta?: number;
  deltaSuffix?: string;
  footnote?: ReactNode;
  /** Force the value color (e.g. high-risk count rose) regardless of sign. */
  accent?: AccentStyle;
  className?: string;
}

/** KPI glass card with count-up — 06 §4 P1, §8. */
export function StatCard({
  title,
  value,
  decimals = 0,
  prefix,
  suffix,
  icon,
  delta,
  deltaSuffix = "%",
  footnote,
  accent,
  className,
}: StatCardProps) {
  const reduce = useReducedMotion();
  const valueColor = accent?.textClass ?? "text-text-primary";
  const deltaStyle = delta !== undefined ? signAccent(delta) : undefined;

  return (
    <motion.div variants={entranceVariants} className={cn("glass-panel p-5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-caption uppercase tracking-wide text-text-muted">{title}</span>
        {icon && <span className="text-text-muted">{icon}</span>}
      </div>

      <div className={cn("mt-2 tabular text-display font-semibold", valueColor)}>
        {prefix}
        {reduce ? (
          value.toFixed(decimals)
        ) : (
          <CountUp end={value} duration={0.8} decimals={decimals} separator="," />
        )}
        {suffix}
      </div>

      {delta !== undefined && (
        <div className={cn("mt-1 tabular text-body", deltaStyle?.textClass)}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {Math.abs(delta).toFixed(decimals)}
          {deltaSuffix}
        </div>
      )}

      {footnote && <div className="mt-2 text-caption text-text-muted">{footnote}</div>}
    </motion.div>
  );
}
```

### 5.11 `src/components/ui/Chip.tsx`
```tsx
import { cn } from "../../lib/cn";

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label: string;
}

/** Toggle chip — product multiselect (MT-33) + ProductSwitcher. 06 §8. */
export function Chip({ active = false, label, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      className={cn(
        "rounded-chip border px-3 py-1.5 text-body transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/60",
        active
          ? "glow-cyan border-accent-cyan/50 bg-accent-cyan/10 text-accent-cyan"
          : "border-border-glass bg-panel-solid/40 text-text-muted hover:text-text-primary",
        className,
      )}
      {...rest}
    >
      {label}
    </button>
  );
}
```

### 5.12 `src/components/ui/ProductSwitcher.tsx`
```tsx
import { Chip } from "./Chip";
import { cn } from "../../lib/cn";

export interface ProductSwitcherOption {
  id: string;
  label: string;
}

export interface ProductSwitcherProps {
  options: ProductSwitcherOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/** Segmented chips to pick which product a panel details — 06 §3, §8. */
export function ProductSwitcher({ options, value, onChange, className }: ProductSwitcherProps) {
  if (options.length <= 1) return null;
  return (
    <div role="tablist" className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <Chip
          key={o.id}
          role="tab"
          aria-selected={o.id === value}
          active={o.id === value}
          label={o.label}
          onClick={() => onChange(o.id)}
        />
      ))}
    </div>
  );
}
```

### 5.13 `src/components/ui/Button.tsx`
```tsx
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "ghost" | "secondary";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent-cyan/15 border border-accent-cyan/50 text-accent-cyan glow-cyan hover:bg-accent-cyan/25",
  secondary:
    "bg-accent-violet/15 border border-accent-violet/40 text-accent-violet hover:bg-accent-violet/25",
  ghost: "border border-border-glass text-text-muted hover:text-text-primary",
};

/** CTA button incl. the glowing Forecast button (loading state) — 06 §4 P0, §8. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", loading = false, disabled, className, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-card px-4 py-2 font-display text-body font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/60",
          "disabled:cursor-not-allowed disabled:opacity-40",
          VARIANTS[variant],
          className,
        )}
        {...rest}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
```

### 5.14 `src/components/ui/Skeleton.tsx`
```tsx
import { cn } from "../../lib/cn";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/** Shimmer placeholder — 06 §5 Loading. */
export function Skeleton({ className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn("shimmer rounded-card", className)}
      {...rest}
    />
  );
}
```

### 5.15 `src/components/ui/Toast.tsx`
Primitive + a minimal provider/hook. MT-42 owns global polish; this gives error states a surface now (`05` §7 `message`).

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "../../lib/cn";

type ToastKind = "error" | "success" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {items.map((t) => (
            <ToastCard key={t.id} {...t} onClose={() => setItems((p) => p.filter((x) => x.id !== t.id))} />
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

function ToastCard({ kind, message, onClose }: ToastItem & { onClose: () => void }) {
  const tone =
    kind === "error"
      ? "border-accent-rose/50 glow-rose text-text-primary"
      : kind === "success"
        ? "border-accent-lime/50 glow-lime text-text-primary"
        : "border-border-glass text-text-primary";
  const Icon = kind === "error" ? AlertTriangle : kind === "success" ? CheckCircle2 : AlertTriangle;
  const iconColor =
    kind === "error" ? "text-accent-rose" : kind === "success" ? "text-accent-lime" : "text-accent-cyan";

  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn("pointer-events-auto flex max-w-sm items-start gap-2 glass-panel px-4 py-3", tone)}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} aria-hidden />
      <span className="text-body">{message}</span>
      <button onClick={onClose} aria-label="Dismiss" className="ml-2 text-text-muted hover:text-text-primary">
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}
```

### 5.16 `src/components/ui/index.ts` — barrel (replaces MT-02 placeholder)
```ts
export { GlassPanel } from "./GlassPanel";
export { StatCard } from "./StatCard";
export { StatusBadge } from "./StatusBadge";
export { RadialDial } from "./RadialDial";
export { Chip } from "./Chip";
export { ProductSwitcher } from "./ProductSwitcher";
export { Button } from "./Button";
export { Skeleton } from "./Skeleton";
export { SectionTitle } from "./SectionTitle";
export { ToastProvider, useToast } from "./Toast";
```

### 5.17 Import `tokens.css` in `main.tsx`
Uncomment / add the import added by MT-02:
```tsx
import "./theme/global.css";
import "./theme/tokens.css";
```

## 6. Tests / Verification (Vitest + RTL)
Colocate `src/components/ui/__tests__/primitives.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { StatCard } from "../StatCard";
import { StatusBadge } from "../StatusBadge";
import { RadialDial } from "../RadialDial";

describe("StatCard (MT-30)", () => {
  it("renders title and value", () => {
    render(<StatCard title="Total Demand" value={1234} />);
    expect(screen.getByText(/Total Demand/i)).toBeInTheDocument();
    // count-up may animate; reduced-motion test env renders final value
    expect(screen.getByText(/1,?234/)).toBeInTheDocument();
  });
});

describe("StatusBadge (MT-30)", () => {
  it("maps Accelerating velocity to lime + shows the label", () => {
    render(<StatusBadge kind="velocity" status="Accelerating" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("Accelerating");
    expect(badge).toHaveClass("text-accent-lime");
    expect(badge).toHaveAttribute("data-accent", "lime");
  });

  it("maps High risk to rose", () => {
    render(<StatusBadge kind="risk" status="High" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("data-accent", "rose");
    expect(badge).toHaveTextContent(/High/i);
  });

  it("maps Stable to cyan", () => {
    render(<StatusBadge kind="velocity" status="Stable" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-accent", "cyan");
  });
});

describe("RadialDial (MT-30)", () => {
  it("shows the value and an accessible label", () => {
    render(<RadialDial value={78} label="Accuracy" />);
    expect(screen.getByText("78")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Accuracy: 78 out of 100/i })).toBeInTheDocument();
  });

  it("clamps out-of-range values", () => {
    render(<RadialDial value={140} label="Coherence" />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});
```

Run / gate:
```powershell
npm run test
npm run typecheck   # tsc --noEmit, strict, must be clean
npm run build
```

## 7. Acceptance checklist
- [ ] `src/theme/tokens.css` defines **every** `06` §2 CSS variable (colors + radius + shadow + blur) and is imported in `main.tsx`.
- [ ] `global.css` adds `.glass-panel` (blur 18px, 1px `--border-glass`, radius 20px, soft shadow, inner top highlight) and `.glow-*` utilities at ~18% opacity (`06` §2).
- [ ] `src/lib/status.ts` is the single status→accent helper; `velocityAccent`/`riskAccent`/`signAccent`/`dialAccent`/`coherenceAccent` map exactly to the `06` §2 table.
- [ ] `src/lib/motion.ts` exports the `06` §2 entrance variants (fade + 12px, 0.5s, ease `[0.22,1,0.36,1]`, stagger 0.06) and disables transforms under `prefers-reduced-motion` (`06` §6).
- [ ] All ten `06` §8 primitives exist with full TSX and are re-exported from `src/components/ui/index.ts`: GlassPanel, StatCard, StatusBadge, RadialDial, Chip, Button, Skeleton, Toast, SectionTitle, ProductSwitcher.
- [ ] `RadialDial` is an SVG 0–100 ring with center value + label, colored by band, animated on mount, clamps out-of-range, respects reduced motion.
- [ ] `StatCard` counts up (`react-countup`, 0.8s), uses mono/tabular numerics, supports signed delta colored by sign.
- [ ] `StatusBadge` shows a colored dot **and** the text label (never color alone, `06` §6).
- [ ] Vitest tests pass: StatCard/StatusBadge/RadialDial render; status maps to the correct color class; RadialDial shows the value.
- [ ] `tsc --noEmit` (strict) and `npm run build` are clean.
- [ ] Only `06` §10 paths were created/edited (`src/theme/*`, `src/lib/{cn,status,motion}.ts`, `src/components/ui/*`); no later-MT scope touched.
