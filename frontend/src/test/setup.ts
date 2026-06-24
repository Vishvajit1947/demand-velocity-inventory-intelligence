// MT-44 — global Vitest setup: jest-dom matchers + jsdom shims (07 §3).
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees between tests (RTL hygiene).
afterEach(() => cleanup());

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

// Give elements a non-zero box so Recharts size queries don't return 0.
Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 800 });
Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 400 });
