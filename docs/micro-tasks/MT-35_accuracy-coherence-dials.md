# MT-35 — Accuracy & Coherence Radial Dials

## 1. Context
Inside the **Forecast Result** panel area (`06_UIUX_SPEC.md` §3 — "FORECAST RESULT … + Accuracy dial + Coherence dial"; §4 "P2"), two **radial dials** summarize how trustworthy the active product's forecast is:
- **Accuracy** = `metrics.accuracy` (0–100, `max(0, 100 - sMAPE)`, `05_API_CONTRACT.md` §5).
- **Coherence** = `metrics.coherence` (0–100, blended shape+direction agreement), with band label `metrics.coherence_label` ∈ Strong/Moderate/Weak.

Each dial is a radial progress ring with the **count-up number in the center**, a **label below**, and a **color chosen by band**. A small caption shows `smape / mae / rmse`. This task builds `src/components/panels/AccuracyCoherence.tsx`, reusing the **`RadialDial`** primitive from MT-30 (do not reimplement the ring). It is presentational — the App passes the active product's `metrics`.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/05_API_CONTRACT.md` — §5 `metrics` object: `accuracy`, `coherence`, `coherence_label` (Strong|Moderate|Weak), `smape`, `mae`, `rmse`.
- `docs/06_UIUX_SPEC.md` — **§4 "P2 — Forecast Result" dial bullets** (locked: two radial rings 0–100, number centered, label below, color by band). §2 tokens + status→color map + count-up motion, §6 a11y (color + text label), §7 libs, §10 tree.
- `docs/07_TESTING_STRATEGY.md` — §3: "**StatCard / StatusBadge / RadialDial:** render given values; status maps to the correct color class"; and "given metrics, both dials show the right numbers and band colors."

**Prior MT artifacts that MUST already exist (import — do NOT redefine):**
- **MT-30** primitives `src/components/ui/`: **`RadialDial`** (radial progress ring; props assumed: `value`, `max`, `color`, `label`, `countUp`, `caption?`), `GlassPanel`, `SectionTitle`. (`RadialDial` already integrates `react-countup` per `06` §2 — pass `countUp`.)
- **MT-31** `src/lib/types.ts`: `Metrics` type (the `metrics` slice of `ForecastResult`).

**Deps:** none new — `react-countup` is consumed inside MT-30's `RadialDial` (`06` §7). React 18 + TS.

## 3. Goal
Implement `AccuracyCoherence.tsx` that, given `metrics: Metrics`:
1. Renders **two `RadialDial`s** side by side — Accuracy and Coherence — each 0–100, center value (count-up), label below.
2. Colors each dial **by band**:
   - **Accuracy bands** (locked, see §4): `>= 75` lime, `60–74` cyan, `40–59` amber, `< 40` rose.
   - **Coherence bands** by `coherence_label`: **Strong** → lime, **Moderate** → amber, **Weak** → rose. (Falls back to numeric `>=75/>=50/<50` if label missing.)
3. Shows a small **caption** under each (or the pair) with `sMAPE`, `MAE`, `RMSE` from `metrics`.

## 4. Design (locked decisions; cite `06` sections)
- **Two dials (`06` §4).** Use MT-30 `RadialDial` twice, `max={100}`. Center shows the integer/1-dp value with count-up (`06` §2 "Numbers count up on load, CountUp 0.8s"); pass `countUp` (default true), disabled under reduced motion by `RadialDial` itself.
- **Accuracy band → color (locked).** `06` §4 says "color by band (… high/low)" but does not enumerate accuracy thresholds, so we **lock** them here aligned to the `06` §2 status→color intent (positive=lime, ok=cyan, warning=amber, danger=rose) and the project's honest accuracy bar (`07` §2 `mean(accuracy) >= 60`):
  - `accuracy >= 75` → `--accent-lime` (strong)
  - `60 <= accuracy < 75` → `--accent-cyan` (solid)
  - `40 <= accuracy < 60` → `--accent-amber` (weak)
  - `accuracy < 40` → `--accent-rose` (poor)
- **Coherence band → color (`05` §5 `coherence_label`, `06` §2 map).** Drive color from the **API label** so frontend never re-derives the metric:
  - `Strong` → `--accent-lime`
  - `Moderate` → `--accent-amber`
  - `Weak` → `--accent-rose`
  - Defensive fallback (label absent/unknown): numeric `>=75` Strong, `>=50` Moderate, else Weak — matching `03/05` bands (consistent with MT-16).
- **Labels + a11y (`06` §6).** Each dial's label text ("Accuracy" / "Coherence") plus a band word is shown so meaning is never color-only. The coherence dial sub-label shows the band word (Strong/Moderate/Weak). The accuracy dial sub-label shows the band word derived above (Strong/Solid/Weak/Poor).
- **Caption (`06` §4 / §2 typography).** Mono, muted, tabular-nums: `sMAPE 21.6 · MAE 3.21 · RMSE 4.87`, formatted via `metrics` values. One caption row beneath the pair.
- **Container (`06` §3).** Rendered as a compact row inside a `GlassPanel` (the App places it below/beside the Forecast Result chart per `06` §3 layout). Tokens only (`06` §2).
- **No data fetching** — App passes `metrics` for the active product (the same `activeSeriesId` MT-34 exposes).

## 5. Implementation (exact file path from `06` §10; FULL runnable TSX)

### File: `src/components/panels/AccuracyCoherence.tsx`
```tsx
import { RadialDial } from "../ui/radial-dial";
import { GlassPanel } from "../ui/glass-panel";
import { SectionTitle } from "../ui/section-title";
import type { Metrics } from "../../lib/types";

export interface AccuracyCoherenceProps {
  /** The active product's metrics slice (05 §5). */
  metrics: Metrics;
  /** Disable count-up animation (idle/test). Defaults to animated. */
  countUp?: boolean;
}

/** Accuracy band → {color token, word} (LOCKED, MT-35 §4). */
export function accuracyBand(accuracy: number): { color: string; word: string } {
  if (accuracy >= 75) return { color: "var(--accent-lime)", word: "Strong" };
  if (accuracy >= 60) return { color: "var(--accent-cyan)", word: "Solid" };
  if (accuracy >= 40) return { color: "var(--accent-amber)", word: "Weak" };
  return { color: "var(--accent-rose)", word: "Poor" };
}

/** Coherence band → color, driven by the API label (05 §5), numeric fallback. */
export function coherenceBand(
  coherence: number,
  label?: string
): { color: string; word: string } {
  const word =
    label ?? (coherence >= 75 ? "Strong" : coherence >= 50 ? "Moderate" : "Weak");
  const color =
    word === "Strong"
      ? "var(--accent-lime)"
      : word === "Moderate"
      ? "var(--accent-amber)"
      : "var(--accent-rose)";
  return { color, word };
}

export function AccuracyCoherence({ metrics, countUp = true }: AccuracyCoherenceProps) {
  const acc = accuracyBand(metrics.accuracy);
  const coh = coherenceBand(metrics.coherence, metrics.coherence_label);

  return (
    <GlassPanel className="flex flex-col gap-3">
      <SectionTitle>Forecast Quality</SectionTitle>

      <div className="flex items-center justify-around gap-6">
        <div className="flex flex-col items-center gap-1" data-testid="dial-accuracy">
          <RadialDial
            value={metrics.accuracy}
            max={100}
            color={acc.color}
            label="Accuracy"
            countUp={countUp}
          />
          <span
            className="text-caption font-[Inter]"
            style={{ color: acc.color }}
          >
            {acc.word}
          </span>
        </div>

        <div className="flex flex-col items-center gap-1" data-testid="dial-coherence">
          <RadialDial
            value={metrics.coherence}
            max={100}
            color={coh.color}
            label="Coherence"
            countUp={countUp}
          />
          <span
            className="text-caption font-[Inter]"
            style={{ color: coh.color }}
          >
            {coh.word}
          </span>
        </div>
      </div>

      <p className="text-center text-caption text-[var(--text-muted)] font-[JetBrains_Mono] tabular-nums">
        sMAPE {metrics.smape.toFixed(1)} · MAE {metrics.mae.toFixed(2)} · RMSE{" "}
        {metrics.rmse.toFixed(2)}
      </p>
    </GlassPanel>
  );
}

export default AccuracyCoherence;
```

> **Note on `RadialDial` props.** MT-30 owns the ring + center value + count-up. This component only chooses the **band color/word** and the **caption**. If MT-30's `RadialDial` exposes a slightly different prop name for the centered value (e.g. `value`/`percent`), keep this component's mapping but match the primitive's signature — do not fork the primitive.

## 6. Tests / Verification (Vitest + RTL; commands)
**File:** `src/components/panels/AccuracyCoherence.test.tsx` (colocated, `07` §3). The band-selection logic is the load-bearing part, so we test it directly **and** assert the rendered numbers/band words. Count-up is disabled (`countUp={false}`) so the final value renders synchronously and deterministically (`07` §1).

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccuracyCoherence, accuracyBand, coherenceBand } from "./AccuracyCoherence";
import type { Metrics } from "../../lib/types";

function metrics(over: Partial<Metrics> = {}): Metrics {
  return {
    accuracy: 78.4,
    coherence: 71,
    coherence_label: "Moderate",
    smape: 21.6,
    mae: 3.21,
    rmse: 4.87,
    ...over,
  };
}

describe("accuracyBand (MT-35)", () => {
  it("maps accuracy to the locked color bands", () => {
    expect(accuracyBand(90).color).toBe("var(--accent-lime)");
    expect(accuracyBand(75).color).toBe("var(--accent-lime)");
    expect(accuracyBand(74).color).toBe("var(--accent-cyan)");
    expect(accuracyBand(60).color).toBe("var(--accent-cyan)");
    expect(accuracyBand(59).color).toBe("var(--accent-amber)");
    expect(accuracyBand(40).color).toBe("var(--accent-amber)");
    expect(accuracyBand(39).color).toBe("var(--accent-rose)");
  });
});

describe("coherenceBand (MT-35)", () => {
  it("colors from the API label", () => {
    expect(coherenceBand(71, "Strong").color).toBe("var(--accent-lime)");
    expect(coherenceBand(71, "Moderate").color).toBe("var(--accent-amber)");
    expect(coherenceBand(71, "Weak").color).toBe("var(--accent-rose)");
  });
  it("falls back to numeric bands when label is missing", () => {
    expect(coherenceBand(80).word).toBe("Strong");
    expect(coherenceBand(60).word).toBe("Moderate");
    expect(coherenceBand(20).word).toBe("Weak");
  });
});

describe("<AccuracyCoherence /> (MT-35)", () => {
  it("renders both dials with the right numbers and band words", () => {
    render(<AccuracyCoherence metrics={metrics({ accuracy: 78.4, coherence: 71, coherence_label: "Moderate" })} countUp={false} />);
    // labels present
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    expect(screen.getByText("Coherence")).toBeInTheDocument();
    // accuracy 78.4 -> Strong; coherence label -> Moderate
    expect(screen.getByText("Strong")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();
    // values rendered by RadialDial center (count-up off -> final value)
    expect(screen.getByText(/78/)).toBeInTheDocument();
    expect(screen.getByText(/71/)).toBeInTheDocument();
    // caption shows smape/mae/rmse
    expect(screen.getByText(/sMAPE 21.6/)).toBeInTheDocument();
    expect(screen.getByText(/MAE 3.21/)).toBeInTheDocument();
    expect(screen.getByText(/RMSE 4.87/)).toBeInTheDocument();
  });

  it("turns the accuracy dial rose when accuracy is poor", () => {
    render(<AccuracyCoherence metrics={metrics({ accuracy: 30 })} countUp={false} />);
    expect(accuracyBand(30).color).toBe("var(--accent-rose)");
    expect(screen.getByText("Poor")).toBeInTheDocument();
  });
});
```

> **RadialDial center value:** the assertions `getByText(/78/)` / `/71/` assume MT-30's `RadialDial` renders the numeric value as text in the center (with count-up off it is the final value). If MT-30 rounds to an integer, `78.4`→`78` still matches `/78/`. Adjust the regex only if MT-30's formatting differs — do not change the dial.

**Commands (run from `frontend/`):**
```powershell
cd frontend
npm run test -- AccuracyCoherence
npm run build   # 0 TS errors (07 §3 build gate)
```

## 7. Acceptance checklist
- [ ] File exists at `src/components/panels/AccuracyCoherence.tsx` (`06` §10).
- [ ] Uses **two MT-30 `RadialDial`s** (not a reimplemented ring); `GlassPanel`/`SectionTitle` from MT-30; `Metrics` type from MT-31 — none redefined.
- [ ] Accuracy dial value = `metrics.accuracy`, colored by the locked bands (`>=75 lime`, `60–74 cyan`, `40–59 amber`, `<40 rose`) with a band word shown as text.
- [ ] Coherence dial value = `metrics.coherence`, colored by `metrics.coherence_label` (Strong→lime, Moderate→amber, Weak→rose), numeric fallback when label absent.
- [ ] Both numbers count up on load (`react-countup` via `RadialDial`); reduced-motion respected by the primitive.
- [ ] Caption shows `sMAPE / MAE / RMSE` from `metrics`, mono + tabular-nums.
- [ ] Color is always paired with a text label (`06` §6); tokens only (`06` §2).
- [ ] Tests pass (band mappings + rendered numbers/words + rose-when-poor); `npm run build` clean.
