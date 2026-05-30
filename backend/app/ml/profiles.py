"""Per-series profiles -> backend/app/models/profiles.json  (docs/03_ALGORITHM_SPEC.md sec 5).
Computed over the TRAIN period. Run once on the dev PC:  python -m app.ml.profiles
"""
from __future__ import annotations
import json
import numpy as np
import pandas as pd
from app.config import SERIES_DAILY_PATH, PROFILES_PATH, TRAIN_END_D


def build_profiles() -> dict:
    sd = pd.read_parquet(SERIES_DAILY_PATH)
    sd["series_id"] = sd["series_id"].astype(str)
    tr = sd[sd["d_index"] <= TRAIN_END_D].copy()
    tr["is_event"] = (tr["event_name_1"].astype(str) != "none").astype(int)

    profiles = {}
    for s, g in tr.groupby("series_id"):
        monthly = [round(float(x), 2) for x in
                   g.groupby("month")["units"].mean().reindex(range(1, 13)).fillna(0)]
        weekday = [round(float(x), 2) for x in
                   g.groupby("wday")["units"].mean().reindex(range(1, 8)).fillna(0)]
        yearly = {str(int(y)): round(float(v), 1) for y, v in g.groupby("year")["units"].sum().items()}
        base = float(g.loc[g["is_event"] == 0, "units"].mean())
        uplift = {}
        for ev, sub in g[g["is_event"] == 1].groupby("event_name_1", observed=True):
            if base > 0 and str(ev) != "none":
                uplift[str(ev)] = round((float(sub["units"].mean()) - base) / base * 100, 1)
        overall_mean = round(float(g["units"].mean()), 2)
        cv = float(np.std(monthly) / np.mean(monthly)) if np.mean(monthly) else 0.0
        profiles[s] = {"monthly_avg": monthly, "weekday_avg": weekday, "yearly_total": yearly,
                       "event_uplift": uplift, "overall_mean": overall_mean,
                       "seasonal_cv": round(cv, 2)}
    return profiles


def main() -> None:
    profiles = build_profiles()
    PROFILES_PATH.parent.mkdir(parents=True, exist_ok=True)
    PROFILES_PATH.write_text(json.dumps(profiles, indent=2))
    print(f"OK -> {PROFILES_PATH}  ({len(profiles)} series)")


if __name__ == "__main__":
    main()
