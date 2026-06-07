/**
 * EventImpactPanel — P4 Event Impact (MT-38).
 * MT-42 edit: added `loading?` + `result?` props + PanelState wrapper (06 §5).
 *
 * Recharts horizontal BarChart of event_uplift + horizon timeline strip.
 * 06 §4 P4, §2 tokens, §7 Recharts, §2 Motion, §6 a11y.
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
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { GlassPanel } from "../ui/GlassPanel";
import { SectionTitle } from "../ui/SectionTitle";
import { Skeleton } from "../ui/Skeleton";
import { PanelState } from "../ui/PanelState";
import { signedPct } from "../../lib/format";
import type { ForecastResult } from "../../lib/types";

// ── Design tokens (06 §2) ─────────────────────────────────────────────────────
const LIME  = "#4DFFB0";
const ROSE  = "#FF5C7A";
const CYAN  = "#2FE6FF";
const MUTED = "#8A97B2";
const GRID  = "rgba(120, 160, 255, 0.08)";

const barColor = (v: number): string => (v >= 0 ? LIME : ROSE);

interface UpliftRow { name: string; value: number }

export interface EventImpactPanelProps {
  /** Optional until first forecast. */
  result?: ForecastResult;
  /** MT-42: shows skeleton while true (06 §5 Loading). */
  loading?: boolean;
}

export function EventImpactPanel({ result, loading = false }: EventImpactPanelProps) {
  // MT-42 skeleton: 4 horizontal bars stacked (06 §5).
  const skeleton = (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-6 w-full rounded-card" />
      ))}
    </div>
  );

  return (
    <GlassPanel animate={false}>
      <div className="flex h-full flex-col gap-4" data-testid="event-impact-panel">
        <SectionTitle title="Event Impact" />
        <PanelState
          loading={loading}
          hasData={!!result}
          skeleton={skeleton}
          minHeight={260}
        >
          {result && <EventImpactContent result={result} />}
        </PanelState>
      </div>
    </GlassPanel>
  );
}

// ── Inner content (rendered only when result is defined) ──────────────────────
function EventImpactContent({ result }: { result: ForecastResult }) {
  const reduce = useReducedMotion();
  const { event_uplift, events_in_horizon, horizon_dates } = result;

  const rows = useMemo<UpliftRow[]>(
    () =>
      Object.entries(event_uplift ?? {})
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    [event_uplift],
  );

  const lastIdx = Math.max(1, (horizon_dates?.length ?? 1) - 1);

  const ticks = useMemo(
    () =>
      (events_in_horizon ?? [])
        .map((ev) => {
          const idx = (horizon_dates ?? []).indexOf(ev.date);
          return { ...ev, idx, pct: (idx / lastIdx) * 100 };
        })
        .filter((t) => t.idx >= 0),
    [events_in_horizon, horizon_dates, lastIdx],
  );

  const chartHeight = Math.max(140, rows.length * 38);

  return (
    <>
      {/* (a) Uplift horizontal bar chart */}
      {rows.length === 0 ? (
        <p className="text-[13px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
          No event uplift profile for this product.
        </p>
      ) : (
        <div style={{ width: "100%", height: chartHeight }} data-testid="event-uplift-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis
                type="number"
                tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}
                tickFormatter={(v) => signedPct(Number(v))}
                stroke={GRID}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fill: "#E8EEF9", fontFamily: "Inter, sans-serif", fontSize: 12 }}
                stroke={GRID}
              />
              <Tooltip
                cursor={{ fill: "rgba(120,160,255,0.06)" }}
                contentStyle={{
                  background: "#0E1626",
                  border: "1px solid rgba(120,160,255,0.12)",
                  borderRadius: 10,
                  color: "#E8EEF9",
                  fontFamily: "JetBrains Mono, monospace",
                }}
                formatter={(v: number) => [signedPct(v), "uplift"]}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={!reduce} data-testid="event-bar">
                {rows.map((r) => (
                  <Cell key={r.name} fill={barColor(r.value)} data-testid={`bar-${r.name}`} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v: number) => signedPct(v)}
                  style={{ fill: "#E8EEF9", fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* (b) Horizon timeline strip */}
      <div className="mt-1" data-testid="horizon-strip">
        <div
          className="mb-2 flex items-center justify-between text-[11px]"
          style={{ color: MUTED, fontFamily: "JetBrains Mono, monospace" }}
        >
          <span>{horizon_dates?.[0] ?? "—"}</span>
          <span>28-day horizon</span>
          <span>{horizon_dates?.[horizon_dates.length - 1] ?? "—"}</span>
        </div>

        <div
          className="relative h-9 w-full rounded-full"
          style={{ border: "1px solid var(--border-glass)", background: "rgba(18,26,44,0.4)" }}
        >
          {ticks.length === 0 ? (
            <span
              className="absolute inset-0 flex items-center justify-center text-[11px]"
              style={{ color: MUTED }}
            >
              No events in this 28-day window.
            </span>
          ) : (
            ticks.map((t) => (
              <div
                key={`${t.date}-${t.name}`}
                className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${t.pct}%` }}
                data-testid="horizon-event"
                title={`${t.name} — ${t.date}`}
              >
                <span
                  className="block h-3 w-3 rounded-full"
                  style={{ background: CYAN, boxShadow: `0 0 10px ${CYAN}` }}
                />
                <span
                  className="mt-1 whitespace-nowrap text-[10px]"
                  style={{ color: "#E8EEF9", fontFamily: "Inter, sans-serif" }}
                >
                  {t.name}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default EventImpactPanel;
