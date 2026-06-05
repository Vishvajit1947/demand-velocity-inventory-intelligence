/**
 * GlassPanel — frosted glass container.
 * 06 §1 principle 2, §2 Shape/Effects.
 */
import { forwardRef } from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/cn";
import { entranceVariants, hoverLift } from "../../lib/motion";

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Apply the staggered entrance animation (default true). */
  animate?: boolean;
  /** Enable hover scale + glow (default false). */
  interactive?: boolean;
}

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, animate = true, interactive = false, children, ...rest }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={cn("glass-panel p-5", className)}
        variants={animate ? entranceVariants : undefined}
        whileHover={interactive ? hoverLift : undefined}
        {...(rest as React.ComponentProps<typeof motion.div>)}
      >
        {children}
      </motion.div>
    );
  },
);
GlassPanel.displayName = "GlassPanel";
