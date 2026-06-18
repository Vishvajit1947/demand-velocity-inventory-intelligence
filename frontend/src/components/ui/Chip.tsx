/**
 * Chip — keyboard-operable multiselect toggle.
 * MT-43 edit: role="checkbox", aria-checked, tabIndex=0, onKeyDown
 * that toggles on Enter AND Space (Space prevented from scrolling). 06 §6.
 * Active state: glow + accent border. 06 §8.
 * MT-51 edit: optional `activeColor` prop overrides the default cyan active
 * styling with the product's semantic color (border, text, box-shadow).
 */
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface ChipProps {
  active: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  /** Optional hex/CSS color applied to border, text, and glow when active. */
  activeColor?: string;
}

export function Chip({ active, onToggle, children, className, activeColor }: ChipProps) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault(); // Space must toggle, not scroll (06 §6)
      onToggle();
    }
  }

  // When activeColor is provided, override the Tailwind active classes with inline styles
  // so the chip glows in the product's semantic color instead of the default cyan.
  const activeStyle: CSSProperties =
    active && activeColor
      ? {
          border: `1px solid ${activeColor}`,
          color: activeColor,
          background: `${activeColor}1A`, // ~10% opacity background tint
          boxShadow: `0 0 8px ${activeColor}33`, // 20% opacity glow
        }
      : {};

  return (
    <div
      role="checkbox"
      aria-checked={active}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      style={activeStyle}
      className={cn(
        "cursor-pointer select-none rounded-chip border px-3 py-1.5 text-body transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-1 focus-visible:ring-offset-base",
        // Only apply Tailwind active classes when no activeColor override is set
        active && !activeColor
          ? "glow-cyan border-accent-cyan/50 bg-accent-cyan/10 text-accent-cyan"
          : !active
            ? "border-border-glass bg-panel-solid/40 text-text-muted hover:text-text-primary"
            : "",
        className,
      )}
    >
      {children}
    </div>
  );
}
