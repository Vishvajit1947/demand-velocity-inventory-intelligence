/**
 * StatusBadge — colored dot + TEXT label pill.
 * Color is ALWAYS paired with a text label — never color alone (06 §6).
 * 06 §2 status map, §8.
 */
import { cn } from "../../lib/cn";
import {
  velocityAccent,
  riskAccent,
  accentStyle,
  type AccentName,
  type AccentStyle,
} from "../../lib/status";
import type { VelocityStatus, RiskLevel } from "../../lib/types";

type StatusBadgeProps =
  | { kind: "velocity"; status: VelocityStatus; label?: string; className?: string }
  | { kind: "risk";     status: RiskLevel;       label?: string; className?: string }
  | { kind: "accent";   accent: AccentName;       label: string;  className?: string };

export function StatusBadge(props: StatusBadgeProps) {
  let style: AccentStyle;
  let label: string;

  if (props.kind === "velocity") {
    style = velocityAccent(props.status);
    label = props.label ?? props.status;
  } else if (props.kind === "risk") {
    style = riskAccent(props.status);
    label = props.label ?? `${props.status} risk`;
  } else {
    style = accentStyle(props.accent);
    label = props.label;
  }

  return (
    <span
      role="status"
      data-accent={style.accent}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1 text-caption font-medium",
        style.bgClass,
        style.borderClass,
        style.textClass,
        props.className,
      )}
    >
      {/* Decorative dot — aria-hidden because the text label carries the meaning */}
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: style.hex }}
      />
      {label}
    </span>
  );
}
