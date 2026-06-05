/**
 * ForecastControlBar — sticky P0 control panel (06 §3, §4).
 * DateField (left) + ProductMultiSelect (centre) + Forecast CTA (right).
 * Entrance: Framer Motion fade + 12 px rise, 0.5 s, ease [0.22,1,0.36,1] (06 §2).
 * State (selectedDate, selectedIds) is lifted to App and passed via props (MT-32).
 * Calls useBounds / useProducts internally so App stays data-free for this panel.
 * MT-33 — src/components/controls/ForecastControlBar.tsx
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
      className="sticky top-0 z-20"
      {...entrance}
    >
      {/*
       * GlassPanel with animate=false so it doesn't double-animate
       * (the outer motion.div drives the entrance from useEntrance).
       */}
      <GlassPanel
        animate={false}
        className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
      >
        {/* LEFT — Date picker */}
        <DateField
          value={selectedDate}
          bounds={bounds}
          loading={boundsLoading}
          onChange={onDateChange}
        />

        {/* CENTRE — Product chips */}
        <div className="flex-1 lg:px-6">
          <ProductMultiSelect
            products={products}
            loading={productsLoading}
            selectedIds={selectedIds}
            onChange={onProductsChange}
          />
        </div>

        {/* RIGHT — Forecast CTA */}
        <Button
          variant="primary"
          disabled={!canForecast}
          onClick={handleForecast}
          aria-label="Run forecast"
          className="min-w-[180px] justify-center"
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
