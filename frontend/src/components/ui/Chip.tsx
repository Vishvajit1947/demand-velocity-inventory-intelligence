/**
 * Chip — keyboard-operable multiselect toggle.
 * MT-43 edit: role="checkbox", aria-checked, tabIndex=0, onKeyDown
 * that toggles on Enter AND Space (Space prevented from scrolling). 06 §6.
 * Active state: glow + accent border. 06 §8.
 */
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface ChipProps {
  active: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}

export function Chip({ active, onToggle, children, className }: ChipProps) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault(); // Space must toggle, not scroll (06 §6)
      onToggle();
    }
  }

  return (
    <div
      role="checkbox"          // a toggle in a multiselect group (06 §6)
      aria-checked={active}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      className={cn(
        "cursor-pointer select-none rounded-chip border px-3 py-1.5 text-body transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-1 focus-visible:ring-offset-base",
        active
          ? "glow-cyan border-accent-cyan/50 bg-accent-cyan/10 text-accent-cyan"
          : "border-border-glass bg-panel-solid/40 text-text-muted hover:text-text-primary",
        className,
      )}
    >
      {children}
    </div>
  );
}
