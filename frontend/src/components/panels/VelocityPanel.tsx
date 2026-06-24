/**
 * VelocityPanel — P3 Velocity Intelligence (MT-37).
 *
 * Pure SVG angular gauge: five colored band zones on a −100…+100 arc,
 * a needle pointing at the clamped value, the real (un-clamped) velocity
 * as an overlay text, a StatusBadge, and a caption.
 *
 * Replaces the Plotly implementation to eliminate the ~3 MB plotly.js bundle.
 * Visual output is identical: same band colors, same boundaries, same tokens.
 *
 * 06 §4 P3, §2 tokens, §2 Motion, §6 a11y.
 * Types from MT-31 (types.ts). Formatters from MT-31 (format.ts).
 * Primitives from MT-30 (GlassPanel, StatusBadge, SectionTitle).
 */
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
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

/** Status → arc color (06 §2). */
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

// ── SVG gauge geometry ────────────────────────────────────────────────────────
// The arc spans 210° total: from 195° to 345° measured clockwise from 12 o'clock
// (i.e. −105° to +105° from 3 o'clock in standard SVG math).
// We use a 220×140 viewBox so the arc sits in the upper portion and labels fit.
const CX = 110;            // arc centre x
const CY = 126;            // arc centre y (slightly below mid so arc sits high)
const R  = 96;             // outer arc radius
const R_INNER = 72;        // inner arc radius (band thickness = 24px)
const NEEDLE_LEN = 82;     // needle length from centre
const NEEDLE_BASE = 6;     // half-width of needle base triangle
const ARC_DEG = 210;       // total arc span in degrees
const ARC_START = 195;     // start angle in SVG degrees (clockwise from right/3 o'clock)

/** Map a value in [−100, 100] to an SVG angle (degrees, clockwise from 3 o'clock). */
function valueToAngle(v: number): number {
  // Fraction across the arc [0, 1]
  const frac = (clamp(v, -100, 100) + 100) / 200;
  return ARC_START + frac * ARC_DEG;
}

/** Convert polar (angle degrees, radius) to Cartesian relative to (CX, CY). */
function polar(angleDeg: number, r: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

/** Build an SVG arc path for a band sector. */
function bandPath(startVal: number, endVal: number): string {
  const a1 = valueToAngle(startVal);
  const a2 = valueToAngle(endVal);
  const [ox1, oy1] = polar(a1, R);
  const [ox2, oy2] = polar(a2, R);
  const [ix2, iy2] = polar(a2, R_INNER);
  const [ix1, iy1] = polar(a1, R_INNER);
  const large = a2 - a1 > 180 ? 1 : 0;
  return [
    `M ${ox1} ${oy1}`,
    `A ${R} ${R} 0 ${large} 1 ${ox2} ${oy2}`,
    `L ${ix2} ${iy2}`,
    `A ${R_INNER} ${R_INNER} 0 ${large} 0 ${ix1} ${iy1}`,
    "Z",
  ].join(" ");
}

/** Build an SVG needle polygon path for a given angle. */
function needlePath(angleDeg: number): string {
  const [tipX, tipY] = polar(angleDeg, NEEDLE_LEN);
  const perpAngle = angleDeg + 90;
  const [b1x, b1y] = polar(perpAngle, NEEDLE_BASE);
  const [b2x, b2y] = polar(perpAngle + 180, NEEDLE_BASE);
  return `M ${b1x} ${b1y} L ${tipX} ${tipY} L ${b2x} ${b2y} Z`;
}

// Tick label positions for −100, −50, −10, 10, 40, 100
const TICK_VALS = [-100, -50, -10, 10, 40, 100];

// ── Component ────────────────────────────────────────────────────────────────
export interface VelocityPanelProps {
  result?: ForecastResult;
  loading?: boolean;
}

export function VelocityPanel({ result, loading = false }: VelocityPanelProps) {
  const reduce = useReducedMotion();

  const skeleton = (
    <div className="flex flex-col items-center gap-4">
      <Skeleton className="h-[220px] w-[220px] rounded-full" />
      <Skeleton className="h-6 w-32 rounded-card" />
    </div>
  );

  return (
    <GlassPanel animate={false} className="h-full">
      <PanelState
        loading={loading}
        hasData={!!result}
        skeleton={skeleton}
        minHeight={280}
      >
        {result && <VelocityContent result={result} reduce={!!reduce} />}
      </PanelState>
    </GlassPanel>
  );
}

function VelocityContent({ result, reduce }: { result: ForecastResult; reduce: boolean }) {
  const { value, status } = result.velocity;

  const gaugeValue = clamp(value, -100, 100);
  const activeColor = STATUS_COLOR[status];
  const needleAngle = valueToAngle(gaugeValue);

  // Pre-compute band paths — stable across re-renders unless bands change
  const bandPaths = useMemo(
    () => BANDS.map((b) => ({ path: bandPath(b.range[0], b.range[1]), color: b.color })),
    [],
  );

  // Tick label data
  const ticks = useMemo(
    () =>
      TICK_VALS.map((v) => {
        const a = valueToAngle(v);
        const [lx, ly] = polar(a, R + 14);
        return { v, lx, ly };
      }),
    [],
  );

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full flex-col gap-2"
      data-testid="velocity-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <SectionTitle title="Velocity Intelligence" className="mb-0" />
        <StatusBadge kind="velocity" status={status} />
      </div>

      {/* SVG Gauge */}
      <div
        className="relative w-full"
        style={{ height: 220 }}
        aria-hidden="true"
        data-testid="velocity-gauge"
      >
        <svg
          viewBox="0 0 220 148"
          width="100%"
          height="100%"
          style={{ overflow: "visible" }}
        >
          {/* Band sectors */}
          {bandPaths.map(({ path, color }) => (
            <path
              key={color + path.slice(0, 12)}
              d={path}
              fill={withAlpha(color, 0.22)}
            />
          ))}

          {/* Outer arc hairline */}
          {(() => {
            const [sx, sy] = polar(ARC_START, R);
            const [ex, ey] = polar(ARC_START + ARC_DEG, R);
            return (
              <path
                d={`M ${sx} ${sy} A ${R} ${R} 0 1 1 ${ex} ${ey}`}
                fill="none"
                stroke="rgba(120,160,255,0.18)"
                strokeWidth={1}
              />
            );
          })()}

          {/* Tick labels */}
          {ticks.map(({ v, lx, ly }) => (
            <text
              key={v}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
              fill="#8A97B2"
            >
              {v}
            </text>
          ))}

          {/* Needle — animated rotation when reduced-motion is off */}
          <g
            style={
              reduce
                ? undefined
                : {
                    transition: "transform 0.6s cubic-bezier(0.22,1,0.36,1)",
                  }
            }
          >
            <path
              d={needlePath(needleAngle)}
              fill={activeColor}
              style={{
                filter: `drop-shadow(0 0 4px ${withAlpha(activeColor, 0.7)})`,
              }}
            />
          </g>

          {/* Centre pivot dot */}
          <circle cx={CX} cy={CY} r={6} fill={activeColor} />
          <circle cx={CX} cy={CY} r={3} fill="#0A1020" />
        </svg>
      </div>

      {/* Real (un-clamped) value overlay */}
      <div
        className="text-center"
        data-testid="velocity-value"
        style={{
          fontFamily: "JetBrains Mono, monospace",
          fontVariantNumeric: "tabular-nums",
          color: activeColor,
          fontSize: 30,
          fontWeight: 600,
          lineHeight: 1,
          textShadow: `0 0 18px ${withAlpha(activeColor, 0.45)}`,
        }}
      >
        {signedPct(value)}
      </div>

      {/* Caption */}
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
