"""End-to-end validation of the SHIPPED forecast engine (app.ml.*). Proves the committed model
produces sensible forecasts and writes the golden fixture used by the test suite.
Run from backend/:  python -m scripts.validate_engine
"""
import json, pickle
import numpy as np
import pandas as pd
from app.config import (SERIES_DAILY_PATH, MODEL_PATH, FEATURE_META_PATH, PROFILES_PATH,
                        SERIES_IDS, HORIZON)
from app.ml.calendar_features import date_to_d
from app.ml.forecast_engine import recursive_forecast
from app.ml.metrics import compute_accuracy, compute_coherence, compute_velocity, compute_inventory_risk

sd = pd.read_parquet(SERIES_DAILY_PATH); sd["series_id"] = sd["series_id"].astype(str)
model = pickle.load(open(MODEL_PATH, "rb"))
meta = json.loads(FEATURE_META_PATH.read_text())
ubys = {s: dict(zip(g.d_index, g.units.astype(float))) for s, g in sd.groupby("series_id")}
pbys = {s: dict(zip(g.d_index, g.sell_price.astype(float))) for s, g in sd.groupby("series_id")}

def fc(s, d):
    return recursive_forecast(s, d, model, meta, ubys[s], pbys[s])

DATES = ["2014-11-01", "2015-02-01", "2014-09-01", "2015-06-15", "2015-12-01", "2016-02-10"]
print("WAPE-accuracy by product (shipped engine):")
allw = []
for s in SERIES_IDS:
    ws = []
    for ds in DATES:
        d = date_to_d(ds)
        f = fc(s, d); a = [ubys[s].get(d + i, 0.0) for i in range(HORIZON)]
        ws.append(compute_accuracy(a, f)["accuracy"])
    allw.append(np.mean(ws))
    print(f"  {s:13s} {np.mean(ws):5.1f}")
print(f"  >>> mean per-product WAPE-acc = {np.mean(allw):.1f}")

# portfolio (volume-weighted) accuracy across all products, per date
print("\nPortfolio (volume-weighted) WAPE-accuracy by date:")
pf = []
for ds in DATES:
    d = date_to_d(ds); num = den = 0.0
    for s in SERIES_IDS:
        f = np.array(fc(s, d)); a = np.array([ubys[s].get(d + i, 0.0) for i in range(HORIZON)])
        num += np.abs(a - f).sum(); den += a.sum()
    print(f"  {ds}: {max(0.0, 100 - num/den*100):5.1f}")
    pf.append(max(0.0, 100 - num / den * 100))
print(f"  >>> mean portfolio WAPE-acc = {np.mean(pf):.1f}")

# golden fixture for the test suite
gold = [round(v, 6) for v in fc("turkey", 1300)]
(MODEL_PATH.parent.parent / "tests" / "golden").mkdir(parents=True, exist_ok=True)
(MODEL_PATH.parent.parent.parent / "tests" / "golden" / "expected_turkey_1300.json").write_text(json.dumps(gold, indent=2))
print("\ngolden fixture written: tests/golden/expected_turkey_1300.json")

# sanity: a Thanksgiving-window turkey forecast should rise
d = date_to_d("2015-11-08"); f = fc("turkey", d)
print(f"turkey @2015-11-08 horizon: peak={max(f):.0f} mean={np.mean(f):.1f} (Thanksgiving in window)")
