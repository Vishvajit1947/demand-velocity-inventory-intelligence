/**
 * ExplainabilityPanel — P7 Explainability & Deep Dive (MT-41).
 * MT-42 edit: added `loading?` + `result?` props + PanelState wrapper (06 §5).
 *
 * (a) Local two-tab toggle: "Insights" | "Deep Dive".
 * (b) Insights: narrative cards + factor bars.
 * (c) Deep Dive: history line chart + monthly/weekday profile mini charts.
 * 06 §4 P7, §2 tokens, §7 libs, §2 Motion, §6 a11y.
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
import { Skeleton } from "../ui/Skeleton";
import { PanelState } from "../ui/PanelState";
import { signedPct, formatNumber } from "../../lib/format";
import type { ForecastResult, FactorKind } from "../../lib/types";

// ── Design tokens ──────────────────────────────────────────────────────────────
const CYAN   = "#2FE6FF";
const AMBER  = "#FFC24D";
const VIOLET = "#8B5CFF";
const MUTED  = "#8A97B2";
const GRID   = "rgba(120, 160, 255, 0.08)";

const MONTHS   = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEKDAYS = ["Sat","Sun","Mon","Tue","Wed","Thu","Fri"];

const KIND_ICON: Record<FactorKind, LucideIcon> = {
  event:    CalendarClock,
  seasonal: Snowflake,
  trend:    TrendingUp,
};
const KIND_COLOR: Record<FactorKind, string> = {
  event:    AMBER,
  seasonal: VIOLET,
  trend:    CYAN,
};

// ── Shared tooltip styles (matches history chart) ────────────────────────────
const tooltipStyle: React.CSSProperties = {
  background: "#0E1626",
  border: "1px solid rgba(120,160,255,0.12)",
  borderRadius: 10,
  color: "#E8EEF9",
  fontFamily: "JetBrains Mono, monospace",
};

const tooltipLabelStyle: React.CSSProperties = {
  color: "#E8EEF9",
  fontFamily: "Inter, sans-serif",
  fontWeight: 600,
  marginBottom: 4,
};

const tooltipItemStyle: React.CSSProperties = {
  color: "#8A97B2",
};

type TabKey = "insights" | "deep";

export interface ExplainabilityPanelProps {
  /** Optional until first forecast. */
  result?: ForecastResult;
  /** MT-42: shows skeleton while true (06 §5 Loading). */
  loading?: boolean;
}

export function ExplainabilityPanel({ result, loading = false }: ExplainabilityPanelProps) {
  // MT-42 skeleton: 3 bullet card shapes (06 §5).
  const skeleton = (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-card" />
      ))}
    </div>
  );

  return (
    <GlassPanel animate={false}>
      <div className="flex h-full flex-col gap-3" data-testid="explainability-panel">
        <SectionTitle title="Explainability" />
        <PanelState
          loading={loading}
          hasData={!!result}
          skeleton={skeleton}
          minHeight={180}
        >
          {result && <ExplainabilityContent result={result} />}
        </PanelState>
      </div>
    </GlassPanel>
  );
}

// ── Inner content ─────────────────────────────────────────────────────────────
function ExplainabilityContent({ result }: { result: ForecastResult }) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<TabKey>("insights");
  const { explainability, history, seasonal } = result;
  const { narrative, factors } = explainability;

  const maxAbs = useMemo(
    () => Math.max(1, ...factors.map((f) => Math.abs(f.value))),
    [factors],
  );

  const monthRows = useMemo(
    () => (seasonal.monthly_avg ?? []).map((value, i) => ({ label: MONTHS[i], value })),
    [seasonal.monthly_avg],
  );

  const weekdayRows = useMemo(
    () => (seasonal.weekday_avg ?? []).map((value, i) => ({ label: WEEKDAYS[i], value })),
    [seasonal.weekday_avg],
  );

  const historyRows = useMemo(
    () => (history.dates ?? []).map((date, i) => ({ date, units: history.units?.[i] ?? 0 })),
    [history.dates, history.units],
  );

  return (
    <>
      {/* Tab toggle — aligned to right */}
      <div className="flex items-center justify-end">
        <div
          className="flex gap-1 rounded-full p-1"
          style={{ border: "1px solid var(--border-glass)" }}
          role="tablist"
          aria-label="Explainability views"
        >
          <TabChip active={tab === "insights"} onClick={() => setTab("insights")} id="tab-insights" aria-controls="panel-insights">
            Insights
          </TabChip>
          <TabChip active={tab === "deep"} onClick={() => setTab("deep")} id="tab-deep" aria-controls="panel-deep">
            Deep Dive
          </TabChip>
        </div>
      </div>

      {/* Insights tab — horizontal: narrative left, factor bars right */}
      {tab === "insights" && (
        <div id="panel-insights" role="tabpanel" aria-labelledby="tab-insights" className="flex flex-col xl:flex-row gap-4 xl:gap-6" data-testid="insights-tab">

          {/* Narrative bullets — takes more space */}
          <div className="flex flex-col gap-2 flex-1">
            {narrative.map((text, i) => {
              const kind = factors[i]?.kind as FactorKind | undefined;
              const Icon  = kind ? KIND_ICON[kind] : Sparkles;
              const color = kind ? KIND_COLOR[kind] : VIOLET;
              return (
                <motion.div
                  key={i}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-start gap-3 rounded-[12px] px-4 py-2.5"
                  style={{
                    borderLeft: `3px solid ${color}`,
                    background: "rgba(18, 26, 44, 0.45)",
                  }}
                  data-testid="narrative-card"
                >
                  <Icon size={16} color={color} style={{ marginTop: 2, flexShrink: 0 }} aria-hidden />
                  <p className="text-[13px] leading-snug" style={{ color: "#E8EEF9", fontFamily: "Inter, sans-serif" }}>
                    {text}
                  </p>
                </motion.div>
              );
            })}
          </div>

          {/* Factor bars — right column */}
          <div className="flex flex-col gap-2 xl:w-[300px] shrink-0" data-testid="factor-bars">
            {factors.map((f) => {
              const color    = KIND_COLOR[f.kind] ?? VIOLET;
              const widthPct = (Math.abs(f.value) / maxAbs) * 100;
              return (
                <div key={f.label} className="flex flex-col gap-1" data-testid="factor-bar">
                  <div className="flex items-center justify-between text-[12px]">
                    <span style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>{f.label}</span>
                    <span style={{ color, fontFamily: "JetBrains Mono, monospace", fontVariantNumeric: "tabular-nums" }}>
                      {signedPct(f.value)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(120, 160, 255, 0.10)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${widthPct}%`, background: color, boxShadow: `0 0 6px ${color}66` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Deep Dive tab */}
      {tab === "deep" && (
        <div id="panel-deep" role="tabpanel" aria-labelledby="tab-deep" className="flex flex-col gap-4" data-testid="deep-tab">
          <div className="flex flex-col gap-1">
            <span className="text-[12px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
              History (last 84 days)
            </span>
            <div style={{ width: "100%", height: 150 }} data-testid="history-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyRows} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke={GRID} />
                  <XAxis dataKey="date" tick={false} stroke={GRID} />
                  <YAxis tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 10 }} stroke={GRID} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
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

          <div className="grid grid-cols-2 gap-4">
            <ProfileMini title="Monthly profile" rows={monthRows} reduce={!!reduce} testid="monthly-mini" tooltipValueLabel="avg units" />
            <ProfileMini title="Weekday profile (Sat→Fri)" rows={weekdayRows} reduce={!!reduce} testid="weekday-mini" tooltipValueLabel="avg units" />
          </div>
        </div>
      )}
    </>
  );
}

// ── TabChip ───────────────────────────────────────────────────────────────────
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
        color:        active ? "#070B14" : MUTED,
        background:   active ? CYAN      : "transparent",
        fontFamily:   "Inter, sans-serif",
        boxShadow:    active ? "0 0 14px rgba(47,230,255,0.4)" : "none",
        borderRadius: "9999px",
      }}
    >
      {children}
    </button>
  );
}

// ── ProfileMini ───────────────────────────────────────────────────────────────
interface ProfileMiniProps {
  title: string;
  rows: { label: string; value: number }[];
  reduce: boolean;
  testid: string;
  tooltipValueLabel: string;
}

function ProfileMini({ title, rows, reduce, testid, tooltipValueLabel }: ProfileMiniProps) {
  return (
    <div className="flex flex-col gap-1" data-testid={testid}>
      <span className="text-[11px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
        {title}
      </span>
      <div style={{ width: "100%", height: 110 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontFamily: "Inter, sans-serif", fontSize: 9 }} stroke={GRID} interval={0} />
            <YAxis tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 9 }} stroke={GRID} />
            <Tooltip
              cursor={{ fill: "rgba(120,160,255,0.06)" }}
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v: number) => [formatNumber(v, 1), tooltipValueLabel]}
            />
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
