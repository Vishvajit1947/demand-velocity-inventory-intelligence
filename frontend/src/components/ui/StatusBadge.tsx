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
  | { kind: "velocity"; status: VelocityStatus; className?: string; label?: string }
  | { kind: "risk"; status: RiskLevel; className?: string; label?: string }
  | { kind: "accent"; accent: AccentName; label: string; className?: string };

/** Color + TEXT label pill — never color alone (06 §6, §2 status map). */
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
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: style.hex }}
      />
      {label}
    </span>
  );
}
