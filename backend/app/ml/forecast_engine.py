"""Recursive 28-day forecast (docs/03_ALGORITHM_SPEC.md sec 4).
Predicts the per-series mean-SCALED target, then rescales to units. Pure function — takes the
loaded model + metadata + data in, returns a list of 28 floats.
"""
from __future__ import annotations
import pandas as pd
from app.config import HORIZON, FIRST_SELECTABLE_D, LAST_SELECTABLE_D
from app.ml.features import build_single_row, row_to_frame


def recursive_forecast(series_id: str, start_d: int, model, feature_meta: dict,
                       units_by_d: dict[int, float], price_by_d: dict[int, float],
                       neutralize_events: bool = False) -> list[float]:
    """Forecast days [start_d .. start_d+27] for one series.

    units_by_d / price_by_d: maps d_index -> actual units / sell_price for this series.
    Returns 28 non-negative floats.
    """
    assert FIRST_SELECTABLE_D <= start_d <= LAST_SELECTABLE_D, \
        f"start_d {start_d} outside selectable range [{FIRST_SELECTABLE_D},{LAST_SELECTABLE_D}]"
    scale = feature_meta["series_scale"][series_id]
    tmean = feature_meta["train_mean_price"][series_id]
    categories = feature_meta["categories"]
    best = feature_meta["best_iteration"]

    u = {d: v for d, v in units_by_d.items() if d < start_d}        # seed with actuals only
    last_price = next((price_by_d[d] for d in range(start_d - 1, 0, -1) if d in price_by_d), tmean)

    preds: list[float] = []
    for t in range(start_d, start_d + HORIZON):
        row = build_single_row(series_id, t, u, last_price, tmean, neutralize_events)
        X = row_to_frame(row, categories)
        yhat = float(model.predict(X, num_iteration=best)[0]) * scale     # rescale
        yhat = max(0.0, yhat)
        u[t] = yhat                                                       # feed back for next day's lags
        preds.append(yhat)
    return preds
