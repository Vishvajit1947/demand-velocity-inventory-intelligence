# Micro-Task Index (authoritative build list)

> 36 small, unambiguous tasks. Each lives in its own `MT-XX_*.md` file and can be run in an
> isolated Antigravity/Claude session using only that file + the foundation docs it lists.
> Numbering has gaps between phases on purpose (room to insert tasks without renumbering).

## How to run a task in a fresh session
Open a new session and provide it:
1. the `MT-XX_*.md` file, and
2. the foundation docs named in that task's **Prerequisites** (almost always a subset of
   `02_DATA_SPEC`, `03_ALGORITHM_SPEC`, `04_BACKEND_ARCHITECTURE`, `05_API_CONTRACT`,
   `06_UIUX_SPEC`, `07_TESTING_STRATEGY`).
Nothing else is needed.

---

## Phase 0 — Foundation (do first)
| ID | Title | Depends on | Track |
|----|-------|-----------|-------|
| MT-00 | Repo scaffold, `.gitignore`, README stub | — | infra |
| MT-01 | Backend init: `requirements.txt`, `config.py` (constants + PRODUCTS), app skeleton, `conftest.py` | MT-00 | backend |
| MT-02 | Frontend init: Vite+TS+Tailwind+shadcn, deps, fonts, folder tree | MT-00 | frontend |

## Phase 1 — ML pipeline  ✅ PROVIDED (pre-built, tested, committed — reference only)
> **These are already implemented in `backend/app/ml/` and `backend/app/models/` and pass 18
> tests.** Do NOT rebuild them. `MT-10…MT-19` remain as design rationale. See
> `../09_PROVIDED_CORE.md` for the authoritative engine API and `../08_DECISIONS_AND_DATA_NOTES.md`
> for why. Verify with `cd backend && python -m pytest -q`.

| ID | Title | Provided file | Status |
|----|-------|--------------|--------|
| MT-10 | Data extraction → `series_daily.parquet` | `app/ml/data_prep.py` | ✅ done |
| MT-11 | Calendar/event feature helpers | `app/ml/calendar_features.py` | ✅ done |
| MT-12 | Feature engineering | `app/ml/features.py` | ✅ done |
| MT-13 | Model training (scaled global LightGBM) | `app/ml/train.py` | ✅ done |
| MT-14 | Profiles builder | `app/ml/profiles.py` | ✅ done |
| MT-15 | Recursive forecast engine + golden test | `app/ml/forecast_engine.py` | ✅ done |
| MT-16 | Accuracy (WAPE) & coherence metrics | `app/ml/metrics.py` | ✅ done |
| MT-17 | Velocity metric | `app/ml/metrics.py` | ✅ done |
| MT-18 | Inventory risk simulation | `app/ml/metrics.py` | ✅ done |
| MT-19 | Explainability (counterfactual + narrative) | `app/ml/metrics.py` | ✅ done |

## Phase 2 — Backend API
| ID | Title | Depends on | Track |
|----|-------|-----------|-------|
| MT-20 | Pydantic schemas (`contracts.py`) == API contract | MT-01 | backend |
| MT-21 | `Store` loader (singletons for model/data/profiles) | MT-13, MT-14 | backend |
| MT-22 | Endpoints: health, products, calendar/bounds | MT-20, MT-21 | backend |
| MT-23 | `forecast_service` + `POST /api/forecast` | MT-16,17,18,19,20,21 | backend |
| MT-24 | App wiring: `main.py`, CORS, error handlers | MT-22, MT-23 | backend |
| MT-25 | Mock API server + fixtures (`frontend/mock/`) | MT-00 (+ reads 05) | frontend-enabler |

## Phase 3 — Frontend foundation (run in order; can start after MT-02 + MT-25)
| ID | Title | Depends on | Track |
|----|-------|-----------|-------|
| MT-30 | Design system: tokens + global CSS + UI primitives | MT-02 | frontend |
| MT-31 | API client, `types.ts`, `format.ts`, `useForecast` hook, React Query | MT-02, MT-25 | frontend |
| MT-32 | App shell/layout: topbar, animated background, responsive grid, panel containers, state orchestration | MT-30, MT-31 | frontend |

## Phase 4 — Control bar + core result
| ID | Title | Depends on | Track |
|----|-------|-----------|-------|
| MT-33 | Forecast Control Bar (date field + product multiselect + submit) | MT-32 | frontend |
| MT-34 | Forecast Result line chart (actual vs forecast) | MT-32 | frontend |
| MT-35 | Accuracy & Coherence radial dials | MT-30 | frontend |
| MT-36 | Executive Overview (4 stat cards from `summary`) | MT-32 | frontend |

## Phase 5 — Analytical panels (parallelizable after MT-32)
| ID | Title | Depends on | Track |
|----|-------|-----------|-------|
| MT-37 | Velocity gauge panel (Plotly radial) | MT-32 | frontend |
| MT-38 | Event Impact panel | MT-32 | frontend |
| MT-39 | Seasonal Trend panel | MT-32 | frontend |
| MT-40 | Inventory Risk panel | MT-32 | frontend |
| MT-41 | Explainability & Deep Dive panel | MT-32 | frontend |

## Phase 6 — Polish + integration (last)
| ID | Title | Depends on | Track |
|----|-------|-----------|-------|
| MT-42 | States polish: skeletons, empty/error, toasts, micro-animations | MT-33..41 | frontend |
| MT-43 | Responsive + accessibility pass | MT-42 | frontend |
| MT-44 | Frontend component tests (Vitest + RTL) | MT-33..41 | frontend |
| MT-45 | Docker Compose + Dockerfiles | MT-24, MT-43 | infra |
| MT-46 | E2E smoke test + README quickstart + final checklist | MT-45 | infra |

---

## Suggested parallel session plan
- **Session A (ML):** MT-10 → MT-19 in order.
- **Session B (backend API):** MT-20 → MT-24 (after A reaches MT-13/14 for artifacts; MT-20 can start anytime).
- **Session C (frontend):** MT-25 → MT-30 → MT-31 → MT-32 → MT-33…MT-41 → MT-42 → MT-43 → MT-44.
- **Session D (infra):** MT-00 first; MT-45 → MT-46 last.

A single person can also just go top-to-bottom: MT-00, 01, 02, 10…19, 20…25, 30…36, 37…41, 42…46.
