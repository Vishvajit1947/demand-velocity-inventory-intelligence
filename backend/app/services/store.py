"""
Store — loads all runtime artifacts ONCE and caches them (singleton).

Per 04_BACKEND_ARCHITECTURE.md §2/§3/§9: model + data + profiles + calendar load at process
start and are held in a module-level singleton (get_store()), so requests are fast and
deterministic. If artifacts are missing, model_loaded becomes False and import does NOT crash
(04 §3/§5) — /api/health then reports model_loaded:false and /api/forecast 500s clearly.

Reads only from config.PATHS (MT-01 / 04 §1). No FastAPI imports (04 §2).

Citations:
  - artifacts list ........... 03_ALGORITHM_SPEC.md §0
  - series_daily schema ...... 02_DATA_SPEC.md §4
  - train mean price ......... 03_ALGORITHM_SPEC.md §3.4 (mean over TRAIN days; 0/NaN -> 1.0)
  - singleton / graceful ..... 04_BACKEND_ARCHITECTURE.md §2/§3/§5/§9
"""

from __future__ import annotations

import json
import pickle
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Optional

import pandas as pd

from app.config import PATHS, SERIES_IDS, TRAIN_END_D, TRAIN_START_D

# Re-export PATHS so test mocks can reference store_mod.PATHS
__all__ = ["Store", "get_store", "reset_store", "PATHS"]


@dataclass
class Store:
    """In-memory holder for all runtime artifacts (singleton via get_store())."""

    model: Optional[Any] = None
    feature_meta: Optional[dict] = None
    profiles: Optional[dict] = None
    series_daily: Optional[pd.DataFrame] = None
    calendar: Optional[pd.DataFrame] = None
    model_loaded: bool = False

    # Diagnostics: per-artifact load problems (empty when all loaded).
    load_errors: dict = field(default_factory=dict)
    # Internal cache: series_id -> train mean price.
    _train_mean_price: dict = field(default_factory=dict, repr=False)

    # ---- loading --------------------------------------------------------
    @classmethod
    def load(cls) -> "Store":
        """
        Load every artifact from config.PATHS. NEVER raises on a missing/broken file:
        a failed artifact is left as None and recorded in load_errors. model_loaded is
        True iff all five core artifacts loaded successfully.
        """
        s = cls()

        s.model = s._safe(_load_pickle, PATHS["model"], "model")
        s.feature_meta = s._safe(_load_json, PATHS["feature_meta"], "feature_meta")
        s.profiles = s._safe(_load_json, PATHS["profiles"], "profiles")
        s.series_daily = s._safe(_load_parquet, PATHS["series_daily"], "series_daily")
        s.calendar = s._safe(_load_calendar_csv, PATHS["calendar"], "calendar")

        if s.series_daily is not None:
            # Stable order for deterministic, fast (series_id, d_index) lookups (02 §4).
            s.series_daily = s.series_daily.sort_values(
                ["series_id", "d_index"]
            ).reset_index(drop=True)

        s.model_loaded = all(
            x is not None
            for x in (s.model, s.feature_meta, s.profiles, s.series_daily, s.calendar)
        )
        return s

    def _safe(self, loader, path, name):
        """Run a loader; on any failure record the reason and return None."""
        try:
            return loader(path)
        except Exception as exc:  # noqa: BLE001 — degrade gracefully (04 §3/§5)
            self.load_errors[name] = f"{type(exc).__name__}: {exc}"
            return None

    # ---- date helpers (backed by app.ml.calendar_features) ---------------

    def d_to_date(self, d: int) -> date:
        """Map d-index to calendar date using the MT-11 formula (02 §1)."""
        from app.ml.calendar_features import d_to_date as _d2d
        return _d2d(d)

    def date_to_d(self, dt) -> int:
        """Map a date/str/Timestamp to d-index using MT-11 formula (02 §1)."""
        from app.ml.calendar_features import date_to_d as _dt2d
        return _dt2d(dt)

    # ---- read helpers ---------------------------------------------------
    def actual_units(self, series_id: str, d_from: int, d_to: int) -> list[float]:
        """
        Actual `units` for `series_id` over inclusive d_index range [d_from, d_to],
        ordered by ascending d_index (02 §4). Returns the rows that exist (no padding).
        """
        if self.series_daily is None:
            raise RuntimeError("series_daily not loaded; cannot read actual_units")
        df = self.series_daily
        sid = str(series_id)
        mask = (
            (df["series_id"].astype(str) == sid)
            & (df["d_index"] >= d_from)
            & (df["d_index"] <= d_to)
        )
        sub = df.loc[mask, ["d_index", "units"]].sort_values("d_index")
        return [float(u) for u in sub["units"].to_list()]

    def units_by_d(self, series_id: str) -> dict[int, float]:
        """Return a full {d_index: units} dict for the series (for recursive_forecast)."""
        if self.series_daily is None:
            raise RuntimeError("series_daily not loaded")
        df = self.series_daily
        sub = df[df["series_id"].astype(str) == str(series_id)]
        return dict(zip(sub["d_index"].tolist(), sub["units"].astype(float).tolist()))

    def price_by_d(self, series_id: str) -> dict[int, float]:
        """Return a full {d_index: sell_price} dict for the series (for recursive_forecast)."""
        if self.series_daily is None:
            raise RuntimeError("series_daily not loaded")
        df = self.series_daily
        sub = df[df["series_id"].astype(str) == str(series_id)]
        return dict(zip(sub["d_index"].tolist(), sub["sell_price"].astype(float).tolist()))

    def series_train_mean_price(self, series_id: str) -> float:
        """
        Mean sell_price over this series' TRAIN days [TRAIN_START_D, TRAIN_END_D] (03 §3.4).
        Returns 1.0 if the mean is 0 / NaN. Cached per series.
        """
        if series_id in self._train_mean_price:
            return self._train_mean_price[series_id]
        if self.series_daily is None:
            raise RuntimeError("series_daily not loaded; cannot compute train mean price")
        df = self.series_daily
        mask = (
            (df["series_id"].astype(str) == str(series_id))
            & (df["d_index"] >= TRAIN_START_D)
            & (df["d_index"] <= TRAIN_END_D)
        )
        mean_price = df.loc[mask, "sell_price"].mean()
        if pd.isna(mean_price) or float(mean_price) == 0.0:
            value = 1.0
        else:
            value = float(mean_price)
        self._train_mean_price[series_id] = value
        return value

    def events_in_range(self, d_from: int, d_to: int) -> list[dict]:
        """
        Return EventInfo dicts {date, name, type} for calendar event days in [d_from, d_to].
        An event day is one where event_name_1 is not "none" (03 §3.3).
        """
        if self.calendar is None:
            return []
        cal = self.calendar
        # calendar may be indexed by d_index (MT-11 contract) or have it as a column
        if cal.index.name == "d_index":
            sub = cal.loc[
                (cal.index >= d_from) & (cal.index <= d_to)
            ]
            # Build date column from index if needed
            d_idx = sub.index
        else:
            sub = cal[(cal["d_index"] >= d_from) & (cal["d_index"] <= d_to)]
            d_idx = sub["d_index"]

        events = []
        for i, (d_val, row) in enumerate(zip(d_idx, sub.itertuples(index=False))):
            name = str(getattr(row, "event_name_1", "none"))
            if name not in ("", "none"):
                dt = self.d_to_date(int(d_val))
                events.append({
                    "date": dt.isoformat(),
                    "name": name,
                    "type": str(getattr(row, "event_type_1", "")),
                })
        return events

    def snap_days_in_range(self, d_from: int, d_to: int) -> int:
        """Count of days in [d_from, d_to] where snap_count > 0."""
        if self.calendar is None:
            return 0
        cal = self.calendar
        if cal.index.name == "d_index":
            sub = cal.loc[(cal.index >= d_from) & (cal.index <= d_to)]
        else:
            sub = cal[(cal["d_index"] >= d_from) & (cal["d_index"] <= d_to)]
        return int((sub["snap_count"] > 0).sum())


# ---------------------------------------------------------------------------
# Per-artifact loaders (module-level; each raises on failure, caught by Store._safe)
# ---------------------------------------------------------------------------
def _load_pickle(path):
    # Importing lightgbm ensures the Booster class is registered for unpickling (03 §0/§2).
    try:
        import lightgbm  # noqa: F401
    except ImportError:
        pass
    with open(path, "rb") as fh:
        return pickle.load(fh)


def _load_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _load_parquet(path):
    return pd.read_parquet(path)


def _load_calendar_csv(path):
    """Load calendar using MT-11's load_calendar() which returns an indexed DataFrame."""
    from app.ml.calendar_features import load_calendar
    return load_calendar()


# ---------------------------------------------------------------------------
# Singleton accessor (load once, cache) — 04 §2/§3
# ---------------------------------------------------------------------------
_STORE: Optional[Store] = None


def get_store() -> Store:
    """Return the process-wide Store, loading artifacts on first call (04 §2/§3/§9)."""
    global _STORE
    if _STORE is None:
        _STORE = Store.load()
    return _STORE


def reset_store() -> None:
    """Clear the cached singleton (test helper only; forces a reload on next get_store())."""
    global _STORE
    _STORE = None
