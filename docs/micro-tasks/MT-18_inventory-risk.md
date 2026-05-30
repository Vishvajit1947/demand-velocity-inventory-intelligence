# MT-18 — Inventory Risk Simulation

## 1. Context
The M5 dataset has **no real stock levels**, so the dashboard *simulates* a deterministic reorder model from recent demand to produce an actionable inventory panel: on-hand stock, safety stock, reorder point, projected stock path, days of cover, stockout risk, overstock flag, and a recommended order quantity. This task adds `compute_inventory_risk` to the shared metrics module `backend/app/ml/metrics.py`, implementing `03_ALGORITHM_SPEC.md` §6.4 **exactly**. The result is surfaced under `inventory.*` in the API (`05_API_CONTRACT.md` §5), and the UI must label it clearly as a **simulated** reorder model (`03` §6.4 final note).

> **Shared module note.** `backend/app/ml/metrics.py` is a **single module shared by MT-16, MT-17, MT-18, MT-19**. MT-16 created the file; MT-17 appended `compute_velocity`. MT-18 **appends** `compute_inventory_risk` below them and extends `__all__`. Do not recreate the file or modify sibling functions.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/03_ALGORITHM_SPEC.md` — **§6.4 (inventory risk, simulated)**: the EXACT deterministic simulation. Do not re-decide.
- `docs/02_DATA_SPEC.md` — §3 (`HORIZON = 28` constant lives in `config.py`; selectable range so 28-day actual history before `start` always exists).
- `docs/04_BACKEND_ARCHITECTURE.md` — §1 (paths `backend/app/ml/metrics.py`, `backend/app/config.py`), §2 (ml/* pure functions), §6 (deps: `numpy`).
- `docs/05_API_CONTRACT.md` — §5 `inventory` object shape (exact field names/types) + `projected_stock` length 28.
- `docs/07_TESTING_STRATEGY.md` — §2 (`test_metrics.py` covers MT-16..19; inventory risk monotonicity).

**Prior MT artifacts/paths that must already exist:**
- MT-16/MT-17 created/extended `backend/app/ml/metrics.py` and `backend/tests/test_metrics.py`.
- MT-01 created `backend/app/config.py` which **must** define the inventory constants (see §4).
- MT-15 (`recursive_forecast`) supplies the 28-value `forecast`; the caller supplies the 28-value trailing actuals.

**Deps:** `numpy` only. No new dependencies.

## 3. Goal
Append one pure function to `backend/app/ml/metrics.py`:

```python
def compute_inventory_risk(trailing_28_actual, forecast) -> dict
# keys: on_hand, safety_stock, reorder_point, horizon_demand, cover_days,
#       stockout_risk, overstock, recommended_order_qty, projected_stock
```

implementing `03_ALGORITHM_SPEC.md` §6.4 **exactly** (deterministic simulation; `projected_stock` length 28; `cover_days` = first horizon day index where stock ≤ 0, else `HORIZON + 1`; risk thresholds; overstock flag; recommended order qty).

## 4. Design (locked decisions; cite foundation sections)
All decisions are **locked** in `03_ALGORITHM_SPEC.md` §6.4 — implement verbatim.

### 4.1 Constants (config.py — LOCKED)
`03` §6.4 states the constants live in `config.py`: `INITIAL_COVER_DAYS=14`, `LEAD_TIME_DAYS=7`, `SERVICE_Z=1.65`. `HORIZON=28` is already defined in `config.py` (`02` §3). MT-01 owns `config.py`; this MT **assumes** these names exist there. The function imports them from `app.config` so there is a single source of truth (`02` §6 pattern). If MT-01 has not yet added the three inventory constants, add them to `backend/app/config.py`:
```python
# Inventory simulation constants (03_ALGORITHM_SPEC.md §6.4) — LOCKED
INITIAL_COVER_DAYS = 14
LEAD_TIME_DAYS = 7
SERVICE_Z = 1.65
# HORIZON is already defined in config.py per 02_DATA_SPEC.md §3:
# HORIZON = 28
```

### 4.2 Inputs (locked signature)
`compute_inventory_risk(trailing_28_actual, forecast)`:
- `trailing_28_actual` = actual units for days `[start-28 .. start-1]` (`03` §6.4 `trailing`). The caller (MT-23) extracts these from `series_daily`; the pure function receives the array. In the selectable range (`02` §3) these 28 days always exist.
- `forecast` = the engine's 28 float predictions over the horizon.

### 4.3 Simulation (`03` §6.4, verbatim)
```
trailing       = actual units for days [start-28 .. start-1]
mean_d         = mean(trailing)
std_d          = std(trailing)                       # population std (ddof=0)
on_hand        = round(mean_d * INITIAL_COVER_DAYS)  # simulated starting stock
safety_stock   = SERVICE_Z * std_d * sqrt(LEAD_TIME_DAYS)
reorder_point  = mean_d * LEAD_TIME_DAYS + safety_stock
horizon_demand = sum(forecast)

# project stock forward day by day over the horizon
stock = on_hand; cover_days = HORIZON + 1
for i, d_demand in enumerate(forecast):
    stock -= d_demand
    if stock <= 0: cover_days = i; break

stockout_risk = "High"   if cover_days <= LEAD_TIME_DAYS
                "Medium" if cover_days <= HORIZON
                "Low"    otherwise
overstock      = on_hand > horizon_demand * 1.5
recommended_order_qty = max(0, round(horizon_demand + safety_stock - on_hand))
```
Plus the **projected stock path** (length 28) for the chart (`03` §6.4: "plus the projected stock path (length 28)").

### 4.4 Locked clarifications (zero ambiguity)
- **`std_d` is population std** (`03` §6.4 comment "population std") → numpy default `np.std(..., ddof=0)`.
- **`cover_days`** is the **0-based index `i`** of the first horizon day where `stock <= 0` after subtracting that day's demand (`03` §6.4 sets `cover_days = i`). If stock never hits `<= 0` over all 28 days, `cover_days = HORIZON + 1 = 29`. So `cover_days ∈ {0,1,…,27} ∪ {29}`. The `05` §5 example `cover_days: 9` is consistent (a mid-horizon depletion).
- **`projected_stock`** is the stock level **after** each day's demand is subtracted, length **exactly 28** (one entry per horizon day, in order). It is recorded for **every** day even after `cover_days` is reached (the loop that detects depletion `break`s, but the chart needs the full 28-point path — so we compute the full path independently via cumulative subtraction, then determine `cover_days` from it). Values may go negative (backlog) — that is the intended simulated path; do not clip.
- **Risk thresholds (`03` §6.4):** `High` if `cover_days <= LEAD_TIME_DAYS (7)`; else `Medium` if `cover_days <= HORIZON (28)`; else `Low`. Since `cover_days` is either ≤27 or 29: depletion on day ≤7 → High; day 8–27 → Medium; never depletes (29) → Low. (`cover_days == 28` cannot occur given the index range, but the `<= HORIZON` form is kept verbatim from spec.)
- **`overstock`** is a bool: `on_hand > horizon_demand * 1.5` (`03` §6.4).
- **`recommended_order_qty`** = `max(0, round(horizon_demand + safety_stock - on_hand))` (`03` §6.4). `round(...)` is Python built-in round; result coerced to `int` (it is an order count; `05` §5 shows `recommended_order_qty: 301`, an integer; `on_hand: 260` is also integer).
- **Types matching `05` §5:** `on_hand` int, `safety_stock` float, `reorder_point` float, `horizon_demand` float, `cover_days` int, `stockout_risk` str (`RiskLevel`), `overstock` bool, `recommended_order_qty` int, `projected_stock` list[float] length 28. Round float scalars to a sensible precision: `safety_stock`, `reorder_point`, `horizon_demand` to 1 dp (matching the `05` §5 examples `41.0`, `171.0`, `520.0`); `projected_stock` entries to 1 dp (matching `05` §5 `248.7, 240.8`).
- **Empty/degenerate input:** if `trailing_28_actual` is empty, `mean_d`/`std_d` are `0.0` (treat empty as zero demand) → `on_hand 0`, etc. (Defensive; in the selectable range this will not happen, but the pure function must not divide by zero or raise.) `np.mean([])` is avoided by an explicit guard.
- **Deterministic:** identical inputs → identical output (no randomness). `04` §2, §6: numpy only.

## 5. Implementation (exact file paths; FULL runnable code)
**File:** `backend/app/ml/metrics.py` — **append** below the MT-17 function. Extend `__all__` and add the config import.

At the top of the module (with the other imports), add:
```python
from app.config import INITIAL_COVER_DAYS, LEAD_TIME_DAYS, SERVICE_Z, HORIZON
```

Extend `__all__`:
```python
__all__ = [
    "compute_accuracy",
    "compute_coherence",
    "compute_velocity",
    "compute_inventory_risk",   # MT-18
]
```

Append this code:
```python
# ---------------------------------------------------------------------------
# MT-18 — 03_ALGORITHM_SPEC.md §6.4 Inventory risk (simulated, deterministic)
# ---------------------------------------------------------------------------
def compute_inventory_risk(trailing_28_actual, forecast) -> dict:
    """Simulated deterministic reorder model over the 28-day horizon (03 §6.4).

    Constants from config.py: INITIAL_COVER_DAYS=14, LEAD_TIME_DAYS=7, SERVICE_Z=1.65.
    Population std (ddof=0). cover_days = first horizon day index i where stock<=0,
    else HORIZON+1. projected_stock is the full 28-point post-demand stock path.

    Returns dict(on_hand, safety_stock, reorder_point, horizon_demand, cover_days,
                 stockout_risk, overstock, recommended_order_qty, projected_stock).
    """
    trailing = _as_float_array(trailing_28_actual)
    fc = _as_float_array(forecast)

    if trailing.size == 0:
        mean_d = 0.0
        std_d = 0.0
    else:
        mean_d = float(np.mean(trailing))
        std_d = float(np.std(trailing))  # population std (ddof=0)

    on_hand = int(round(mean_d * INITIAL_COVER_DAYS))
    safety_stock = SERVICE_Z * std_d * np.sqrt(LEAD_TIME_DAYS)
    reorder_point = mean_d * LEAD_TIME_DAYS + safety_stock
    horizon_demand = float(np.sum(fc))

    # Full 28-point projected stock path (do NOT clip; backlog can go negative).
    projected_stock = []
    stock = float(on_hand)
    cover_days = HORIZON + 1  # 29 if never depletes
    for i, d_demand in enumerate(fc):
        stock -= float(d_demand)
        projected_stock.append(round(stock, 1))
        if stock <= 0.0 and cover_days == HORIZON + 1:
            cover_days = i  # first depletion day (0-based index), per 03 §6.4

    if cover_days <= LEAD_TIME_DAYS:
        stockout_risk = "High"
    elif cover_days <= HORIZON:
        stockout_risk = "Medium"
    else:
        stockout_risk = "Low"

    overstock = bool(on_hand > horizon_demand * 1.5)
    recommended_order_qty = int(max(0, round(horizon_demand + safety_stock - on_hand)))

    return {
        "on_hand": on_hand,
        "safety_stock": round(float(safety_stock), 1),
        "reorder_point": round(float(reorder_point), 1),
        "horizon_demand": round(horizon_demand, 1),
        "cover_days": int(cover_days),
        "stockout_risk": stockout_risk,
        "overstock": overstock,
        "recommended_order_qty": recommended_order_qty,
        "projected_stock": projected_stock,
    }
```

> Reuses `_as_float_array` (MT-16) and `import numpy as np`. The `from app.config import ...` line is the only new import; it relies on MT-01's `config.py` (§4.1).

## 6. Tests / Verification (exact pytest tests + commands)
**File:** `backend/tests/test_metrics.py` — **append** the MT-18 tests. Add `compute_inventory_risk` to the import line.

Update the import:
```python
from app.ml.metrics import (
    compute_accuracy,
    compute_coherence,
    compute_velocity,
    compute_inventory_risk,
)
```

Append:
```python
# ---------- MT-18: inventory risk ----------
from app.config import INITIAL_COVER_DAYS, LEAD_TIME_DAYS, SERVICE_Z, HORIZON


def test_inventory_projected_stock_length_28():
    trailing = [10.0] * 28
    fc = [5.0] * 28
    out = compute_inventory_risk(trailing, fc)
    assert len(out["projected_stock"]) == 28


def test_inventory_deterministic():
    trailing = [3.0, 4.0, 5.0] * 9 + [3.0]   # 28 values
    fc = [2.0] * 28
    a = compute_inventory_risk(trailing, fc)
    b = compute_inventory_risk(trailing, fc)
    assert a == b


def test_inventory_on_hand_and_horizon_demand():
    # constant trailing 10 -> mean_d=10, std_d=0
    trailing = [10.0] * 28
    fc = [4.0] * 28
    out = compute_inventory_risk(trailing, fc)
    assert out["on_hand"] == round(10.0 * INITIAL_COVER_DAYS)   # 140
    assert out["safety_stock"] == 0.0                            # std 0
    assert out["horizon_demand"] == round(4.0 * 28, 1)          # 112.0
    # reorder_point = mean_d*LEAD + safety = 10*7 + 0 = 70.0
    assert out["reorder_point"] == 70.0


def test_inventory_cover_days_is_first_depletion_index():
    # on_hand from mean 10 -> 140. Demand 30/day depletes:
    # after day0:110, ... stock<=0 first when cumulative demand >= 140.
    # 30*5=150 -> day index 4 (0-based) is first <=0 (140-150=-10).
    trailing = [10.0] * 28
    fc = [30.0] * 28
    out = compute_inventory_risk(trailing, fc)
    assert out["cover_days"] == 4
    assert out["stockout_risk"] == "High"   # 4 <= LEAD_TIME_DAYS (7)


def test_inventory_risk_thresholds():
    trailing = [10.0] * 28  # on_hand 140
    # High: deplete within LEAD_TIME_DAYS (<=7). 140/20=7 -> day index 6 (<=0 at 140-7*20=0).
    out_high = compute_inventory_risk(trailing, [20.0] * 28)
    assert out_high["cover_days"] <= LEAD_TIME_DAYS
    assert out_high["stockout_risk"] == "High"

    # Medium: deplete between day 8 and 27.
    out_med = compute_inventory_risk(trailing, [10.0] * 28)  # 140/10 -> day idx 13
    assert LEAD_TIME_DAYS < out_med["cover_days"] <= HORIZON
    assert out_med["stockout_risk"] == "Medium"

    # Low: never depletes over 28 days -> cover_days = HORIZON+1 = 29.
    out_low = compute_inventory_risk(trailing, [1.0] * 28)   # only 28 total < 140
    assert out_low["cover_days"] == HORIZON + 1
    assert out_low["stockout_risk"] == "Low"


def test_inventory_monotonic_more_demand_fewer_cover_days():
    trailing = [10.0] * 28
    cover_light = compute_inventory_risk(trailing, [5.0] * 28)["cover_days"]
    cover_heavy = compute_inventory_risk(trailing, [25.0] * 28)["cover_days"]
    assert cover_heavy < cover_light


def test_inventory_overstock_flag():
    # on_hand 140, tiny horizon demand -> on_hand > 1.5*demand -> overstock True
    trailing = [10.0] * 28
    out = compute_inventory_risk(trailing, [1.0] * 28)  # demand 28; 1.5*28=42 < 140
    assert out["overstock"] is True
    # heavy demand -> not overstock
    out2 = compute_inventory_risk(trailing, [20.0] * 28)  # demand 560
    assert out2["overstock"] is False


def test_inventory_recommended_order_qty():
    # mean 10 -> on_hand 140, std 0 -> safety 0. demand 112.
    # recommended = max(0, round(112 + 0 - 140)) = max(0, -28) = 0
    trailing = [10.0] * 28
    out = compute_inventory_risk(trailing, [4.0] * 28)
    assert out["recommended_order_qty"] == 0
    # heavier demand -> positive recommendation
    out2 = compute_inventory_risk(trailing, [20.0] * 28)  # demand 560
    assert out2["recommended_order_qty"] == max(0, round(560 + 0 - 140))


def test_inventory_safety_stock_uses_population_std():
    # trailing with variation -> safety = SERVICE_Z * pop_std * sqrt(LEAD)
    trailing = [0.0, 20.0] * 14  # mean 10, population std 10
    fc = [4.0] * 28
    out = compute_inventory_risk(trailing, fc)
    expected = SERVICE_Z * 10.0 * (LEAD_TIME_DAYS ** 0.5)
    assert out["safety_stock"] == pytest.approx(round(expected, 1), abs=1e-9)


def test_inventory_types_match_contract():
    out = compute_inventory_risk([10.0] * 28, [10.0] * 28)
    assert isinstance(out["on_hand"], int)
    assert isinstance(out["cover_days"], int)
    assert isinstance(out["recommended_order_qty"], int)
    assert isinstance(out["overstock"], bool)
    assert isinstance(out["stockout_risk"], str)
    assert isinstance(out["projected_stock"], list)
```

**Commands (run from `backend/`):**
```powershell
cd backend
pytest -q tests/test_metrics.py -k "inventory"
```
All `inventory` tests must pass.

## 7. Acceptance checklist
- [ ] `compute_inventory_risk(trailing_28_actual, forecast) -> dict` appended to `backend/app/ml/metrics.py` (siblings untouched); `__all__` extended.
- [ ] Constants `INITIAL_COVER_DAYS=14`, `LEAD_TIME_DAYS=7`, `SERVICE_Z=1.65` are imported from `app.config` (and exist there per `03` §6.4 / MT-01); `HORIZON=28` from `config.py` (`02` §3).
- [ ] `std_d` is **population** std (`np.std`, ddof=0); `on_hand = round(mean_d*INITIAL_COVER_DAYS)`; `safety_stock = SERVICE_Z*std_d*sqrt(LEAD_TIME_DAYS)`; `reorder_point = mean_d*LEAD_TIME_DAYS + safety_stock`; `horizon_demand = sum(forecast)`.
- [ ] `cover_days` = first 0-based horizon index where stock ≤ 0, else `HORIZON+1`; `projected_stock` is the full **length-28** post-demand path (not clipped).
- [ ] Risk: High if `cover_days <= 7`, Medium if `<= 28`, else Low; `overstock = on_hand > horizon_demand*1.5`; `recommended_order_qty = max(0, round(horizon_demand+safety_stock-on_hand))`.
- [ ] Return dict keys exactly match `05` §5 `inventory` object (incl. `projected_stock`); types match (`on_hand`/`cover_days`/`recommended_order_qty` int, `overstock` bool, `stockout_risk` `RiskLevel` str).
- [ ] Tests prove: `projected_stock` length 28, determinism, monotonicity (more demand → fewer cover_days), risk thresholds, overstock, recommended qty, population-std safety stock — all green via `pytest -q tests/test_metrics.py -k "inventory"`.
- [ ] Pure function, numpy only (`04` §2, §6); deterministic; no FastAPI/I/O.
