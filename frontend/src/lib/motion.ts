import { useReducedMotion, type Variants } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Panel/element entrance: fade + 12px rise, 0.5s (06 §2 Motion). */
export const entranceVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** Stagger container: children animate 0.06s apart (06 §2 Motion). */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/** Hover micro-interaction: scale 1.01 + glow (06 §2). */
export const hoverLift = { scale: 1.01 };

/**
 * Returns motion props that collapse to an instant render under
 * prefers-reduced-motion (06 §6). Spread onto a motion.<el>.
 */
export function useEntrance() {
  const reduce = useReducedMotion();
  if (reduce) {
    return { initial: false as const, animate: { opacity: 1, y: 0 } };
  }
  return {
    variants: entranceVariants,
    initial: "hidden" as const,
    animate: "visible" as const,
  };
}
