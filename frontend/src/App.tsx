/**
 * App — root shell with lifted forecast state (MT-32 wiring, 06 §3).
 * MT-42 edit: ToastProvider + ToastHost, EntranceList/EntranceItem panel grid,
 * all seven panels (MT-34…41) rendered and wrapped via PanelState.
 */
import { useEffect, useState } from "react";
import { ForecastControlBar } from "./components/controls/ForecastControlBar";
import { useBounds, useForecastMutation } from "./hooks/useForecast";
import { ToastProvider } from "./components/ui/Toast";
import { ToastHost } from "./components/ui/ToastHost";
import { EntranceList, EntranceItem } from "./components/ui/EntranceList";
import {
  ExecutiveOverview,
  ForecastResult,
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
  useEffect(() => {
    if (bounds && !selectedDate) {
      setSelectedDate(bounds.last_selectable_date);
    }
  }, [bounds, selectedDate]);

  // ── Forecast mutation (MT-31 useForecastMutation) ──────────────────────
  const forecast = useForecastMutation();

  function handleSubmit(payload: ForecastRequest) {
    forecast.mutate(payload);
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

  const isPending = forecast.isPending;

  return (
    <ToastProvider>
      {/* MT-42: fire toast on forecast error (05 §7 message) */}
      <ToastHost error={forecast.error} status={forecast.status} />

      <div className="min-h-screen bg-base text-text-primary font-sans">
        {/* ── Sticky control bar ─────────────────────────────────────────── */}
        <ForecastControlBar
          selectedDate={selectedDate}
          selectedIds={selectedIds}
          isPending={isPending}
          onDateChange={setSelectedDate}
          onProductsChange={setSelectedIds}
          onSubmit={handleSubmit}
        />

        {/* ── Main content area ──────────────────────────────────────────── */}
        <main className="mx-auto max-w-screen-2xl px-6 py-8">
          {/*
           * MT-42: EntranceList wraps the panel grid so the staggered entrance
           * (fade + 12px rise, stagger 0.06s, 06 §2) fires once on Success.
           * Each EntranceItem carries the hover micro-interaction (scale 1.01 + glow).
           */}
          <EntranceList className="grid grid-cols-12 gap-6">

            {/* P1 — Executive Overview (col-span-12) */}
            <EntranceItem className="col-span-12">
              <ExecutiveOverview
                summary={forecastData?.summary}
                loading={isPending}
              />
            </EntranceItem>

            {/* P2 — Forecast Result (col-span-8) */}
            <EntranceItem className="col-span-12 xl:col-span-8">
              <ForecastResult
                results={forecastData?.results ?? []}
                activeSeriesId={activeSeriesId}
                onActiveChange={setActiveSeriesId}
                startDate={forecastData?.start_date ?? selectedDate}
                loading={isPending}
              />
            </EntranceItem>

            {/* P3 — Velocity (col-span-4) */}
            <EntranceItem className="col-span-12 xl:col-span-4">
              <VelocityPanel result={selectedResult} loading={isPending} />
            </EntranceItem>

            {/* P4 — Event Impact (col-span-6) */}
            <EntranceItem className="col-span-12 lg:col-span-6">
              <EventImpactPanel result={selectedResult} loading={isPending} />
            </EntranceItem>

            {/* P5 — Seasonal Trend (col-span-6) */}
            <EntranceItem className="col-span-12 lg:col-span-6">
              <SeasonalPanel result={selectedResult} loading={isPending} />
            </EntranceItem>

            {/* P6 — Inventory Risk (col-span-6) */}
            <EntranceItem className="col-span-12 lg:col-span-6">
              <InventoryRiskPanel result={selectedResult} loading={isPending} />
            </EntranceItem>

            {/* P7 — Explainability (col-span-6) */}
            <EntranceItem className="col-span-12 lg:col-span-6">
              <ExplainabilityPanel result={selectedResult} loading={isPending} />
            </EntranceItem>

          </EntranceList>
        </main>
      </div>
    </ToastProvider>
  );
}
