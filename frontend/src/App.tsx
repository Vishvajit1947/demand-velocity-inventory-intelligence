/**
 * App — root shell with lifted forecast state (MT-32 wiring, 06 §3).
 * Owns: selectedDate, selectedIds, useForecastMutation.
 * Passes controlled props + callbacks down to ForecastControlBar (MT-33).
 * Downstream panels (MT-34…41) receive `forecastData` once the mutation resolves.
 */
import { useEffect, useState } from "react";
import { ForecastControlBar } from "./components/controls/ForecastControlBar";
import { useBounds, useForecastMutation } from "./hooks/useForecast";
import type { ForecastRequest, ForecastResponse, SeriesId } from "./lib/types";

export default function App() {
  // ── Lifted control-bar state (MT-32) ──────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<SeriesId[]>([]);

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

  // forecastData is available for downstream panels (MT-34…41).
  const forecastData: ForecastResponse | undefined = forecast.data;

  return (
    <div className="min-h-screen bg-base text-text-primary font-sans">
      {/* ── Sticky control bar ─────────────────────────────────────────── */}
      <ForecastControlBar
        selectedDate={selectedDate}
        selectedIds={selectedIds}
        isPending={forecast.isPending}
        onDateChange={setSelectedDate}
        onProductsChange={setSelectedIds}
        onSubmit={handleSubmit}
      />

      {/* ── Main content area (MT-36…41 panels go here) ────────────────── */}
      <main className="mx-auto max-w-screen-2xl px-6 py-8">
        {/* Idle state — no forecast run yet (06 §5) */}
        {!forecastData && !forecast.isPending && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
            <p className="text-h2 text-text-muted font-display">
              Select a date &amp; products, then Forecast
            </p>
            <p className="text-body text-text-muted">
              Results will appear here after your first forecast run.
            </p>
          </div>
        )}

        {/* Error state — toast shown by MT-42; panels keep last good data */}
        {forecast.isError && (
          <p className="text-caption text-accent-rose text-center mt-4">
            {forecast.error?.message ?? "An unexpected error occurred."}
          </p>
        )}

        {/* TODO(MT-36…41): Executive Overview + analytical panels */}
      </main>
    </div>
  );
}
