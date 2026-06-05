/**
 * Skeleton — shimmer placeholder for panel loading state.
 * 06 §5 Loading, §8.
 */
import { cn } from "../../lib/cn";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn("shimmer rounded-card", className)}
      {...rest}
    />
  );
}
