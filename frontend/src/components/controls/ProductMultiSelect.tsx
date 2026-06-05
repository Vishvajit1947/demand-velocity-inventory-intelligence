/**
 * ProductMultiSelect — 8 glowing toggle Chips for product selection.
 * Select all / Clear helpers. ≥ 1 required (enforced by Forecast button's disabled).
 * MT-33 — src/components/controls/ProductMultiSelect.tsx
 */
import { CheckCheck, X } from "lucide-react";
import { Chip } from "../ui/Chip";
import { cn } from "../../lib/cn";
import type { ProductInfo, SeriesId } from "../../lib/types";

export interface ProductMultiSelectProps {
  /** The 8 products from GET /api/products (MT-31 useProducts), in API order. */
  products: ProductInfo[];
  /** Whether products are still loading. */
  loading?: boolean;
  /** Currently selected series ids (controlled by App). */
  selectedIds: SeriesId[];
  /** Replace the selection with the given ids. */
  onChange: (ids: SeriesId[]) => void;
}

export function ProductMultiSelect({
  products,
  loading,
  selectedIds,
  onChange,
}: ProductMultiSelectProps) {
  const selected = new Set(selectedIds);

  function toggle(id: SeriesId) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Preserve API order so the payload is deterministic (05 §5).
    onChange(products.map((p) => p.series_id).filter((sid) => next.has(sid)));
  }

  function selectAll() {
    onChange(products.map((p) => p.series_id));
  }

  function clear() {
    onChange([]);
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Header row: label + Select all / Clear */}
      <div className="flex items-center justify-between gap-3">
        <label className="text-caption text-text-muted font-sans">
          Products ({selectedIds.length}/8)
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={selectAll}
            disabled={loading}
            className={cn(
              "flex items-center gap-1 text-caption text-accent-cyan",
              "hover:underline disabled:opacity-40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/60 rounded",
            )}
          >
            <CheckCheck size={12} aria-hidden /> Select all
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={loading || selectedIds.length === 0}
            className={cn(
              "flex items-center gap-1 text-caption text-text-muted",
              "hover:text-text-primary disabled:opacity-40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/60 rounded",
            )}
          >
            <X size={12} aria-hidden /> Clear
          </button>
        </div>
      </div>

      {/* Chip group */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Product selection"
      >
        {loading
          ? // Loading skeleton: 8 pill-shaped placeholders
            Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                aria-hidden
                className="h-8 w-28 animate-pulse rounded-chip bg-panel"
              />
            ))
          : products.map((p) => (
              <Chip
                key={p.series_id}
                label={p.name}
                active={selected.has(p.series_id)}
                onClick={() => toggle(p.series_id)}
                aria-pressed={selected.has(p.series_id)}
              />
            ))}
      </div>
    </div>
  );
}

export default ProductMultiSelect;
