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

// ── Band colors — reference image exact values ────────────────────────────────
const MAROON    = "#7A2E3F";   // −100 to −50  : Critical Decline
const BROWN     = "#7A5B2E";   // −50  to −10  : Declining
const DEEP_TEAL = "#144E5A";   // −10  to  10  : Stable
const TEAL_GRN  = "#1F6B5B";   //  10  to  40  : Growing
const DARK_GRN  = "#145B4A";   //  40  to 100  : Accelerating

const NEEDLE_COLOR = "#00F0B5"; // mint green needle

/** Status → accent color (kept for external consumers / future use). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _STATUS_COLOR: Record<VelocityStatus, string> = {
  "Critical Decline": MAROON,
  Declining:          BROWN,
  Stable:             DEEP_TEAL,
  Growing:            NEEDLE_COLOR,
  Accelerating:       NEEDLE_COLOR,
};

/**
 * Five band zones on the −100..100 arc.
 * Boundaries −50, −10, 10, 40 per 03 §6.3 / 07 §2.
 */
const BANDS: { range: [number, number]; color: string }[] = [
  { range: [-100, -50], color: MAROON    },
  { range: [-50,  -10], color: BROWN     },
  { range: [-10,   10], color: DEEP_TEAL },
  { range: [10,    40], color: TEAL_GRN  },
  { range: [40,   100], color: DARK_GRN  },
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
// The arc spans 180° total: a clean semi-circle from left to right (9 o'clock to 3 o'clock).
// In SVG angle convention (clockwise from 3 o'clock / right):
//   180° = left (−100 end),  0° = right (+100 end).
// We drive from 180° → 360° (= 0°) going clockwise, which produces a top-facing arc.
const CX = 130;            // arc centre x (shifted right to balance label space)
const CY = 148;            // arc centre y — at the bottom so the arc opens upward
const R  = 110;            // outer arc radius
const R_INNER = 78;        // inner arc radius (band thickness = 32px — thick like reference)
const NEEDLE_LEN = 100;    // needle length from centre
const NEEDLE_WIDTH = 2.5;  // stroke width of needle line
const ARC_DEG = 180;       // 180° semi-circle
const ARC_START = 180;     // start angle (left / −100)

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

/** Build an SVG arc path for a band sector (donut slice). */
function bandPath(startVal: number, endVal: number): string {
  const a1 = valueToAngle(startVal);
  const a2 = valueToAngle(endVal);
  const [ox1, oy1] = polar(a1, R);
  const [ox2, oy2] = polar(a2, R);
  const [ix2, iy2] = polar(a2, R_INNER);
  const [ix1, iy1] = polar(a1, R_INNER);
  const sweep = a2 - a1;
  const large = sweep > 180 ? 1 : 0;
  return [
    `M ${ox1} ${oy1}`,
    `A ${R} ${R} 0 ${large} 1 ${ox2} ${oy2}`,
    `L ${ix2} ${iy2}`,
    `A ${R_INNER} ${R_INNER} 0 ${large} 0 ${ix1} ${iy1}`,
    "Z",
  ].join(" ");
}

/** Build the needle as a line from centre hub to tip. */
function needleLinePath(angleDeg: number): { x1: number; y1: number; x2: number; y2: number } {
  const [tipX, tipY] = polar(angleDeg, NEEDLE_LEN);
  return { x1: CX, y1: CY, x2: tipX, y2: tipY };
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
  const needleAngle = valueToAngle(gaugeValue);

  // Pre-compute band paths — stable across re-renders unless bands change
  const bandPaths = useMemo(
    () => BANDS.map((b) => ({ path: bandPath(b.range[0], b.range[1]), color: b.color })),
    [],
  );

  // Tick label data — placed just outside the outer arc
  const ticks = useMemo(
    () =>
      TICK_VALS.map((v) => {
        const a = valueToAngle(v);
        const [lx, ly] = polar(a, R + 16);
        return { v, lx, ly };
      }),
    [],
  );

  const needle = needleLinePath(needleAngle);

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

      {/* SVG Gauge — 180° semi-circular arc */}
      <div
        className="relative w-full"
        style={{ height: 200 }}
        aria-hidden="true"
        data-testid="velocity-gauge"
      >
        <svg
          viewBox="0 0 260 158"
          width="100%"
          height="100%"
          style={{ overflow: "visible" }}
        >
          {/* Band sectors — solid filled donut slices */}
          {bandPaths.map(({ path, color }) => (
            <path
              key={color + path.slice(0, 12)}
              d={path}
              fill={color}
            />
          ))}

          {/* Tick labels along the arc */}
          {ticks.map(({ v, lx, ly }) => (
            <text
              key={v}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9.5}
              fontFamily="JetBrains Mono, monospace"
              fill="rgba(255,255,255,0.65)"
            >
              {v}
            </text>
          ))}

          {/* Needle — thin mint-green line with glow */}
          <g
            style={
              reduce
                ? undefined
                : {
                    transition: "transform 0.6s cubic-bezier(0.22,1,0.36,1)",
                  }
            }
          >
            <line
              x1={needle.x1}
              y1={needle.y1}
              x2={needle.x2}
              y2={needle.y2}
              stroke={NEEDLE_COLOR}
              strokeWidth={NEEDLE_WIDTH}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 5px ${withAlpha(NEEDLE_COLOR, 0.85)})` }}
            />
          </g>

          {/* Centre pivot — mint green outer, dark inner */}
          <circle cx={CX} cy={CY} r={7} fill={NEEDLE_COLOR} style={{ filter: `drop-shadow(0 0 6px ${withAlpha(NEEDLE_COLOR, 0.9)})` }} />
          <circle cx={CX} cy={CY} r={3.5} fill="#0A1020" />
        </svg>
      </div>

      {/* Real (un-clamped) value overlay — always mint green like reference */}
      <div
        className="text-center"
        data-testid="velocity-value"
        style={{
          fontFamily: "JetBrains Mono, monospace",
          fontVariantNumeric: "tabular-nums",
          color: NEEDLE_COLOR,
          fontSize: 30,
          fontWeight: 600,
          lineHeight: 1,
          textShadow: `0 0 18px ${withAlpha(NEEDLE_COLOR, 0.45)}`,
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
