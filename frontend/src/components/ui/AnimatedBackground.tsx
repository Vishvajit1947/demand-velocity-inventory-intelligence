/**
 * AnimatedBackground — gradient mesh + faint grid + drifting glow blobs.
 * MT-43 §5.8 — frozen under prefers-reduced-motion (06 §6).
 * Animation class only applied when motion is allowed. Static gradient always present.
 * aria-hidden: purely decorative (06 §6).
 */
import { useReducedMotion } from "framer-motion";
import { cn } from "../../lib/cn";

export function AnimatedBackground() {
  const reduce = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Gradient mesh — always visible (static under reduced motion) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 10%, rgba(47,230,255,0.07), transparent 60%)," +
            "radial-gradient(50% 50% at 85% 20%, rgba(139,92,255,0.07), transparent 60%)," +
            "radial-gradient(60% 60% at 60% 100%, rgba(77,255,176,0.04), transparent 60%)",
        }}
      />

      {/* Faint grid (06 §3) */}
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(var(--grid-line) 1px, transparent 1px)," +
            "linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(120% 100% at 50% 0%, black, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(120% 100% at 50% 0%, black, transparent 80%)",
        }}
      />

      {/* Drifting glow blob 1 — only animates when motion is allowed (06 §6) */}
      <div
        className={cn(
          "absolute -left-32 top-20 h-80 w-80 rounded-full bg-accent-cyan/10 blur-3xl",
          !reduce && "animate-[drift1_22s_ease-in-out_infinite]",
        )}
      />

      {/* Drifting glow blob 2 */}
      <div
        className={cn(
          "absolute right-0 top-1/3 h-96 w-96 rounded-full bg-accent-violet/10 blur-3xl",
          !reduce && "animate-[drift2_28s_ease-in-out_infinite]",
        )}
      />
    </div>
  );
}

export default AnimatedBackground;
