# MT-19 — Explainability (Counterfactual + Narrative)

## 1. Context
The Explainability panel (P7, MT-41) answers *"why this forecast?"* in plain language and numbers. It isolates how much of the predicted demand comes from **events** using a **counterfactual** forecast (re-run the model with all event signals neutralized), then assembles a short narrative (trend / seasonality / events) and a 3-factor breakdown for a bar chart. This task adds `compute_explainability` to the shared metrics module `backend/app/ml/metrics.py`, implementing `03_ALGORITHM_SPEC.md` §6.5 **exactly**. It is the only metric function that re-invokes the model, so it depends on MT-15's `recursive_forecast`. Result fields are surfaced under `explainability.*` and `seasonal.month_vs_avg_pct` in the API (`05_API_CONTRACT.md` §5).

> **Shared module note.** `backend/app/ml/metrics.py` is a **single module shared by MT-16, MT-17, MT-18, MT-19**. MT-16 created it; MT-17 added `compute_velocity`; MT-18 added `compute_inventory_risk`. MT-19 **appends** `compute_explainability` (plus small private helpers) and extends `__all__`. Do not recreate the file or modify sibling functions.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/03_ALGORITHM_SPEC.md` — **§6.5 (explainability)** the EXACT counterfactual + narrative templates; **§4** (`recursive_forecast` algorithm); **§3.3** (event features); **§5** (`profiles.json` shape: `monthly_avg`, `overall_mean`, `event_uplift`). Do not re-decide.
- `docs/02_DATA_SPEC.md` — §1 (`d_1 = 2011-01-29`, calendar join), §4 (`series_daily`/calendar columns, `snap_count`), §3 (`HORIZON`, selectable range).
- `docs/04_BACKEND_ARCHITECTURE.md` — §1 (paths `metrics.py`, `forecast_engine.py`), §2 (ml/* pure), §6 (deps).
- `docs/05_API_CONTRACT.md` — §5 `explainability` object (`event_contribution_pct`, `snap_days_in_horizon`, `narrative`, `factors`) and `seasonal.month_vs_avg_pct`.
- `docs/07_TESTING_STRATEGY.md` — §2 (`test_metrics.py` covers MT-16..19; explainability returns finite numbers).

**Prior MT artifacts/paths that must already exist:**
- MT-16/17/18 created/extended `backend/app/ml/metrics.py` and `backend/tests/test_metrics.py`.
- **MT-15** defines `recursive_forecast(series_id, start_d, model, feature_meta, data, calendar)` in `backend/app/ml/forecast_engine.py` (its `calendar` arg is the per-day feature table covering `d_1 … d_1969`; see MT-15 §4.1). **This task requires extending it** — see §4.2.
- **MT-14** produced `profiles.json` with `monthly_avg`, `overall_mean`, `event_uplift` per series (`03` §5).
- MT-17's `compute_velocity` output (`{value, status}`) is passed in as the `velocity` argument.

**Deps:** `numpy` + `python-dateutil` (for date math; pinned in `04` §6). No new dependencies.

## 3. Goal
1. **Extend** `recursive_forecast` (MT-15, `forecast_engine.py`) with an optional **keyword** parameter `neutralize_events=False` (added **after** the existing `calendar` positional arg) that forces event features off over the horizon (the counterfactual path). This is the cleaner choice over a duplicated sibling function (see §4.2 decision).
2. **Append** to `backend/app/ml/metrics.py`:
```python
def compute_explainability(series_id, start_d, model, feature_meta, data,
                           calendar, profiles, velocity, forecast) -> dict
# keys: event_contribution_pct, snap_days_in_horizon, narrative, factors
```
implementing `03_ALGORITHM_SPEC.md` §6.5 **exactly**: counterfactual event-contribution %, snap-day count, narrative bullets via the locked templates, and a 3-entry `factors` list.

## 4. Design (locked decisions; cite foundation sections)

### 4.1 Inputs (locked signature)
`compute_explainability(series_id, start_d, model, feature_meta, data, calendar, profiles, velocity, forecast)`:
- `series_id` (str), `start_d` (int d-index, the horizon start) — to re-run the model and to slice the calendar.
- `model`, `feature_meta`, `data` — the booster, the feature-order metadata, and the `series_daily` table. Passed straight through to the counterfactual `recursive_forecast` run (MT-15 §4.1).
- `calendar` — the **per-day calendar/feature table** MT-15's `recursive_forecast` consumes (covers `d_1 … d_1969`; columns `d_index, month, snap_count, event_name_1, event_name_2, …` per MT-15 §4.1 / `02` §4). It serves **both** roles here: it is forwarded to the counterfactual run **and** scanned locally for events / SNAP days / the start month. (The caller/`Store` already holds it; `04` §2.)
- `profiles` — the loaded `profiles.json` dict (`03` §5): we read `profiles[series_id]["monthly_avg"]`, `["overall_mean"]`, `["event_uplift"]`.
- `velocity` — the dict from `compute_velocity` (MT-17): `{"value": float, "status": str}` — reused so the Trend factor/narrative matches `03` §6.3 exactly (no recomputation).
- `forecast` — the **normal** 28-value forecast already computed for this product (`f_full`). We do **not** recompute it; we only compute the counterfactual `f_no_event` here. (`03` §6.5 `f_full = recursive_forecast(... normal ...)`.)

### 4.2 Counterfactual: extend `recursive_forecast` (DECISION — locked here)
`03` §6.5 requires a forecast "with event features forced to `none`/0 and `days_to/since_event = 28` for horizon days". Two implementation options were offered; **we choose extending `recursive_forecast` with an optional `neutralize_events=False` flag** rather than a duplicated `_forecast_no_events`. Rationale: a sibling function would duplicate the entire recursive loop (lag feedback, price fill, categorical ordering) and risk drift from the locked `03` §4 algorithm; a single flag keeps one code path and one golden test (`07` §2). The default `False` preserves MT-15's locked behavior and golden vector exactly (the flag is purely additive).

**Change to `backend/app/ml/forecast_engine.py` (MT-15's file):** update the signature and, inside the per-day feature assembly, when `neutralize_events` is `True`, override the event features for every horizon day **after** the normal calendar/event fill, before ordering/predict:
```python
event_name_1  = "none"
event_type_1  = "none"
event_name_2  = "none"
event_type_2  = "none"
is_event      = 0
days_to_next_event   = 28
days_since_last_event = 28
```
Everything else (calendar §3.2, price §3.4, lags §3.5 fed from the **counterfactual** running predictions `u`) is unchanged. This matches `03` §3.3 (event feature definitions) and `03` §6.5 (neutralized values). New signature (the flag is appended **after** MT-15's existing `calendar` arg, keyword-only-by-default):
```python
def recursive_forecast(series_id, start_d, model, feature_meta, data, calendar,
                       neutralize_events: bool = False) -> list[float]:
```

### 4.3 Event contribution (`03` §6.5, verbatim)
```
f_full     = forecast                                   # passed in (normal run)
f_no_event = recursive_forecast(series_id, start_d, model, feature_meta, data, calendar,
                                neutralize_events=True)
event_contribution_pct = round(
    (sum(f_full) - sum(f_no_event)) / max(1e-6, sum(f_no_event)) * 100, 1
)
```
The `max(1e-6, ...)` guard (locked in `03` §6.5) prevents divide-by-zero when the neutralized forecast sums to ~0.

### 4.4 Seasonality (`03` §6.5)
- The horizon's months: derive `month` from `start_d` (the horizon's start day). `05` §5 `seasonal.month` is the **start date's** calendar month; we use that single month for the narrative/seasonal factor (the dominant month of the window). Obtain it from `calendar` for `d_index == start_d` (authoritative date↔d join, `02` §1).
- `monthly_avg = profiles[series_id]["monthly_avg"]` (length 12, `03` §5). `overall_mean = profiles[series_id]["overall_mean"]`.
- `month_vs_avg_pct = round((monthly_avg[month-1] - overall_mean) / overall_mean * 100, 1)` (guard `overall_mean <= 0` → `0.0`). This is the `seasonal.month_vs_avg_pct` value (`05` §5) and the **Seasonality** factor value. `high|low` in the narrative: `high` if `month_vs_avg_pct >= 0` else `low`.

### 4.5 Events in horizon & uplift (`03` §6.5)
- Scan `calendar` for `d_index in [start_d .. start_d+27]`; collect events where `event_name_1 != "none"` (and `event_name_2` if present), each with its `event_uplift` from `profiles[series_id]["event_uplift"]` (default `0.0` if that event isn't in the series' profile, e.g. it never occurred in TRAIN — `03` §5). The narrative uses the **first** such event (the most prominent window event) for its event bullet; if none, the event bullet is omitted.

### 4.6 SNAP days (`03` §6.5)
- `snap_days_in_horizon = count of horizon days where snap_count > 0` (from `calendar`/`series_daily`, `02` §4 `snap_count` 0–3). This is `explainability.snap_days_in_horizon` (`05` §5). (SNAP is surfaced as a count; no narrative bullet is mandated by the templates in §4.7, so we do not add one — keeps narrative to the four locked templates.)

### 4.7 Narrative bullets (`03` §6.5 templates — verbatim wording)
Build a **list of strings** in this order, skipping any bullet whose data is absent:
1. Trend (always): `f"Demand is {status} ({velocity:+.0f}% vs the prior 28 days)."` — `status`/`velocity` from the `velocity` arg (MT-17). For the sentinel `999.0`, `{:+.0f}` renders `+999`; acceptable (it is the locked velocity value).
2. Seasonality (always): `f"{month_name} is a {high|low}-demand month for {product} (~{pct:+.0f}% vs average)."` — `month_name` from the start month (calendar/`dateutil`), `product` = `profiles[series_id].get("name")` or the product name from `data`/config; `pct = month_vs_avg_pct`.
3. Event (only if ≥1 event in horizon): `f"{event} falls in this window — historically a {uplift:+.0f}% swing."` — `event` = first horizon event name, `uplift` = its `event_uplift`.
4. Event contribution (always): `f"Events account for ~{event_contribution_pct:+.0f}% of predicted demand in this window."`

The narrative is **non-empty** (bullets 1, 2, 4 always present → length ≥ 3).

> **Product name source.** Prefer `profiles[series_id]["name"]` if present; else look it up from `data` (the `product_name` column for that `series_id`, `02` §4); both resolve to the same human name (e.g. "Fresh Whole Turkey"). Use whichever the session's `profiles`/`data` provides; the narrative wording is fixed regardless.

### 4.8 Factors (`03` §6.5 / `05` §5 — exact 3 entries, exact kinds/order)
```python
factors = [
    {"label": "Event uplift", "value": event_contribution_pct, "kind": "event"},
    {"label": "Seasonality",  "value": month_vs_avg_pct,        "kind": "seasonal"},
    {"label": "Trend",        "value": velocity["value"],       "kind": "trend"},
]
```
This matches `05` §5 `factors` exactly (order, labels, `kind` values, and which number each carries).

### 4.9 Return shape & purity
Return `dict(event_contribution_pct, snap_days_in_horizon, narrative, factors)` — exactly the `05` §5 `explainability` object. (`seasonal.month_vs_avg_pct` is consumed by the service layer from this function's seasonality computation, but this function's **return** is just the four explainability keys; the service recomputes/derives `seasonal.*` from `profiles` — to avoid duplicating that here, `month_vs_avg_pct` is still embedded inside `factors[1].value`, which is the single source the panel reads.) The function performs **one** model re-run (the counterfactual); it is deterministic (`03` §4 determinism) and offline. It imports `recursive_forecast` from `app.ml.forecast_engine` — this is an `ml/*`→`ml/*` call, allowed (both are pure; `04` §2). No FastAPI.

### 4.10 Numeric safety (locked)
All returned numbers are finite: divide-by-zero guards on `event_contribution_pct` (`max(1e-6,...)`) and `month_vs_avg_pct` (`overall_mean <= 0 → 0.0`). `velocity["value"]` is already finite (MT-17 caps at `999.0`, never `inf`).

## 5. Implementation (exact file paths; FULL runnable code)

### 5.1 Extend `recursive_forecast` — `backend/app/ml/forecast_engine.py`
Add the `neutralize_events` parameter (default `False`, preserving MT-15 behavior + golden test) and the override block. Conceptual diff (apply to MT-15's implementation; the surrounding loop is MT-15's locked `03` §4 algorithm):
```python
def recursive_forecast(series_id, start_d, model, feature_meta, data, calendar,
                       neutralize_events: bool = False) -> list[float]:
    ...
    for t in range(start_d, start_d + HORIZON):
        feat = {}
        # ... §3.2 calendar fill, §3.3 event fill (from calendar) ...

        if neutralize_events:
            # 03 §6.5 counterfactual: force all event signals off for the horizon day
            feat["event_name_1"] = "none"
            feat["event_type_1"] = "none"
            feat["event_name_2"] = "none"
            feat["event_type_2"] = "none"
            feat["is_event"] = 0
            feat["days_to_next_event"] = 28
            feat["days_since_last_event"] = 28

        # ... §3.4 price fill, §3.5 lag/rolling from u, order by FEATURES, predict, clip, feed back ...
    return preds
```
> Do not change any other line of MT-15. The default path (`neutralize_events=False`) must still reproduce `expected_turkey_1300.json` within 1e-6 (`07` §2 golden test).

### 5.2 Append to `backend/app/ml/metrics.py`
Add the import near the top (deferred import inside the function is also acceptable to avoid any import cycle, but `ml`→`ml` is fine):
```python
from app.ml.forecast_engine import recursive_forecast
from app.config import HORIZON  # already imported by MT-18; keep one import line
import calendar as _pycal       # for month names (stdlib)
```
Extend `__all__`:
```python
__all__ = [
    "compute_accuracy",
    "compute_coherence",
    "compute_velocity",
    "compute_inventory_risk",
    "compute_explainability",   # MT-19
]
```
Append this code:
```python
# ---------------------------------------------------------------------------
# MT-19 — 03_ALGORITHM_SPEC.md §6.5 Explainability (counterfactual + narrative)
# ---------------------------------------------------------------------------
def _month_for_start_d(start_d, calendar):
    """Return the 1-12 calendar month of the horizon start day (02 §1 join)."""
    row = calendar.loc[calendar["d_index"] == start_d]
    if len(row) == 0:
        raise ValueError(f"start_d {start_d} not found in calendar")
    return int(row["month"].iloc[0])


def _horizon_rows(start_d, calendar):
    """Calendar rows for d_index in [start_d .. start_d+HORIZON-1]."""
    lo, hi = start_d, start_d + HORIZON - 1
    return calendar.loc[(calendar["d_index"] >= lo) & (calendar["d_index"] <= hi)]


def compute_explainability(series_id, start_d, model, feature_meta, data,
                           calendar, profiles, velocity, forecast) -> dict:
    """Event-contribution counterfactual + narrative + 3 factors (03 §6.5).

    `forecast` is the already-computed normal run (f_full). This function computes
    the neutralized counterfactual (f_no_event) once, then assembles the narrative
    from numbers already available (velocity from MT-17, profiles from MT-14).

    Returns dict(event_contribution_pct, snap_days_in_horizon, narrative, factors).
    """
    prof = profiles[series_id]
    f_full = _as_float_array(forecast)

    # --- Event contribution via counterfactual (03 §6.5) ---
    f_no_event = _as_float_array(
        recursive_forecast(series_id, start_d, model, feature_meta, data, calendar,
                           neutralize_events=True)
    )
    sum_full = float(np.sum(f_full))
    sum_none = float(np.sum(f_no_event))
    event_contribution_pct = round((sum_full - sum_none) / max(1e-6, sum_none) * 100.0, 1)

    # --- Seasonality (03 §6.5 / §5) ---
    month = _month_for_start_d(start_d, calendar)
    monthly_avg = list(prof["monthly_avg"])
    overall_mean = float(prof.get("overall_mean", 0.0))
    if overall_mean > 0.0:
        month_vs_avg_pct = round(
            (float(monthly_avg[month - 1]) - overall_mean) / overall_mean * 100.0, 1
        )
    else:
        month_vs_avg_pct = 0.0
    month_name = _pycal.month_name[month]
    high_low = "high" if month_vs_avg_pct >= 0.0 else "low"

    # --- Events in horizon + SNAP days (03 §6.5 / §3.3 / 02 §4) ---
    hrows = _horizon_rows(start_d, calendar)
    event_uplift_map = prof.get("event_uplift", {})
    events_in_horizon = []  # list of (name, uplift)
    for _, r in hrows.iterrows():
        for col in ("event_name_1", "event_name_2"):
            name = r[col] if col in r else "none"
            if isinstance(name, str) and name != "none":
                events_in_horizon.append((name, float(event_uplift_map.get(name, 0.0))))
    snap_days_in_horizon = int((hrows["snap_count"] > 0).sum())

    # --- Product name (03 §5 'name' or series_daily product_name; 02 §4) ---
    product = prof.get("name")
    if not product:
        match = data.loc[data["series_id"] == series_id, "product_name"]
        product = str(match.iloc[0]) if len(match) else series_id

    # --- Narrative bullets (03 §6.5 templates, verbatim wording) ---
    status = velocity["status"]
    vel_value = float(velocity["value"])
    narrative = [
        f"Demand is {status} ({vel_value:+.0f}% vs the prior 28 days).",
        f"{month_name} is a {high_low}-demand month for {product} "
        f"(~{month_vs_avg_pct:+.0f}% vs average).",
    ]
    if events_in_horizon:
        ev_name, ev_uplift = events_in_horizon[0]
        narrative.append(
            f"{ev_name} falls in this window — historically a {ev_uplift:+.0f}% swing."
        )
    narrative.append(
        f"Events account for ~{event_contribution_pct:+.0f}% of predicted demand in this window."
    )

    # --- Factors (03 §6.5 / 05 §5: exact 3 entries, order, kinds) ---
    factors = [
        {"label": "Event uplift", "value": event_contribution_pct, "kind": "event"},
        {"label": "Seasonality",  "value": month_vs_avg_pct,        "kind": "seasonal"},
        {"label": "Trend",        "value": vel_value,               "kind": "trend"},
    ]

    return {
        "event_contribution_pct": event_contribution_pct,
        "snap_days_in_horizon": snap_days_in_horizon,
        "narrative": narrative,
        "factors": factors,
    }
```

> Reuses `_as_float_array` (MT-16) and module-level `numpy`. `calendar` here is the **per-day DataFrame** argument (it shadows the stdlib `calendar`, which is imported as `_pycal`). Adjust `calendar.loc[...]` column access if the session's calendar is a different structure, but `d_index/month/snap_count/event_name_*` columns are guaranteed by `02` §4.

## 6. Tests / Verification (exact pytest tests + commands)
**File:** `backend/tests/test_metrics.py` — **append** the MT-19 tests. These use lightweight **fakes** for `model`, `data`, `calendar`, `profiles` so the test stays offline and does not need the trained artifacts (the integration is exercised end-to-end in `test_api.py`, `07` §2). The fake model returns a constant, and we monkeypatch `recursive_forecast` is **not** needed because we drive the real one with a trivial model — but to keep MT-19's unit test focused on the *assembly* logic (templates/factors/finiteness) without depending on MT-15's full feature pipeline, we monkeypatch `recursive_forecast` in the metrics module to a deterministic stub.

Add to the import line:
```python
from app.ml import metrics as metrics_mod
from app.ml.metrics import compute_explainability
```

Append:
```python
# ---------- MT-19: explainability ----------
import pandas as pd


def _fake_calendar():
    # 60 days starting at d_index=100; month 11 (November) for the window start.
    rows = []
    for i in range(60):
        d = 100 + i
        rows.append({
            "d_index": d,
            "month": 11,
            "snap_count": 1 if i % 2 == 0 else 0,
            "event_name_1": "Thanksgiving" if i == 5 else "none",
            "event_name_2": "none",
        })
    return pd.DataFrame(rows)


def _fake_profiles():
    return {
        "turkey": {
            "name": "Fresh Whole Turkey",
            "monthly_avg": [10.0] * 10 + [57.0, 92.0],  # index 10 == month 11 -> 57.0
            "overall_mean": 18.6,
            "event_uplift": {"Thanksgiving": 517.0},
        }
    }


def test_explainability_assembly(monkeypatch):
    # Stub recursive_forecast so the counterfactual (neutralize_events=True) returns
    # a smaller sum than f_full -> positive event_contribution_pct, finite.
    def fake_rf(series_id, start_d, model, feature_meta, data, calendar, neutralize_events=False):
        return [1.0] * 28 if neutralize_events else [5.0] * 28
    monkeypatch.setattr(metrics_mod, "recursive_forecast", fake_rf)

    forecast = [5.0] * 28
    velocity = {"value": 412.0, "status": "Accelerating"}
    out = compute_explainability(
        series_id="turkey", start_d=100, model=None, feature_meta=None,
        data=pd.DataFrame({"series_id": ["turkey"], "product_name": ["Fresh Whole Turkey"]}),
        calendar=_fake_calendar(), profiles=_fake_profiles(),
        velocity=velocity, forecast=forecast,
    )

    # finite numbers
    assert np.isfinite(out["event_contribution_pct"])
    assert isinstance(out["snap_days_in_horizon"], int)
    # event_contribution_pct = (140 - 28)/28*100 = 400.0
    assert out["event_contribution_pct"] == 400.0
    # snap days: 28-day window, even-index days have snap -> indices 0,2,...,26 = 14
    assert out["snap_days_in_horizon"] == 14

    # narrative: non-empty list of strings, includes trend + seasonality + event + contribution
    assert isinstance(out["narrative"], list)
    assert len(out["narrative"]) >= 3
    assert all(isinstance(s, str) and s for s in out["narrative"])
    assert out["narrative"][0].startswith("Demand is Accelerating (+412%")
    assert any("Thanksgiving falls in this window" in s for s in out["narrative"])
    assert out["narrative"][-1].startswith("Events account for ~+400%")

    # factors: exactly 3, right kinds/order/values
    factors = out["factors"]
    assert [f["kind"] for f in factors] == ["event", "seasonal", "trend"]
    assert [f["label"] for f in factors] == ["Event uplift", "Seasonality", "Trend"]
    assert factors[0]["value"] == out["event_contribution_pct"]
    assert factors[2]["value"] == 412.0
    # seasonality value finite (month 11: (57-18.6)/18.6*100)
    assert np.isfinite(factors[1]["value"])


def test_explainability_no_events_omits_event_bullet(monkeypatch):
    def fake_rf(series_id, start_d, model, feature_meta, data, calendar, neutralize_events=False):
        return [3.0] * 28
    monkeypatch.setattr(metrics_mod, "recursive_forecast", fake_rf)

    cal = _fake_calendar()
    cal["event_name_1"] = "none"  # remove all events
    out = compute_explainability(
        series_id="turkey", start_d=100, model=None, feature_meta=None,
        data=pd.DataFrame({"series_id": ["turkey"], "product_name": ["Fresh Whole Turkey"]}),
        calendar=cal, profiles=_fake_profiles(),
        velocity={"value": 0.0, "status": "Stable"}, forecast=[3.0] * 28,
    )
    # equal sums -> 0% contribution, guarded (no div-by-zero)
    assert out["event_contribution_pct"] == 0.0
    # no event bullet -> exactly 3 narrative lines (trend, seasonality, contribution)
    assert len(out["narrative"]) == 3
    assert not any("falls in this window" in s for s in out["narrative"])


def test_explainability_div_zero_guard(monkeypatch):
    # neutralized forecast sums to 0 -> guard max(1e-6, .) prevents inf/nan
    def fake_rf(series_id, start_d, model, feature_meta, data, calendar, neutralize_events=False):
        return [0.0] * 28 if neutralize_events else [10.0] * 28
    monkeypatch.setattr(metrics_mod, "recursive_forecast", fake_rf)
    out = compute_explainability(
        series_id="turkey", start_d=100, model=None, feature_meta=None,
        data=pd.DataFrame({"series_id": ["turkey"], "product_name": ["Fresh Whole Turkey"]}),
        calendar=_fake_calendar(), profiles=_fake_profiles(),
        velocity={"value": 999.0, "status": "Accelerating"}, forecast=[10.0] * 28,
    )
    assert np.isfinite(out["event_contribution_pct"])  # finite, not inf
```

**Commands (run from `backend/`):**
```powershell
cd backend
pytest -q tests/test_metrics.py -k "explainability"
```
All `explainability` tests must pass. (The full end-to-end path with the real model/profiles is verified in `test_api.py`, MT-22..24, per `07` §2.)

## 7. Acceptance checklist
- [ ] `recursive_forecast` (MT-15, `forecast_engine.py`) gains an optional `neutralize_events: bool = False` parameter **after** its existing `calendar` arg that, when `True`, forces `event_name_*/event_type_* = "none"`, `is_event = 0`, `days_to_next_event = days_since_last_event = 28` for every horizon day; default `False` leaves MT-15 behavior + golden test unchanged.
- [ ] `compute_explainability(series_id, start_d, model, feature_meta, data, calendar, profiles, velocity, forecast) -> dict` appended to `backend/app/ml/metrics.py` (siblings untouched); `__all__` extended.
- [ ] `event_contribution_pct = round((sum(f_full) - sum(f_no_event)) / max(1e-6, sum(f_no_event)) * 100, 1)` with `f_full = forecast` (passed in) and `f_no_event` from the single neutralized re-run (`03` §6.5).
- [ ] `month_vs_avg_pct` from `profiles[series_id].monthly_avg[month-1]` vs `overall_mean` (guard `overall_mean<=0`); used for the Seasonality factor and the high/low narrative.
- [ ] `snap_days_in_horizon` = count of horizon days with `snap_count > 0` (`02` §4).
- [ ] `narrative` is a **non-empty list of strings** using the four verbatim templates (`03` §6.5); the event bullet is included only when an event falls in the horizon (length ≥ 3 otherwise).
- [ ] `factors` is exactly `[{Event uplift,event_contribution_pct,event},{Seasonality,month_vs_avg_pct,seasonal},{Trend,velocity.value,trend}]` (`05` §5).
- [ ] All returned numbers are finite (div-by-zero guards verified); function does exactly one model re-run; deterministic, offline, pure (`04` §2).
- [ ] Return keys exactly match `05` §5 `explainability`: `event_contribution_pct, snap_days_in_horizon, narrative, factors`.
- [ ] `pytest -q tests/test_metrics.py -k "explainability"` passes.
