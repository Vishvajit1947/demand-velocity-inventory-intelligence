/**
 * App — root shell with lifted forecast state (MT-32 wiring, 06 §3).
 * MT-42 edit: ToastProvider + ToastHost, EntranceList/EntranceItem panel grid,
 * all seven panels (MT-34…41) rendered and wrapped via PanelState.
 */
import { useEffect, useRef, useState } from "react";
import { ForecastControlBar } from "./components/controls/ForecastControlBar";
import { useBounds, useForecastMutation, useProducts } from "./hooks/useForecast";
import { ToastProvider } from "./components/ui/Toast";
import { ToastHost } from "./components/ui/ToastHost";
import { EntranceList, EntranceItem } from "./components/ui/EntranceList";
import { AnimatedBackground } from "./components/ui/AnimatedBackground";
import {
  ExecutiveOverview,
  ForecastResult,
  AccuracyCoherence,
  VelocityPanel,
  EventImpactPanel,
  SeasonalPanel,
  InventoryRiskPanel,
  ExplainabilityPanel,
} from "./components/panels";
import type { ForecastRequest, ForecastResponse, SeriesId } from "./lib/types";

export default function App() {
  // ── Lifted control-bar state (MT-32) ──────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<SeriesId[]>([]);
  // Active product (for per-product panels) — defaults to first result
  const [activeSeriesId, setActiveSeriesId] = useState<string | undefined>(undefined);

  // ── Default date to last_selectable_date once bounds load (06 §4) ──────
  const { data: bounds } = useBounds();
  // Product list — static, cached (05 §3) — used for per-product archetype context
  const { data: productsData } = useProducts();
  useEffect(() => {
    if (bounds && !selectedDate) {
      setSelectedDate(bounds.last_selectable_date);
    }
  }, [bounds, selectedDate]);

  // ── Forecast mutation (MT-31 useForecastMutation) ──────────────────────
  const forecast = useForecastMutation();

  // Two-layer deduplication guard:
  //
  // 1. submittingRef (non-reactive) — flips synchronously on click, blocking
  //    any re-entrant call within the same JS task before React re-renders.
  //
  // 2. isSubmitting (reactive state) — triggers an immediate re-render so the
  //    Forecast button becomes disabled before useMutation's isPending catches
  //    up (isPending updates after a microtask tick, leaving a ~16ms window
  //    where rapid clicks bypass it).
  //
  // Together they guarantee exactly ONE in-flight request regardless of how
  // quickly the user clicks or how React 18 concurrent mode schedules renders.
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(payload: ForecastRequest) {
    if (submittingRef.current) return;   // synchronous guard — drops re-entrant clicks
    submittingRef.current = true;
    setIsSubmitting(true);               // immediate re-render → button disabled
    forecast.mutate(payload, {
      onSettled: () => {
        submittingRef.current = false;
        setIsSubmitting(false);
      },
    });
  }

  const forecastData: ForecastResponse | undefined = forecast.data;

  // When new forecast data arrives, default the active product to the first result
  useEffect(() => {
    if (forecastData?.results?.[0] && !activeSeriesId) {
      setActiveSeriesId(forecastData.results[0].series_id);
    }
  }, [forecastData, activeSeriesId]);

  // When forecast reruns, reset the active series to the first result
  useEffect(() => {
    if (forecastData?.results?.[0]) {
      setActiveSeriesId(forecastData.results[0].series_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecastData?.start_date]);

  // The selected product's ForecastResult slice (for single-product panels)
  const selectedResult =
    forecastData?.results?.find((r) => r.series_id === activeSeriesId) ??
    forecastData?.results?.[0];

  // Archetype of the active product — drives expectation band in AccuracyCoherence
  const activeArchetype = productsData?.products?.find(
    (p) => p.series_id === selectedResult?.series_id,
  )?.archetype;

  const isPending = forecast.isPending || isSubmitting;

  return (
    <ToastProvider>
      {/* MT-42: fire toast on forecast error (05 §7 message) */}
      <ToastHost error={forecast.error} status={forecast.status} />

      {/* MT-43 §5.8 — animated background (frozen under prefers-reduced-motion, 06 §6) */}
      <AnimatedBackground />

      <div className="relative min-h-screen bg-base text-text-primary font-sans">
        {/* ── Sticky control bar — .control-bar ensures fixed height, no shift (06 §3) */}
        <div className="control-bar">
        <ForecastControlBar
          selectedDate={selectedDate}
          selectedIds={selectedIds}
          isPending={isPending}
          onDateChange={setSelectedDate}
          onProductsChange={setSelectedIds}
          onSubmit={handleSubmit}
        />
        </div>

        {/* ── Main content area ──────────────────────────────────────────── */}
        <main className="mx-auto max-w-screen-2xl px-4 py-5 lg:px-6 lg:py-6">
          {/*
           * MT-42: EntranceList wraps the panel grid so the staggered entrance
           * (fade + 12px rise, stagger 0.06s, 06 §2) fires once on Success.
           * Each EntranceItem carries the hover micro-interaction (scale 1.01 + glow).
           */}
          {/*
           * MT-43 §5.1 — Responsive grid (06 §3):
           * Mobile-first base = 1 column (below 1280px).
           * At ≥1280px (xl) → full 12-column grid with xl:col-span-* per panel.
           * Gap is 16px (gap-4) for tighter dashboard density matching the reference.
           */}
          <EntranceList className="grid grid-cols-1 gap-4 xl:grid-cols-12">

            {/* P1 — Executive Overview (full 12 cols at xl) */}
            <EntranceItem className="xl:col-span-12">
              <ExecutiveOverview
                summary={forecastData?.summary}
                loading={isPending}
                highRiskProducts={
                  forecastData?.results
                    ?.filter((r) => r.inventory?.stockout_risk === "High")
                    .map((r) => r.product_name) ?? []
                }
              />
            </EntranceItem>

            {/* P2 — Forecast Result (8 cols at xl) + P3 — Velocity (4 cols at xl) */}
            <EntranceItem className="xl:col-span-8">
              <ForecastResult
                results={forecastData?.results ?? []}
                activeSeriesId={activeSeriesId}
                onActiveChange={setActiveSeriesId}
                startDate={forecastData?.start_date ?? selectedDate}
                loading={isPending}
              />
            </EntranceItem>

            <EntranceItem className="xl:col-span-4">
              <VelocityPanel result={selectedResult} loading={isPending} />
            </EntranceItem>

            {/* P4 — Inventory Risk (full 12 cols at xl) — PRIMARY OBJECTIVE */}
            <EntranceItem className="xl:col-span-12">
              <InventoryRiskPanel result={selectedResult} loading={isPending} />
            </EntranceItem>

            {/* P5 — Explainability (full 12 cols at xl) */}
            <EntranceItem className="xl:col-span-12">
              <ExplainabilityPanel result={selectedResult} loading={isPending} />
            </EntranceItem>

            {/* P6 — Event Impact (6 cols at xl) + P7 — Seasonal Trend (6 cols at xl) */}
            <EntranceItem className="xl:col-span-6">
              <EventImpactPanel result={selectedResult} loading={isPending} />
            </EntranceItem>

            <EntranceItem className="xl:col-span-6">
              <SeasonalPanel result={selectedResult} loading={isPending} />
            </EntranceItem>

            {/* P8 — Forecast Quality / Accuracy & Coherence (full 12 cols at xl) */}
            <EntranceItem className="xl:col-span-12">
              <AccuracyCoherence
                metrics={selectedResult?.metrics}
                loading={isPending}
                archetype={activeArchetype}
              />
            </EntranceItem>

          </EntranceList>
        </main>
      </div>
    </ToastProvider>
  );
}
