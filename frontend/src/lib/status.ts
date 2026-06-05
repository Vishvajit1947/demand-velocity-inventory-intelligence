/**
 * Single status → accent helper — 06 §2 status map (LOCKED).
 * Every primitive resolves one consistent set of Tailwind classes + hex from here.
 * Never convey status by color alone — always pair with a text label (06 §6).
 */
import type { VelocityStatus, RiskLevel } from "./types";

export type AccentName = "lime" | "cyan" | "amber" | "rose" | "violet";

export interface AccentStyle {
  accent: AccentName;
  hex: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  glowClass: string;
}

const ACCENTS: Record<AccentName, AccentStyle> = {
  lime: {
    accent: "lime",
    hex: "#4DFFB0",
    textClass: "text-accent-lime",
    bgClass: "bg-accent-lime/10",
    borderClass: "border-accent-lime/40",
    glowClass: "glow-lime",
  },
  cyan: {
    accent: "cyan",
    hex: "#2FE6FF",
    textClass: "text-accent-cyan",
    bgClass: "bg-accent-cyan/10",
    borderClass: "border-accent-cyan/40",
    glowClass: "glow-cyan",
  },
  amber: {
    accent: "amber",
    hex: "#FFC24D",
    textClass: "text-accent-amber",
    bgClass: "bg-accent-amber/10",
    borderClass: "border-accent-amber/40",
    glowClass: "glow-amber",
  },
  rose: {
    accent: "rose",
    hex: "#FF5C7A",
    textClass: "text-accent-rose",
    bgClass: "bg-accent-rose/10",
    borderClass: "border-accent-rose/40",
    glowClass: "glow-rose",
  },
  violet: {
    accent: "violet",
    hex: "#8B5CFF",
    textClass: "text-accent-violet",
    bgClass: "bg-accent-violet/10",
    borderClass: "border-accent-violet/40",
    glowClass: "glow-violet",
  },
};

/** Direct lookup by accent name. */
export function accentStyle(name: AccentName): AccentStyle {
  return ACCENTS[name];
}

/**
 * Velocity status → accent (06 §2 status map).
 * Accelerating/Growing → lime | Stable → cyan | Declining → amber | Critical Decline → rose
 */
export function velocityAccent(status: VelocityStatus): AccentStyle {
  switch (status) {
    case "Accelerating":
    case "Growing":
      return ACCENTS.lime;
    case "Stable":
      return ACCENTS.cyan;
    case "Declining":
      return ACCENTS.amber;
    case "Critical Decline":
      return ACCENTS.rose;
  }
}

/**
 * Risk level → accent (06 §2 status map).
 * Low → lime | Medium → amber | High → rose
 */
export function riskAccent(risk: RiskLevel): AccentStyle {
  switch (risk) {
    case "Low":
      return ACCENTS.lime;
    case "Medium":
      return ACCENTS.amber;
    case "High":
      return ACCENTS.rose;
  }
}

/**
 * Numeric sign → accent (06 §2).
 * positive (> 0.5) → lime | negative (< -0.5) → rose | ~zero → cyan
 */
export function signAccent(value: number): AccentStyle {
  if (value > 0.5) return ACCENTS.lime;
  if (value < -0.5) return ACCENTS.rose;
  return ACCENTS.cyan;
}

/**
 * Dial band for accuracy/coherence 0–100 → accent (06 §2 P2 dials).
 * ≥ 75 → lime (Strong) | 50–74 → cyan (Moderate) | 30–49 → amber (Weak) | < 30 → rose (Poor)
 */
export function dialAccent(value: number): AccentStyle {
  if (value >= 75) return ACCENTS.lime;
  if (value >= 50) return ACCENTS.cyan;
  if (value >= 30) return ACCENTS.amber;
  return ACCENTS.rose;
}

/**
 * coherence_label (05 §5: Strong | Moderate | Weak) → accent.
 * Lets RadialDial be driven from the label string instead of a numeric band.
 */
export function coherenceAccent(label: string): AccentStyle {
  switch (label) {
    case "Strong":
      return ACCENTS.lime;
    case "Moderate":
      return ACCENTS.cyan;
    case "Weak":
      return ACCENTS.amber;
    default:
      return ACCENTS.cyan;
  }
}
