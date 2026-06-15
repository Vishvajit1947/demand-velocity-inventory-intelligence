/**
 * AccuracyCoherence — two radial dials showing forecast quality (MT-35).
 * Renders Accuracy + Coherence dials from `metrics`, each colored by band,
 * with a band-word text label (color is never the only indicator, 06 §6)
 * and a mono caption row showing sMAPE / MAE / RMSE.
 *
 * Uses MT-30 RadialDial (ring + center value + CSS animation),
 * GlassPanel, SectionTitle. Metrics type from MT-31.
 * 06 §3 (Forecast Result panel), §4 (P2 dials), §2 (tokens, count-up, a11y).
 */
import { RadialDial } from "../ui/RadialDial";
import { GlassPanel } from "../ui/GlassPanel";
import { SectionTitle } from "../ui/SectionTitle";
import { Skeleton } from "../ui/Skeleton";
import { PanelState } from "../ui/PanelState";
import { accentStyle, type AccentStyle } from "../../lib/status";
import type { Metrics } from "../../lib/types";

export interface AccuracyCoherenceProps {
  /** The active product's metrics slice (05 §5). Optional until first forecast. */
  metrics?: Metrics;
  /** MT-42: shows skeleton while true (06 §5 Loading). */
  loading?: boolean;
}

/** Accuracy band → {AccentStyle, word} — LOCKED thresholds (MT-35 §4). */
export function accuracyBand(accuracy: number): { accent: AccentStyle; word: string } {
  if (accuracy >= 75) return { accent: accentStyle("lime"), word: "Strong" };
  if (accuracy >= 60) return { accent: accentStyle("cyan"), word: "Solid" };
  if (accuracy >= 40) return { accent: accentStyle("amber"), word: "Weak" };
  return { accent: accentStyle("rose"), word: "Poor" };
}

/**
 * Coherence band → {AccentStyle, word}.
 * Driven by the API label (05 §5) so frontend never re-derives the metric.
 * Numeric fallback when label is absent/unknown (MT-35 §4).
 * MT-35 §4 locks: Strong→lime, Moderate→amber, Weak→rose.
 */
export function coherenceBand(
  coherence: number,
  label?: string,
): { accent: AccentStyle; word: string } {
  const word =
    label === "Strong" || label === "Moderate" || label === "Weak"
      ? label
      : coherence >= 75
        ? "Strong"
        : coherence >= 50
          ? "Moderate"
          : "Weak";

  const accent =
    word === "Strong"
      ? accentStyle("lime")
      : word === "Moderate"
        ? accentStyle("amber")
        : accentStyle("rose");

  return { accent, word };
}

export function AccuracyCoherence({ metrics, loading = false }: AccuracyCoherenceProps) {
  const acc = metrics ? accuracyBand(metrics.accuracy) : null;
  const coh = metrics ? coherenceBand(metrics.coherence, metrics.coherence_label) : null;

  const skeleton = (
    <div className="flex items-center justify-around gap-6">
      <Skeleton className="h-[132px] w-[132px] rounded-full" />
      <Skeleton className="h-[132px] w-[132px] rounded-full" />
    </div>
  );

  return (
    <GlassPanel animate={false} className="flex flex-col gap-3">
      <SectionTitle title="Forecast Quality" />
      <PanelState
        loading={loading}
        hasData={!!metrics}
        skeleton={skeleton}
        minHeight={220}
      >
        {metrics && acc && coh && (
          <>
            <div className="flex items-center justify-around gap-6">
              {/* Accuracy dial */}
              <div className="flex flex-col items-center gap-1" data-testid="dial-accuracy">
                <RadialDial
                  value={metrics.accuracy}
                  label="Accuracy"
                  accent={acc.accent}
                />
                <span
                  className="text-caption font-inter"
                  style={{ color: acc.accent.hex }}
                  aria-label={`Accuracy band: ${acc.word}`}
                >
                  {acc.word}
                </span>
              </div>

              {/* Coherence dial */}
              <div className="flex flex-col items-center gap-1" data-testid="dial-coherence">
                <RadialDial
                  value={metrics.coherence}
                  label="Coherence"
                  accent={coh.accent}
                />
                <span
                  className="text-caption font-inter"
                  style={{ color: coh.accent.hex }}
                  aria-label={`Coherence band: ${coh.word}`}
                >
                  {coh.word}
                </span>
              </div>
            </div>

            {/* sMAPE / MAE / RMSE caption */}
            <p className="text-center text-caption text-text-muted font-mono tabular-nums">
              sMAPE {metrics.smape.toFixed(1)} · MAE {metrics.mae.toFixed(2)} · RMSE{" "}
              {metrics.rmse.toFixed(2)}
            </p>
          </>
        )}
      </PanelState>
    </GlassPanel>
  );
}

export default AccuracyCoherence;
