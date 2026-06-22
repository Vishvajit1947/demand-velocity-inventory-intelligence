/**
 * InventoryRiskPanel — P4 Inventory Risk (PRIMARY OBJECTIVE).
 * MT-42 edit: added `loading?` + `result?` props + PanelState wrapper (06 §5).
 *
 * (a) Stockout-risk StatusBadge + optional "Overstock" pill.
 * (b) Recharts LineChart of projected_stock[28] split into safe (cyan) / danger (rose dashed).
 * (c) Reorder card: count-up recommended_order_qty + figures.
 * 06 §4 P6, §2 tokens, §7 libs, §2 Motion, §6 a11y.
 */
import { useMemo, useRef, useState, useEffect } from "react";
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

// ── Design tokens ─────────────────────────────────────────────────────────────
const CYAN   = "var(--accent-cyan)";
const AMBER  = "var(--accent-amber)";
const ROSE   = "var(--accent-rose)";
const VIOLET = "#8B5CFF";
const MUTED  = "#8A97B2";
const GRID   = "rgba(120, 160, 255, 0.08)";

// LineChart internal margins — must match the <LineChart margin={...}> below
const MARGIN = { top: 16, right: 12, bottom: 30, left: 28 };
// Approximate YAxis rendered width (Recharts default ~60px minus our left offset)
const YAXIS_W = 48;

interface StockRow { day: number; safe: number | null; danger: number | null }

export interface InventoryRiskPanelProps {
  result?: ForecastResult;
  loading?: boolean;
}

export function InventoryRiskPanel({ result, loading = false }: InventoryRiskPanelProps) {
  const skeleton = (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-[160px] w-full rounded-card" />
      <Skeleton className="h-16 w-40 rounded-card" />
    </div>
  );

  return (
    <GlassPanel animate={false}>
      <div className="flex h-full flex-col gap-3" data-testid="inventory-risk-panel">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SectionTitle title="Inventory Risk" className="mb-0" />
            <span
              style={{
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 9999,
                background: "rgba(255,194,77,0.15)",
                color: "var(--accent-amber)",
                border: "1px solid rgba(255,194,77,0.3)",
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
        <PanelState loading={loading} hasData={!!result} skeleton={skeleton} minHeight={0}>
          {result && <InventoryRiskContent result={result} />}
        </PanelState>
      </div>
    </GlassPanel>
  );
}

function InventoryRiskContent({ result }: { result: ForecastResult }) {
  const reduce = useReducedMotion();
  const inv = result.inventory;

  // Measure the chart wrapper so we can compute pixel position from data coords
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [wrapperWidth, setWrapperWidth] = useState(0);
  const [wrapperHeight, setWrapperHeight] = useState(200);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWrapperWidth(entry.contentRect.width);
      setWrapperHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo<StockRow[]>(() => {
    const stock = inv.projected_stock ?? [];
    const safety = inv.safety_stock;
    const crossIdx = stock.findIndex((s) => s <= safety);
    return stock.map((s, i) => {
      const inDanger = crossIdx >= 0 && i >= crossIdx;
      return {
        day: i + 1,
        safe: !inDanger || i === crossIdx ? s : null,
        danger: inDanger ? s : null,
      };
    });
  }, [inv.projected_stock, inv.safety_stock]);

  const showStockoutMarker = inv.cover_days <= 28;

  // ── Compute label pixel position from data coordinates ────────────────────
  // Plot area = wrapper minus margins and YAxis width
  const plotW = Math.max(0, wrapperWidth - MARGIN.left - MARGIN.right - YAXIS_W);
  const plotH = Math.max(0, wrapperHeight - MARGIN.top - MARGIN.bottom);

  const totalDays = rows.length; // typically 28
  // x: map cover_days (1-based) to pixel — Recharts spaces ticks evenly
  const dotX = totalDays > 1
    ? MARGIN.left + YAXIS_W + ((inv.cover_days - 1) / (totalDays - 1)) * plotW
    : MARGIN.left + YAXIS_W;

  // y: map value 0 to pixel within the plot area
  const allValues = (inv.projected_stock ?? []).filter(Boolean) as number[];
  const yMin = Math.min(...allValues, inv.safety_stock);
  const yMax = Math.max(...allValues);
  const yRange = yMax - yMin || 1;
  // value=0 mapped to pixel (0 at top, plotH at bottom)
  const dotY = MARGIN.top + ((yMax - 0) / yRange) * plotH;

  // Label sits 44px above the dot
  const LABEL_OFFSET = 44;
  const labelTop = Math.max(4, dotY - LABEL_OFFSET);

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:gap-6">

      {/* (a) Risk badge + chart ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 flex-1 min-w-0">
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

        {/* Chart wrapper — position:relative so the HTML label overlay works */}
        <div
          ref={wrapperRef}
          style={{ width: "100%", height: 200, position: "relative" }}
          data-testid="projected-stock-chart"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={MARGIN}>
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
                cursor={false}
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
              {/* Safety stock threshold */}
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
              {/* Stockout dot — plain ReferenceDot, no label (label is HTML overlay below) */}
              {showStockoutMarker && (
                <ReferenceDot
                  x={inv.cover_days}
                  y={0}
                  r={5}
                  fill={ROSE}
                  stroke="#0E1626"
                  strokeWidth={1.5}
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

          {/* ── Stockout label — HTML overlay, never clipped by SVG ── */}
          {showStockoutMarker && wrapperWidth > 0 && (
            <div
              style={{
                position: "absolute",
                left: dotX,
                top: labelTop,
                transform: "translateX(-50%)",
                pointerEvents: "none",
                zIndex: 10,
                textAlign: "center",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  background: "rgba(14,22,38,0.92)",
                  border: "1px solid rgba(255,92,122,0.5)",
                  borderRadius: 6,
                  color: "#FF9EAE",
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "JetBrains Mono, monospace",
                  padding: "3px 8px",
                  whiteSpace: "nowrap",
                  lineHeight: 1.4,
                }}
              >
                Day {inv.cover_days} — stockout
              </span>
            </div>
          )}
        </div>
      </div>

      {/* (b) Reorder card ─────────────────────────────────────────────────── */}
      <div
        className="rounded-[14px] p-5 flex flex-col justify-center shrink-0 xl:w-[280px]"
        style={{ border: "1px solid var(--border-glass)", background: "rgba(18, 26, 44, 0.4)" }}
        data-testid="reorder-card"
      >
        <span className="text-[11px] mb-1" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
          Recommended order qty
        </span>
        <span
          className="leading-none mb-4"
          style={{
            color: "var(--accent-lime)",
            fontFamily: "JetBrains Mono, monospace",
            fontVariantNumeric: "tabular-nums",
            fontSize: 48,
            fontWeight: 700,
            textShadow: "0 0 24px rgba(77,255,176,0.35)",
          }}
          data-testid="reorder-qty"
        >
          {reduce ? (
            formatNumber(inv.recommended_order_qty, 0)
          ) : (
            <CountUp end={inv.recommended_order_qty} duration={0.8} separator="," />
          )}{" "}
          <span style={{ fontSize: 22, fontWeight: 400, color: "var(--text-muted)" }}>units</span>
        </span>

        <div className="grid grid-cols-3 gap-3">
          <Figure label="On hand"    value={formatNumber(inv.on_hand, 0)} />
          <Figure label="Reorder pt" value={formatNumber(inv.reorder_point, 1)} />
          <Figure label="28d demand" value={formatNumber(inv.horizon_demand, 1)} />
        </div>

        <p className="mt-4 text-[10px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
          Simulated reorder model — illustrative.
        </p>
      </div>
    </div>
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
