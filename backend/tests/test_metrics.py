"""Pure-math tests for app.ml.metrics (no artifacts needed)."""
import numpy as np
from app.ml.metrics import (compute_accuracy, compute_coherence, compute_velocity,
                            compute_inventory_risk, compute_explainability)


def test_accuracy_perfect():
    a = [1, 2, 3, 4]
    r = compute_accuracy(a, a)
    assert r["accuracy"] == 100.0 and r["wape"] == 0.0 and r["mae"] == 0.0


def test_accuracy_all_zero():
    assert compute_accuracy([0, 0, 0], [0, 0, 0])["accuracy"] == 100.0


def test_accuracy_wape_value():
    # actual sum 10, abs err sum 2 -> wape 20 -> accuracy 80
    r = compute_accuracy([5, 5], [6, 6])
    assert r["wape"] == 20.0 and r["accuracy"] == 80.0


def test_coherence_constant_actual_uses_direction():
    r = compute_coherence([2, 2, 2, 2], [1, 2, 3, 4])
    assert 0 <= r["coherence"] <= 100 and r["coherence_label"] in {"Strong", "Moderate", "Weak"}


def test_coherence_perfect_shape():
    r = compute_coherence([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])
    assert r["coherence"] >= 75 and r["coherence_label"] == "Strong"


def test_velocity_buckets():
    assert compute_velocity(100, [0] * 28)["status"] == "Critical Decline"   # -100%
    assert compute_velocity(100, [8.0] * 10)["status"] in {"Declining"}      # -20%
    assert compute_velocity(100, [10.0] * 10)["status"] == "Stable"          # 0%
    assert compute_velocity(100, [13.0] * 10)["status"] == "Growing"         # +30%
    assert compute_velocity(100, [20.0] * 10)["status"] == "Accelerating"    # +100%


def test_velocity_zero_prev():
    assert compute_velocity(0, [0] * 28)["value"] == 0.0
    assert compute_velocity(0, [5] * 28)["value"] == 999.0


def test_inventory_risk_shape_and_monotonic():
    trailing = [10.0] * 28
    low = compute_inventory_risk(trailing, [5.0] * 28)
    high = compute_inventory_risk(trailing, [50.0] * 28)
    assert len(low["projected_stock"]) == 28
    assert high["cover_days"] <= low["cover_days"]          # more demand -> runs out sooner
    assert high["stockout_risk"] in {"Low", "Medium", "High"}
    assert high["recommended_order_qty"] >= 0


def test_explainability_structure():
    prof = {"overall_mean": 10.0, "monthly_avg": [10] * 12, "event_uplift": {"Thanksgiving": 500.0}}
    vel = {"value": 50.0, "status": "Accelerating"}
    r = compute_explainability("turkey", "Fresh Whole Turkey", 11,
                               [20.0] * 28, [10.0] * 28, prof, vel,
                               [{"date": "2015-11-26", "name": "Thanksgiving", "type": "National"}], 4)
    assert np.isfinite(r["event_contribution_pct"])
    assert isinstance(r["narrative"], list) and len(r["narrative"]) >= 3
    assert len(r["factors"]) == 3 and {f["kind"] for f in r["factors"]} == {"event", "seasonal", "trend"}
