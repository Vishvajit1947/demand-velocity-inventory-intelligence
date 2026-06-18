/**
 * SeasonalPanel — P5 Seasonal Trend (MT-39).
 * MT-42 edit: added `loading?` + `result?` props + PanelState wrapper (06 §5).
 *
 * 12-bar monthly chart (current month highlighted) + 7-bar weekday pattern (Sat→Fri).
 * 06 §4 P5, §2 tokens, §7 Recharts, §2 Motion, §6 a11y.
 */
import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";
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
import { Skeleton } from "../ui/Skeleton";
import { PanelState } from "../ui/PanelState";
import { signedPct } from "../../lib/format";
import type { ForecastResult } from "../../lib/types";

// ── Design tokens (06 §2) ─────────────────────────────────────────────────────
const CYAN   = "#2FE6FF";
const VIOLET = "#8B5CFF";
const MUTED  = "#8A97B2";
const GRID   = "rgba(120, 160, 255, 0.08)";

const MONTHS   = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEKDAYS = ["Sat","Sun","Mon","Tue","Wed","Thu","Fri"];

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

export interface SeasonalPanelProps {
  /** Optional until first forecast. */
  result?: ForecastResult;
  /** MT-42: shows skeleton while true (06 §5 Loading). */
  loading?: boolean;
}

export function SeasonalPanel({ result, loading = false }: SeasonalPanelProps) {
  // MT-42 skeleton: tall chart block + smaller row (06 §5).
  const skeleton = (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-[180px] w-full rounded-card" />
      <Skeleton className="h-12 w-full rounded-card" />
    </div>
  );

  return (
    <GlassPanel animate={false}>
      <div className="flex h-full flex-col gap-4" data-testid="seasonal-panel">
        <SectionTitle title="Seasonal Trend" />
        <PanelState
          loading={loading}
          hasData={!!result}
          skeleton={skeleton}
          minHeight={260}
        >
          {result && <SeasonalContent result={result} />}
        </PanelState>
      </div>
    </GlassPanel>
  );
}

function SeasonalContent({ result }: { result: ForecastResult }) {
  const reduce = useReducedMotion();
  const { month, month_vs_avg_pct, monthly_avg, weekday_avg } = result.seasonal;

  const monthRows = useMemo(
    () => (monthly_avg ?? []).map((value, i) => ({ label: MONTHS[i], value, idx: i + 1 })),
    [monthly_avg],
  );

  const weekdayRows = useMemo(
    () => (weekday_avg ?? []).map((value, i) => ({ label: WEEKDAYS[i], value })),
    [weekday_avg],
  );

  const monthName = MONTHS[(month - 1 + 12) % 12];

  return (
    <>
      {/* Callout */}
      <p
        className="text-[14px]"
        style={{ color: "#E8EEF9", fontFamily: "Inter, sans-serif" }}
        data-testid="seasonal-callout"
      >
        {monthName} runs{" "}
        <span style={{ color: CYAN, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>
          {signedPct(month_vs_avg_pct)}
        </span>{" "}
        vs average
      </p>

      {/* (a) Monthly bars — 12 bars */}
      <div style={{ width: "100%", height: 170 }} data-testid="monthly-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthRows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
            <Tooltip cursor={{ fill: "rgba(120,160,255,0.06)" }} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={!reduce}>
              {monthRows.map((r) => {
                const active = r.idx === month;
                return (
                  <Cell
                    key={r.label}
                    fill={active ? CYAN : VIOLET}
                    fillOpacity={active ? 0.9 : 0.45}
                    data-testid={`month-${r.label}`}
                    data-active={active ? "true" : "false"}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "Inter, sans-serif", marginTop: 2 }}>
        Current month highlighted in cyan
      </p>

      {/* (b) Weekday bars — 7 bars, Sat→Fri */}
      <div className="flex flex-col gap-1">
        <span className="text-[12px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
          Weekday pattern (Sat→Fri)
        </span>
        <div style={{ width: "100%", height: 110 }} data-testid="weekday-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdayRows} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
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
              <Tooltip cursor={{ fill: "rgba(120,160,255,0.06)" }} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} isAnimationActive={!reduce}>
                {weekdayRows.map((r) => (
                  <Cell key={r.label} fill={CYAN} fillOpacity={0.55} data-testid={`weekday-${r.label}`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

export default SeasonalPanel;
