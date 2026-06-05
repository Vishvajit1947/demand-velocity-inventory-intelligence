/**
 * SectionTitle — panel header with display font, optional caption + right slot.
 * 06 §8.
 */
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface SectionTitleProps {
  title: string;
  caption?: string;
  icon?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function SectionTitle({ title, caption, icon, right, className }: SectionTitleProps) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="flex items-center gap-2">
        {icon && <span className="text-accent-cyan">{icon}</span>}
        <div>
          <h2 className="font-display text-h2 text-text-primary">{title}</h2>
          {caption && <p className="mt-0.5 text-caption text-text-muted">{caption}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
