/**
 * ProductMultiSelect — compact dropdown with a search bar and checkable list.
 * Replaces the flat chip grid for a cleaner control-bar footprint.
 * The trigger button shows the selection count and a chevron toggle.
 * The dropdown floats below the trigger, stays within the sticky bar.
 */
import { useEffect, useRef, useState } from "react";
import { CheckCheck, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { cn } from "../../lib/cn";
import type { ProductInfo, SeriesId } from "../../lib/types";

export interface ProductMultiSelectProps {
  /** The products from GET /api/products, in API order. */
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = new Set(selectedIds);

  // Focus the search input when the dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function toggle(id: SeriesId) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(products.map((p) => p.series_id).filter((sid) => next.has(sid)));
  }

  function selectAll() {
    onChange(products.map((p) => p.series_id));
  }

  function clear() {
    onChange([]);
  }

  const filtered = query.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : products;

  const triggerLabel =
    selectedIds.length === 0
      ? "Select products…"
      : selectedIds.length === products.length
      ? "All products selected"
      : `${selectedIds.length} / ${products.length} products`;

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      <label
        className="font-mono uppercase tracking-widest"
        style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em" }}
      >
        Products
      </label>

      {/* Trigger button — min-h-[44px] on mobile; min-w-[200px] desktop-only */}
      <button
        type="button"
        disabled={loading}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex items-center justify-between gap-2 rounded-chip border px-3 py-1.5 text-body",
          "border-border-glass bg-panel-solid/40 text-text-primary",
          "hover:border-accent-cyan/50 hover:text-accent-cyan",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/60",
          "transition-colors disabled:opacity-40",
          /* Desktop: keep the original min-width so the bar doesn't collapse */
          "sm:min-w-[200px]",
          /* Mobile touch target */
          "min-h-[44px] sm:min-h-0",
          open && "border-accent-cyan/50 text-accent-cyan",
        )}
      >
        <span className="truncate">{loading ? "Loading…" : triggerLabel}</span>
        {open ? (
          <ChevronUp size={14} className="shrink-0" aria-hidden />
        ) : (
          <ChevronDown size={14} className="shrink-0" aria-hidden />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className={cn(
            "absolute top-full left-0 z-50 mt-1 w-72",
            "rounded-lg border border-border-glass bg-base shadow-xl",
            "flex flex-col overflow-hidden",
          )}
          role="dialog"
          aria-label="Product list"
        >
          {/* Search bar */}
          <div className="flex items-center gap-2 border-b border-border-glass px-3 py-2">
            <Search size={14} className="shrink-0 text-text-muted" aria-hidden />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className={cn(
                "flex-1 bg-transparent text-body text-text-primary placeholder:text-text-muted",
                "focus:outline-none",
              )}
              aria-label="Search products"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-text-muted hover:text-text-primary focus-visible:outline-none"
                aria-label="Clear search"
              >
                <X size={12} aria-hidden />
              </button>
            )}
          </div>

          {/* Select all / Clear row — min-h-[44px] on mobile for both buttons */}
          <div className="flex items-center justify-between border-b border-border-glass px-3 py-1.5 min-h-[44px] sm:min-h-0">
            <button
              type="button"
              onClick={selectAll}
              className={cn(
                "flex items-center gap-1 text-caption text-accent-cyan",
                "hover:underline focus-visible:outline-none",
                /* Grow tap area vertically to fill the row height */
                "self-stretch flex items-center",
              )}
            >
              <CheckCheck size={12} aria-hidden /> Select all
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={selectedIds.length === 0}
              className={cn(
                "flex items-center gap-1 text-caption text-text-muted",
                "hover:text-text-primary disabled:opacity-40 focus-visible:outline-none",
                "self-stretch flex items-center",
              )}
            >
              <X size={12} aria-hidden /> Clear
            </button>
          </div>

          {/* Product list */}
          <ul
            role="listbox"
            aria-multiselectable="true"
            aria-label="Products"
            className="max-h-56 overflow-y-auto"
          >
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <li key={i} className="px-3 py-2">
                  <span className="block h-4 w-40 animate-pulse rounded bg-panel" aria-hidden />
                </li>
              ))
            ) : filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-caption text-text-muted">
                No products match "{query}"
              </li>
            ) : (
              filtered.map((p) => {
                const isSelected = selected.has(p.series_id);
                return (
                  <li
                    key={p.series_id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggle(p.series_id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(p.series_id);
                      }
                    }}
                    tabIndex={0}
                    className={cn(
                      /* Mobile touch target: min-h-[44px]; desktop keeps py-2 */
                      "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-body",
                      "min-h-[44px] sm:min-h-0",
                      "transition-colors focus-visible:outline-none focus-visible:bg-panel",
                      isSelected
                        ? "text-accent-cyan bg-accent-cyan/5 hover:bg-accent-cyan/10"
                        : "text-text-muted hover:text-text-primary hover:bg-panel",
                    )}
                  >
                    {/* Checkbox indicator */}
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        isSelected
                          ? "border-accent-cyan bg-accent-cyan/20 text-accent-cyan"
                          : "border-border-glass",
                      )}
                      aria-hidden
                    >
                      {isSelected && (
                        <svg
                          viewBox="0 0 12 12"
                          fill="none"
                          className="h-2.5 w-2.5"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="2,6 5,9 10,3" />
                        </svg>
                      )}
                    </span>
                    {p.name}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ProductMultiSelect;
