// TODO(MT-32): replace this placeholder with the full app shell/layout
// (TopBar + sticky ControlBar + Executive Overview + responsive panel grid),
// per 06_UIUX_SPEC §3. This placeholder only proves the toolchain renders.

export default function App() {
  return (
    <main className="min-h-screen bg-base text-text-primary font-sans">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <h1 className="font-display text-display text-text-primary">
          Demand Velocity &amp; Inventory Intelligence
        </h1>
        <p className="mt-3 text-body text-text-muted">
          Frontend scaffold ready (MT-02). The dashboard shell arrives in MT-32.
        </p>
        <p className="mt-6 tabular text-accent-cyan">
          VITE_API_BASE: {import.meta.env.VITE_API_BASE}
        </p>
      </div>
    </main>
  );
}
