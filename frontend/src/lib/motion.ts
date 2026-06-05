/**
 * Framer Motion entrance helpers — 06 §2 Motion (LOCKED).
 * fade + 12px rise, duration 0.5, ease [0.22,1,0.36,1], stagger 0.06s.
 * All transforms disabled under prefers-reduced-motion (06 §6).
 */
import { useReducedMotion, type Variants } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Panel/element entrance: fade + 12px rise, 0.5s (06 §2 Motion). */
export const entranceVariants: Variants = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/**
 * Stagger container: children animate 0.06s apart (06 §2 Motion).
 * Spread onto the parent motion element alongside `entranceVariants`.
 */
export const staggerContainer: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/** Hover micro-interaction: scale 1.01 (06 §2). Pair with a `.glow-*` class for full effect. */
export const hoverLift = { scale: 1.01 };

/**
 * Returns motion props that collapse to an instant render under
 * prefers-reduced-motion (06 §6). Spread onto a motion.<el>.
 *
 * @example
 * const entrance = useEntrance();
 * return <motion.div {...entrance}>…</motion.div>;
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
