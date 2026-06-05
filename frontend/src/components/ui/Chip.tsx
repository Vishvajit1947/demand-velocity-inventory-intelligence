/**
 * Chip — rounded toggle chip for product multiselect and ProductSwitcher.
 * Active state: glow + accent border (06 §8).
 */
import { cn } from "../../lib/cn";

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label: string;
}

export function Chip({ active = false, label, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      className={cn(
        "rounded-chip border px-3 py-1.5 text-body transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/60",
        active
          ? "glow-cyan border-accent-cyan/50 bg-accent-cyan/10 text-accent-cyan"
          : "border-border-glass bg-panel-solid/40 text-text-muted hover:text-text-primary",
        className,
      )}
      {...rest}
    >
      {label}
    </button>
  );
}
