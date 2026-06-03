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


# ---------- MT-17: velocity (full boundary suite) ----------
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


# ==========================================================================
# MT-18: inventory risk  (03_ALGORITHM_SPEC §6.4)
# ==========================================================================
from app.config import INITIAL_COVER_DAYS, LEAD_TIME_DAYS, SERVICE_Z, HORIZON


def test_inventory_risk_shape_and_monotonic():
    trailing = [10.0] * 28
    low = compute_inventory_risk(trailing, [5.0] * 28)
    high = compute_inventory_risk(trailing, [50.0] * 28)
    assert len(low["projected_stock"]) == 28
    assert high["cover_days"] <= low["cover_days"]     # more demand -> runs out sooner
    assert high["stockout_risk"] in {"Low", "Medium", "High"}
    assert high["recommended_order_qty"] >= 0


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


# ==========================================================================
# MT-19: explainability  (03_ALGORITHM_SPEC §6.5)
# ==========================================================================
import pandas as pd

from app.ml import metrics as metrics_mod


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
