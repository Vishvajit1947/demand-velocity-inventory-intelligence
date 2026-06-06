/**
 * SeasonalPanel — P5 Seasonal Trend.
 * 06 §4 P5: 12-bar monthly chart (current month highlighted) + 7-bar weekday pattern (Sat→Fri).
 * Data source: ForecastResult.seasonal (05 §5).
 */
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GlassPanel } from "../ui/GlassPanel";
import { SectionTitle } from "../ui/SectionTitle";
import { signedPct } from "../../lib/format";
import type { ForecastResult } from "../../lib/types";

// ── Design tokens (06 §2) ───────────────────────────────────────────────────
const CYAN = "#2FE6FF";   // --accent-cyan   : highlighted month bar
const VIOLET = "#8B5CFF"; // --accent-violet : non-current months
const MUTED = "#8A97B2";  // --text-muted    : axis ticks
const GRID = "rgba(120, 160, 255, 0.08)"; // --grid-line

// ── Label arrays ────────────────────────────────────────────────────────────
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// 05 §5 / 02 data spec: wday 1..7 = Saturday..Friday.
// Array index 0..6 maps directly — render in array order, do NOT re-sort.
const WEEKDAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

const tooltipStyle: React.CSSProperties = {
  background: "#0E1626",
  border: "1px solid rgba(120,160,255,0.12)",
  borderRadius: 10,
  color: "#E8EEF9",
  fontFamily: "JetBrains Mono, monospace",
};

// ── Props ────────────────────────────────────────────────────────────────────
export interface SeasonalPanelProps {
  result: ForecastResult;
}

// ── Component ────────────────────────────────────────────────────────────────
export function SeasonalPanel({ result }: SeasonalPanelProps) {
  const reduce = useReducedMotion();
  const { month, month_vs_avg_pct, monthly_avg, weekday_avg } = result.seasonal;

  // Build row data for Recharts.
  // monthly: idx is 1-based month number for comparison with seasonal.month.
  const monthRows = useMemo(
    () => (monthly_avg ?? []).map((value, i) => ({ label: MONTHS[i], value, idx: i + 1 })),
    [monthly_avg],
  );

  // weekday: render array as-is (Sat→Fri per contract).
  const weekdayRows = useMemo(
    () => (weekday_avg ?? []).map((value, i) => ({ label: WEEKDAYS[i], value })),
    [weekday_avg],
  );

  // Safe month name (guard against out-of-range values)
  const monthName = MONTHS[(month - 1 + 12) % 12];

  return (
    // animate=false so GlassPanel doesn't apply its own entrance variants on top of ours
    <GlassPanel animate={false}>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-full flex-col gap-4"
        data-testid="seasonal-panel"
      >
        {/* Header */}
        <SectionTitle title="Seasonal Trend" />

        {/* Callout — 06 §4 P5 */}
        <p
          className="text-[14px]"
          style={{ color: "#E8EEF9", fontFamily: "Inter, sans-serif" }}
          data-testid="seasonal-callout"
        >
          {monthName} runs{" "}
          <span
            style={{
              color: CYAN,
              fontFamily: "JetBrains Mono, monospace",
              fontWeight: 600,
            }}
          >
            {signedPct(month_vs_avg_pct)}
          </span>{" "}
          vs average
        </p>

        {/* (a) Monthly bars — 12 bars, Jan…Dec */}
        <div style={{ width: "100%", height: 170 }} data-testid="monthly-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={monthRows}
              margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
            >
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="label"
                tick={{ fill: MUTED, fontFamily: "Inter, sans-serif", fontSize: 11 }}
                stroke={GRID}
                interval={0}
              />
              <YAxis
                tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}
                stroke={GRID}
              />
              <Tooltip
                cursor={{ fill: "rgba(120,160,255,0.06)" }}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={!reduce}>
                {monthRows.map((r) => {
                  const active = r.idx === month;
                  return (
                    <Cell
                      key={r.label}
                      fill={active ? CYAN : VIOLET}
                      fillOpacity={active ? 1 : 0.35}
                      data-testid={`month-${r.label}`}
                      data-active={active ? "true" : "false"}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* (b) Weekday bars — 7 bars, Sat→Fri (wday 1→7 = array index 0→6) */}
        <div className="flex flex-col gap-1">
          <span
            className="text-[12px]"
            style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}
          >
            Weekday pattern (Sat→Fri)
          </span>
          <div style={{ width: "100%", height: 110 }} data-testid="weekday-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weekdayRows}
                margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: MUTED, fontFamily: "Inter, sans-serif", fontSize: 11 }}
                  stroke={GRID}
                  interval={0}
                />
                <YAxis
                  tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}
                  stroke={GRID}
                />
                <Tooltip
                  cursor={{ fill: "rgba(120,160,255,0.06)" }}
                  contentStyle={tooltipStyle}
                />
                <Bar dataKey="value" radius={[5, 5, 0, 0]} isAnimationActive={!reduce}>
                  {weekdayRows.map((r) => (
                    <Cell
                      key={r.label}
                      fill={CYAN}
                      fillOpacity={0.55}
                      data-testid={`weekday-${r.label}`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>
    </GlassPanel>
  );
}

export default SeasonalPanel;
