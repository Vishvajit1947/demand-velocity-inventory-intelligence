/**
 * ForecastResult — hero line chart: actual vs forecast demand (MT-34).
 * 06 §4 "P2 — Forecast Result"; §2 tokens/motion; §3 multi-product + ProductSwitcher.
 * Pure presentational — data passed as props from App (MT-32); no fetching here.
 */
import { useMemo, useState } from "react";
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
import type { ForecastResult as ForecastResultData } from "../../lib/types";
import { formatDate, formatNumber } from "../../lib/format";

// ── Accent rotation for multi-product forecast lines (06 §2 accents) ────────
const ACCENTS = [
  "var(--accent-cyan)",
  "var(--accent-violet)",
  "var(--accent-lime)",
  "var(--accent-amber)",
  "var(--accent-rose)",
  "#5AA0FF",
  "#FF9E5C",
  "#B45CFF",
] as const;

/** "muted-cyan" for the Actual series — dimmed cyan at reduced saturation (06 §4). */
const MUTED_CYAN = "#7FD8E8";

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
}: ForecastResultProps) {
  const reducedMotion = useReducedMotion();
  // legend visibility: keys are "actual" and "forecast_<series_id>"
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // ── Empty / idle state (06 §5) ───────────────────────────────────────────
  if (!results || results.length === 0) {
    return (
      <GlassPanel className="flex h-[420px] flex-col">
        <SectionTitle title="Forecast Result" />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-body text-[var(--text-muted)]">
            Select a date &amp; products, then Forecast.
          </p>
        </div>
      </GlassPanel>
    );
  }

  // Resolve the active product (fall back to first if not found)
  const active =
    results.find((r) => r.series_id === activeSeriesId) ?? results[0];

  const isMulti = results.length > 1;

  // ── Build unified x-axis rows (06 §4): 84 history + 28 horizon = 112 ────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const rows = useMemo<Row[]>(() => {
    const byDate = new Map<string, Row>();

    // 1) History rows for the active product → actual = units[i], forecast = null
    active.history.dates.forEach((d, i) => {
      byDate.set(d, {
        date: d,
        actual: active.history.units[i] ?? null,
        forecast: null,
      });
    });

    // 2) Horizon rows for the active product → actual = actual[i], forecast = forecast[i]
    active.horizon_dates.forEach((d, i) => {
      const existing = byDate.get(d);
      const row: Row = existing ?? { date: d, actual: null, forecast: null };
      row.actual = active.actual[i] ?? null;
      row.forecast = active.forecast[i] ?? null;
      byDate.set(d, row);
    });

    // 3) Add per-product forecast columns for the multi overlay
    //    key = `forecast_<series_id>`, history rows remain null (connectNulls=false)
    results.forEach((r) => {
      r.horizon_dates.forEach((d, i) => {
        const existing = byDate.get(d);
        const row: Row = existing ?? { date: d, actual: null, forecast: null };
        (row as Row)[`forecast_${r.series_id}`] = r.forecast[i] ?? null;
        byDate.set(d, row);
      });
    });

    return Array.from(byDate.values()).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
  }, [results, active]);

  const lastHorizonDate =
    active.horizon_dates[active.horizon_dates.length - 1];

  // Thin x-axis ticks: show every 14th date + always include startDate + last horizon
  const xTicks = useMemo(() => {
    const base = rows
      .filter((_, i) => i % 14 === 0)
      .map((r) => r.date);
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

  // ProductSwitcher options
  const switcherOptions = results.map((r) => ({
    id: r.series_id,
    label: r.product_name,
  }));

  return (
    <GlassPanel className="flex flex-col">
      {/* ── Panel header ──────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <SectionTitle
          title="Forecast Result"
          className="mb-0"
        />
        {isMulti && (
          <ProductSwitcher
            options={switcherOptions}
            value={active.series_id}
            onChange={(id) => onActiveChange?.(id)}
          />
        )}
      </div>

      {/* ── Custom legend with toggle (06 §4) ────────────────────────── */}
      <div className="mb-2 flex flex-wrap gap-3" role="list" aria-label="Chart series legend">
        <LegendItem
          color={MUTED_CYAN}
          label="Actual"
          dimmed={hidden.has("actual")}
          onClick={() => toggle("actual")}
        />
        {(isMulti ? results : [active]).map((r, idx) => {
          const key = `forecast_${r.series_id}`;
          const label = isMulti ? `${r.product_name} (forecast)` : "Forecast";
          return (
            <LegendItem
              key={key}
              color={ACCENTS[idx % ACCENTS.length]}
              label={label}
              dimmed={hidden.has(key)}
              onClick={() => toggle(key)}
            />
          );
        })}
      </div>

      {/* ── Chart ─────────────────────────────────────────────────────── */}
      {/* Fixed height prevents layout shift (06 §6) */}
      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            {/* SVG glow filter for the active forecast line (06 §2 "Glow utility") */}
            <defs>
              <filter
                id="forecast-glow"
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
              >
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

            <YAxis
              tick={{
                fill: "var(--text-muted)",
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
              }}
              stroke="var(--border-glass)"
              allowDecimals={false}
              domain={[0, "auto"]}
            />

            <Tooltip
              content={<ForecastTooltip />}
              cursor={{ stroke: "var(--accent-violet)", strokeOpacity: 0.3 }}
            />

            {/* Shaded horizon region (06 §4) */}
            <ReferenceArea
              x1={startDate}
              x2={lastHorizonDate}
              fill="var(--accent-cyan)"
              fillOpacity={0.06}
              ifOverflow="extendDomain"
            />

            {/* "now" vertical divider (06 §4) */}
            <ReferenceLine
              x={startDate}
              stroke="var(--accent-violet)"
              strokeDasharray="4 4"
              label={{
                value: "now",
                fill: "var(--accent-violet)",
                fontSize: 11,
                position: "top",
              }}
            />

            {/* ── Actual series: solid muted-cyan, all 112 points (06 §4) ── */}
            {!hidden.has("actual") && (
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke={MUTED_CYAN}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={!reducedMotion}
                animationDuration={900}
              />
            )}

            {/* ── Forecast line(s): horizon-only, connectNulls=false (06 §4) */}
            {(isMulti
              ? results.map((r, idx) => ({ r, idx }))
              : [{ r: active, idx: 0 }]
            ).map(({ r, idx }) => {
              // In single-product mode the column name is "forecast" (built by the
              // active-product horizon loop); in multi mode it's "forecast_<series_id>".
              const dataKey = isMulti ? `forecast_${r.series_id}` : "forecast";
              if (hidden.has(`forecast_${r.series_id}`)) return null;
              const isActiveLine = r.series_id === active.series_id;
              return (
                <Line
                  key={dataKey}
                  type="monotone"
                  dataKey={dataKey}
                  name={isMulti ? r.product_name : "Forecast"}
                  stroke={ACCENTS[idx % ACCENTS.length]}
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
    </GlassPanel>
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
      {/* Color chip — always paired with text label (06 §6, color never alone) */}
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
        aria-hidden="true"
      />
      <span className="text-[var(--text-primary)]">{label}</span>
    </button>
  );
}

// ── Custom tooltip (06 §4) ───────────────────────────────────────────────────
interface TooltipPayloadEntry {
  dataKey: string;
  value: number | null;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function ForecastTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) return null;

  const actualEntry = payload.find((p) => p.dataKey === "actual");
  const forecastEntry = payload.find(
    (p) =>
      p.dataKey === "forecast" ||
      (typeof p.dataKey === "string" && p.dataKey.startsWith("forecast_")),
  );

  const actualVal = actualEntry?.value ?? null;
  const forecastVal = forecastEntry?.value ?? null;

  // Nothing meaningful to show
  if (actualVal == null && forecastVal == null) return null;

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
        <p style={{ color: "var(--accent-cyan)" }}>
          Forecast:{" "}
          <span className="font-[JetBrains_Mono]">{formatNumber(forecastVal, 1)}</span>
        </p>
      )}
    </div>
  );
}

export default ForecastResult;
