# backend/tests/test_metrics.py
"""Metric function tests covering MT-16 (accuracy/coherence), MT-17 (velocity),
MT-18 (inventory risk), and MT-19 (explainability).
Pure-math tests — no artifacts needed.
"""
import numpy as np
import pytest

from app.ml.metrics import (
    compute_accuracy,
    compute_coherence,
    compute_velocity,
    compute_inventory_risk,
    compute_explainability,
)


# ==========================================================================
# MT-16: accuracy / sMAPE  (03_ALGORITHM_SPEC §6.1)
# ==========================================================================

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
    # WAPE: |10-8|+|10-12| = 4, sum(|a|) = 20 -> wape = 20
    assert out["wape"] == pytest.approx(20.0, abs=1e-9)
    assert out["accuracy"] == pytest.approx(80.0, abs=1e-9)
    assert out["mae"] == pytest.approx(2.0, abs=1e-9)
    assert out["rmse"] == pytest.approx(2.0, abs=1e-9)


def test_accuracy_zero_day_excluded_from_smape():
    # day where a=f=0 must not divide-by-zero nor count; other days drive sMAPE
    a = [0.0, 10.0]
    f = [0.0, 10.0]
    out = compute_accuracy(a, f)
    assert out["accuracy"] == 100.0  # only contributing day is perfect


def test_accuracy_floor_at_zero():
    # wildly wrong -> WAPE near 200 -> accuracy floored at 0
    a = [100.0, 100.0, 100.0]
    f = [0.0, 0.0, 0.0]
    out = compute_accuracy(a, f)
    assert out["accuracy"] == 0.0


def test_accuracy_length_mismatch_raises():
    with pytest.raises(ValueError):
        compute_accuracy([1.0, 2.0], [1.0])


def test_accuracy_all_zero_forecast_nonzero():
    # sum(|a|)==0, sum(|f|) >= 1 -> accuracy = 0
    out = compute_accuracy([0.0, 0.0], [5.0, 5.0])
    assert out["accuracy"] == 0.0


def test_accuracy_wape_value():
    # actual sum 10, abs err sum 2 -> wape 20 -> accuracy 80
    r = compute_accuracy([5.0, 5.0], [6.0, 6.0])
    assert r["wape"] == 20.0 and r["accuracy"] == 80.0


# ==========================================================================
# MT-16: coherence  (03_ALGORITHM_SPEC §6.2)
# ==========================================================================

def test_coherence_identical_strong():
    a = [1.0, 3.0, 2.0, 5.0, 4.0]
    out = compute_coherence(a, a)
    # perfect corr (1.0) + perfect direction (1.0) -> 100
    assert out["coherence"] == 100.0
    assert out["coherence_label"] == "Strong"


def test_coherence_constant_actual_uses_direction_only():
    # actual constant -> shape_corr NaN -> coherence = 100*direction
    a = [5.0, 5.0, 5.0, 5.0]   # all diffs sign 0
    f = [5.0, 6.0, 7.0, 8.0]   # all diffs sign +1
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
    # craft direction-only cases (constant actual) to hit each band exactly
    a = [5.0, 5.0, 5.0, 5.0, 5.0]   # constant -> direction-only

    # 2 of 4 transitions are flat (sign 0 == sign 0) -> direction 0.5 -> coherence 50 (Moderate)
    f_50 = [5.0, 5.0, 5.0, 6.0, 7.0]
    out_mod = compute_coherence(a, f_50)
    assert out_mod["coherence"] == 50.0
    assert out_mod["coherence_label"] == "Moderate"   # 50 -> Moderate (>=50)

    # 3 of 4 transitions flat -> direction 0.75 -> coherence 75 (Strong boundary)
    f_75 = [5.0, 5.0, 5.0, 5.0, 7.0]
    out_strong = compute_coherence(a, f_75)
    assert out_strong["coherence"] == 75.0
    assert out_strong["coherence_label"] == "Strong"  # 75 -> Strong (>=75)

    # 0 of 4 transitions match -> direction 0 -> coherence 0 (Weak)
    f_weak = [5.0, 6.0, 7.0, 8.0, 9.0]
    out_weak = compute_coherence(a, f_weak)
    assert out_weak["coherence"] == 0.0
    assert out_weak["coherence_label"] == "Weak"


def test_coherence_anticorrelated():
    # forecast moves opposite to actual -> max(0, shape_corr)=0, direction=0 -> 0
    a = [1.0, 2.0, 3.0, 4.0]
    f = [4.0, 3.0, 2.0, 1.0]
    out = compute_coherence(a, f)
    assert out["coherence"] == 0.0


def test_coherence_perfect_shape_positive():
    r = compute_coherence([1.0, 2.0, 3.0, 4.0, 5.0], [2.0, 4.0, 6.0, 8.0, 10.0])
    assert r["coherence"] >= 75 and r["coherence_label"] == "Strong"


# ==========================================================================
# MT-17: velocity  (03_ALGORITHM_SPEC §6.3)
# ==========================================================================

def test_velocity_buckets():
    assert compute_velocity(100, [0] * 28)["status"] == "Critical Decline"   # -100%
    assert compute_velocity(100, [8.0] * 10)["status"] == "Declining"        # -20%
    assert compute_velocity(100, [10.0] * 10)["status"] == "Stable"          # 0%
    assert compute_velocity(100, [13.0] * 10)["status"] == "Growing"         # +30%
    assert compute_velocity(100, [20.0] * 10)["status"] == "Accelerating"    # +100%


def test_velocity_zero_prev():
    assert compute_velocity(0, [0] * 28)["value"] == 0.0
    assert compute_velocity(0, [5] * 28)["value"] == 999.0


# ==========================================================================
# MT-18: inventory risk  (03_ALGORITHM_SPEC §6.4)
# ==========================================================================

def test_inventory_risk_shape_and_monotonic():
    trailing = [10.0] * 28
    low = compute_inventory_risk(trailing, [5.0] * 28)
    high = compute_inventory_risk(trailing, [50.0] * 28)
    assert len(low["projected_stock"]) == 28
    assert high["cover_days"] <= low["cover_days"]     # more demand -> runs out sooner
    assert high["stockout_risk"] in {"Low", "Medium", "High"}
    assert high["recommended_order_qty"] >= 0


# ==========================================================================
# MT-19: explainability  (03_ALGORITHM_SPEC §6.5)
# ==========================================================================

def test_explainability_structure():
    prof = {
        "overall_mean": 10.0,
        "monthly_avg": [10] * 12,
        "event_uplift": {"Thanksgiving": 500.0},
    }
    vel = {"value": 50.0, "status": "Accelerating"}
    r = compute_explainability(
        "turkey", "Fresh Whole Turkey", 11,
        [20.0] * 28, [10.0] * 28,
        prof, vel,
        [{"date": "2015-11-26", "name": "Thanksgiving", "type": "National"}],
        4,
    )
    assert np.isfinite(r["event_contribution_pct"])
    assert isinstance(r["narrative"], list) and len(r["narrative"]) >= 3
    assert len(r["factors"]) == 3
    assert {fac["kind"] for fac in r["factors"]} == {"event", "seasonal", "trend"}
