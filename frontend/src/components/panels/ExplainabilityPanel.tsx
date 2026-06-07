/**
 * ExplainabilityPanel — P7 Explainability & Deep Dive (MT-41).
 *
 * (a) Local two-tab toggle: "Insights" | "Deep Dive" (06 §4 P7, §7).
 * (b) Insights tab:
 *     - Narrative bullet cards with lucide icon by factor kind (06 §4 P7).
 *     - Factor bars: labeled horizontal bars colored by kind, value signedPct (06 §4 P7).
 * (c) Deep Dive tab:
 *     - Recharts LineChart over history.dates / history.units (84 days) (06 §4 P7).
 *     - Monthly (12) + weekday (7, Sat→Fri) profile mini bar charts (06 §4 P7).
 *
 * 06 §4 P7, §2 tokens, §7 libs, §2 Motion, §6 a11y.
 * Types from MT-31 (types.ts). Formatters from MT-31 (format.ts).
 * Primitives from MT-30 (GlassPanel, SectionTitle).
 */
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarClock,
  Snowflake,
  TrendingUp,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  LineChart,
  Line,
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
import { signedPct, formatNumber } from "../../lib/format";
import type { ForecastResult, FactorKind } from "../../lib/types";

// ── Exact hex tokens from 06 §2 ────────────────────────────────────────────
const ROSE   = "#FF5C7A"; // --accent-rose   : event kind
const CYAN   = "#2FE6FF"; // --accent-cyan   : seasonal kind / history line
const LIME   = "#4DFFB0"; // --accent-lime   : trend kind
const VIOLET = "#8B5CFF"; // --accent-violet : fallback / profile bars
const MUTED  = "#8A97B2"; // --text-muted
const GRID   = "rgba(120, 160, 255, 0.08)"; // --grid-line

// ── Label arrays ─────────────────────────────────────────────────────────────
// Jan..Dec (monthly_avg indices 0..11)
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
// Sat→Fri = wday 1→7 — consistent with MT-39 and 05 §5 (weekday_avg indices 0..6)
const WEEKDAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

// ── Kind → icon + color maps (06 §4 P7) ─────────────────────────────────────
const KIND_ICON: Record<FactorKind, LucideIcon> = {
  event:    CalendarClock,
  seasonal: Snowflake,
  trend:    TrendingUp,
};
const KIND_COLOR: Record<FactorKind, string> = {
  event:    ROSE,
  seasonal: CYAN,
  trend:    LIME,
};

// ── Tooltip style (consistent with other panels) ─────────────────────────────
const tooltipStyle: React.CSSProperties = {
  background: "#0E1626",
  border: "1px solid rgba(120,160,255,0.12)",
  borderRadius: 10,
  color: "#E8EEF9",
  fontFamily: "JetBrains Mono, monospace",
};

// ── Tab type ─────────────────────────────────────────────────────────────────
type TabKey = "insights" | "deep";

// ── Props ─────────────────────────────────────────────────────────────────────
export interface ExplainabilityPanelProps {
  /** The active product's full ForecastResult (05 §5). */
  result: ForecastResult;
}

/**
 * ExplainabilityPanel — narrative cards, factor bars, deep-dive tab.
 * Framer Motion entrance + staggered narrative cards; prefers-reduced-motion safe (06 §2/§6).
 */
export function ExplainabilityPanel({ result }: ExplainabilityPanelProps) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<TabKey>("insights");
  const { explainability, history, seasonal } = result;
  const { narrative, factors } = explainability;

  /** Max absolute factor value — used to normalise bar widths. */
  const maxAbs = useMemo(
    () => Math.max(1, ...factors.map((f) => Math.abs(f.value))),
    [factors],
  );

  /** Recharts row data for the monthly profile. */
  const monthRows = useMemo(
    () => (seasonal.monthly_avg ?? []).map((value, i) => ({ label: MONTHS[i], value })),
    [seasonal.monthly_avg],
  );

  /** Recharts row data for the weekday profile (Sat→Fri). */
  const weekdayRows = useMemo(
    () => (seasonal.weekday_avg ?? []).map((value, i) => ({ label: WEEKDAYS[i], value })),
    [seasonal.weekday_avg],
  );

  /** Recharts row data for the 84-day history line. */
  const historyRows = useMemo(
    () => (history.dates ?? []).map((date, i) => ({ date, units: history.units?.[i] ?? 0 })),
    [history.dates, history.units],
  );

  return (
    // animate=false → GlassPanel doesn't add its own entrance on top of ours
    <GlassPanel animate={false}>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-full flex-col gap-4"
        data-testid="explainability-panel"
      >
        {/* ── Header: title + local tab toggle ─────────────────────────── */}
        <div className="flex items-center justify-between">
          <SectionTitle title="Explainability" className="mb-0" />

          {/* Local two-tab segmented toggle (06 §4 P7 — no Tabs primitive in MT-30 inventory) */}
          <div
            className="flex gap-1 rounded-full p-1"
            style={{ border: "1px solid var(--border-glass)" }}
            role="tablist"
            aria-label="Explainability views"
          >
            <TabChip
              active={tab === "insights"}
              onClick={() => setTab("insights")}
              id="tab-insights"
              aria-controls="panel-insights"
            >
              Insights
            </TabChip>
            <TabChip
              active={tab === "deep"}
              onClick={() => setTab("deep")}
              id="tab-deep"
              aria-controls="panel-deep"
            >
              Deep Dive
            </TabChip>
          </div>
        </div>

        {/* ── Insights tab ─────────────────────────────────────────────── */}
        {tab === "insights" && (
          <div
            id="panel-insights"
            role="tabpanel"
            aria-labelledby="tab-insights"
            className="flex flex-col gap-4"
            data-testid="insights-tab"
          >
            {/* Narrative cards — one per narrative bullet (06 §4 P7) */}
            <div className="flex flex-col gap-2">
              {narrative.map((text, i) => {
                const kind = factors[i]?.kind as FactorKind | undefined;
                const Icon  = kind ? KIND_ICON[kind] : Sparkles;
                const color = kind ? KIND_COLOR[kind] : VIOLET;
                return (
                  <motion.div
                    key={i}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.4,
                      delay: reduce ? 0 : i * 0.06,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="flex items-start gap-3 rounded-[14px] p-3"
                    style={{
                      border: "1px solid var(--border-glass)",
                      background: "rgba(18, 26, 44, 0.4)",
                      boxShadow: `0 0 18px ${color}2E`, // ~18% alpha glow (06 §2)
                    }}
                    data-testid="narrative-card"
                  >
                    <Icon
                      size={18}
                      color={color}
                      style={{ marginTop: 2, flexShrink: 0 }}
                      aria-hidden
                    />
                    <p
                      className="text-[13px]"
                      style={{ color: "#E8EEF9", fontFamily: "Inter, sans-serif" }}
                    >
                      {text}
                    </p>
                  </motion.div>
                );
              })}
            </div>

            {/* Factor bars (06 §4 P7) */}
            <div className="flex flex-col gap-2" data-testid="factor-bars">
              {factors.map((f) => {
                const color    = KIND_COLOR[f.kind] ?? VIOLET;
                const widthPct = (Math.abs(f.value) / maxAbs) * 100;
                return (
                  <div key={f.label} className="flex flex-col gap-1" data-testid="factor-bar">
                    <div className="flex items-center justify-between text-[12px]">
                      <span style={{ color: "#E8EEF9", fontFamily: "Inter, sans-serif" }}>
                        {f.label}
                      </span>
                      <span
                        style={{
                          color,
                          fontFamily: "JetBrains Mono, monospace",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {signedPct(f.value)}
                      </span>
                    </div>
                    {/* Bar track */}
                    <div
                      className="h-2 w-full overflow-hidden rounded-full"
                      style={{ background: "rgba(120, 160, 255, 0.10)" }}
                    >
                      {/* Filled segment — CSS width proportional to |value| / maxAbs */}
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${widthPct}%`,
                          background: color,
                          boxShadow: `0 0 8px ${color}`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Deep Dive tab ─────────────────────────────────────────────── */}
        {tab === "deep" && (
          <div
            id="panel-deep"
            role="tabpanel"
            aria-labelledby="tab-deep"
            className="flex flex-col gap-4"
            data-testid="deep-tab"
          >
            {/* History line chart — 84-day longer context (06 §4 P7) */}
            <div className="flex flex-col gap-1">
              <span
                className="text-[12px]"
                style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}
              >
                History (last 84 days)
              </span>
              <div style={{ width: "100%", height: 150 }} data-testid="history-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={historyRows}
                    margin={{ top: 8, right: 12, bottom: 0, left: -16 }}
                  >
                    <CartesianGrid stroke={GRID} />
                    <XAxis dataKey="date" tick={false} stroke={GRID} />
                    <YAxis
                      tick={{
                        fill: MUTED,
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 10,
                      }}
                      stroke={GRID}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [formatNumber(v, 1), "units"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="units"
                      stroke={CYAN}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={!reduce}
                      style={{ filter: `drop-shadow(0 0 6px ${CYAN})` }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Profile mini-charts: monthly + weekday (06 §4 P7) */}
            <div className="grid grid-cols-2 gap-4">
              <ProfileMini
                title="Monthly profile"
                rows={monthRows}
                reduce={!!reduce}
                testid="monthly-mini"
              />
              <ProfileMini
                title="Weekday profile (Sat→Fri)"
                rows={weekdayRows}
                reduce={!!reduce}
                testid="weekday-mini"
              />
            </div>
          </div>
        )}
      </motion.div>
    </GlassPanel>
  );
}

// ── TabChip — local segmented toggle chip (06 §4 P7; §2 chip radius 9999px) ──
interface TabChipProps {
  active: boolean;
  onClick: () => void;
  id: string;
  "aria-controls": string;
  children: React.ReactNode;
}

function TabChip({ active, onClick, id, "aria-controls": ariaControls, children }: TabChipProps) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={ariaControls}
      onClick={onClick}
      className="rounded-full px-3 py-1 text-[12px] transition-colors"
      style={{
        // Active: dark text on cyan background with glow (06 §2 --accent-cyan)
        // Inactive: muted text, transparent background
        color:      active ? "#070B14" : MUTED,
        background: active ? CYAN      : "transparent",
        fontFamily: "Inter, sans-serif",
        boxShadow:  active ? "0 0 14px rgba(47,230,255,0.4)" : "none",
        // Chip radius: 9999px (06 §2)
        borderRadius: "9999px",
      }}
    >
      {children}
    </button>
  );
}

// ── ProfileMini — shared mini bar chart for monthly + weekday profiles ───────
interface ProfileMiniProps {
  title: string;
  rows: { label: string; value: number }[];
  reduce: boolean;
  testid: string;
}

function ProfileMini({ title, rows, reduce, testid }: ProfileMiniProps) {
  return (
    <div className="flex flex-col gap-1" data-testid={testid}>
      <span
        className="text-[11px]"
        style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}
      >
        {title}
      </span>
      <div style={{ width: "100%", height: 110 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="label"
              tick={{ fill: MUTED, fontFamily: "Inter, sans-serif", fontSize: 9 }}
              stroke={GRID}
              interval={0}
            />
            <YAxis
              tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 9 }}
              stroke={GRID}
            />
            {/* Violet low-opacity bars (06 §4 P7 — same data as seasonal panel, context only) */}
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={!reduce}>
              {rows.map((r) => (
                <Cell key={r.label} fill={VIOLET} fillOpacity={0.5} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ExplainabilityPanel;
