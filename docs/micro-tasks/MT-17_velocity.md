# MT-17 — Velocity Metric

## 1. Context
**Demand Velocity** is the project's signature metric: how fast a product's demand is changing — the predicted next-28-day volume versus the actual previous-28-day volume — expressed as a percentage with a human status label (Critical Decline → Accelerating). It drives the velocity gauge panel (MT-37) and the executive summary's `avg_velocity`. This task adds `compute_velocity` to the shared metrics module `backend/app/ml/metrics.py`, implementing `03_ALGORITHM_SPEC.md` §6.3 **exactly**. The result is surfaced at `velocity.value` / `velocity.status` in the API (`05_API_CONTRACT.md` §5).

> **Shared module note.** `backend/app/ml/metrics.py` is a **single module shared by MT-16, MT-17, MT-18, MT-19**. MT-16 already created the file (header, `_as_float_array`, `compute_accuracy`, `compute_coherence`). MT-17 **appends** `compute_velocity` below the existing functions and extends `__all__`. Do not recreate the file, do not modify or remove the MT-16 functions.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/03_ALGORITHM_SPEC.md` — **§6.3 (velocity score + status)**: the EXACT formula and bucket boundaries. Do not re-decide.
- `docs/04_BACKEND_ARCHITECTURE.md` — §1 (path `backend/app/ml/metrics.py`), §2 (ml/* pure functions), §6 (deps).
- `docs/05_API_CONTRACT.md` — §1 (`VelocityStatus` literal union), §5 (`velocity.value/status`), §5 summary note (`avg_velocity` caps each value at 999 before averaging — informs why 999 is the sentinel).
- `docs/07_TESTING_STRATEGY.md` — §2 (`test_metrics.py` covers MT-16..19; velocity bucket boundaries −50, −10, 10, 40).

**Prior MT artifacts/paths that must already exist:**
- MT-16 created `backend/app/ml/metrics.py` (with header + `compute_accuracy` + `compute_coherence`) and `backend/tests/test_metrics.py`.
- MT-15 (`recursive_forecast`) supplies the 28-value `forecast` array this metric sums.

**Deps:** `numpy` only (already imported in the shared module). No new dependencies.

## 3. Goal
Append one pure function to `backend/app/ml/metrics.py`:

```python
def compute_velocity(prev_28_actual_sum, forecast) -> dict   # keys: value, status
```

implementing `03_ALGORITHM_SPEC.md` §6.3 **exactly**:
- `prev_28 = prev_28_actual_sum` (the caller passes the precomputed sum of actual units for days `[start-28 .. start-1]`).
- `recent_28 = sum(forecast)`.
- Guard `prev_28 == 0`: `value = 0.0` if `recent_28 == 0` else `999.0`.
- Otherwise `value = round((recent_28 - prev_28) / prev_28 * 100, 1)`.
- `status` buckets at exactly `-50, -10, 10, 40`.

## 4. Design (locked decisions; cite foundation sections)
All decisions are **locked** in `03_ALGORITHM_SPEC.md` §6.3 — implement verbatim.

- **Inputs (locked signature).** `compute_velocity(prev_28_actual_sum, forecast)`.
  - `prev_28_actual_sum` is a **scalar** = `sum(actual units for days [start-28 .. start-1])` (`03` §6.3: `prev_28 = sum(actual ... [start-28 .. start-1])`). The caller (MT-23 `forecast_service`) computes this sum from `series_daily` because the metrics module is pure and has no data access. Passing the pre-summed scalar (rather than the raw 28-day actual array) is the locked contract for this function so it stays decoupled from data layout.
  - `forecast` is the engine's 28 float predictions; `recent_28 = sum(forecast)` (`03` §6.3).
- **Formula (`03` §6.3, verbatim).**
  ```
  if prev_28 == 0:  velocity = 0.0 if recent_28 == 0 else 999.0
  else:             velocity = round((recent_28 - prev_28) / prev_28 * 100, 1)
  ```
  - `999.0` is the explicit "infinite growth from a zero base" sentinel. `05` §5 summary caps each velocity at 999 before averaging, confirming 999 is the locked sentinel (do not use `inf`).
  - The `prev_28 == 0` comparison is exact-zero on the summed scalar. (Actual units are non-negative per `02` §4, so `prev_28 < 0` cannot occur; `recent_28` from clipped forecasts is `>= 0` per `03` §4 `yhat = max(0, ...)`.)
- **Status buckets (`03` §6.3, verbatim — note the half-open boundaries):**
  ```
  status = "Critical Decline" if velocity < -50
           "Declining"        if -50 <= velocity < -10
           "Stable"           if -10 <= velocity <= 10
           "Growing"          if  10 <  velocity <= 40
           "Accelerating"     if velocity > 40
  ```
  Boundary ownership (exact, from the inequalities above):
  - `velocity == -50` → **Declining** (`-50 <= v`, not `< -50`).
  - `velocity == -10` → **Stable** (`-10 <= v`).
  - `velocity == 10` → **Stable** (`v <= 10`).
  - `velocity == 40` → **Growing** (`v <= 40`).
  - `velocity == 999.0` (prev==0, recent>0) → `999 > 40` → **Accelerating**.
  - `velocity == 0.0` (prev==0, recent==0) → `-10 <= 0 <= 10` → **Stable**.
  The five labels are exactly the `VelocityStatus` union in `05` §1.
- **Return shape.** `dict(value=<float>, status=<str>)` — matches `05` §5 `velocity` object. `value` is the rounded float (or `0.0`/`999.0`).
- **Pure / deterministic.** No I/O, no FastAPI, numpy only (`04` §2, §6).

## 5. Implementation (exact file paths; FULL runnable code)
**File:** `backend/app/ml/metrics.py` — **append** the following below the MT-16 functions. Also extend `__all__`.

Update the existing `__all__` to include the new name:
```python
__all__ = [
    "compute_accuracy",
    "compute_coherence",
    "compute_velocity",   # MT-17
]
```

Append this code (after `compute_coherence`):
```python
# ---------------------------------------------------------------------------
# MT-17 — 03_ALGORITHM_SPEC.md §6.3 Velocity score + status
# ---------------------------------------------------------------------------
def _velocity_status(velocity: float) -> str:
    """Map a velocity % to its status bucket (03 §6.3, exact boundaries)."""
    if velocity < -50.0:
        return "Critical Decline"
    if velocity < -10.0:          # -50 <= v < -10
        return "Declining"
    if velocity <= 10.0:          # -10 <= v <= 10
        return "Stable"
    if velocity <= 40.0:          # 10 < v <= 40
        return "Growing"
    return "Accelerating"         # v > 40


def compute_velocity(prev_28_actual_sum, forecast) -> dict:
    """Demand velocity (% change of next-28 forecast vs prior-28 actual) + status (03 §6.3).

    prev_28   = prev_28_actual_sum   # caller-supplied sum of actual units [start-28 .. start-1]
    recent_28 = sum(forecast)
    if prev_28 == 0:  value = 0.0 if recent_28 == 0 else 999.0
    else:             value = round((recent_28 - prev_28) / prev_28 * 100, 1)

    Returns dict(value, status).
    """
    prev_28 = float(prev_28_actual_sum)
    recent_28 = float(np.sum(_as_float_array(forecast)))

    if prev_28 == 0.0:
        value = 0.0 if recent_28 == 0.0 else 999.0
    else:
        value = round((recent_28 - prev_28) / prev_28 * 100.0, 1)

    return {"value": value, "status": _velocity_status(value)}
```

> The function reuses `_as_float_array` defined by MT-16 and the module-level `import numpy as np`. No new imports.

## 6. Tests / Verification (exact pytest tests + commands)
**File:** `backend/tests/test_metrics.py` — **append** the MT-17 tests below the MT-16 tests. Add `compute_velocity` to the existing import line.

Update the import at the top of the file:
```python
from app.ml.metrics import compute_accuracy, compute_coherence, compute_velocity
```

Append:
```python
# ---------- MT-17: velocity ----------
def _forecast_summing_to(total, n=28):
    """Helper: an n-length forecast whose sum is exactly `total`."""
    arr = [0.0] * n
    arr[0] = float(total)
    return arr


def test_velocity_stable_zero_change():
    # prev=100, recent=100 -> 0.0% -> Stable
    out = compute_velocity(100.0, _forecast_summing_to(100.0))
    assert out["value"] == 0.0
    assert out["status"] == "Stable"


@pytest.mark.parametrize(
    "prev, recent, expected_value, expected_status",
    [
        # boundary at -50: v == -50 -> Declining
        (100.0, 50.0, -50.0, "Declining"),
        # just below -50 -> Critical Decline
        (100.0, 49.0, -51.0, "Critical Decline"),
        # boundary at -10: v == -10 -> Stable
        (100.0, 90.0, -10.0, "Stable"),
        # just below -10 -> Declining
        (100.0, 89.0, -11.0, "Declining"),
        # boundary at +10: v == 10 -> Stable
        (100.0, 110.0, 10.0, "Stable"),
        # just above +10 -> Growing
        (100.0, 111.0, 11.0, "Growing"),
        # boundary at +40: v == 40 -> Growing
        (100.0, 140.0, 40.0, "Growing"),
        # just above +40 -> Accelerating
        (100.0, 141.0, 41.0, "Accelerating"),
    ],
)
def test_velocity_bucket_boundaries(prev, recent, expected_value, expected_status):
    out = compute_velocity(prev, _forecast_summing_to(recent))
    assert out["value"] == pytest.approx(expected_value, abs=1e-9)
    assert out["status"] == expected_status


def test_velocity_prev_zero_recent_zero():
    # prev==0 and recent==0 -> 0.0 -> Stable
    out = compute_velocity(0.0, _forecast_summing_to(0.0))
    assert out["value"] == 0.0
    assert out["status"] == "Stable"


def test_velocity_prev_zero_recent_positive_sentinel():
    # prev==0 and recent>0 -> 999.0 -> Accelerating
    out = compute_velocity(0.0, _forecast_summing_to(37.5))
    assert out["value"] == 999.0
    assert out["status"] == "Accelerating"


def test_velocity_rounding_one_decimal():
    # prev=3, recent=4 -> (4-3)/3*100 = 33.333... -> 33.3
    out = compute_velocity(3.0, _forecast_summing_to(4.0))
    assert out["value"] == 33.3
    assert out["status"] == "Growing"


def test_velocity_sums_forecast_array():
    # recent_28 is the SUM of the whole forecast array, not just one element
    fc = [10.0] * 28  # sum = 280
    out = compute_velocity(140.0, fc)
    assert out["value"] == 100.0       # (280-140)/140*100
    assert out["status"] == "Accelerating"
```

**Commands (run from `backend/`):**
```powershell
cd backend
pytest -q tests/test_metrics.py -k "velocity"
```
All `velocity` tests must pass.

## 7. Acceptance checklist
- [ ] `compute_velocity(prev_28_actual_sum, forecast) -> dict` is appended to `backend/app/ml/metrics.py` (MT-16 functions untouched).
- [ ] `__all__` now includes `"compute_velocity"`.
- [ ] `recent_28 = sum(forecast)`; `prev_28 = prev_28_actual_sum` (scalar) — matches `03` §6.3.
- [ ] `prev_28 == 0` guard returns `0.0` (recent 0) or `999.0` (recent > 0), per `03` §6.3.
- [ ] Otherwise `value = round((recent_28 - prev_28)/prev_28*100, 1)`.
- [ ] Status boundaries exact: `-50` → Declining, `-10` → Stable, `10` → Stable, `40` → Growing; `< -50` Critical Decline; `> 40` (incl. 999) Accelerating; `0.0` Stable.
- [ ] The five status strings are exactly the `VelocityStatus` union in `05` §1; return keys are `value`, `status` (`05` §5).
- [ ] Pure function, numpy only (`04` §2, §6); no FastAPI/I/O; deterministic.
- [ ] `pytest -q tests/test_metrics.py -k "velocity"` passes.
