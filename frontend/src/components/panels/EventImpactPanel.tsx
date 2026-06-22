/**
 * EventImpactPanel — P4 Event Impact (MT-38).
 * MT-42 edit: added `loading?` + `result?` props + PanelState wrapper (06 §5).
 *
 * Recharts horizontal BarChart of event_uplift (top-5) + "View All" drawer.
 * 06 §4 P4, §2 tokens, §7 Recharts, §2 Motion, §6 a11y.
 */
import { useMemo, useState, useEffect, useRef } from "react";
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
import { X, Search } from "lucide-react";
import { GlassPanel } from "../ui/GlassPanel";
import { SectionTitle } from "../ui/SectionTitle";
import { Skeleton } from "../ui/Skeleton";
import { PanelState } from "../ui/PanelState";
import { Button } from "../ui/Button";
import { signedPct } from "../../lib/format";
import type { ForecastResult } from "../../lib/types";

// ── Design tokens (06 §2) ─────────────────────────────────────────────────────
const LIME  = "#4DFFB0";
const ROSE  = "#FF5C7A";
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
  const skeleton = (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-6 w-full rounded-card" />
      ))}
    </div>
  );

  return (
    <GlassPanel animate={false}>
      <div className="flex h-full flex-col gap-3" data-testid="event-impact-panel">
        <SectionTitle title="Event Impact" />
        <PanelState
          loading={loading}
          hasData={!!result}
          skeleton={skeleton}
          minHeight={280}
        >
          {result && <EventImpactContent result={result} />}
        </PanelState>
      </div>
    </GlassPanel>
  );
}

// ── Inner content ─────────────────────────────────────────────────────────────
function EventImpactContent({ result }: { result: ForecastResult }) {
  const reduce = useReducedMotion();
  const { event_uplift } = result;
  const [drawerOpen, setDrawerOpen] = useState(false);

  // All events sorted by absolute uplift descending
  const allRows = useMemo<UpliftRow[]>(
    () =>
      Object.entries(event_uplift ?? {})
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    [event_uplift],
  );

  const totalEvents = allRows.length;
  const rows = allRows.slice(0, 5);
  const shownCount = rows.length;

  return (
    <>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p
          className="text-[11px]"
          style={{ color: MUTED, fontFamily: "JetBrains Mono, monospace" }}
        >
          top 5 historical impact
        </p>
        {totalEvents > 0 && (
          <Button
            variant="ghost"
            className="h-6 px-2 py-0 text-[11px]"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
          >
            View All ({totalEvents})
          </Button>
        )}
      </div>

      {/* Bar chart — fixed height matching the seasonal panel */}
      {rows.length === 0 ? (
        <p className="text-[13px]" style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}>
          No event uplift profile for this product.
        </p>
      ) : (
        <div style={{ width: "100%", height: 210 }} data-testid="event-uplift-chart">
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
                width={110}
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
                labelStyle={{
                  color: "#E8EEF9",
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 600,
                  marginBottom: 4,
                }}
                itemStyle={{ color: MUTED }}
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

      {/* Caption */}
      {totalEvents > 0 && (
        <p
          style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "Inter, sans-serif", marginTop: 2 }}
          data-testid="event-impact-caption"
        >
          Showing top {shownCount} of {totalEvents}
        </p>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <AllEventsDrawer
          rows={allRows}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}

// ── All Events Drawer ─────────────────────────────────────────────────────────
interface AllEventsDrawerProps {
  rows: UpliftRow[];
  onClose: () => void;
}

function AllEventsDrawer({ rows, onClose }: AllEventsDrawerProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Focus search on open
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const filtered = useMemo(
    () =>
      query.trim() === ""
        ? rows
        : rows.filter((r) =>
            r.name.toLowerCase().includes(query.trim().toLowerCase()),
          ),
    [rows, query],
  );

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      style={{ background: "rgba(5, 10, 20, 0.65)", backdropFilter: "blur(2px)" }}
      onClick={handleBackdropClick}
      role="presentation"
    >
      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="All Events"
        className="flex flex-col"
        style={{
          width: 380,
          height: "100%",
          background: "#0E1626",
          borderLeft: "1px solid rgba(120,160,255,0.12)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.5)",
        }}
      >
        {/* Drawer header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(120,160,255,0.10)" }}
        >
          <div>
            <p
              className="font-semibold"
              style={{ color: "#E8EEF9", fontFamily: "Inter, sans-serif", fontSize: 14 }}
            >
              All Events
            </p>
            <p style={{ color: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 11, marginTop: 2 }}>
              {rows.length} events · sorted by impact
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10"
            style={{ color: MUTED }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(120,160,255,0.08)" }}>
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: "rgba(120,160,255,0.06)", border: "1px solid rgba(120,160,255,0.12)" }}
          >
            <Search size={13} style={{ color: MUTED, flexShrink: 0 }} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search events…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none"
              style={{
                color: "#E8EEF9",
                fontFamily: "Inter, sans-serif",
                fontSize: 12,
                caretColor: LIME,
              }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                style={{ color: MUTED }}
                className="hover:text-white"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Column headers */}
        <div
          className="flex items-center justify-between px-5 py-2"
          style={{
            borderBottom: "1px solid rgba(120,160,255,0.08)",
            background: "rgba(120,160,255,0.03)",
          }}
        >
          <span style={{ color: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>
            EVENT
          </span>
          <span style={{ color: MUTED, fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>
            IMPACT
          </span>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
          {filtered.length === 0 ? (
            <p
              className="px-5 py-6 text-center text-[12px]"
              style={{ color: MUTED, fontFamily: "Inter, sans-serif" }}
            >
              No events match "{query}"
            </p>
          ) : (
            filtered.map((r, i) => (
              <div
                key={r.name}
                className="flex items-center justify-between px-5 py-[10px] transition-colors hover:bg-white/[0.03]"
                style={{
                  borderBottom: i < filtered.length - 1 ? "1px solid rgba(120,160,255,0.06)" : "none",
                }}
              >
                {/* Rank + name */}
                <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                  <span
                    style={{
                      color: MUTED,
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 10,
                      width: 18,
                      textAlign: "right",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    style={{
                      color: "#E8EEF9",
                      fontFamily: "Inter, sans-serif",
                      fontSize: 13,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.name}
                  </span>
                </div>

                {/* Impact value + dot */}
                <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
                  <span
                    style={{
                      color: barColor(r.value),
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {signedPct(r.value)}
                  </span>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: barColor(r.value),
                      boxShadow: `0 0 6px ${barColor(r.value)}99`,
                      flexShrink: 0,
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Drawer footer */}
        <div
          className="px-5 py-3"
          style={{
            borderTop: "1px solid rgba(120,160,255,0.08)",
            background: "rgba(120,160,255,0.02)",
          }}
        >
          <p style={{ color: MUTED, fontFamily: "Inter, sans-serif", fontSize: 11 }}>
            {filtered.length} of {rows.length} events
            {query && ` matching "${query}"`}
          </p>
        </div>
      </div>
    </div>
  );
}

export default EventImpactPanel;
