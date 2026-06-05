/**
 * RadialDial — SVG ring 0–100 with center value + band label.
 * Color by band: ≥75 lime (Strong) | 50–74 cyan (Moderate) | 30–49 amber (Weak) | <30 rose (Poor).
 * Stroke-dashoffset animates on mount; reduced-motion renders instantly (06 §6).
 * 06 §2 P2 dials, §8.
 */
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "../../lib/cn";
import { dialAccent, type AccentStyle } from "../../lib/status";

export interface RadialDialProps {
  /** 0–100 (clamped). */
  value: number;
  label: string;
  /** Override the automatic band accent (e.g. drive from coherence_label). */
  accent?: AccentStyle;
  /** Diameter in px (default 132). */
  size?: number;
  className?: string;
  /** Decimal places on the centre number (default 0). */
  decimals?: number;
}

export function RadialDial({
  value,
  label,
  accent,
  size = 132,
  className,
  decimals = 0,
}: RadialDialProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const style = accent ?? dialAccent(clamped);
  const reduce = useReducedMotion();

  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  // Animate dashoffset from full (empty ring) to the actual value.
  const [progress, setProgress] = useState(reduce ? clamped : 0);

  useEffect(() => {
    if (reduce) {
      setProgress(clamped);
      return;
    }
    // One rAF is enough to trigger the CSS transition after initial paint.
    const id = requestAnimationFrame(() => setProgress(clamped));
    return () => cancelAnimationFrame(id);
  }, [clamped, reduce]);

  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${clamped.toFixed(decimals)} out of 100`}
    >
      {/* SVG rotated so progress starts from the 12-o'clock position */}
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        {/* Track ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--grid-line)"
          strokeWidth={stroke}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={style.hex}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: reduce
              ? "none"
              : "stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("tabular text-h1 font-semibold leading-none", style.textClass)}>
          {clamped.toFixed(decimals)}
        </span>
        <span className="mt-1 text-caption text-text-muted">{label}</span>
      </div>
    </div>
  );
}
