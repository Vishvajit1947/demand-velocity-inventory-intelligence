// MT-42 — Staggered entrance + hover micro-interaction (06 §2).
// Fade + 12px rise, duration 0.5, ease [0.22,1,0.36,1], stagger 0.06s.
// prefers-reduced-motion: render instantly, no transforms (06 §2/§6).
import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]; // 06 §2 (LOCKED)

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } }, // 06 §2 stagger 0.06s
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },                              // fade + 12px rise
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/**
 * EntranceList — wraps children in a stagger container so each EntranceItem
 * animates in with a 0.06s delay offset (06 §2 Motion).
 * Under prefers-reduced-motion the stagger + transforms are disabled (06 §6).
 */
export function EntranceList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    // Reduced motion: no stagger, no transforms — render at final state instantly.
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

/**
 * EntranceItem — one animated, hoverable item (a panel).
 * Use as a direct child of EntranceList.
 * hover: scale 1.01 + .panel-hover-glow (box-shadow) per 06 §2.
 * Under reduced motion: no transform, glow box-shadow may still apply (06 §6).
 */
export function EntranceItem({
  children,
  className,
  hoverable = true,
}: {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    // No transforms under reduced motion; keep the glow utility (box-shadow only).
    return (
      <div className={[className, hoverable ? "panel-hover-glow" : ""].filter(Boolean).join(" ")}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      className={[className, hoverable ? "panel-hover-glow" : ""].filter(Boolean).join(" ")}
      variants={itemVariants}
      whileHover={hoverable ? { scale: 1.01 } : undefined} // 06 §2 hover scale 1.01
    >
      {children}
    </motion.div>
  );
}
