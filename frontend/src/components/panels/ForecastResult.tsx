/**
 * ForecastResult — hero line chart: actual vs forecast demand (MT-34).
 * MT-42 edit: added `loading` prop + PanelState wrapper (06 §5).
 * 06 §4 "P2 — Forecast Result"; §2 tokens/motion; §3 multi-product + ProductSwitcher.
 * MT-50 edit: added Normalized/Absolute view mode toggle for multi-product comparison.
 * MT-51 edit: semantic per-product colors (PRODUCT_COLORS) replace generic accent rotation.
 * Pure presentational — data passed as props from App (MT-32); no fetching here.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { GlassPanel } from "../ui/GlassPanel";
import { SectionTitle } from "../ui/SectionTitle";
import { ProductSwitcher } from "../ui/ProductSwitcher";
import { Skeleton } from "../ui/Skeleton";
import { PanelState } from "../ui/PanelState";
import type { ForecastResult as ForecastResultData } from "../../lib/types";
import { formatDate, formatNumber } from "../../lib/format";
import { productColor, PRODUCT_COLORS } from "../../lib/constants";

/** Cyan ground-truth line for the Actual series — never changes (MT-51). */
const ACTUAL_COLOR = "#2FE6FF";

// ── Props ────────────────────────────────────────────────────────────────────
export interface ForecastResultProps {
  /** All ForecastResult objects returned by POST /api/forecast (05 §5). */
  results: ForecastResultData[];
  /** The currently active product's series_id — drives the Actual line + sibling panels. */
  activeSeriesId?: string;
  /** Notify App when the user switches the active product. */
  onActiveChange?: (seriesId: string) => void;
  /** Top-level start_date from the forecast response (the "now" divider). */
  startDate: string;
  /** MT-42: True while the POST /api/forecast mutation is in flight (06 §5 Loading). */
  loading?: boolean;
}

// ── Internal chart row type ──────────────────────────────────────────────────
type Row = {
  date: string;
  actual: number | null;
  forecast: number | null;
  [k: string]: number | null | string;
};

// ── Component ────────────────────────────────────────────────────────────────
export function ForecastResult({
  results,
  activeSeriesId,
  onActiveChange,
  startDate,
  loading = false,
}: ForecastResultProps) {
  // legend visibility: keys are "actual" and "forecast_<series_id>"
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // ── View mode: default absolute; user can switch at any time ───────────
  const [viewMode, setViewMode] = useState<"normalized" | "absolute">("absolute");
  // Track the user's manual override so we don't clobber their choice on re-render
  const [userOverride, setUserOverride] = useState(false);

  useEffect(() => {
    // Auto-switch to normalized only when multiple products are loaded and
    // the user hasn't manually chosen a mode yet.
    if (!userOverride && results.length > 1) {
      setViewMode("normalized");
    }
  }, [results.length, userOverride]);

  const hasData = results.length > 0;
  // skeleton: one tall block (MT-42, 06 §5 Loading)
  const skeleton = <Skeleton className="h-[320px] w-full rounded-card" />;

  // Resolve active product (only needed when hasData)
  const active = hasData
    ? (results.find((r) => r.series_id === activeSeriesId) ?? results[0])
    : null;
  const isMulti = results.length > 1;

  function handleToggle(mode: "normalized" | "absolute") {
    setViewMode(mode);
    setUserOverride(true);
  }

  return (
    <GlassPanel animate={false} className="flex flex-col">
      {/* ── Panel header — always visible ─────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SectionTitle title="Forecast Result" className="mb-0" />
          {/* ── Normalized / Absolute toggle (MT-50) ─────────────────── */}
          {hasData && (
            <div
              style={{
                display: "flex",
                gap: 0,
                border: "1px solid var(--border-glass)",
                borderRadius: "9999px",
                overflow: "hidden",
                fontSize: "11px",
              }}
              role="group"
              aria-label="Chart view mode"
            >
              <button
                type="button"
                onClick={() => handleToggle("normalized")}
                style={{
                  padding: "3px 12px",
                  background:
                    viewMode === "normalized" ? "var(--accent-cyan)" : "transparent",
                  color:
                    viewMode === "normalized" ? "#000" : "var(--text-muted)",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                Normalized
              </button>
              <button
                type="button"
                onClick={() => handleToggle("absolute")}
                style={{
                  padding: "3px 12px",
                  background:
                    viewMode === "absolute" ? "var(--accent-cyan)" : "transparent",
                  color:
                    viewMode === "absolute" ? "#000" : "var(--text-muted)",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                Absolute
              </button>
            </div>
          )}
        </div>

        {hasData && isMulti && active && (
          <ProductSwitcher
            options={results.map((r) => ({ id: r.series_id, label: r.product_name }))}
            value={active.series_id}
            onChange={(id) => onActiveChange?.(id)}
            colors={PRODUCT_COLORS}
          />
        )}
      </div>

      {/* ── Absolute mode + multi-product warning (MT-50 Change 8) ─────── */}
      {hasData && viewMode === "absolute" && isMulti && (
        <p
          style={{
            fontSize: "11px",
            color: "var(--accent-amber)",
            padding: "4px 0",
            marginBottom: "4px",
          }}
        >
          ⚠ Products have different volume scales — shapes may be misleading.
          Switch to Normalized for fair comparison.
        </p>
      )}

      {/* MT-42: PanelState for Loading / Idle / Success states */}
      <PanelState
        loading={loading}
        hasData={hasData}
        skeleton={skeleton}
        minHeight={360}
      >
        {/* Only rendered when hasData=true — active is guaranteed non-null here */}
        {active && (
          <ChartBody
            results={results}
            active={active}
            isMulti={isMulti}
            startDate={startDate}
            hidden={hidden}
            setHidden={setHidden}
            viewMode={viewMode}
          />
        )}
      </PanelState>
    </GlassPanel>
  );
}

// ── Chart body — only rendered on Success (hasData=true) ────────────────────
interface ChartBodyProps {
  results: ForecastResultData[];
  active: ForecastResultData;
  isMulti: boolean;
  startDate: string;
  hidden: Set<string>;
  setHidden: React.Dispatch<React.SetStateAction<Set<string>>>;
  viewMode: "normalized" | "absolute";
}

/** Compute per-product mean from non-zero history units (guarded against division by zero). */
function historyBaseline(units: number[]): number {
  const nonZero = units.filter((u) => u !== 0);
  const source = nonZero.length > 0 ? nonZero : units;
  const sum = source.reduce((acc, v) => acc + v, 0);
  return Math.max(source.length > 0 ? sum / source.length : 0, 0.001);
}

/** % deviation from baseline: ((v - base) / base) * 100 */
function normalise(v: number, base: number): number {
  return ((v - base) / base) * 100;
}

function ChartBody({
  results,
  active,
  isMulti,
  startDate,
  hidden,
  setHidden,
  viewMode,
}: ChartBodyProps) {
  const reducedMotion = useReducedMotion();

  // ── Pre-compute per-product baselines (MT-50 Change 2) ──────────────────
  const baselines = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    results.forEach((r) => {
      map[r.series_id] = historyBaseline(r.history.units);
    });
    return map;
  }, [results]);

  // ── Raw rows ref — kept in parallel for tooltip raw-value lookup ─────────
  // rawRows[rowIndex][dataKey] = raw number | null
  const rawRowsRef = useRef<Array<Record<string, number | null | string>>>([]);

  // ── Build unified x-axis rows (06 §4): 84 history + 28 horizon = 112 ────
  const rows = useMemo<Row[]>(() => {
    const byDate = new Map<string, Row>();
    const rawByDate = new Map<string, Record<string, number | null | string>>();

    // Helper to ensure raw mirror row exists
    function ensureRaw(d: string): Record<string, number | null | string> {
      if (!rawByDate.has(d)) rawByDate.set(d, { date: d });
      return rawByDate.get(d)!;
    }

    const activeBase = baselines[active.series_id] ?? 0.001;
    const isNorm = viewMode === "normalized";

    // 1) History rows for the active product → actual = units[i], forecast = null
    active.history.dates.forEach((d, i) => {
      const raw = active.history.units[i] ?? null;
      byDate.set(d, {
        date: d,
        actual: raw !== null && isNorm ? normalise(raw, activeBase) : raw,
        forecast: null,
      });
      const rawRow = ensureRaw(d);
      rawRow["actual"] = raw;
      rawRow["forecast"] = null;
    });

    // 2) Horizon rows → actual = actual[i], forecast = forecast[i]
    active.horizon_dates.forEach((d, i) => {
      const existing = byDate.get(d);
      const rawActual = active.actual[i] ?? null;
      const rawForecast = active.forecast[i] ?? null;
      const row: Row = existing ?? { date: d, actual: null, forecast: null };
      row.actual =
        rawActual !== null && isNorm ? normalise(rawActual, activeBase) : rawActual;
      row.forecast =
        rawForecast !== null && isNorm ? normalise(rawForecast, activeBase) : rawForecast;
      byDate.set(d, row);

      const rawRow = ensureRaw(d);
      rawRow["actual"] = rawActual;
      rawRow["forecast"] = rawForecast;
    });

    // 3) Per-product forecast columns for multi overlay
    results.forEach((r) => {
      const base = baselines[r.series_id] ?? 0.001;
      r.horizon_dates.forEach((d, i) => {
        const existing = byDate.get(d);
        const row: Row = existing ?? { date: d, actual: null, forecast: null };
        const rawVal = r.forecast[i] ?? null;
        const displayVal =
          rawVal !== null && isNorm ? normalise(rawVal, base) : rawVal;
        (row as Row)[`forecast_${r.series_id}`] = displayVal;
        byDate.set(d, row);

        const rawRow = ensureRaw(d);
        rawRow[`forecast_${r.series_id}`] = rawVal;
      });
    });

    const sortedRows = Array.from(byDate.values()).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );

    // Sync raw rows ref in same order
    const rawSorted = sortedRows.map((row) => rawByDate.get(row.date) ?? { date: row.date });
    rawRowsRef.current = rawSorted;

    return sortedRows;
  }, [results, active, baselines, viewMode]);

  const lastHorizonDate = active.horizon_dates[active.horizon_dates.length - 1];

  // Thin x-axis ticks: every 14th date + always include startDate + last horizon
  const xTicks = useMemo(() => {
    const base = rows.filter((_, i) => i % 14 === 0).map((r) => r.date);
    const extra = [startDate, lastHorizonDate];
    return Array.from(new Set([...base, ...extra])).sort();
  }, [rows, startDate, lastHorizonDate]);

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const isNorm = viewMode === "normalized";

  // ── Compute explicit Y domain from row data so Recharts can't get stuck ──
  // In normalized mode: scan every numeric cell across all series keys; pad 10%
  const yDomain = useMemo<[number, number] | [number, string]>(() => {
    if (!isNorm) return [0, "auto"];
    const numericKeys = ["actual", "forecast", ...results.map((r) => `forecast_${r.series_id}`)];
    let lo = Infinity;
    let hi = -Infinity;
    rows.forEach((row) => {
      numericKeys.forEach((k) => {
        const v = row[k];
        if (typeof v === "number" && isFinite(v)) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      });
    });
    if (!isFinite(lo) || !isFinite(hi)) return [-100, 100];
    const pad = Math.max((hi - lo) * 0.1, 5);
    return [Math.floor(lo - pad), Math.ceil(hi + pad)];
  }, [isNorm, rows, results]);

  return (
    <>
      {/* ── Custom legend with toggle (06 §4 + MT-50 Change 7) ────────── */}
      <div className="mb-2 flex flex-wrap gap-3" role="list" aria-label="Chart series legend">
        <LegendItem
          color={ACTUAL_COLOR}
          label="Actual"
          dimmed={hidden.has("actual")}
          onClick={() => toggle("actual")}
        />
        {(isMulti ? results : [active]).map((r, idx) => {
          const key = `forecast_${r.series_id}`;
          // Append baseline mean in normalized mode (MT-50 Change 7)
          const baseMean = baselines[r.series_id];
          const baseLabel =
            isNorm && baseMean != null
              ? ` (avg ${Math.round(baseMean)}u)`
              : "";
          const label = isMulti
            ? `${r.product_name}${baseLabel} (forecast)`
            : `Forecast${baseLabel}`;
          return (
            <LegendItem
              key={key}
              color={productColor(r.series_id, idx)}
              label={label}
              dimmed={hidden.has(key)}
              onClick={() => toggle(key)}
            />
          );
        })}
      </div>

      {/* ── Chart ──────────────────────────────────────────────────────── */}
      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart key={viewMode} data={rows} margin={{ top: 28, right: 16, bottom: 8, left: 0 }}>
            <defs>
              <filter id="forecast-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <CartesianGrid stroke="var(--grid-line)" vertical={false} />

            <XAxis
              dataKey="date"
              ticks={xTicks}
              tickFormatter={(d: string) => formatDate(d)}
              tick={{
                fill: "var(--text-muted)",
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
              }}
              stroke="var(--border-glass)"
              minTickGap={20}
            />

            {/* ── Y-axis: different label + formatter per mode (Change 4) */}
            <YAxis
              tick={{
                fill: "var(--text-muted)",
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
              }}
              stroke="var(--border-glass)"
              allowDecimals={isNorm}
              domain={yDomain}
              tickFormatter={
                isNorm
                  ? (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}%`
                  : (v: number) => v.toLocaleString()
              }
              label={{
                value: isNorm ? "% vs product mean" : "units / day",
                angle: -90,
                position: "insideLeft",
                offset: 12,
                style: {
                  fill: "var(--text-muted)",
                  fontSize: 10,
                  fontFamily: "JetBrains Mono, monospace",
                },
              }}
            />

            <Tooltip
              content={
                <ForecastTooltip
                  viewMode={viewMode}
                  rawRowsRef={rawRowsRef}
                  rows={rows}
                  results={results}
                  isMulti={isMulti}
                />
              }
              cursor={{ stroke: "var(--accent-violet)", strokeOpacity: 0.3 }}
            />

            {/* Shaded horizon region (06 §4) */}
            <ReferenceArea
              x1={startDate}
              x2={lastHorizonDate}
              fill="var(--accent-cyan)"
              fillOpacity={0.06}
            />

            {/* "now" vertical divider (06 §4) */}
            <ReferenceLine
              x={startDate}
              stroke="var(--accent-violet)"
              strokeDasharray="4 4"
              label={{
                value: "now",
                fill: "#e2e8f0",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "JetBrains Mono, monospace",
                position: "insideTopRight",
                offset: 6,
              }}
            />

            {/* ── Zero reference line in normalized mode (Change 4) ───── */}
            {isNorm && (
              <ReferenceLine
                y={0}
                stroke="#facc15"
                strokeOpacity={0.5}
                strokeDasharray="4 3"
              />
            )}

            {/* Actual series: bright cyan ground-truth line (MT-51) */}
            {!hidden.has("actual") && (
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke={ACTUAL_COLOR}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={!reducedMotion}
                animationDuration={900}
              />
            )}

            {/* Forecast line(s): semantic product colors (MT-51) */}
            {(isMulti
              ? results.map((r, idx) => ({ r, idx }))
              : [{ r: active, idx: 0 }]
            ).map(({ r, idx }) => {
              const dataKey = isMulti ? `forecast_${r.series_id}` : "forecast";
              if (hidden.has(`forecast_${r.series_id}`)) return null;
              const isActiveLine = r.series_id === active.series_id;
              const lineColor = productColor(r.series_id, idx);
              return (
                <Line
                  key={dataKey}
                  type="monotone"
                  dataKey={dataKey}
                  name={isMulti ? r.product_name : "Forecast"}
                  stroke={lineColor}
                  strokeWidth={isActiveLine ? 2.5 : 2}
                  dot={false}
                  connectNulls={false}
                  filter={isActiveLine ? "url(#forecast-glow)" : undefined}
                  isAnimationActive={!reducedMotion}
                  animationDuration={900}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Normalized footer: product avg key ──────────────────────────── */}
      {isNorm && (
        <div
          className="mt-2 flex items-center gap-2"
          style={{ paddingLeft: 4 }}
        >
          <svg width="22" height="10" aria-hidden="true" style={{ flexShrink: 0 }}>
            <line
              x1="0" y1="5" x2="22" y2="5"
              stroke="#facc15"
              strokeWidth="1.5"
              strokeDasharray="3 2"
            />
          </svg>
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            dashed line = product avg (0% baseline)
          </span>
        </div>
      )}
    </>
  );
}

// ── Legend item ──────────────────────────────────────────────────────────────
interface LegendItemProps {
  color: string;
  label: string;
  dimmed: boolean;
  onClick: () => void;
}

function LegendItem({ color, label, dimmed, onClick }: LegendItemProps) {
  return (
    <button
      type="button"
      role="listitem"
      onClick={onClick}
      aria-pressed={!dimmed}
      className={[
        "flex items-center gap-2 text-caption transition-opacity focus:outline-none",
        "focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)] rounded",
        dimmed ? "opacity-40" : "opacity-100",
      ].join(" ")}
    >
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
        aria-hidden="true"
      />
      <span className="text-[var(--text-primary)]">{label}</span>
    </button>
  );
}

// ── Custom tooltip (06 §4 + MT-50 Change 5) ──────────────────────────────────
interface TooltipPayloadEntry {
  dataKey: string;
  value: number | null;
  name?: string;
  color?: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  viewMode: "normalized" | "absolute";
  rawRowsRef: React.MutableRefObject<Array<Record<string, number | null | string>>>;
  rows: Row[];
  results: ForecastResultData[];
  isMulti: boolean;
}

function ForecastTooltip({
  active,
  payload,
  label,
  viewMode,
  rawRowsRef,
  rows,
  results,
  isMulti,
}: TooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) return null;

  const isNorm = viewMode === "normalized";

  // Find the index of this date in rows to look up raw values
  const rowIdx = rows.findIndex((r) => r.date === label);
  const rawRow = rowIdx >= 0 ? rawRowsRef.current[rowIdx] : null;

  // Build lookup maps: dataKey → { productName, seriesId, idx }
  const seriesMap: Record<string, { name: string; seriesId: string; idx: number }> = {};
  results.forEach((r, idx) => {
    seriesMap[`forecast_${r.series_id}`] = { name: r.product_name, seriesId: r.series_id, idx };
    seriesMap["forecast"] = { name: "Forecast", seriesId: r.series_id, idx };
  });
  seriesMap["actual"] = { name: "Actual", seriesId: "__actual__", idx: -1 };

  if (isNorm) {
    // Normalized tooltip: show % + raw for each series
    const entries = payload.filter((p) => p.value != null);
    if (entries.length === 0) return null;

    return (
      <div
        className={[
          "rounded-[10px] border border-[var(--border-glass)]",
          "bg-[var(--bg-panel-solid)] px-3 py-2 text-caption",
          "shadow-[0_8px_40px_rgba(0,0,0,0.45)]",
        ].join(" ")}
        style={{ maxWidth: 260 }}
      >
        <p
          className="mb-1 font-[JetBrains_Mono] text-[var(--text-muted)]"
          style={{ fontSize: 11 }}
        >
          {formatDate(label, "medium")}
        </p>
        {entries.map((p) => {
          const pctVal = typeof p.value === "number" ? p.value : null;
          const rawVal = rawRow ? (rawRow[p.dataKey] as number | null) : null;
          const meta = seriesMap[p.dataKey];
          const productName = meta?.name ?? p.name ?? p.dataKey;
          // Use product color for the % value; actual stays cyan
          const valueColor =
            p.dataKey === "actual"
              ? ACTUAL_COLOR
              : productColor(meta?.seriesId ?? "", meta?.idx ?? 0);
          if (pctVal == null) return null;
          return (
            <div key={p.dataKey} style={{ marginBottom: 6 }}>
              <div style={{ color: valueColor, fontSize: 11, fontWeight: 600 }}>
                {productName}
              </div>
              <div style={{ color: valueColor, fontFamily: "JetBrains Mono, monospace" }}>
                {pctVal > 0 ? "+" : ""}
                {pctVal.toFixed(1)}% vs avg
              </div>
              {rawVal != null && (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  Raw: {rawVal.toFixed(1)} units
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Absolute mode: show all non-null series with product colors ──────────
  const entries = payload.filter((p) => p.value != null);
  if (entries.length === 0) return null;

  // Single-product mode: keep the compact original layout
  if (!isMulti) {
    const actualEntry = entries.find((p) => p.dataKey === "actual");
    const forecastEntry = entries.find(
      (p) =>
        p.dataKey === "forecast" ||
        (typeof p.dataKey === "string" && p.dataKey.startsWith("forecast_")),
    );
    const actualVal = actualEntry?.value ?? null;
    const forecastVal = forecastEntry?.value ?? null;
    if (actualVal == null && forecastVal == null) return null;

    const fMeta = forecastEntry ? seriesMap[forecastEntry.dataKey] : null;
    const fColor = fMeta
      ? productColor(fMeta.seriesId, fMeta.idx)
      : "var(--accent-cyan)";

    return (
      <div
        className={[
          "rounded-[10px] border border-[var(--border-glass)]",
          "bg-[var(--bg-panel-solid)] px-3 py-2 text-caption",
          "shadow-[0_8px_40px_rgba(0,0,0,0.45)]",
        ].join(" ")}
      >
        <p className="mb-1 font-[JetBrains_Mono] text-[var(--text-muted)]">
          {formatDate(label, "medium")}
        </p>
        {actualVal != null && (
          <p className="text-[var(--text-primary)]">
            Actual:{" "}
            <span className="font-[JetBrains_Mono]">{formatNumber(actualVal)}</span>
          </p>
        )}
        {forecastVal != null && (
          <p style={{ color: fColor }}>
            Forecast:{" "}
            <span className="font-[JetBrains_Mono]">{formatNumber(forecastVal, 1)}</span>
          </p>
        )}
      </div>
    );
  }

  // Multi-product absolute tooltip: one row per product
  return (
    <div
      className={[
        "rounded-[10px] border border-[var(--border-glass)]",
        "bg-[var(--bg-panel-solid)] px-3 py-2 text-caption",
        "shadow-[0_8px_40px_rgba(0,0,0,0.45)]",
      ].join(" ")}
      style={{ maxWidth: 260 }}
    >
      <p className="mb-1 font-[JetBrains_Mono] text-[var(--text-muted)]">
        {formatDate(label, "medium")}
      </p>
      {entries.map((p) => {
        const val = p.value;
        if (val == null) return null;
        const meta = seriesMap[p.dataKey];
        const name = meta?.name ?? p.name ?? p.dataKey;
        const color =
          p.dataKey === "actual"
            ? ACTUAL_COLOR
            : productColor(meta?.seriesId ?? "", meta?.idx ?? 0);
        return (
          <div key={p.dataKey} style={{ color, marginBottom: 2 }}>
            <span style={{ fontWeight: 600 }}>{name}: </span>
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {formatNumber(val, 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default ForecastResult;
