/**
 * Button — primary glowing CTA + ghost/secondary variants.
 * Supports loading spinner (the Forecast button, 06 §4 P0).
 * 06 §8.
 */
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "ghost" | "secondary";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent-cyan/15 border border-accent-cyan/50 text-accent-cyan glow-cyan hover:bg-accent-cyan/25",
  secondary:
    "bg-accent-violet/15 border border-accent-violet/40 text-accent-violet hover:bg-accent-violet/25",
  ghost:
    "border border-border-glass text-text-muted hover:text-text-primary",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", loading = false, disabled, className, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-card px-4 py-2",
          "font-display text-body font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/60",
          "disabled:cursor-not-allowed disabled:opacity-40",
          VARIANTS[variant],
          className,
        )}
        {...rest}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
