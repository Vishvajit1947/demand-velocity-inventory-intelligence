/**
 * StatCard — KPI glass card with count-up value, optional delta + footnote.
 * Numbers count up 0.8s (react-countup); mono/tabular numerics (06 §2).
 * Reduced-motion renders the final value immediately (06 §6).
 * 06 §4 P1, §8.
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import CountUp from "react-countup";
import { useReducedMotion } from "framer-motion";
import { cn } from "../../lib/cn";
import { entranceVariants } from "../../lib/motion";
import { signAccent, type AccentStyle } from "../../lib/status";

export interface StatCardProps {
  title: string;
  value: number;
  /** Decimal places for count-up display (default 0). */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  icon?: ReactNode;
  /** Signed delta shown below, colored by sign. */
  delta?: number;
  deltaSuffix?: string;
  footnote?: ReactNode;
  /** Override the value text color (e.g. rose for high-risk count). */
  accent?: AccentStyle;
  className?: string;
}

export function StatCard({
  title,
  value,
  decimals = 0,
  prefix,
  suffix,
  icon,
  delta,
  deltaSuffix = "%",
  footnote,
  accent,
  className,
}: StatCardProps) {
  const reduce = useReducedMotion();
  const valueColor = accent?.textClass ?? "text-text-primary";
  const deltaStyle = delta !== undefined ? signAccent(delta) : undefined;

  return (
    <motion.div variants={entranceVariants} className={cn("glass-panel p-5", className)}>
      {/* Header row: title + optional icon */}
      <div className="flex items-center justify-between">
        <span className="text-caption uppercase tracking-wide text-text-muted">{title}</span>
        {icon && <span className="text-text-muted">{icon}</span>}
      </div>

      {/* Main KPI number */}
      <div className={cn("mt-2 tabular text-display font-semibold", valueColor)}>
        {prefix}
        {reduce ? (
          value.toFixed(decimals)
        ) : (
          <CountUp end={value} duration={0.8} decimals={decimals} separator="," />
        )}
        {suffix}
      </div>

      {/* Delta row */}
      {delta !== undefined && (
        <div className={cn("mt-1 tabular text-body", deltaStyle?.textClass)}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {Math.abs(delta).toFixed(decimals)}
          {deltaSuffix}
        </div>
      )}

      {/* Footnote / secondary info */}
      {footnote && <div className="mt-2 text-caption text-text-muted">{footnote}</div>}
    </motion.div>
  );
}
