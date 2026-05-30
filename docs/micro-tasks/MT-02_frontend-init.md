# MT-02 — Frontend Init (Vite + React + TS + Tailwind, deps, fonts, folder tree)

## 1. Context
We are building **Demand Velocity & Inventory Intelligence**, a futuristic, premium, animated dark dashboard that forecasts 28 days of demand for 8 retail products. The frontend is **React 18 + TypeScript + Vite**, styled with **TailwindCSS + shadcn/ui primitives**, animated with **Framer Motion**, and charts via **Recharts** + **react-plotly.js** (gauge only). It is built entirely against a **mock API server** (MT-25) via the `VITE_API_BASE` env var, so no real backend is required during MT-30…MT-44. This task scaffolds the `frontend/` app: it installs the exact locked dependency set (`06_UIUX_SPEC.md` §7), wires the build/test toolchain, loads the three Google Fonts, materializes the canonical folder tree (`06_UIUX_SPEC.md` §10) with TODO-stamped placeholders that later micro-tasks fill in, and produces a running dev server plus a clean type-checked build.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/06_UIUX_SPEC.md` (§2 design tokens — colors/typography/radius; §7 locked libraries; §10 frontend tree)
- `docs/05_API_CONTRACT.md` (§9 mock server + `VITE_API_BASE`, §1 base URL)
- `docs/00_INDEX.md` (§5 locked decisions — Node 20 LTS, React 18 + TS + Vite)

**Prior MT artifacts/paths that must already exist:**
- MT-00 created the repo scaffold including the empty `frontend/` directory tree (`frontend/`, `frontend/mock/fixtures/`, `frontend/src/theme/`, `frontend/src/lib/`, `frontend/src/hooks/`, `frontend/src/components/{ui,controls,panels}/`) and the root `.gitignore` (which already ignores `node_modules/`, `frontend/dist/`, `.env`, `*.local`). Per `MT-INDEX.md`, MT-02 depends only on MT-00.

**Tooling assumed installed on the dev PC:** **Node 20 LTS** + npm (`node -v` → `v20.x`). No backend or Python required for this task.

> All `frontend/` directories from MT-00 already exist; this task **adds files** into them. If a directory is missing (fresh clone where MT-00's `.gitkeep` was pruned), recreate it per §5.1.

## 3. Goal
Scaffold a runnable `frontend/` Vite + React-TS app with the exact locked dependencies, Tailwind/PostCSS wired to the `06` §2 design tokens, the three Google Fonts loaded, `VITE_API_BASE` set, and the full `06` §10 folder tree materialized with TODO-stamped placeholders — such that `npm install` then `npm run dev` serves the app and `npm run build` (which runs `tsc --noEmit` + `vite build`) completes with **zero** TypeScript errors.

## 4. Design (locked decisions; cite `06_UIUX_SPEC` sections)
Nothing here is open to choice — every value is locked by `06_UIUX_SPEC.md` or `00_INDEX.md` §5.

- **Stack (LOCKED, `06` §7 / `00` §5):** React 18 + TypeScript + Vite. TailwindCSS + shadcn/ui primitives. Framer Motion. Recharts + `react-plotly.js` (+ `plotly.js-dist-min`) for the velocity gauge only. TanStack Query (`@tanstack/react-query`). `react-countup`. `lucide-react`. Node 20.
- **Dev server port:** Vite default **5173** — the API contract (`05` §1) states the backend CORS allows origin `http://localhost:5173`; keep this port.
- **`VITE_API_BASE` (LOCKED, `05` §9 + §1):** `.env` sets `VITE_API_BASE=http://localhost:8000`. The mock server (MT-25) and the real backend both listen on `:8000`, so swapping tracks is an env change only — **no code change**. All API code reads `import.meta.env.VITE_API_BASE` (the typed client lands in MT-31).
- **Fonts (LOCKED, `06` §2 Typography):** Google Fonts **Space Grotesk** (display/headings), **Inter** (body/UI), **JetBrains Mono** (numeric/tabular). Loaded via `<link>` tags in `index.html`; mapped into Tailwind `fontFamily` as `display`, `sans`, `mono`.
- **Design tokens → Tailwind (LOCKED, `06` §2 Color / Shape):** Tailwind `theme.extend` mirrors the `06` §2 palette and radius so utility classes resolve to the exact tokens:
  - colors: `bg-base #070B14`, `bg-panel rgba(18,26,44,0.55)`, `bg-panel-solid #0E1626`, `border-glass rgba(120,160,255,0.12)`, `text-primary #E8EEF9`, `text-muted #8A97B2`, `accent-cyan #2FE6FF`, `accent-violet #8B5CFF`, `accent-lime #4DFFB0`, `accent-amber #FFC24D`, `accent-rose #FF5C7A`, `grid-line rgba(120,160,255,0.08)`.
  - radius: panel `20px`, card `14px`, chip `9999px`.
  - The same tokens are **also** emitted as CSS variables in `src/theme/tokens.css` in **MT-30** (design system). This task only seeds Tailwind config + a minimal global stylesheet so the dark page background renders; MT-30 owns the full `tokens.css` and primitives.
- **Tailwind dark-first (LOCKED, `06` §1):** one dark theme, no light mode. `index.html`/`body` get `bg-base`/`text-primary` so the page is dark immediately.
- **TypeScript:** `strict: true` (`07` §5 Definition of Done requires `tsc --noEmit` clean).
- **Vitest test config (`07` §3):** `environment: jsdom`, globals enabled, `@testing-library/react` + `@testing-library/jest-dom`. A single smoke test verifies the harness; real component tests arrive in MT-30/31/32/44.
- **Placeholder strategy:** every file in the `06` §10 tree that a **later** MT owns is created now as a minimal compiling placeholder containing a `// TODO(MT-XX): ...` comment naming the owning task. This guarantees the tree exists and the project type-checks without pre-empting later work. The two files MT-02 fully owns are `src/main.tsx` and `src/App.tsx` (placeholder App per the task scope).
- **App entry (`06` §10):** `src/main.tsx` creates a `QueryClient`, wraps `<App/>` in `QueryClientProvider`, and renders into `#root`. `src/App.tsx` is a minimal dark placeholder shell (the real shell/layout is MT-32).

## 5. Implementation (exact paths from `06` §10; FULL runnable code)
All paths are relative to the **repo root**. Run every command from `frontend/` unless stated otherwise. **Do not** use `create-vite`/`npm init` interactively (it prompts and can overwrite); author the files below directly, then `npm install`.

### 5.1 (If needed) ensure the folder tree exists
The canonical tree from `06` §10. MT-00 already created these; recreate only if missing. Run from the repo root.

```powershell
$dirs = @(
  "frontend/mock/fixtures",
  "frontend/src/theme","frontend/src/lib","frontend/src/hooks",
  "frontend/src/components/ui","frontend/src/components/controls","frontend/src/components/panels"
)
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
```

### 5.2 `frontend/package.json`
Exact dependency set from `06` §7 plus the toolchain (tailwind/postcss/autoprefixer, `@types/*`, vitest, RTL, jsdom). Pinned to Node-20-compatible versions.

```json
{
  "name": "demand-velocity-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@tanstack/react-query": "^5.59.0",
    "framer-motion": "^11.11.0",
    "recharts": "^2.13.0",
    "react-plotly.js": "^2.6.0",
    "plotly.js-dist-min": "^2.35.2",
    "react-countup": "^6.5.3",
    "lucide-react": "^0.451.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.4",
    "class-variance-authority": "^0.7.0"
  },
  "devDependencies": {
    "@types/node": "^20.16.0",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@types/react-plotly.js": "^2.6.3",
    "@vitejs/plugin-react": "^4.3.2",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "tailwindcss": "^3.4.13",
    "postcss": "^8.4.47",
    "autoprefixer": "^10.4.20",
    "vitest": "^2.1.2",
    "jsdom": "^25.0.1",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/user-event": "^14.5.2"
  }
}
```

> `clsx` + `tailwind-merge` + `class-variance-authority` are the standard shadcn/ui helper trio (used by the primitives in MT-30). `plotly.js-dist-min` + `@types/react-plotly.js` are required peers for `react-plotly.js` (velocity gauge, MT-37).

### 5.3 `frontend/index.html`
Mount node + the three Google Fonts (Space Grotesk, Inter, JetBrains Mono per `06` §2). Dark background applied immediately to avoid a white flash.

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Demand Velocity & Inventory Intelligence</title>

    <!-- Fonts: Space Grotesk (display), Inter (body), JetBrains Mono (numeric) — 06 §2 -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />

    <style>
      /* Dark-first: paint the page background before React mounts (06 §1) */
      html,
      body,
      #root {
        margin: 0;
        min-height: 100%;
        background-color: #070b14; /* --bg-base */
        color: #e8eef9; /* --text-primary */
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 5.4 `frontend/.env`
`VITE_API_BASE` per `05` §9 / §1. (`.env` is gitignored by MT-00; that is intentional.)

```dotenv
# Base URL the frontend talks to. Point at the MOCK server (MT-25) during MT-30..MT-44,
# then at the real backend (http://localhost:8000) for integration (MT-46). 05 §9.
VITE_API_BASE=http://localhost:8000
```

> Optional convenience: also create `frontend/.env.example` with the same line so a fresh clone (where `.env` is ignored) knows the expected variable. Recommended.

### 5.5 `frontend/vite.config.ts`
React plugin + Vitest jsdom test config (`07` §3). Dev server pinned to port 5173 (CORS, `05` §1).

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
```

### 5.6 `frontend/src/test/setup.ts`
Vitest setup — registers `@testing-library/jest-dom` matchers and a `matchMedia` stub (Framer Motion / `prefers-reduced-motion` reads it). Create the `src/test/` folder.

```ts
import "@testing-library/jest-dom/vitest";

// jsdom has no matchMedia; stub it so prefers-reduced-motion checks don't crash.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
```

### 5.7 `frontend/tailwind.config.ts`
`theme.extend` mirrors `06` §2 colors, fonts, and radius exactly.

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 06 §2 Color tokens (LOCKED)
        base: "#070B14",
        panel: "rgba(18, 26, 44, 0.55)",
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
```

### 5.8 `frontend/postcss.config.js`

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### 5.9 `frontend/tsconfig.json` (strict) + `frontend/tsconfig.node.json`
`tsconfig.json` (app code, strict):

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "useDefineForClassFields": true,
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json` (build tooling — vite/tailwind config files):

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "tailwind.config.ts", "postcss.config.js"]
}
```

### 5.10 `frontend/src/theme/global.css`
Minimal global stylesheet: Tailwind layers + base body styling so the dark page renders now. **MT-30 owns the full `src/theme/tokens.css`** (all CSS variables + glass/glow utilities); this file only imports Tailwind and sets fonts/background.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    color-scheme: dark;
  }
  body {
    @apply bg-base text-text-primary font-sans;
    font-size: 14px; /* 06 §2 base >= 14 */
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  /* Tabular numerics for KPIs/axes use the mono family (06 §2) */
  .tabular {
    @apply font-mono;
    font-variant-numeric: tabular-nums;
  }
}

/* tokens.css (MT-30) is imported in main.tsx once it exists. */
```

### 5.11 `frontend/src/main.tsx` (OWNED by MT-02)
QueryClientProvider + render App.

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./theme/global.css";
// import "./theme/tokens.css"; // TODO(MT-30): full design tokens + glass/glow utilities

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

### 5.12 `frontend/src/App.tsx` (OWNED by MT-02 — placeholder)
Minimal dark shell. The real TopBar / ControlBar / panel grid is built in **MT-32**.

```tsx
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
        <p className="mt-6 tabular text-accent-cyan">VITE_API_BASE: {import.meta.env.VITE_API_BASE}</p>
      </div>
    </main>
  );
}
```

### 5.13 Placeholder files for the rest of the `06` §10 tree
Create each of the following as a minimal **compiling** placeholder with a `// TODO(MT-XX)` comment naming the owning task. These keep the canonical tree present and the project type-checked without pre-empting later work. Each export is referenced by name in the owning MT.

**`frontend/src/lib/types.ts`**
```ts
// TODO(MT-31): mirror 05_API_CONTRACT §1 + all response/result types
// (SeriesId, VelocityStatus, RiskLevel, EventInfo, ProductInfo, BoundsResponse,
// Metrics, Velocity, Inventory, Factor, Explainability, Seasonal, ForecastResult,
// Summary, ForecastResponse, ForecastRequest).
export {};
```

**`frontend/src/lib/api.ts`**
```ts
// TODO(MT-31): typed fetch client (getHealth, getProducts, getBounds, postForecast)
// reading import.meta.env.VITE_API_BASE; throws a typed ApiError on non-2xx (05 §7).
export const API_BASE = import.meta.env.VITE_API_BASE as string;
```

**`frontend/src/lib/format.ts`**
```ts
// TODO(MT-31): formatNumber, formatPct (with sign), formatDate helpers.
export {};
```

**`frontend/src/hooks/useForecast.ts`**
```ts
// TODO(MT-31): TanStack Query wrappers (useProducts, useBounds, useForecastMutation).
export {};
```

**`frontend/src/components/ui/index.ts`**
```ts
// TODO(MT-30): UI primitives — GlassPanel, StatCard, StatusBadge, RadialDial, Chip,
// Button, Skeleton, Toast, SectionTitle, ProductSwitcher (06 §8).
export {};
```

**`frontend/src/components/controls/index.ts`**
```ts
// TODO(MT-33): ForecastControlBar, DateField, ProductMultiSelect (06 §4 P0 / §8).
export {};
```

**`frontend/src/components/panels/index.ts`**
```ts
// TODO(MT-34..41): ExecutiveOverview, ForecastResult, VelocityPanel, EventImpactPanel,
// SeasonalPanel, InventoryRiskPanel, ExplainabilityPanel (06 §4 / §8).
export {};
```

> The `frontend/mock/server.mjs` + `frontend/mock/fixtures/<series_id>.json` files are owned by **MT-25** (not this task). Leave `frontend/mock/fixtures/.gitkeep` (from MT-00) in place.

### 5.14 `frontend/.gitignore` (local)
The root `.gitignore` (MT-00) already ignores `node_modules/`, `frontend/dist/`, `.env`, `*.local`. Add a small frontend-local ignore for Vite/TS caches (optional but tidy):

```gitignore
# build / cache
dist/
node_modules/
*.tsbuildinfo
.vite/
# local env (also covered by root .gitignore)
.env
.env.local
```

### 5.15 Smoke test — `frontend/src/App.test.tsx`
Proves the Vitest + RTL harness works and the placeholder App renders.

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App scaffold (MT-02)", () => {
  it("renders the dashboard title", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /Demand Velocity & Inventory Intelligence/i }),
    ).toBeInTheDocument();
  });
});
```

### 5.16 Install
From `frontend/`:
```powershell
npm install
```

## 6. Tests / Verification
Run all commands from `frontend/`.

1. **Install succeeds.** `npm install` completes with no peer-dependency errors. `node -v` is `v20.x`.

2. **Dev server serves.**
   ```powershell
   npm run dev
   ```
   Vite prints `Local: http://localhost:5173/`. Open it: a dark page renders the title in Space Grotesk and the `VITE_API_BASE` line in JetBrains Mono cyan. Stop with Ctrl+C.

3. **Type-check + build clean (build gate, `07` §5).**
   ```powershell
   npm run build
   ```
   Runs `tsc --noEmit` (strict) then `vite build`; both must finish with **0 TypeScript errors** and emit `dist/`. (`npm run typecheck` runs just `tsc --noEmit`.)

4. **Tests pass.**
   ```powershell
   npm run test
   ```
   The `App.test.tsx` smoke test passes under the jsdom environment.

5. **Folder tree matches `06` §10.** Confirm these exist (placeholders included): `src/main.tsx`, `src/App.tsx`, `src/theme/global.css`, `src/lib/{api.ts,types.ts,format.ts}`, `src/hooks/useForecast.ts`, `src/components/{ui,controls,panels}/index.ts`, plus configs `index.html`, `package.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig.json`, `.env`.

6. **Fonts load.** In the running dev server, DevTools → Network shows the Google Fonts CSS request resolving (Space Grotesk / Inter / JetBrains Mono).

7. **Env reads.** The rendered `VITE_API_BASE: http://localhost:8000` line confirms `import.meta.env.VITE_API_BASE` is wired.

## 7. Acceptance checklist
- [ ] `frontend/package.json` lists the **exact** locked deps from `06` §7 (React 18, TS, Vite, Tailwind+PostCSS+autoprefixer, Framer Motion, Recharts, react-plotly.js + plotly.js-dist-min, TanStack Query, react-countup, lucide-react) plus `@types/*`, Vitest, RTL, jsdom.
- [ ] `npm install` completes cleanly on Node 20.
- [ ] `npm run dev` serves a dark page at `http://localhost:5173`.
- [ ] `npm run build` runs `tsc --noEmit` (strict) + `vite build` with **0 TypeScript errors**.
- [ ] `npm run test` passes the Vitest + RTL smoke test (jsdom env).
- [ ] `index.html` loads Space Grotesk, Inter, and JetBrains Mono (Google Fonts) and mounts `#root`.
- [ ] `tailwind.config.ts` `theme.extend` mirrors `06` §2 colors, fonts, radius, and panel shadow exactly.
- [ ] `.env` sets `VITE_API_BASE=http://localhost:8000` and `App.tsx` reads it via `import.meta.env`.
- [ ] `src/main.tsx` wraps `<App/>` in `QueryClientProvider`; `src/App.tsx` is the dark placeholder (real shell is MT-32).
- [ ] The full `06` §10 tree exists with TODO-stamped placeholders for files owned by later MTs (each TODO names the owning MT).
- [ ] Nothing outside `frontend/` was changed; `node_modules/`, `dist/`, `.env` remain gitignored.
