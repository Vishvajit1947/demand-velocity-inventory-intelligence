/**
 * DateField — calendar popover containing a native <input type="date">.
 * Constrained to [first_selectable_date, last_selectable_date] from useBounds().
 * Optional "Snap to week start (Sat)" toggle (06 §4, 05 §4 week anchor = Saturday).
 * MT-33 — src/components/controls/DateField.tsx
 */
import { useRef, useState, useEffect, type KeyboardEvent } from "react";
import { Calendar as CalendarIcon, Check } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatDate } from "../../lib/format";
import type { BoundsResponse } from "../../lib/types";

export interface DateFieldProps {
  /** Currently selected ISO date (YYYY-MM-DD). Controlled by App. */
  value: string;
  /** Calendar window from GET /api/calendar/bounds (MT-31 useBounds). */
  bounds?: BoundsResponse;
  /** Whether bounds are still loading (disables the field). */
  loading?: boolean;
  /** Notify parent of a new (already in-range) ISO date. */
  onChange: (isoDate: string) => void;
}

/**
 * Snap an ISO date back to the Saturday that starts its M5 week, then clamp.
 * M5 weeks are Sat→Fri (05 §4: train_start 2011-01-29 is a Saturday).
 * getUTCDay: Sun=0, Mon=1, …, Sat=6. Days since last Saturday = (day + 1) % 7.
 */
export function snapToWeekStart(iso: string, min: string, max: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const back = (d.getUTCDay() + 1) % 7; // days since last Saturday
  d.setUTCDate(d.getUTCDate() - back);
  let snapped = d.toISOString().slice(0, 10);
  if (snapped < min) snapped = min;
  if (snapped > max) snapped = max;
  return snapped;
}

/** Clamp an ISO date into [min, max]. */
function clampDate(iso: string, min: string, max: string): string {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}

export function DateField({ value, bounds, loading, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const min = bounds?.first_selectable_date ?? "";
  const max = bounds?.last_selectable_date ?? "";
  const disabled = loading || !bounds;

  // Close popover on outside click (lightweight, no Radix needed).
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function handleInput(raw: string) {
    if (!raw || !bounds) return;
    // Defensive clamp: browsers honour min/max but jsdom does not (07 §3 note).
    let next = clampDate(raw, min, max);
    if (snap) next = snapToWeekStart(next, min, max);
    onChange(next);
  }

  function handleSnapToggle() {
    const nextSnap = !snap;
    setSnap(nextSnap);
    // Apply snap immediately to the current value when turning on.
    if (nextSnap && value && bounds) {
      onChange(snapToWeekStart(value, min, max));
    }
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      <label
        className="font-mono uppercase tracking-widest"
        style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em" }}
      >
        Forecast Start Date
      </label>

      {/* Trigger button — min-h-[44px] on mobile for touch target; desktop keeps py-2 */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label="Choose start date"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-card border border-border-glass",
          "bg-panel-solid px-4 py-2 text-body text-text-primary font-mono tabular-nums",
          "transition-shadow hover:shadow-[0_0_18px_rgba(47,230,255,0.18)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/60",
          "disabled:cursor-not-allowed disabled:opacity-50",
          /* Mobile touch target */
          "min-h-[44px] sm:min-h-0",
        )}
      >
        <CalendarIcon size={16} className="shrink-0 text-accent-cyan" aria-hidden />
        <span>{value ? formatDate(value, "medium") : "Select date"}</span>
      </button>

      {/* Popover panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Date picker"
          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
            if (e.key === "Escape") {
              setOpen(false);
              triggerRef.current?.focus(); // return focus to trigger (06 §6)
            }
          }}
          className={cn(
            "absolute left-0 top-full z-50 mt-2 min-w-[260px]",
            "rounded-card border border-border-glass bg-panel-solid",
            "p-4 shadow-panel",
          )}
        >
          <div className="flex flex-col gap-3">
            {/* Native date input — constrained by min/max */}
            <input
              type="date"
              aria-label="Forecast start date input"
              value={value}
              min={min}
              max={max}
              disabled={disabled}
              onChange={(e) => handleInput(e.target.value)}
              className={cn(
                "w-full rounded-[10px] border border-border-glass",
                "bg-base px-3 py-2 text-body text-text-primary font-mono tabular-nums",
                "focus:outline-none focus:ring-2 focus:ring-accent-cyan/60",
                "[color-scheme:dark]",
              )}
            />

            {/* Snap to week start toggle — min-h-[44px] on mobile for touch target */}
            <button
              type="button"
              role="switch"
              aria-checked={snap}
              onClick={handleSnapToggle}
              className={cn(
                "flex items-center gap-2 text-caption text-text-muted",
                "hover:text-text-primary focus:outline-none",
                "focus-visible:ring-2 focus-visible:ring-accent-cyan/60 rounded",
                /* Mobile touch target */
                "min-h-[44px] sm:min-h-0",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  snap
                    ? "border-accent-cyan text-accent-cyan"
                    : "border-border-glass text-transparent",
                )}
              >
                <Check size={12} aria-hidden />
              </span>
              Snap to week start (Sat)
            </button>

            {/* Range hint */}
            <p className="text-caption text-text-muted">
              Selectable:{" "}
              {min ? formatDate(min, "medium") : "—"} →{" "}
              {max ? formatDate(max, "medium") : "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default DateField;
