/**
 * ExecutiveOverview — P1 band: four KPI stat cards from ForecastResponse.summary.
 * 06 §4 P1, §3 "always aggregates across the selection".
 * Values: total_predicted_demand, high_risk_count, avg_velocity, active_events.length.
 * Staggered entrance via staggerContainer + entranceVariants (06 §2 Motion).
 */
import { motion } from "framer-motion";
import {
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  CalendarClock,
} from "lucide-react";
import { StatCard } from "../ui/StatCard";
import { Skeleton } from "../ui/Skeleton";
import { PanelState } from "../ui/PanelState";
import { accentStyle } from "../../lib/status";
import { staggerContainer, entranceVariants } from "../../lib/motion";
import { formatDate } from "../../lib/format";
import type { Summary, EventInfo } from "../../lib/types";

export interface ExecutiveOverviewProps {
  /**
   * The summary slice of the forecast response (05 §5).
   * Undefined when no forecast has been run yet (06 §5 idle state).
   */
  summary?: Summary;
  /**
   * True while the POST /api/forecast mutation is in flight (06 §5 Loading).
   * MT-42: PanelState shows the skeleton when loading.
   */
  loading?: boolean;
  /**
   * When false, entrance animation and count-up are disabled.
   * Useful for tests and SSR. Defaults to true.
   */
  animate?: boolean;
}

/** Build the tooltip string listing active events (06 §4.4). */
function eventsTooltip(events: EventInfo[]): string {
  if (!events || events.length === 0) return "No events in this window";
  return events
    .map((e) => `${formatDate(e.date, "medium")} — ${e.name} (${e.type})`)
    .join("\n");
}

export function ExecutiveOverview({
  summary,
  loading = false,
  animate = true,
}: ExecutiveOverviewProps) {
  // MT-42 skeleton: a row of 4 card-shaped skeleton blocks (06 §5 Loading).
  const skeleton = (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[120px] rounded-card" />
      ))}
    </div>
  );

  // MT-42: wrap in PanelState for all four states (06 §5).
  // hasData = !!summary (summary arrives on first success; kept through errors).
  return (
    <PanelState
      loading={loading}
      hasData={!!summary}
      skeleton={skeleton}
      minHeight={140}
    >
      <SummaryCards summary={summary!} animate={animate} />
    </PanelState>
  );
}

/** The actual stat-card grid — only rendered when summary is defined. */
function SummaryCards({ summary, animate }: { summary: Summary; animate: boolean }) {
  const highRisk = summary.high_risk_count;
  const velocity = summary.avg_velocity;
  const velocityPositive = velocity >= 0;
  const events = summary.active_events ?? [];
  const tooltip = eventsTooltip(events);

  return (
    <motion.div
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4"
      variants={animate ? staggerContainer : undefined}
      initial={animate ? "hidden" : false}
      animate={animate ? "visible" : undefined}
    >
      {/* 1 — Total Predicted Demand (06 §4.1) */}
      <motion.div variants={animate ? entranceVariants : undefined}>
        <StatCard
          title="Total Predicted Demand"
          value={summary.total_predicted_demand}
          decimals={0}
          accent={accentStyle("cyan")}
          icon={<Package size={18} />}
          footnote="Units · next 28 days"
        />
      </motion.div>

      {/* 2 — High-Risk Products: rose when > 0, lime when 0 (06 §4.2) */}
      <motion.div
        variants={animate ? entranceVariants : undefined}
        data-testid="card-high-risk"
      >
        <StatCard
          title="High-Risk Products"
          value={highRisk}
          decimals={0}
          accent={accentStyle(highRisk > 0 ? "rose" : "lime")}
          icon={<AlertTriangle size={18} />}
          footnote="Stockout risk = High"
        />
      </motion.div>

      {/* 3 — Avg Velocity: signed %, arrow + sign color (06 §4.3) */}
      <motion.div variants={animate ? entranceVariants : undefined}>
        <StatCard
          title="Avg Velocity"
          value={velocity}
          decimals={1}
          suffix="%"
          prefix={velocityPositive ? "+" : ""}
          accent={accentStyle(velocityPositive ? "lime" : "rose")}
          icon={
            velocityPositive ? (
              <TrendingUp size={18} />
            ) : (
              <TrendingDown size={18} />
            )
          }
          footnote="Avg velocity · vs prior 28 days"
        />
      </motion.div>

      {/* 4 — Active Events: count + hover tooltip listing event names (06 §4.4) */}
      <motion.div
        variants={animate ? entranceVariants : undefined}
        data-testid="card-events"
        title={tooltip}
      >
        <StatCard
          title="Active Events"
          value={events.length}
          decimals={0}
          accent={accentStyle("violet")}
          icon={<CalendarClock size={18} />}
          footnote="Events in this window"
        />
      </motion.div>
    </motion.div>
  );
}

export default ExecutiveOverview;
