# Demand Velocity & Inventory Intelligence — Master Documentation Index

> **Read this file first.** It explains what every document is for, the order to build
> things in, and how to run a single micro-task in an isolated Google Antigravity / AI
> coding session **without needing to understand the rest of the project**.

---

## 1. What we are building (one paragraph)

A web dashboard that forecasts daily demand for **8 retail products** (Walmart M5 data).
A user opens the dashboard, picks a **start date** inside the test period and one or more
**products**, and clicks **Forecast**. The backend runs a pre-trained **LightGBM** model to
predict the next **28 days** of demand, then returns the forecast alongside the **actual**
sales for those days, plus **accuracy** and **coherence** scores and a set of inventory-
intelligence insights (velocity, stockout risk, event/seasonal explanations). The frontend
renders this in a **futuristic, animated, dark-theme dashboard** with 7 panels.

The data is split into **3 years of training** (`d_1`–`d_1095`) and **~2.3 years of test**
(`d_1096`–`d_1941`). The model is trained once on the training period; forecasts can be
generated from any date in the test period.

---

## 2. Document map

| # | File | What it defines | Audience |
|---|------|-----------------|----------|
| 00 | `00_INDEX.md` | This file. Build order + how to run a micro-task. | Everyone |
| 01 | `01_PROJECT_SPEC.md` | Goals, scope, glossary, success criteria, the 7 panels. | Everyone |
| 02 | `02_DATA_SPEC.md` | Exact data definitions, the 8 products, train/test split, processed data schema. | Backend / ML |
| 03 | `03_ALGORITHM_SPEC.md` | The full forecasting algorithm: features, model, recursive forecast, metrics formulas. | ML |
| 04 | `04_BACKEND_ARCHITECTURE.md` | FastAPI structure, modules, file tree, error handling. | Backend |
| 05 | `05_API_CONTRACT.md` | **The contract.** Every endpoint, request & response JSON, field-by-field. | Backend + Frontend |
| 06 | `06_UIUX_SPEC.md` | Design system, layout, every panel's look & interaction, animations. | Frontend |
| 07 | `07_TESTING_STRATEGY.md` | How testing works across the project; what "done" means. | Everyone |
| 08 | `08_DECISIONS_AND_DATA_NOTES.md` | **Why** 2 products were swapped + the algorithm/metric decisions. | Everyone |
| 09 | `09_PROVIDED_CORE.md` | **What's pre-built & tested** (the forecasting engine) + its exact API. | Backend |
| — | `micro-tasks/MT-XX_*.md` | Self-contained build tasks (design + dev + tests). One per session. | The session running it |

> **⚠️ The forecasting engine is already built, tested, and committed** (`backend/app/ml/*`,
> `backend/app/models/*`, `data/processed/`, `backend/tests/` — 18 passing tests). Students build
> the API + frontend + Docker **around** it. Read `09_PROVIDED_CORE.md` first. Tasks `MT-10…MT-19`
> are reference-only; the real build work is `MT-20…MT-46`.

**The two "source of truth" documents are `02_DATA_SPEC.md` and `05_API_CONTRACT.md`.**
Frontend and backend never need to read each other's code — they only need to agree on the
API contract. The ML tasks and the backend tasks only need to agree on the data spec.

---

## 3. Build order (dependency graph)

The project is broken into **36 small micro-tasks**. The authoritative list, dependencies, and
parallel-session plan live in **`micro-tasks/MT-INDEX.md`** — read that file for the full table.

High-level phases:
```
Phase 0  Foundation        MT-00 (scaffold) · MT-01 (backend init) · MT-02 (frontend init)
Phase 1  ML pipeline       MT-10 … MT-19  (data → features → model → forecast → metrics)
Phase 2  Backend API       MT-20 … MT-25  (schemas, store, endpoints, mock server)
Phase 3  Frontend base     MT-30 … MT-32  (design system, API client, app shell)
Phase 4  Control + result  MT-33 … MT-36  (control bar, forecast chart, dials, exec overview)
Phase 5  Panels            MT-37 … MT-41  (velocity, event, seasonal, risk, explainability)
Phase 6  Polish + ship     MT-42 … MT-46  (states, a11y, tests, Docker, E2E + README)
```

**Critical rule:** Frontend tasks are built against the **mock API server** (MT-25, see
`05_API_CONTRACT.md` §9). They do **not** need the real backend finished. MT-46 connects the two.

### Recommended scheduling (see `MT-INDEX.md` for detail)
- **Session A (ML):** MT-10 → MT-19 in order.
- **Session B (backend API):** MT-20 → MT-24.
- **Session C (frontend):** MT-25 → MT-30 → MT-31 → MT-32 → MT-33…41 → MT-42 → MT-43 → MT-44.
- **Session D (infra):** MT-00 first; MT-45 → MT-46 last.

---

## 4. How to run ONE micro-task in an isolated session

Each `MT-XX` file is written so you can paste it into a fresh Antigravity / Claude session
with **no other context** and it will work. Every micro-task file has the same sections:

1. **Context** — the 3–4 sentences of project background you need.
2. **Prerequisites** — which files/artifacts must already exist (and where to get them).
3. **Goal** — one sentence.
4. **Design** — exact decisions already made for you (no choices left open).
5. **Implementation** — files to create, function signatures, and code-level detail.
6. **Tests** — the exact tests to write and the commands to run.
7. **Acceptance checklist** — tick every box = task is done.

> When you start a session, give it: the `MT-XX` file **plus** the two source-of-truth files
> it lists under *Prerequisites* (usually `02_DATA_SPEC.md` and/or `05_API_CONTRACT.md`).
> Nothing else is required.

---

## 5. Locked global decisions (do not re-decide)

| Decision | Value |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | TailwindCSS + shadcn/ui + Framer Motion |
| Charts | Recharts (primary); Plotly only for the velocity gauge |
| Backend | Python 3.11 + FastAPI + Uvicorn |
| ML model | Single global **LightGBM** regressor (Tweedie objective) |
| Forecast horizon | **28 days** (recursive) |
| Granularity | **Item-level** — each product summed across all 10 stores → 8 series |
| Train / test split | Train `d_1`–`d_1095`; Test `d_1096`–`d_1941` |
| Selectable forecast start | `d_1096` (2014-01-28) … `d_1914` (2016-04-25) |
| Packaging | Docker Compose (one command) + documented local-dev fallback |
| Python dep manager | `pip` + `requirements.txt` (pinned versions) |
| Node version | 20 LTS |

Any value above that also appears in another doc is **duplicated on purpose** for
self-containment. If two docs ever disagree, **`00_INDEX.md` §5 and `05_API_CONTRACT.md` win.**

---

## 6. Glossary (used everywhere)

- **Series** — one product's total daily demand across all 10 stores. There are 8 series.
- **`d_n`** — the M5 day index. `d_1` = 2011-01-29. Calendar maps `d_n` ↔ real dates.
- **Horizon** — the 28 future days being forecast.
- **Recursive forecast** — predict day 1, feed it back as a lag to predict day 2, etc.
- **Velocity** — % change of recent 28-day demand vs the previous 28-day demand.
- **Accuracy score** — `max(0, 100 − sMAPE)` over the 28-day horizon (see `03` §6).
- **Coherence score** — how well the predicted *shape* matches actual shape (see `03` §6).
- **SNAP** — US food-assistance payout days; a demand driver in the calendar.
