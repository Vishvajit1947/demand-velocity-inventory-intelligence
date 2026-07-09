"""
Timing instrumentation for POST /api/forecast — diagnosis only, no changes.
Run from backend/: .venv\Scripts\python -m scripts.time_forecast

Instruments every major step in the hot path and prints a breakdown table.
"""
from __future__ import annotations

import time
import sys

# ── patch timing into the hot-path functions ─────────────────────────────────
_timings: dict[str, float] = {}
_counts:  dict[str, int]   = {}

def _t(label: str, fn, *args, **kwargs):
    t0 = time.perf_counter()
    result = fn(*args, **kwargs)
    elapsed = time.perf_counter() - t0
    _timings[label] = _timings.get(label, 0.0) + elapsed
    _counts[label]  = _counts.get(label, 0) + 1
    return result


# ── import app (artifacts load at this point via get_store lifespan) ──────────
print("Loading app + artifacts...", flush=True)
t_app_start = time.perf_counter()
from app.services.store import get_store
store = get_store()
t_app_end = time.perf_counter()
print(f"  Artifact load: {t_app_end - t_app_start:.3f}s  (model_loaded={store.model_loaded})")

if not store.model_loaded:
    print("ERROR: artifacts not loaded. Aborting.", file=sys.stderr)
    sys.exit(1)

# ── monkey-patch the hot-path functions to inject timing ─────────────────────
import app.services.forecast_service as fs_mod
import app.ml.forecast_engine as eng_mod
import app.ml.metrics as met_mod

# --- store helpers ---
_orig_units_by_d  = store.units_by_d.__func__
_orig_price_by_d  = store.price_by_d.__func__

import types

def _timed_units_by_d(self, series_id):
    return _t("store.units_by_d", _orig_units_by_d, self, series_id)

def _timed_price_by_d(self, series_id):
    return _t("store.price_by_d", _orig_price_by_d, self, series_id)

store.units_by_d = types.MethodType(_timed_units_by_d, store)
store.price_by_d = types.MethodType(_timed_price_by_d, store)

# --- recursive_forecast_dicts (main forecast run) ---
_orig_rfd = eng_mod.recursive_forecast_dicts

def _timed_rfd(series_id, start_d, model, feature_meta, units_by_d, price_by_d, neutralize_events=False):
    label = "recursive_forecast (neutralized)" if neutralize_events else "recursive_forecast (main)"
    return _t(label, _orig_rfd, series_id, start_d, model, feature_meta, units_by_d, price_by_d, neutralize_events)

eng_mod.recursive_forecast_dicts = _timed_rfd

# Also patch the recursive_forecast used by compute_explainability (different import path)
_orig_rf = eng_mod.recursive_forecast

def _timed_rf(series_id, start_d, model, feature_meta, data, calendar, neutralize_events=False):
    label = "recursive_forecast_df (neutralized)" if neutralize_events else "recursive_forecast_df (main)"
    return _t(label, _orig_rf, series_id, start_d, model, feature_meta, data, calendar, neutralize_events)

eng_mod.recursive_forecast = _timed_rf
# metrics.py imported recursive_forecast directly — re-patch that reference too
met_mod.recursive_forecast = _timed_rf

# --- compute_explainability ---
_orig_expl = met_mod.compute_explainability

def _timed_expl(series_id, start_d, model, feature_meta, data, calendar, profiles, velocity, forecast):
    return _t("compute_explainability", _orig_expl,
              series_id, start_d, model, feature_meta, data, calendar, profiles, velocity, forecast)

met_mod.compute_explainability = _timed_expl
# patch the reference in forecast_service too
fs_mod.compute_explainability = _timed_expl

# --- other metrics ---
_orig_acc = met_mod.compute_accuracy
_orig_coh = met_mod.compute_coherence
_orig_vel = met_mod.compute_velocity
_orig_inv = met_mod.compute_inventory_risk

met_mod.compute_accuracy       = lambda *a, **k: _t("compute_accuracy",       _orig_acc, *a, **k)
met_mod.compute_coherence      = lambda *a, **k: _t("compute_coherence",      _orig_coh, *a, **k)
met_mod.compute_velocity       = lambda *a, **k: _t("compute_velocity",       _orig_vel, *a, **k)
met_mod.compute_inventory_risk = lambda *a, **k: _t("compute_inventory_risk", _orig_inv, *a, **k)

fs_mod.compute_accuracy        = met_mod.compute_accuracy
fs_mod.compute_coherence       = met_mod.compute_coherence
fs_mod.compute_velocity        = met_mod.compute_velocity
fs_mod.compute_inventory_risk  = met_mod.compute_inventory_risk

# --- calendar reload inside recursive_forecast_dicts ---
import app.ml.calendar_features as cal_mod
_orig_load_cal    = cal_mod.load_calendar
_orig_add_evt_dst = cal_mod.add_event_distance

cal_mod.load_calendar         = lambda: _t("calendar_features.load_calendar", _orig_load_cal)
cal_mod.add_event_distance    = lambda c: _t("calendar_features.add_event_distance", _orig_add_evt_dst, c)
eng_mod.load_calendar_features = lambda: _t("eng.load_calendar_features", eng_mod.load_calendar_features)

# ── time _build_row and _frame_from_row per-iteration ────────────────────────
_orig_build_row   = eng_mod._build_row
_orig_frame_from  = eng_mod._frame_from_row

def _timed_build_row(*a, **k):
    return _t("_build_row (×28 per run)", _orig_build_row, *a, **k)

def _timed_frame_from(*a, **k):
    return _t("_frame_from_row (×28 per run)", _orig_frame_from, *a, **k)

eng_mod._build_row      = _timed_build_row
eng_mod._frame_from_row = _timed_frame_from

# ── also time the _same_wday_mean inner loop ─────────────────────────────────
_orig_swm = eng_mod._same_wday_mean

def _timed_swm(*a, **k):
    return _t("_same_wday_mean (×28 per run)", _orig_swm, *a, **k)

eng_mod._same_wday_mean = _timed_swm

# ── run the forecast ──────────────────────────────────────────────────────────
from app.services.forecast_service import run as forecast_run

PRODUCT = "turkey"
START   = "2015-11-01"

print(f"\nRunning forecast for {PRODUCT!r} @ {START}...", flush=True)
t0 = time.perf_counter()
try:
    result = forecast_run([PRODUCT], START)
    total = time.perf_counter() - t0
    print(f"  Total wall time: {total:.3f}s\n")
except Exception as exc:
    total = time.perf_counter() - t0
    print(f"  FAILED after {total:.3f}s: {exc}", file=sys.stderr)
    raise

# ── print timing breakdown ────────────────────────────────────────────────────
print("=" * 68)
print(f"  {'Step':<46} {'Time (s)':>8}  {'Calls':>5}  {'% total':>7}")
print("=" * 68)

for label, elapsed in sorted(_timings.items(), key=lambda x: -x[1]):
    calls = _counts.get(label, 1)
    pct   = elapsed / total * 100 if total else 0.0
    print(f"  {label:<46} {elapsed:>8.3f}  {calls:>5}  {pct:>6.1f}%")

print("=" * 68)
print(f"  {'TOTAL (wall clock)':<46} {total:>8.3f}")
print()

# ── per-iteration cost of main loop ──────────────────────────────────────────
if "recursive_forecast (main)" in _timings:
    rf_main = _timings["recursive_forecast (main)"]
    print(f"  recursive_forecast (main) breakdown per iteration (28 steps):")
    for k in ["_build_row (×28 per run)", "_same_wday_mean (×28 per run)",
              "_frame_from_row (×28 per run)"]:
        if k in _timings:
            per_iter = _timings[k] / _counts.get(k, 1)
            print(f"    {k}: {_timings[k]:.3f}s total, {per_iter*1000:.2f}ms/call")

print("\nDiagnosis complete. Do NOT commit any changes from this script.")
