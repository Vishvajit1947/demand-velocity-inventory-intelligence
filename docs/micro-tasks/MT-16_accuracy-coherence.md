# MT-16 — Accuracy & Coherence Metrics

## 1. Context
The forecast engine (MT-15, `recursive_forecast`) produces a 28-day prediction for a product. The dashboard's headline scores — **Accuracy** (how close the forecast is to the actuals) and **Coherence** (does the forecast move in the same shape/direction as reality) — are computed from the aligned `actual` vs `forecast` arrays over the horizon. This task implements the first two metric functions, `compute_accuracy` and `compute_coherence`, into the shared metrics module `backend/app/ml/metrics.py`. These are **pure functions** (no FastAPI, no globals) per `04_BACKEND_ARCHITECTURE.md` §2 — they take arrays in and return dicts out. They are surfaced verbatim in the API at `metrics.accuracy / metrics.coherence / metrics.coherence_label / metrics.smape / metrics.mae / metrics.rmse` (`05_API_CONTRACT.md` §5).

> **Shared module note.** `backend/app/ml/metrics.py` is a **single module shared by MT-16, MT-17, MT-18, MT-19**. Each of those tasks adds its own function(s) to this **same file, additively** — do not create per-metric files and do not overwrite functions added by a sibling task. MT-16 is the first to touch the file, so it also creates the module header / imports; MT-17–19 append below.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/03_ALGORITHM_SPEC.md` — **§6.1 (accuracy/sMAPE)** and **§6.2 (coherence)**: the EXACT formulas. Do not re-derive.
- `docs/04_BACKEND_ARCHITECTURE.md` — §1 (repo path `backend/app/ml/metrics.py`), §2 (ml/* are pure functions), §6 (allowed deps: `numpy==2.1.3`, `scipy==1.15.0`).
- `docs/05_API_CONTRACT.md` — §5 `metrics` object shape (field names/types the API exposes).
- `docs/07_TESTING_STRATEGY.md` — §2 (pytest conventions, `pytest.approx`, `test_metrics.py` covers MT-16..19).

**Prior MT artifacts/paths that must already exist:**
- MT-00 created the folder tree, including `backend/app/ml/` and `backend/tests/`.
- MT-01 created `backend/app/ml/__init__.py` and `backend/tests/conftest.py`.
- MT-15 defines `recursive_forecast` in `backend/app/ml/forecast_engine.py` (not used directly here, but the `forecast` arrays this metric consumes come from it).

**Deps:** only `numpy` and `scipy` (both pinned in `04` §6). No new dependencies.

## 3. Goal
Add two pure functions to `backend/app/ml/metrics.py`:

```python
def compute_accuracy(actual, forecast) -> dict   # keys: accuracy, smape, mae, rmse
def compute_coherence(actual, forecast) -> dict   # keys: coherence, coherence_label
```

implementing `03_ALGORITHM_SPEC.md` §6.1 and §6.2 **exactly**, including the edge cases:
- all-zero arrays → `accuracy == 100.0` (and `smape == 0.0`).
- constant `actual` (or constant `forecast`) → Pearson corr is NaN → coherence uses **direction only**.
- `coherence_label`: `>= 75` → `"Strong"`, `50–74` → `"Moderate"`, `< 50` → `"Weak"`.

## 4. Design (locked decisions; cite foundation sections)
All formulas are **locked** in `03_ALGORITHM_SPEC.md` §6 — implement them verbatim; do not invent alternatives.

- **Inputs.** Both functions take two array-likes `actual` and `forecast` of equal length `n` (`n ≤ 28`, the horizon, per `03` §6 intro: `a = actual[start..start+27]`, `f = forecast[start..start+27]`). They are coerced to `numpy` float arrays internally. Callers (MT-23 `forecast_service`) pass the horizon actuals (from `series_daily`) and the engine's float predictions.
- **Accuracy (`03` §6.1).**
  ```
  sMAPE = mean over days where (|a_t| + |f_t|) > 0 of ( 2*|a_t - f_t| / (|a_t| + |f_t|) ) * 100
  accuracy = round( max(0.0, 100.0 - sMAPE), 1 )
  ```
  - Days where `|a_t| + |f_t| == 0` are **excluded** from the sMAPE mean (no divide-by-zero).
  - If **every** day has `|a_t| + |f_t| == 0` (all zeros) → `accuracy = 100.0` and `smape = 0.0` (per `03` §6.1 final sentence: "If every `(|a_t|+|f_t|)==0` (all zeros), `accuracy = 100.0`").
  - Also return `mae = mean(|a-f|)` and `rmse = sqrt(mean((a-f)^2))`, each **rounded to 2 decimals** (`03` §6.1: "Also return raw `mae` … and `rmse`, rounded to 2 decimals"). `mae`/`rmse` use **all** days (no exclusion); for empty input they are `0.0`.
- **Coherence (`03` §6.2).**
  ```
  shape_corr = Pearson corr(a, f)        # NaN if either array is constant
  direction  = fraction of t in [1..len-1] where sign(a_t - a_{t-1}) == sign(f_t - f_{t-1})
  if shape_corr is NaN:                  # constant actual or forecast
      coherence = round(100 * direction, 1)
  else:
      coherence = round(100 * (0.5 * max(0, shape_corr) + 0.5 * direction), 1)
  ```
  - **Pearson corr** is computed via `scipy.stats.pearsonr` (allowed in `04` §6: "pearsonr via scipy"). When either array is constant, `pearsonr` returns/raises a NaN-correlation situation; we treat the correlation as NaN and fall back to direction-only (this is the `03` §6.2 "constant actual or forecast" branch). We detect "constant" explicitly (`np.ptp(arr) == 0`) **before** calling `pearsonr` to avoid relying on warning behavior — equivalent result, zero ambiguity.
  - **`direction`** compares the sign of consecutive **first differences**. `sign(0)` is `0`; a flat step in `a` matches a flat step in `f` (both signs `0`). If `len < 2` there are no transitions → `direction = 0.0` (and, since a length-<2 array is constant, `shape_corr` is NaN → `coherence = round(100*0.0,1) = 0.0`). This is the deterministic, locked interpretation of `03` §6.2 for degenerate input.
  - **`coherence_label`** (UI interpretation, `03` §6.2 last line / `05` §5 `coherence_label`): `>= 75` → `"Strong"`, `>= 50 and < 75` → `"Moderate"`, else `"Weak"`.
- **Rounding.** Use Python's built-in `round` for the spec's `round(...)` calls (banker's rounding is fine; values are display scores). `accuracy`/`coherence` → 1 dp; `smape` → 1 dp (kept consistent with the `05` §5 example `smape: 21.6`); `mae`/`rmse` → 2 dp.
- **No I/O, no model, no FastAPI** (`04` §2). Functions are deterministic and offline.

## 5. Implementation (exact file paths; FULL runnable code)
**File:** `backend/app/ml/metrics.py` (this MT **creates** the file with the module header + the two functions; MT-17–19 append their functions below).

```python
"""backend/app/ml/metrics.py

Pure, deterministic metric functions for the 28-day forecast horizon.

This module is SHARED and ADDITIVE across micro-tasks:
  - MT-16: compute_accuracy, compute_coherence      (this file's initial content)
  - MT-17: compute_velocity
  - MT-18: compute_inventory_risk
  - MT-19: compute_explainability

All functions are pure (no FastAPI, no globals, no I/O) per 04_BACKEND_ARCHITECTURE.md §2.
Formulas are LOCKED in 03_ALGORITHM_SPEC.md §6 — implement verbatim, do not re-decide.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import pearsonr

__all__ = [
    "compute_accuracy",
    "compute_coherence",
]


def _as_float_array(x) -> np.ndarray:
    """Coerce an array-like to a 1-D float64 numpy array."""
    return np.asarray(x, dtype=np.float64).reshape(-1)


# ---------------------------------------------------------------------------
# MT-16 — 03_ALGORITHM_SPEC.md §6.1 Accuracy / sMAPE
# ---------------------------------------------------------------------------
def compute_accuracy(actual, forecast) -> dict:
    """Accuracy headline + sMAPE/MAE/RMSE over the aligned horizon (03 §6.1).

    sMAPE = mean over days where (|a|+|f|) > 0 of ( 2*|a-f| / (|a|+|f|) ) * 100
    accuracy = round(max(0.0, 100.0 - sMAPE), 1)
    All-zero arrays -> accuracy 100.0, smape 0.0.

    Returns dict(accuracy, smape, mae, rmse).
    """
    a = _as_float_array(actual)
    f = _as_float_array(forecast)
    if a.shape != f.shape:
        raise ValueError(
            f"actual and forecast must be the same length, got {a.shape} vs {f.shape}"
        )

    n = a.size
    if n == 0:
        return {"accuracy": 100.0, "smape": 0.0, "mae": 0.0, "rmse": 0.0}

    abs_err = np.abs(a - f)
    denom = np.abs(a) + np.abs(f)
    mask = denom > 0.0  # days that contribute to sMAPE (avoid 0/0)

    if not mask.any():
        # every (|a|+|f|) == 0  -> all zeros -> perfect by definition (03 §6.1)
        smape = 0.0
    else:
        per_day = 2.0 * abs_err[mask] / denom[mask] * 100.0
        smape = float(np.mean(per_day))

    accuracy = round(max(0.0, 100.0 - smape), 1)
    mae = round(float(np.mean(abs_err)), 2)
    rmse = round(float(np.sqrt(np.mean((a - f) ** 2))), 2)

    return {
        "accuracy": accuracy,
        "smape": round(smape, 1),
        "mae": mae,
        "rmse": rmse,
    }


# ---------------------------------------------------------------------------
# MT-16 — 03_ALGORITHM_SPEC.md §6.2 Coherence (shape/trend agreement)
# ---------------------------------------------------------------------------
def _coherence_label(coherence: float) -> str:
    """UI interpretation band (03 §6.2 / 05 §5)."""
    if coherence >= 75.0:
        return "Strong"
    if coherence >= 50.0:
        return "Moderate"
    return "Weak"


def compute_coherence(actual, forecast) -> dict:
    """Coherence score 0-100 blending shape correlation + direction agreement (03 §6.2).

    shape_corr = Pearson corr(a, f)   # NaN if either array is constant
    direction  = fraction of t where sign(a_t - a_{t-1}) == sign(f_t - f_{t-1})
    if shape_corr is NaN: coherence = round(100 * direction, 1)
    else:                 coherence = round(100 * (0.5*max(0,shape_corr) + 0.5*direction), 1)

    Returns dict(coherence, coherence_label).
    """
    a = _as_float_array(actual)
    f = _as_float_array(forecast)
    if a.shape != f.shape:
        raise ValueError(
            f"actual and forecast must be the same length, got {a.shape} vs {f.shape}"
        )

    n = a.size

    # direction: agreement of consecutive first-difference signs
    if n < 2:
        direction = 0.0
    else:
        sa = np.sign(np.diff(a))
        sf = np.sign(np.diff(f))
        direction = float(np.mean(sa == sf))

    # shape_corr: NaN if either array is constant (zero peak-to-peak range)
    a_constant = (n < 2) or (np.ptp(a) == 0.0)
    f_constant = (n < 2) or (np.ptp(f) == 0.0)
    if a_constant or f_constant:
        coherence = round(100.0 * direction, 1)
    else:
        shape_corr = float(pearsonr(a, f)[0])
        if np.isnan(shape_corr):  # defensive: treat as constant branch
            coherence = round(100.0 * direction, 1)
        else:
            coherence = round(100.0 * (0.5 * max(0.0, shape_corr) + 0.5 * direction), 1)

    return {
        "coherence": coherence,
        "coherence_label": _coherence_label(coherence),
    }
```

> **For MT-17–19 maintainers:** append your functions **below** the last function above. Keep the module header, `_as_float_array`, and `__all__` (extend `__all__` with your new public names). Do not modify `compute_accuracy` / `compute_coherence`.

## 6. Tests / Verification (exact pytest tests + commands)
**File:** `backend/tests/test_metrics.py`. This file is shared with MT-17–19 (each appends its own tests). MT-16 creates it with the imports + the accuracy/coherence tests below. Append tests; do not overwrite a sibling's.

```python
# backend/tests/test_metrics.py
import numpy as np
import pytest

from app.ml.metrics import compute_accuracy, compute_coherence


# ---------- MT-16: accuracy / sMAPE ----------
def test_accuracy_perfect_match():
    a = [10.0, 8.0, 0.0, 5.0, 3.0]
    out = compute_accuracy(a, a)
    assert out["accuracy"] == 100.0
    assert out["smape"] == 0.0
    assert out["mae"] == 0.0
    assert out["rmse"] == 0.0


def test_accuracy_all_zero_is_100():
    a = [0.0, 0.0, 0.0, 0.0]
    f = [0.0, 0.0, 0.0, 0.0]
    out = compute_accuracy(a, f)
    assert out["accuracy"] == 100.0
    assert out["smape"] == 0.0


def test_accuracy_known_array():
    # a=[10,10], f=[8,12]: per-day sMAPE = 2*2/18*100 and 2*2/22*100
    a = [10.0, 10.0]
    f = [8.0, 12.0]
    d1 = 2 * 2 / 18 * 100
    d2 = 2 * 2 / 22 * 100
    smape = (d1 + d2) / 2
    out = compute_accuracy(a, f)
    assert out["smape"] == pytest.approx(round(smape, 1), abs=1e-9)
    assert out["accuracy"] == pytest.approx(round(max(0.0, 100.0 - smape), 1), abs=1e-9)
    assert out["mae"] == pytest.approx(2.0, abs=1e-9)
    assert out["rmse"] == pytest.approx(2.0, abs=1e-9)


def test_accuracy_zero_day_excluded_from_smape():
    # day where a=f=0 must not divide-by-zero nor count; other days drive sMAPE
    a = [0.0, 10.0]
    f = [0.0, 10.0]
    out = compute_accuracy(a, f)
    assert out["accuracy"] == 100.0  # only contributing day is perfect


def test_accuracy_floor_at_zero():
    # wildly wrong -> sMAPE near 200 -> accuracy floored at 0
    a = [100.0, 100.0, 100.0]
    f = [0.0, 0.0, 0.0]
    out = compute_accuracy(a, f)
    assert out["accuracy"] == 0.0


def test_accuracy_length_mismatch_raises():
    with pytest.raises(ValueError):
        compute_accuracy([1.0, 2.0], [1.0])


# ---------- MT-16: coherence ----------
def test_coherence_identical_strong():
    a = [1.0, 3.0, 2.0, 5.0, 4.0]
    out = compute_coherence(a, a)
    # perfect corr (1.0) + perfect direction (1.0) -> 100
    assert out["coherence"] == 100.0
    assert out["coherence_label"] == "Strong"


def test_coherence_constant_actual_uses_direction_only():
    # actual constant -> shape_corr NaN -> coherence = 100*direction
    a = [5.0, 5.0, 5.0, 5.0]          # all diffs sign 0
    f = [5.0, 6.0, 7.0, 8.0]          # all diffs sign +1
    # direction: sign(0)==sign(+1)? no -> 0/3 -> 0.0
    out = compute_coherence(a, f)
    assert out["coherence"] == 0.0
    assert out["coherence_label"] == "Weak"


def test_coherence_both_constant_direction_one():
    a = [3.0, 3.0, 3.0]
    f = [9.0, 9.0, 9.0]
    # both flat: all diff signs 0 == 0 -> direction 1.0 -> coherence 100*1.0
    out = compute_coherence(a, f)
    assert out["coherence"] == 100.0
    assert out["coherence_label"] == "Strong"


def test_coherence_label_boundaries():
    # craft direction-only cases (constant actual) to hit each band exactly.
    # 4 transitions; matches/total controls the score.
    a = [5.0, 5.0, 5.0, 5.0, 5.0]      # constant -> direction-only
    # f diffs: choose how many are flat (sign 0) to match a's flat (sign 0)
    f_strong = [5.0, 5.0, 5.0, 6.0, 7.0]   # 2 of 4 flat -> dir .5 -> 50 (Moderate boundary)
    out_mod = compute_coherence(a, f_strong)
    assert out_mod["coherence"] == 50.0
    assert out_mod["coherence_label"] == "Moderate"  # 50 -> Moderate (>=50)

    f_three = [5.0, 5.0, 5.0, 5.0, 7.0]    # 3 of 4 flat -> dir .75 -> 75 (Strong boundary)
    out_strong = compute_coherence(a, f_three)
    assert out_strong["coherence"] == 75.0
    assert out_strong["coherence_label"] == "Strong"  # 75 -> Strong (>=75)

    f_weak = [5.0, 6.0, 7.0, 8.0, 9.0]     # 0 of 4 flat -> dir 0 -> 0 (Weak)
    out_weak = compute_coherence(a, f_weak)
    assert out_weak["coherence"] == 0.0
    assert out_weak["coherence_label"] == "Weak"


def test_coherence_anticorrelated():
    # forecast moves opposite to actual -> max(0, shape_corr)=0 and direction=0 -> 0
    a = [1.0, 2.0, 3.0, 4.0]
    f = [4.0, 3.0, 2.0, 1.0]
    out = compute_coherence(a, f)
    assert out["coherence"] == 0.0
```

**Commands (run from `backend/`):**
```powershell
cd backend
pytest -q tests/test_metrics.py -k "accuracy or coherence"
```
All selected tests must pass. Full suite later: `pytest -q`.

## 7. Acceptance checklist
- [ ] `backend/app/ml/metrics.py` exists with the module header, `_as_float_array`, `compute_accuracy`, `compute_coherence`, and `__all__` listing the two public names.
- [ ] `compute_accuracy` implements `03` §6.1 exactly: sMAPE excludes `(|a|+|f|)==0` days; all-zero → `accuracy 100.0`, `smape 0.0`; `accuracy` floored at 0 and rounded to 1 dp; `mae`/`rmse` rounded to 2 dp.
- [ ] `compute_coherence` implements `03` §6.2 exactly: Pearson corr via `scipy`, NaN/constant fallback to direction-only, blend `0.5*max(0,corr)+0.5*direction`, rounded to 1 dp.
- [ ] `coherence_label` bands are `>=75 Strong`, `50–74 Moderate`, `<50 Weak` (50 → Moderate, 75 → Strong).
- [ ] Both functions are pure (no FastAPI/I/O), use only `numpy`+`scipy` (`04` §6), and signatures match `compute_accuracy(actual, forecast)->dict` and `compute_coherence(actual, forecast)->dict`.
- [ ] Return dict keys exactly match `05` §5: `accuracy, smape, mae, rmse` and `coherence, coherence_label`.
- [ ] `backend/tests/test_metrics.py` contains the MT-16 tests and they pass with `pytest -q tests/test_metrics.py -k "accuracy or coherence"`.
- [ ] No sibling functions (velocity/inventory/explainability) were removed; the file remains additive-friendly.
