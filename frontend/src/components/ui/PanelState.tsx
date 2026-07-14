// MT-42 — PanelState: maps forecast status to Idle / Loading / Success per 06 §5.
// Error is handled by ToastHost (05 §7); on error the panel keeps last good data
// (hasData=true) or falls back to the Idle prompt — never blanks populated data.
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export type PanelStateProps = {
  /** True while the POST /api/forecast mutation is in flight (06 §5 Loading). */
  loading: boolean;
  /** Does this panel have something to render? (success, or error-with-last-good-data) */
  hasData: boolean;
  /** Panel-specific skeleton (composed from the MT-30 Skeleton primitive). */
  skeleton: ReactNode;
  /** The success content. */
  children: ReactNode;
  /** Reserve height so Idle/Loading/Success share one box (06 §6 — no layout shift). */
  minHeight?: number;
  className?: string;
};

/** Verbatim empty prompt from 06 §5. */
export const IDLE_PROMPT = "Select a date & products, then Forecast";

/**
 * PanelState — three render branches:
 *   Loading  → renders the panel's skeleton (role=status, aria-label=Loading)
 *   HasData  → renders children (success, or error keeping last good data)
 *   Idle     → renders the empty prompt with a Sparkles icon
 *
 * Error is NOT its own branch here — it's surfaced by ToastHost (06 §5).
 * "Error keeping last good data" is automatic: hasData stays true when TanStack
 * Query retains the previous successful data across a later error (06 §5).
 *
 * Mobile fix: minHeight is applied only during Loading and Idle states.
 * When hasData=true the wrapper has no minimum height so content-short panels
 * don't create empty space at the bottom of their glass card on mobile.
 */
export function PanelState({
  loading,
  hasData,
  skeleton,
  children,
  minHeight = 220,
  className,
}: PanelStateProps) {
  let body: ReactNode;
  // Only enforce minHeight during loading/idle — not when real content is present.
  const appliedMinHeight = hasData && !loading ? undefined : minHeight;

  if (loading) {
    // 06 §5 Loading — skeleton shimmer; role=status so SR announces it (06 §6).
    body = (
      <div role="status" aria-label="Loading" className="h-full w-full">
        {skeleton}
      </div>
    );
  } else if (hasData) {
    // 06 §5 Success (or Error keeping last good data — toast surfaces the error).
    body = children;
  } else {
    // 06 §5 Idle — tasteful empty prompt (also empty fallback on first error).
    body = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-muted">
        <Sparkles className="h-6 w-6 opacity-70" aria-hidden="true" />
        <p className="text-body">{IDLE_PROMPT}</p>
      </div>
    );
  }

  return (
    <div className={className} style={{ minHeight: appliedMinHeight }}>
      {body}
    </div>
  );
}
