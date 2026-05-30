# 07 — Testing Strategy

> What "tested" and "done" mean across the project. Every micro-task ships its own tests; this
> file defines the shared conventions so the tests fit together. Keep tests **fast, deterministic,
> and offline**.

---

## 1. Philosophy
- Every `MT-XX` includes a **Tests** section and an **Acceptance checklist**. A task is done only
  when its tests pass **and** every checkbox is ticked.
- Tests are **deterministic** (seed 42, committed artifacts) and **offline** (no network).
- Prefer a few high-value tests over many trivial ones. Test the contract and the math.

---

## 2. Backend testing (pytest)

**Location:** `backend/tests/`. **Run:** `cd backend && pytest -q`.

### Conventions
- `conftest.py` provides shared fixtures:
  - `store` — a loaded `Store` singleton (model + data + profiles), session-scoped.
  - `client` — FastAPI `TestClient` (httpx) for API tests.
- Use tiny tolerances for floats: `pytest.approx(expected, abs=1e-6)` for golden vectors,
  `rel=1e-3` for derived stats.
- No test may require the raw CSVs **except** `test_data_prep.py`, which is **skipped** if
  `data/raw/sales_train_evaluation.csv` is absent (so it passes on a cloned repo):
  ```python
  pytestmark = pytest.mark.skipif(not RAW_PRESENT, reason="raw M5 data not present")
  ```

### What each backend test file covers
| file | covers | key assertions |
|---|---|---|
| `test_data_prep.py` | MT-10 | `series_daily.parquet` has 15,528 rows; 8 series; no NaN in `units`; `units` ≥ 0; price filled. (skip if raw absent) |
| `test_calendar_features.py` | MT-11 | `d_to_date(1)==2011-01-29`; `days_to_next_event`/`since` non-negative & capped at 28; snap_count ∈ 0..3. |
| `test_features.py` | MT-12 | feature columns == `FEATURES` order; categoricals are category dtype; no leakage (lag_1 at day t equals units at t-1); no NaN in train rows `d_index≥29`. |
| `test_forecast_engine.py` | MT-15 | output length 28; all ≥ 0; **golden test**: `recursive_forecast("turkey", 1300)` matches committed `expected_turkey_1300.json` within 1e-6. |
| `test_metrics.py` | MT-16..19 | sMAPE/accuracy on hand-built arrays; coherence edge cases (constant array → uses direction); velocity bucket boundaries (−50,−10,10,40); inventory risk monotonicity; explainability returns finite numbers. |
| `test_api.py` | MT-22..24 | `/api/health` 200; `/api/products` returns 8; `/api/calendar/bounds` matches `05` §4; `/api/forecast` happy path matches the `ForecastResult` schema; invalid product → 422; out-of-range date → 422 with `field=="start_date"`. |

### Golden test (anti-drift)
`test_forecast_engine.py` stores `backend/tests/golden/expected_turkey_1300.json` (the 28-value
forecast). If the algorithm changes unintentionally, this fails — protecting the locked spec.
The golden file is generated **once** after MT-15 is verified correct, then committed.

### Metrics evaluation test (success criterion S3)
`test_metrics.py::test_accuracy_target` forecasts a fixed date (`2015-06-15`) for all 8 products
and asserts `mean(accuracy) >= 60`. This encodes the project's honest accuracy bar.

---

## 3. Frontend testing (Vitest + React Testing Library)

**Location:** colocated `*.test.tsx` next to components, or `frontend/src/__tests__/`.
**Run:** `cd frontend && npm run test`. **Build gate:** `npm run build` must succeed with 0 TS errors.

### What frontend tests cover (MT-44 + per-component)
- **api.ts** parses a fixture response into typed objects without throwing.
- **ForecastControlBar:** disables Forecast when no product selected; disables out-of-range dates;
  calls the submit handler with `{product_ids, start_date}`.
- **ForecastResult:** given a fixture `ForecastResult`, renders actual + forecast series and the
  accuracy/coherence values.
- **StatCard / StatusBadge / RadialDial:** render given values; status maps to the correct color
  class; badge shows the text label.
- **Panels:** each panel renders without crashing given its fixture slice and shows the headline
  number (e.g. InventoryRiskPanel shows `recommended_order_qty`).
- **States:** loading shows skeleton; error shows toast text; idle shows the empty prompt.

Frontend tests use the committed JSON fixtures from `frontend/mock/fixtures/` so they never need
a running backend.

---

## 4. Integration / end-to-end (MT-46)
A scripted smoke test (documented commands, not a heavy E2E framework):
1. Start backend (`uvicorn`) and frontend (`npm run dev`) — or `docker compose up`.
2. `curl` `GET /api/health` → `model_loaded:true`.
3. `curl -X POST /api/forecast` with `{"product_ids":["turkey"],"start_date":"2015-11-01"}`
   → 200, response validates against the `ForecastResult` shape, `forecast` length 28.
4. Manual UI check against `06_UIUX_SPEC.md` §9 "wow" checklist + the §3 primary flow.
The MT-46 acceptance checklist captures these as ticks.

---

## 5. Definition of Done (applies to every micro-task)
- [ ] Code matches the file paths/signatures in the spec.
- [ ] The task's tests are written and **green**.
- [ ] No new runtime dependencies beyond those listed in `04` §6 / `06` §7.
- [ ] Lint/typecheck clean (`pytest` collects with no import errors; `tsc --noEmit` clean).
- [ ] The task's Acceptance checklist is fully ticked.
- [ ] Nothing outside the task's stated file scope was changed.

---

## 6. CI (optional, recommended for the dev PC)
A simple GitHub Action (authored in MT-46, optional) that on push runs:
`backend: pip install -r requirements.txt && pytest -q` and
`frontend: npm ci && npm run build && npm run test`.
If the team prefers, this can be skipped — local green tests are the gate.
