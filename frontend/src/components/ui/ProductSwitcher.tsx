import { Chip } from "./Chip";
import { cn } from "../../lib/cn";

export interface ProductSwitcherOption {
  id: string;
  label: string;
}

export interface ProductSwitcherProps {
  options: ProductSwitcherOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/** Segmented chips to pick which product a panel details — 06 §3, §8. */
export function ProductSwitcher({
  options,
  value,
  onChange,
  className,
}: ProductSwitcherProps) {
  if (options.length <= 1) return null;
  return (
    <div role="tablist" className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <Chip
          key={o.id}
          role="tab"
          aria-selected={o.id === value}
          active={o.id === value}
          label={o.label}
          onClick={() => onChange(o.id)}
        />
      ))}
    </div>
  );
}
