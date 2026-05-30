# 01 — Project Specification

> Companion to `00_INDEX.md`. This document defines **what** the product is and **what
> "done" looks like**. It contains no code. Every claim here is made concrete in `02`–`07`.

---

## 1. Vision

Build **Demand Velocity & Inventory Intelligence** — a single-page web dashboard that turns
5 years of historical retail sales into forward-looking demand forecasts and inventory
decisions. A non-expert user selects a date and products and instantly sees:

- a **28-day demand forecast** overlaid on the **actual** sales,
- **how good** the forecast is (accuracy + coherence),
- **why** demand is moving (events, seasonality, trend), and
- **what to do** about inventory (stockout / overstock risk + replenishment quantity).

The experience must look **futuristic, premium, and "AI-powered"** — a recruiter or
professor seeing it should assume a small startup built it.

---

## 2. Primary user flow (the spine of the whole app)

```
1. User lands on the dashboard (dark, animated, "Inventory Command Center" feel).
2. In the Control Bar:
      • picks a START DATE (or week) inside the TEST period (2014-01-28 … 2016-04-25),
      • selects one or more of the 8 PRODUCTS (chips / multi-select),
      • clicks  ⟶  FORECAST.
3. The app calls POST /api/forecast.
4. Results animate in:
      • Forecast Result panel: line chart = actual history + actual horizon + forecast,
        with an ACCURACY score and a COHERENCE score.
      • Executive Overview: totals, # high-risk products, velocity summary, active events.
      • Velocity / Event / Seasonal / Inventory-Risk / Deep-Dive / Explainability panels
        update for the selected product(s).
5. User can change the date/products and forecast again; panels re-animate.
```

This flow is the acceptance backbone: if a user can do steps 1–5 end-to-end, the project works.

---

## 3. Scope

### In scope
- The **8 finalized products** (see `02_DATA_SPEC.md` §2), item-level (summed across 10 stores).
- A **single pre-trained LightGBM model** covering all 8 products.
- **28-day** recursive forecasts from any selectable test date.
- Accuracy + coherence metrics computed against real actuals.
- The **7 dashboard panels** (see §5) + the control bar + the forecast result view.
- Inventory risk via a **simulated** reorder model (the data has no real stock — we simulate).
- One-command Docker run + local-dev fallback.

### Out of scope (explicitly, to remove ambiguity)
- User accounts / auth / multi-tenant.
- Live/streaming data or retraining from the UI.
- All 30,490 M5 series (we use only the 8 chosen products).
- Mobile-first layout (desktop-first; must be *usable* but not optimized for phones).
- Real warehouse/ERP integration.
- Per-store forecasts (granularity is item-level only — locked).

---

## 4. Success criteria (measurable)

| # | Criterion | How it is verified |
|---|-----------|--------------------|
| S1 | `docker compose up` brings up frontend + backend with no manual steps. | MT-14 smoke test |
| S2 | Selecting any valid date + product returns a forecast in < 2 s. | MT-06 / MT-14 |
| S3 | Forecast accuracy score ≥ 60 averaged across the 8 products on a fixed eval date. | MT-05 eval test |
| S4 | Every one of the 7 panels renders with real data for a selected product. | MT-10–13 tests |
| S5 | UI passes the "wow" bar: dark theme, smooth animation, responsive ≥ 1280px. | MT-07 visual checklist |
| S6 | All backend modules have unit tests that pass (`pytest`), all green. | CI / local pytest |
| S7 | Frontend builds with `npm run build` and has zero TypeScript errors. | MT-07 acceptance |
| S8 | A new person can run a single `MT-XX` spec to completion using only that file + its listed prerequisites. | Manual |

> **Accuracy target rationale:** the 8 products span very easy (milk, bread: near-flat) to
> very hard (turkey, candy: huge one-day spikes). A 60-average is realistic and honest; we do
> **not** promise 90%+. The dashboard shows the *real* score, never a faked one.

---

## 5. The 7 panels (from the original Project Doc, made concrete)

Each panel's exact visuals/interactions are in `06_UIUX_SPEC.md`; the data each needs is in
`05_API_CONTRACT.md`. Summary:

| Panel | Purpose | Key visuals | Spec'd in |
|---|---|---|---|
| **P1 Executive Overview** | At-a-glance KPIs for the current selection. | 4 stat cards: total predicted demand, # high-risk products, avg velocity, active events. | MT-10 |
| **P2 Forecast Result** | The core deliverable: actual vs predicted. | Line chart (history + horizon + forecast band), accuracy & coherence dials. | MT-09 |
| **P3 Product Velocity Intelligence** | Is the product accelerating or declining? | Radial velocity gauge + status badge (Critical/Declining/Stable/Growing/Accelerating). | MT-11 |
| **P4 Event Impact** | How events drive spikes. | Bar chart of event uplift %, event markers on timeline. | MT-11 |
| **P5 Seasonal Trend** | Monthly/weekly seasonality. | Monthly heatmap/bars + weekday pattern. | MT-11 |
| **P6 Inventory Risk Intelligence** | Stockout/overstock + replenishment. | Risk badge, projected stock line vs demand, recommended reorder qty. | MT-12 |
| **P7 Explainability & Insight** | Plain-English "why". | Auto-generated narrative bullets + factor contribution bars. | MT-13 |

(The original "Product Deep Dive" panel is merged into P7's section as a "Deep Dive" tab —
see MT-13 — to avoid duplicating P2–P5.)

---

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | `/api/forecast` for up to 8 products ≤ 2 s warm; model loads once at startup. |
| Reproducibility | Fixed random seeds; pinned dependency versions; committed `model.pkl`. |
| Determinism | Same request → same response (no randomness at inference). |
| Accessibility | Color is never the only signal (badges have text); base font ≥ 14px. |
| Browser support | Latest Chrome/Edge/Firefox. |
| Resolution | Designed for 1280–1920px wide; must not break (just scroll) below. |
| Error handling | Invalid date/product → 422 with a clear message; UI shows a friendly toast. |
| Offline-from-internet | Runs fully locally; no external API calls at runtime. |

---

## 7. Deliverables checklist (project-level)

- [ ] `docs/` — this documentation set (provided).
- [ ] `backend/` — FastAPI service + ML pipeline + `model.pkl` + tests.
- [ ] `frontend/` — React dashboard + tests.
- [ ] `docker-compose.yml` + per-service `Dockerfile`s.
- [ ] `README.md` — quickstart (generated in MT-14).
- [ ] `data/processed/` — generated artifacts (built by MT-01, not committed if large).
- [ ] All `MT-XX` acceptance checklists ticked.
