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

export function accentStyle(name: AccentName): AccentStyle {
  return ACCENTS[name];
}

/** Velocity status → accent (06 §2 status map). */
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

/** Risk level → accent (06 §2 status map). */
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

/** Numeric sign → accent (positive=lime, negative=rose, ~zero=cyan). 06 §2. */
export function signAccent(value: number): AccentStyle {
  if (value > 0.5) return ACCENTS.lime;
  if (value < -0.5) return ACCENTS.rose;
  return ACCENTS.cyan;
}

/** Dial band (accuracy/coherence 0–100) → accent. Used by RadialDial / MT-35. */
export function dialAccent(value: number): AccentStyle {
  if (value >= 75) return ACCENTS.lime; // Strong
  if (value >= 50) return ACCENTS.cyan; // Moderate
  if (value >= 30) return ACCENTS.amber; // Weak
  return ACCENTS.rose; // Poor
}

/** coherence_label (05 §5: Strong|Moderate|Weak) → accent. */
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
