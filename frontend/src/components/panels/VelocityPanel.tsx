/**
 * VelocityPanel — P3 Velocity Intelligence (MT-37).
 *
 * Renders a Plotly gauge+indicator (the ONLY Plotly chart in the app, 06 §7)
 * with a needle on a −100…+100 arc, five colored band zones, the real velocity
 * value as an overlay text, a StatusBadge, and a caption.
 *
 * 06 §4 P3, §2 tokens, §7 Plotly, §2 Motion, §6 a11y.
 * Types from MT-31 (types.ts). Formatters from MT-31 (format.ts).
 * Primitives from MT-30 (GlassPanel, StatusBadge, SectionTitle).
 */
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Plot from "react-plotly.js";
import type { Data, Layout } from "plotly.js";
import { GlassPanel } from "../ui/GlassPanel";
import { StatusBadge } from "../ui/StatusBadge";
import { SectionTitle } from "../ui/SectionTitle";
import { Skeleton } from "../ui/Skeleton";
import { PanelState } from "../ui/PanelState";
import { signedPct } from "../../lib/format";
import type { ForecastResult, VelocityStatus } from "../../lib/types";

// ── Band colors — EXACT tokens from 06 §2 status→color map ──────────────────
const ROSE  = "#FF5C7A";   // --accent-rose  : Critical Decline
const AMBER = "#FFC24D";   // --accent-amber : Declining
const CYAN  = "#2FE6FF";   // --accent-cyan  : Stable
const LIME  = "#4DFFB0";   // --accent-lime  : Growing / Accelerating

/**
 * Status → arc color (06 §2).
 * Growing and Accelerating both map to lime (positive / low-risk).
 */
const STATUS_COLOR: Record<VelocityStatus, string> = {
  "Critical Decline": ROSE,
  Declining:          AMBER,
  Stable:             CYAN,
  Growing:            LIME,
  Accelerating:       LIME,
};

/**
 * Five band zones on the −100..100 arc.
 * Boundaries −50, −10, 10, 40 per 03 §6.3 / 07 §2.
 * 06 §4 P3 (band→color table).
 */
const BANDS: { range: [number, number]; color: string }[] = [
  { range: [-100, -50], color: ROSE  },
  { range: [-50,  -10], color: AMBER },
  { range: [-10,   10], color: CYAN  },
  { range: [10,    40], color: LIME  },
  { range: [40,   100], color: LIME  },
];

/** Clamp n into [lo, hi]. */
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Convert #RRGGBB hex to rgba() string with the given alpha. */
function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Component ────────────────────────────────────────────────────────────────

export interface VelocityPanelProps {
  /** The active product's full ForecastResult (05 §5). Optional until first forecast. */
  result?: ForecastResult;
  /** MT-42: True while the POST /api/forecast mutation is in flight (06 §5 Loading). */
  loading?: boolean;
}

/**
 * VelocityPanel — instrument-grade radial gauge for velocity intelligence.
 * Renders a Plotly gauge+indicator. Framer Motion entrance. Reduced-motion safe.
 * 06 §4 P3.
 */
export function VelocityPanel({ result, loading = false }: VelocityPanelProps) {
  const reduce = useReducedMotion();

  // MT-42 skeleton: circle + bar (06 §5 Loading).
  const skeleton = (
    <div className="flex flex-col items-center gap-4">
      <Skeleton className="h-[220px] w-[220px] rounded-full" />
      <Skeleton className="h-6 w-32 rounded-card" />
    </div>
  );

  return (
    <GlassPanel animate={false}>
      <PanelState
        loading={loading}
        hasData={!!result}
        skeleton={skeleton}
        minHeight={300}
      >
        {result && <VelocityContent result={result} reduce={!!reduce} />}
      </PanelState>
    </GlassPanel>
  );
}

/** The actual gauge + badge — only rendered when result is defined. */
function VelocityContent({ result, reduce }: { result: ForecastResult; reduce: boolean }) {
  const { value, status } = result.velocity;

  // Needle clamped to arc bounds (06 §4 P3: "clamp display to arc");
  // the real value is overlaid as text so +412% still shows even if needle is at 100.
  const gaugeValue = clamp(value, -100, 100);
  const activeColor = STATUS_COLOR[status];

  // Memoize Plotly data — only recomputes when gaugeValue / activeColor change.
  const data = useMemo<Partial<Data>[]>(
    () => [
      {
        type: "indicator",
        mode: "gauge+number",
        // gauge.value drives the needle; we use the clamped value.
        value: gaugeValue,
        // The built-in Plotly number shows the clamped value in small secondary text.
        // The authoritative headline number is the absolutely-positioned overlay div below.
        number: {
          valueformat: ".0f",
          suffix: "%",
          font: {
            color: "rgba(232,238,249,0.35)", // dimmed — overlay is the hero
            family: "JetBrains Mono, monospace",
            size: 18,
          },
        },
        gauge: {
          shape: "angular",
          axis: {
            range: [-100, 100],
            tickcolor: "rgba(120,160,255,0.35)",
            tickfont: {
              color: "#8A97B2",
              family: "JetBrains Mono, monospace",
              size: 11,
            },
            tickmode: "array",
            tickvals: [-100, -50, -10, 10, 40, 100],
          },
          // Hide Plotly's default value bar; the needle is rendered via `threshold`.
          bar: { color: "rgba(0,0,0,0)", thickness: 0 },
          bgcolor: "rgba(0,0,0,0)",
          borderwidth: 0,
          // Five colored zones at low opacity so the needle reads clearly.
          steps: BANDS.map((b) => ({
            range: b.range,
            color: withAlpha(b.color, 0.22),
          })),
          // Threshold line = the needle; its color matches the active band.
          threshold: {
            line: { color: activeColor, width: 5 },
            thickness: 0.85,
            value: gaugeValue,
          },
        },
      } as Partial<Data>,
    ],
    [gaugeValue, activeColor],
  );

  const layout = useMemo<Partial<Layout>>(
    () => ({
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor:  "rgba(0,0,0,0)",
      margin: { t: 8, b: 8, l: 24, r: 24 },
      font: { color: "#E8EEF9", family: "Inter, sans-serif" },
      height: 220,
      // Plotly indicator transition (disabled under reduced-motion).
      // @ts-expect-error — transition is a valid Plotly layout key for indicator
      transition: reduce ? { duration: 0 } : { duration: 600, easing: "cubic-in-out" },
    }),
    [reduce],
  );

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full flex-col gap-3"
      data-testid="velocity-panel"
    >
      {/* Header — title + status badge */}
      <div className="flex items-center justify-between">
        <SectionTitle title="Velocity Intelligence" className="mb-0" />
        <StatusBadge kind="velocity" status={status} />
      </div>

      {/* Gauge area */}
      <div className="relative flex-1" aria-hidden="false">
        <Plot
          data={data as Data[]}
          layout={layout}
          config={{
            displayModeBar: false,
            responsive: true,
            staticPlot: !!reduce,
          }}
          style={{ width: "100%", height: "220px" }}
          useResizeHandler
          data-testid="velocity-gauge"
        />

        {/*
         * Real (un-clamped) value overlay — 06 §4 P3.
         * Tests assert on this element's text content.
         */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-8 text-center"
          data-testid="velocity-value"
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontVariantNumeric: "tabular-nums",
            color: activeColor,
            fontSize: 28,
            fontWeight: 600,
            textShadow: `0 0 18px ${withAlpha(activeColor, 0.45)}`,
          }}
        >
          {signedPct(value)}
        </div>
      </div>

      {/* Caption — "{signed}% vs prior 28 days" (06 §4 P3) */}
      <p
        className="text-center text-[12px]"
        style={{
          color: "var(--text-muted)",
          fontFamily: "JetBrains Mono, monospace",
        }}
        data-testid="velocity-caption"
      >
        {signedPct(value)} vs prior 28 days
      </p>
    </motion.div>
  );
}

export default VelocityPanel;
