/**
 * ProductSwitcher — segmented row of chips to pick which product's detail a panel shows.
 * Returns null when only one product is selected (no switcher needed).
 * MT-43 edit: updated to use the new Chip API (onToggle + children). 06 §3, §8.
 */
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

export function ProductSwitcher({ options, value, onChange, className }: ProductSwitcherProps) {
  if (options.length <= 1) return null;

  return (
    <div role="tablist" className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <Chip
          key={o.id}
          active={o.id === value}
          onToggle={() => onChange(o.id)}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  );
}
