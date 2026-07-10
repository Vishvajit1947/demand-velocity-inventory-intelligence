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

import datetime
import json
import pickle
from dataclasses import dataclass, field
from typing import Any, Optional

import pandas as pd

from app.config import PATHS, TRAIN_END_D, TRAIN_START_D

# Re-export PATHS so test monkeypatching can target store_mod.PATHS
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
    # Pre-built per-series dicts for fast forecast lookups (populated after load).
    _units_cache: dict = field(default_factory=dict, repr=False)   # {series_id: {d: units}}
    _price_cache: dict = field(default_factory=dict, repr=False)   # {series_id: {d: price}}

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
        s.calendar = s._safe(_load_calendar, PATHS["calendar"], "calendar")

        if s.series_daily is not None:
            # Stable order for deterministic, fast (series_id, d_index) lookups (02 §4).
            s.series_daily = s.series_daily.sort_values(
                ["series_id", "d_index"]
            ).reset_index(drop=True)

        s.model_loaded = all(
            x is not None
            for x in (s.model, s.feature_meta, s.profiles, s.series_daily, s.calendar)
        )

        # Pre-build per-series unit/price dicts once at startup so each forecast
        # request does O(1) dict lookup instead of a full DataFrame mask scan.
        if s.model_loaded and s.series_daily is not None:
            df = s.series_daily
            for sid, grp in df.groupby("series_id", sort=False):
                d_arr = grp["d_index"].to_numpy().astype(int)
                s._units_cache[str(sid)] = dict(
                    zip(d_arr, grp["units"].to_numpy().astype(float))
                )
                s._price_cache[str(sid)] = dict(
                    zip(d_arr, grp["sell_price"].to_numpy().astype(float))
                )

        return s

    def _safe(self, loader, path, name):
        """Run a loader; on any failure record the reason and return None."""
        try:
            return loader(path)
        except Exception as exc:  # noqa: BLE001 — degrade gracefully (04 §3/§5)
            self.load_errors[name] = f"{type(exc).__name__}: {exc}"
            return None

    # ---- read helpers ---------------------------------------------------
    def actual_units(self, series_id: str, d_from: int, d_to: int) -> list[float]:
        """
        Actual `units` for `series_id` over inclusive d_index range [d_from, d_to],
        ordered by ascending d_index (02 §4). Returns the rows that exist (no padding).

        Vectorized: filters by series_id once, then slices the d_index range with
        numpy comparison — faster than a three-condition boolean mask on the full
        DataFrame, especially under Railway's CPU throttling.
        """
        if self.series_daily is None:
            raise RuntimeError("series_daily not loaded; cannot read actual_units")
        df = self.series_daily
        sid_mask = df["series_id"] == series_id
        sub      = df.loc[sid_mask, ["d_index", "units"]]
        d_arr    = sub["d_index"].to_numpy()
        u_arr    = sub["units"].to_numpy()
        keep     = (d_arr >= d_from) & (d_arr <= d_to)
        # d_arr is already ascending (series_daily sorted at load time)
        return [float(v) for v in u_arr[keep]]

    def d_to_date(self, d: int) -> "datetime.date":
        """
        Map a day index d (>=1) to its calendar date (02_DATA_SPEC §1, calendar map).

        Delegates to calendar_features.d_to_date so the single authoritative
        implementation (MT-11) is always used. Required by the /api/calendar/bounds
        endpoint (MT-22) which calls store.d_to_date(config.TRAIN_START_D) etc.
        """
        from app.ml.calendar_features import d_to_date as _d_to_date
        return _d_to_date(d)

    def date_to_d(self, dt) -> int:
        """
        Inverse of d_to_date: map a date to its day index (02_DATA_SPEC §1).

        Delegates to calendar_features.date_to_d (MT-11). Required by
        forecast_service._validate_start_d (MT-23).
        """
        from app.ml.calendar_features import date_to_d as _date_to_d
        return _date_to_d(dt)

    def units_by_d(self, series_id: str) -> dict:
        """
        Return {d_index: units} for all days of `series_id` (02 §4).

        Returns the pre-built cache dict built at startup (O(1) lookup).
        Falls back to a DataFrame scan if the cache was not populated (e.g. in tests).
        """
        if series_id in self._units_cache:
            return self._units_cache[series_id]
        # Fallback: build on demand (test / partial-load path)
        if self.series_daily is None:
            raise RuntimeError("series_daily not loaded; cannot read units_by_d")
        df = self.series_daily
        mask = df["series_id"] == series_id
        sub = df.loc[mask, ["d_index", "units"]]
        result = dict(zip(sub["d_index"].to_numpy().astype(int),
                          sub["units"].to_numpy().astype(float)))
        self._units_cache[series_id] = result
        return result

    def price_by_d(self, series_id: str) -> dict:
        """
        Return {d_index: sell_price} for all days of `series_id` (02 §4).

        Returns the pre-built cache dict built at startup (O(1) lookup).
        Falls back to a DataFrame scan if the cache was not populated (e.g. in tests).
        """
        if series_id in self._price_cache:
            return self._price_cache[series_id]
        # Fallback: build on demand (test / partial-load path)
        if self.series_daily is None:
            raise RuntimeError("series_daily not loaded; cannot read price_by_d")
        df = self.series_daily
        mask = df["series_id"] == series_id
        sub = df.loc[mask, ["d_index", "sell_price"]]
        result = dict(zip(sub["d_index"].to_numpy().astype(int),
                          sub["sell_price"].to_numpy().astype(float)))
        self._price_cache[series_id] = result
        return result

    def events_in_range(self, d_from: int, d_to: int) -> list:
        """
        Return list of {date, name, type} dicts for calendar event days in [d_from, d_to].

        Both event slots (event_name_1/type_1 and event_name_2/type_2) are included.
        Days with no event (value == "none") are skipped. (05 §5 events_in_horizon)
        """
        if self.calendar is None:
            raise RuntimeError("calendar not loaded; cannot read events_in_range")
        cal = self.calendar  # indexed by d_index
        # Vectorized slice instead of per-day .loc[d] loop
        idx = [d for d in range(d_from, d_to + 1) if d in cal.index]
        if not idx:
            return []
        rows = cal.loc[idx]
        events = []
        for d, row in rows.iterrows():
            date_str = self.d_to_date(int(d)).isoformat()
            for name_col, type_col in [("event_name_1", "event_type_1"),
                                        ("event_name_2", "event_type_2")]:
                name = str(row[name_col])
                if name and name != "none":
                    events.append({
                        "date": date_str,
                        "name": name,
                        "type": str(row[type_col]),
                    })
        return events

    def snap_days_in_range(self, d_from: int, d_to: int) -> int:
        """
        Count days with snap_count > 0 in the inclusive range [d_from, d_to].

        Used by explainability (03 §6.5 snap_days_in_horizon).
        """
        if self.calendar is None:
            raise RuntimeError("calendar not loaded; cannot read snap_days_in_range")
        cal = self.calendar
        idx = [d for d in range(d_from, d_to + 1) if d in cal.index]
        if not idx:
            return 0
        return int((cal.loc[idx, "snap_count"] > 0).sum())

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
            (df["series_id"] == series_id)
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


def _load_calendar(path):
    # Lazy import so MT-21 is valid before MT-11 lands; calendar_features.load_calendar (MT-11)
    # parses data/raw/calendar.csv into a DataFrame.
    # First verify the path exists so _safe catches a missing file as FileNotFoundError.
    import pathlib
    p = pathlib.Path(path)
    if not p.exists():
        raise FileNotFoundError(f"calendar file not found: {path}")
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
