import { cn } from "../../lib/cn";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/** Shimmer placeholder — 06 §5 Loading. */
export function Skeleton({ className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn("shimmer rounded-card", className)}
      {...rest}
    />
  );
}
