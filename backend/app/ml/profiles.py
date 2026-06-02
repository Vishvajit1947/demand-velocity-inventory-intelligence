"""MT-14 — Build per-series profiles (03_ALGORITHM_SPEC §5) -> profiles.json.

One-time dev-PC step. Reads data/processed/series_daily.parquet over the TRAIN
period (d_index <= 1095) and writes backend/app/models/profiles.json.

Run from backend/:  python -m app.ml.profiles
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from app.config import SERIES_IDS, TRAIN_END_D, PROFILES_PATH, SERIES_DAILY_PATH, MODELS_DIR

NO_EVENT = "none"  # 02 §4: empty events stored as the literal string "none"


def load_train_rows() -> pd.DataFrame:
    """Load series_daily and keep TRAIN rows only (d_index <= TRAIN_END_D, 02 §3)."""
    if not SERIES_DAILY_PATH.exists():
        raise FileNotFoundError(
            f"missing {SERIES_DAILY_PATH}; run MT-10 (data_prep) first"
        )
    df = pd.read_parquet(SERIES_DAILY_PATH)
    return df.loc[df["d_index"] <= TRAIN_END_D].copy()


def _monthly_avg(g: pd.DataFrame) -> list[float]:
    """Mean units/day by month 1..12 -> list index 0..11 (03 §5)."""
    means = g.groupby("month")["units"].mean()
    return [float(means.get(m, 0.0)) for m in range(1, 13)]


def _weekday_avg(g: pd.DataFrame) -> list[float]:
    """Mean units/day by wday 1..7 -> list index 0..6 (03 §5)."""
    means = g.groupby("wday")["units"].mean()
    return [float(means.get(w, 0.0)) for w in range(1, 8)]


def _yearly_total(g: pd.DataFrame) -> dict[str, float]:
    """Sum units per TRAIN year, year-string keys ascending (03 §5)."""
    totals = g.groupby("year")["units"].sum().sort_index()
    return {str(int(y)): float(v) for y, v in totals.items()}


def _event_uplift(g: pd.DataFrame) -> dict[str, float]:
    """Mean % uplift on each event's days vs the no-event baseline (03 §5).

    baseline = mean(units on TRAIN days with event_name_1 == "none").
    A day counts toward event E if event_name_1 == E OR event_name_2 == E.
    Only events that occur for this series in TRAIN are included.
    """
    # baseline: days with NO event in slot 1 (02 §4 / 03 §5)
    no_event_mask = g["event_name_1"].astype(str) == NO_EVENT
    baseline = float(g.loc[no_event_mask, "units"].mean())
    if not np.isfinite(baseline) or baseline == 0.0:
        return {}

    # collect all distinct event names from BOTH event slots (excluding "none")
    ev1 = g["event_name_1"].astype(str)
    ev2 = g["event_name_2"].astype(str)
    all_names = pd.unique(pd.concat([ev1, ev2], ignore_index=True))

    out: dict[str, float] = {}
    for name in all_names:
        if name == NO_EVENT:
            continue
        # A day counts toward E if it appears in either slot (03 §5)
        day_mask = (ev1 == name) | (ev2 == name)
        if not day_mask.any():
            continue
        mean_on = float(g.loc[day_mask, "units"].mean())
        out[str(name)] = round((mean_on - baseline) / baseline * 100.0, 1)
    return out


def build_profile(g: pd.DataFrame) -> dict:
    """Assemble one series' profile object (03 §5)."""
    monthly = _monthly_avg(g)
    m_mean = float(np.mean(monthly))
    seasonal_cv = round(float(np.std(monthly)) / m_mean, 2) if m_mean != 0.0 else 0.0
    return {
        "monthly_avg": [round(x, 4) for x in monthly],
        "weekday_avg": [round(x, 4) for x in _weekday_avg(g)],
        "yearly_total": _yearly_total(g),
        "event_uplift": _event_uplift(g),
        "overall_mean": round(float(g["units"].mean()), 1),
        "seasonal_cv": seasonal_cv,
    }


def build_profiles() -> dict:
    """Build the full {series_id: profile} dict and write profiles.json (03 §5).

    Iterates SERIES_IDS for stable key order (02 §6).
    """
    train = load_train_rows()
    # coerce category columns to str for reliable comparisons
    train["series_id"] = train["series_id"].astype(str)
    train["event_name_1"] = train["event_name_1"].astype(str)
    train["event_name_2"] = train["event_name_2"].astype(str)

    profiles: dict[str, dict] = {}
    for sid in SERIES_IDS:
        g = train.loc[train["series_id"] == sid]
        if g.empty:
            raise ValueError(f"no TRAIN rows for series '{sid}'")
        profiles[sid] = build_profile(g)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROFILES_PATH, "w", encoding="utf-8") as fh:
        json.dump(profiles, fh, indent=2)
    print(f"[MT-14] wrote {PROFILES_PATH} ({len(profiles)} series)")
    return profiles


if __name__ == "__main__":
    build_profiles()
