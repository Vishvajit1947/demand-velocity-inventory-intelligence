import "@testing-library/jest-dom/vitest";

// jsdom has no matchMedia; stub it so prefers-reduced-motion checks don't crash.
// Return matches:true for prefers-reduced-motion so count-up / animations resolve
// to their final value immediately in tests (07 §3 "reduced-motion test env").
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom has no ResizeObserver; stub it so Recharts' ResponsiveContainer doesn't crash.
if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
