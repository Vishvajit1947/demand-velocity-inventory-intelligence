/**
 * InventoryRiskPanel — P4 Inventory Risk (PRIMARY OBJECTIVE).
 * MT-42 edit: added `loading?` + `result?` props + PanelState wrapper (06 §5).
 *
 * (a) Stockout-risk StatusBadge + optional "Overstock" pill.
 * (b) Recharts LineChart of projected_stock[28] split into safe (cyan) / danger (rose dashed).
 * (c) Reorder card: count-up recommended_order_qty + figures.
 * 06 §4 P6, §2 tokens, §7 libs, §2 Motion, §6 a11y.
 */
import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";
import CountUp from "react-countup";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { GlassPanel } from "../ui/GlassPanel";
import { StatusBadge } from "../ui/StatusBadge";
import { SectionTitle } from "../ui/SectionTitle";
import { Skeleton } from "../ui/Skeleton";
import { PanelState } from "../ui/PanelState";
import { formatNumber } from "../../lib/format";
import type { ForecastResult } from "../../lib/types";

// ── Design tokens (06 §2) ─────────────────────────────────────────────────────
const CYAN   = "var(--accent-cyan)";
const AMBER  = "var(--accent-amber)";
const ROSE   = "var(--accent-rose)";
const VIOLET = "#8B5CFF";
const MUTED  = "#8A97B2";
const GRID   = "rgba(120, 160, 255, 0.08)";

interface StockRow { day: number; date: string; safe: number | null; danger: number | null }

export interface InventoryRiskPanelProps {
  /** Optional until first forecast. */
  result?: ForecastResult;
  /** MT-42: shows skeleton while true (06 §5 Loading). */
  loading?: boolean;
}

export function InventoryRiskPanel({ result, loading = false }: InventoryRiskPanelProps) {
  // MT-42 skeleton: chart block + big number block (06 §5).
  const skeleton = (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-[160px] w-full rounded-card" />
      <Skeleton className="h-16 w-40 rounded-card" />
    </div>
  );

  return (
    <GlassPanel animate={false}>
      <div className="flex h-full flex-col gap-4" data-testid="inventory-risk-panel">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <SectionTitle title="Inventory Risk" className="mb-0" />
            <span
              style={{
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 9999,
                background: "rgba(255,194,77,0.15)",
                color: "var(--accent-amber)",
                border: "1px solid rgba(255,194,77,0.3)",
                marginLeft: 8,
                fontFamily: "Inter, sans-serif",
                fontWeight: 600,
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
              }}
            >
              PRIMARY OBJECTIVE
            </span>
          </div>
        </div>
        <PanelState
          loading={loading}
          hasData={!!result}
          skeleton={skeleton}
          minHeight={300}
        >
          {result && <InventoryRiskContent result={result} />}
        </PanelState>
      </div>
    </GlassPanel>
  );
}

function InventoryRiskContent({ result }: { result: ForecastResult }) {
  const reduce = useReducedMotion();
  const inv = result.inventory;
  const dates = result.horizon_dates ?? [];

  const rows = useMemo<StockRow[]>(
    () => {
      const stock = inv.projected_stock ?? [];
      const safety = inv.safety_stock;
      // Find the first index where stock dips at or below safety_stock
      const crossIdx = stock.findIndex((s) => s <= safety);
      return stock.map((s, i) => {
        const inDanger = crossIdx >= 0 && i >= crossIdx;
        return {
          day: i + 1,
          date: dates[i] ?? "",
          // safe segment: present up to and including the crossover point (for seamless join)
          safe: !inDanger || i === crossIdx ? s : null,
          // danger segment: present from crossover point onward (starts at crossIdx for join)
          danger: inDanger ? s : null,
        };
      });
    },
    [inv.projected_stock, inv.safety_stock, dates],
  );

  const showStockoutMarker = inv.cover_days <= 28;

  return (
    <>
      {/* (a) Risk badge + optional overstock pill */}
      <div className="flex items-center gap-2">
        <StatusBadge kind="risk" status={inv.stockout_risk} />
        {inv.overstock && (
          <span
            className="rounded-chip px-3 py-1 text-[12px] font-medium"
            style={{
              color: VIOLET,
              border: `1px solid ${VIOLET}`,
              background: "rgba(139, 92, 255, 0.12)",
              fontFamily: "Inter, sans-serif",
            }}
            data-testid="overstock-pill"
          >
            Overstock
          </span>
        )}
      </div>

      {/* (b) Projected-stock line chart */}
      <div style={{ width: "100%", height: 180 }} data-testid="projected-stock-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 28, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis
              dataKey="day"
              tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}
              stroke={GRID}
              tickFormatter={(d: number) => `D${d}`}
            />
            <YAxis
              tick={{ fill: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}
              stroke={GRID}
            />
            <Tooltip
              cursor={{ stroke: "rgba(120, 160, 255, 0.3)" }}
              contentStyle={{
                background: "#0E1626",
                border: "1px solid rgba(120, 160, 255, 0.12)",
                borderRadius: 10,
                color: "#E8EEF9",
                fontFamily: "JetBrains Mono, monospace",
              }}
              labelFormatter={(d: number) => `Day ${d}`}
              formatter={(v: number) => [formatNumber(v, 1), "projected stock"]}
            />
            {/* Safety stock dashed threshold — amber, clearly visible */}
            <ReferenceLine
              y={inv.safety_stock}
              stroke={AMBER}
              strokeOpacity={0.7}
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: "Safety stock",
                position: "insideTopRight",
                fill: AMBER,
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
                opacity: 0.9,
              }}
              data-testid="safety-ref"
            />
            {/* Stockout annotation as ReferenceDot at (cover_days, 0) */}
            {showStockoutMarker && (
              <ReferenceDot
                x={inv.cover_days}
                y={0}
                r={5}
                fill={ROSE}
                stroke="none"
                label={{
                  value: `Day ${inv.cover_days} — stockout`,
                  position: "insideTopLeft",
                  fill: ROSE,
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "JetBrains Mono, monospace",
                }}
                data-testid="stockout-ref"
              />
            )}
            {/* Safe segment — cyan */}
            <Line
              type="monotone"
              dataKey="safe"
              stroke={CYAN}
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={!reduce}
              style={{ filter: `drop-shadow(0 0 6px ${CYAN})` }}
              data-testid="stock-line-safe"
            />
            {/* Danger segment — rose dashed */}
            <Line
              type="monotone"
              dataKey="danger"
              stroke={ROSE}
              strokeWidth={2.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls={false}
              isAnimationActive={!reduce}
              style={{ filter: `drop-shadow(0 0 6px ${ROSE})` }}
              data-testid="stock-line-danger"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* (c) Reorder card */}
      <div
        className="rounded-[14px] p-4"
        style={{ border: "1px solid var(--border-glass)", background: "rgba(18, 26, 44, 0.4)" }}
        data-testid="reorder-card"
      >
        <div className="flex flex-col">
          <span className="text-[12px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
            Recommended order qty
          </span>
          <span
            className="leading-none"
            style={{
              color: "#E8EEF9",
              fontFamily: "JetBrains Mono, monospace",
              fontVariantNumeric: "tabular-nums",
              fontSize: 36,
              fontWeight: 600,
            }}
            data-testid="reorder-qty"
          >
            {reduce ? (
              formatNumber(inv.recommended_order_qty, 0)
            ) : (
              <CountUp end={inv.recommended_order_qty} duration={0.8} separator="," />
            )}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <Figure label="On hand"       value={formatNumber(inv.on_hand, 0)} />
          <Figure label="Reorder point" value={formatNumber(inv.reorder_point, 1)} />
          <Figure label="28-day demand" value={formatNumber(inv.horizon_demand, 1)} />
        </div>

        <p className="mt-3 text-[11px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
          Simulated reorder model — illustrative.
        </p>
      </div>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
        {label}
      </span>
      <span
        style={{
          color: "#E8EEF9",
          fontFamily: "JetBrains Mono, monospace",
          fontVariantNumeric: "tabular-nums",
          fontSize: 16,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default InventoryRiskPanel;
