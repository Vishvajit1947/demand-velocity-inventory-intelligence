import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "../../lib/cn";
import { dialAccent, type AccentStyle } from "../../lib/status";

export interface RadialDialProps {
  /** 0–100. */
  value: number;
  label: string;
  /** Override the band accent (e.g. drive from coherence_label). */
  accent?: AccentStyle;
  size?: number;
  className?: string;
  /** Decimals on the centre number (default 0). */
  decimals?: number;
}

/** Radial progress ring (0–100) — 06 §2 P2 dials, §8. */
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
  const c = 2 * Math.PI * r;

  const [progress, setProgress] = useState(reduce ? clamped : 0);

  useEffect(() => {
    if (reduce) {
      setProgress(clamped);
      return;
    }
    const id = requestAnimationFrame(() => setProgress(clamped));
    return () => cancelAnimationFrame(id);
  }, [clamped, reduce]);

  const offset = c - (progress / 100) * c;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${clamped.toFixed(decimals)} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--grid-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={style.hex}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: reduce
              ? "none"
              : "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("tabular text-h1 font-semibold", style.textClass)}>
          {clamped.toFixed(decimals)}
        </span>
        <span className="text-caption text-text-muted">{label}</span>
      </div>
    </div>
  );
}
