/**
 * ForecastControlBar — sticky P0 control panel (06 §3, §4).
 * DateField (left) + ProductMultiSelect (centre) + Forecast CTA (right).
 * Entrance: Framer Motion fade + 12 px rise, 0.5 s, ease [0.22,1,0.36,1] (06 §2).
 * State (selectedDate, selectedIds) is lifted to App and passed via props (MT-32).
 * Calls useBounds / useProducts internally so App stays data-free for this panel.
 * MT-33 — src/components/controls/ForecastControlBar.tsx
 *
 * Mobile (Group 1): stacks controls vertically below sm breakpoint.
 * - GlassPanel switches flex-row → flex-col on mobile.
 * - Vertical divider is hidden on mobile (hidden sm:block).
 * - The outer sticky wrapper removes the fixed min-height on mobile so it
 *   doesn't clip the taller stacked layout.
 */
import { ArrowRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { GlassPanel } from "../ui/GlassPanel";
import { Button } from "../ui/Button";
import { DateField } from "./DateField";
import { ProductMultiSelect } from "./ProductMultiSelect";
import { useBounds, useProducts } from "../../hooks/useForecast";
import { useEntrance } from "../../lib/motion";
import type { ForecastRequest, SeriesId } from "../../lib/types";

export interface ForecastControlBarProps {
  /** Selected ISO start date (controlled by App). */
  selectedDate: string;
  /** Selected series ids (controlled by App). */
  selectedIds: SeriesId[];
  /** Whether the forecast mutation is in flight (App's useForecastMutation.isPending). */
  isPending?: boolean;
  onDateChange: (iso: string) => void;
  onProductsChange: (ids: SeriesId[]) => void;
  /** Fire the forecast — payload shape exactly matches 05 §5. */
  onSubmit: (payload: ForecastRequest) => void;
}

export function ForecastControlBar({
  selectedDate,
  selectedIds,
  isPending = false,
  onDateChange,
  onProductsChange,
  onSubmit,
}: ForecastControlBarProps) {
  const { data: bounds, isLoading: boundsLoading } = useBounds();
  const { data: productsResp, isLoading: productsLoading } = useProducts();

  const products = productsResp?.products ?? [];

  // Forecast is only possible when ≥1 product chosen, bounds loaded, and no request in-flight.
  const canForecast = selectedIds.length > 0 && !!bounds && !isPending;

  function handleForecast() {
    if (!canForecast) return;
    onSubmit({ product_ids: selectedIds, start_date: selectedDate });
  }

  // Reduced-motion-safe entrance (06 §6).
  const entrance = useEntrance();

  return (
    <motion.div
      /* Mobile: remove the fixed min-height from .control-bar so the taller
         stacked layout doesn't clip. Desktop (sm+): sticky behaviour unchanged. */
      className="sticky top-0 z-20 [&.control-bar]:sm:min-h-[60px]"
      {...entrance}
    >
      {/*
       * GlassPanel with animate=false so it doesn't double-animate
       * (the outer motion.div drives the entrance from useEntrance).
       *
       * Mobile  (< sm / 640 px): flex-col, full-width controls, gap-3.
       * Desktop (≥ sm):          flex-row, existing justify-between layout.
       */}
      <GlassPanel
        animate={false}
        className="flex flex-col gap-3 py-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
      >
        {/* Controls group — vertical on mobile, horizontal on desktop */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8 sm:min-w-0">
          {/* Date picker — full-width on mobile */}
          <div className="w-full sm:w-auto sm:shrink-0">
            <DateField
              value={selectedDate}
              bounds={bounds}
              loading={boundsLoading}
              onChange={onDateChange}
            />
          </div>

          {/* Vertical divider — hidden on mobile, visible on desktop */}
          <div
            className="hidden sm:block"
            style={{
              width: 1,
              height: 36,
              background: "var(--border-glass)",
              flexShrink: 0,
            }}
          />

          {/* Product select — full-width on mobile */}
          <div className="w-full sm:flex-1 sm:min-w-0">
            <ProductMultiSelect
              products={products}
              loading={productsLoading}
              selectedIds={selectedIds}
              onChange={onProductsChange}
            />
          </div>
        </div>

        {/* Forecast CTA — full-width on mobile, fixed min-width on desktop */}
        <Button
          variant="primary"
          disabled={!canForecast}
          onClick={handleForecast}
          aria-label="Run forecast"
          className="w-full justify-center min-h-[44px] sm:w-auto sm:shrink-0 sm:min-w-[140px] sm:min-h-0"
        >
          {isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden />
              Forecasting…
            </>
          ) : (
            <>
              Forecast
              <ArrowRight size={16} aria-hidden />
            </>
          )}
        </Button>
      </GlassPanel>
    </motion.div>
  );
}

export default ForecastControlBar;
