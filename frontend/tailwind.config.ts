import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 06 §2 Color tokens (LOCKED)
        base: "#070B14",
        panel: "rgba(18, 26, 44, 0.62)", /* MT-43 — bumped 0.55→0.62 for ≥4.5:1 contrast (06 §6) */
        "panel-solid": "#0E1626",
        "border-glass": "rgba(120, 160, 255, 0.12)",
        "text-primary": "#E8EEF9",
        "text-muted": "#8A97B2",
        "accent-cyan": "#2FE6FF",
        "accent-violet": "#8B5CFF",
        "accent-lime": "#4DFFB0",
        "accent-amber": "#FFC24D",
        "accent-rose": "#FF5C7A",
        "grid-line": "rgba(120, 160, 255, 0.08)",
      },
      fontFamily: {
        // 06 §2 Typography (LOCKED)
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        // 06 §2 scale: display 32 / h1 24 / h2 18 / body 14 / caption 12
        display: ["32px", { lineHeight: "1.1", fontWeight: "600" }],
        h1: ["24px", { lineHeight: "1.2", fontWeight: "600" }],
        h2: ["18px", { lineHeight: "1.3", fontWeight: "600" }],
        body: ["14px", { lineHeight: "1.5" }],
        caption: ["12px", { lineHeight: "1.4" }],
      },
      borderRadius: {
        // 06 §2 Shape (LOCKED)
        panel: "20px",
        card: "14px",
        chip: "9999px",
      },
      boxShadow: {
        // 06 §2 panel soft shadow
        panel: "0 8px 40px rgba(0, 0, 0, 0.45)",
      },
      backdropBlur: {
        panel: "18px", // 06 §2 panel blur
      },
    },
  },
  plugins: [],
};

export default config;
