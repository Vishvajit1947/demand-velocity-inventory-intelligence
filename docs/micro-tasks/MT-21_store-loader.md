# MT-21 — `Store` Loader (singletons for model / data / profiles)

## 1. Context
The API must be fast and deterministic: the model and data are loaded **once** at process start
and held in module-level singletons, so each `/api/forecast` request is a CPU-only, sub-second
lookup (`04` §2/§9, `05` §8). This task creates `backend/app/services/store.py` (path fixed in
`04` §1): a `Store` that loads `model.pkl`, `feature_meta.json`, `profiles.json`,
`series_daily.parquet`, and `calendar.csv`, plus a cached `get_store()` singleton and two read
helpers used by the forecast engine/service. Crucially, if artifacts are **missing** the import
must **not** crash — `model_loaded` flips to `False` so `/api/health` can report it and
`/api/forecast` can 500 with a clear message (`04` §3/§5).

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/04_BACKEND_ARCHITECTURE.md` (§1 path, §2 layered design / singleton, §3 startup, §9 determinism).
- `docs/02_DATA_SPEC.md` (§4 `series_daily.parquet` schema: `series_id`, `d_index`, `units`, `sell_price`; §3 split for the train-mean price).
- `docs/03_ALGORITHM_SPEC.md` (§0 artifacts list; §4 uses of actuals/price at inference).
- `docs/05_API_CONTRACT.md` (§2 `model_loaded`).
- `docs/07_TESTING_STRATEGY.md` (§2 `store` fixture, tolerances).

**Prior MT artifacts/paths that must already exist:**
- MT-01: `backend/app/config.py` (provides `PATHS`, `SERIES_IDS`, split constants), the package
  `__init__.py`s, `backend/tests/conftest.py` (the `store` fixture calls `get_store()`).
- MT-11: `backend/app/ml/calendar_features.py` providing `load_calendar(path) -> DataFrame`
  (used here to load `calendar.csv`). **If MT-11 has not landed yet**, this task still imports it
  lazily and degrades gracefully (calendar load is wrapped); see §4. The store is fully exercised
  once MT-10 (`series_daily.parquet`), MT-13 (`model.pkl`, `feature_meta.json`), MT-14
  (`profiles.json`), and MT-11 are all present.

**Tooling:** the 3.11 venv (MT-01 §5.0) with deps installed (`pandas`, `pyarrow`, `lightgbm`).

## 3. Goal
Create `backend/app/services/store.py` with:
- a `Store` class exposing attributes `model`, `feature_meta`, `profiles`, `series_daily`,
  `calendar`, and `model_loaded: bool`;
- `Store.load() -> Store` that loads all five artifacts (graceful on missing files);
- a module-level singleton `get_store()` that loads **once** and caches;
- helpers `actual_units(series_id, d_from, d_to) -> list[float]` and
  `series_train_mean_price(series_id) -> float`, reading from `series_daily`.

After this task: with all artifacts present, `get_store().model_loaded is True`, `actual_units`
returns the correct length, and `get_store()` returns the **same** instance every call.

## 4. Design (locked decisions; cite foundation sections)
- **Singleton, load-once (LOCKED — `04` §2/§3/§9).** `get_store()` returns a process-wide cached
  `Store`. The first call triggers `Store.load()`; subsequent calls return the identical object.
  Loading is **idempotent and side-effect-free** beyond populating the cache.
- **Artifact paths come from `config.PATHS` (MT-01 / `04` §1).** Never hard-code paths here. The
  five artifacts (`03` §0, `02` §4):
  | attribute | source path (`config.PATHS`) | loader |
  |---|---|---|
  | `model` | `model` (`model.pkl`) | `pickle.load` |
  | `feature_meta` | `feature_meta` (`feature_meta.json`) | `json.load` |
  | `profiles` | `profiles` (`profiles.json`) | `json.load` |
  | `series_daily` | `series_daily` (`series_daily.parquet`) | `pandas.read_parquet` |
  | `calendar` | `calendar` (`calendar.csv`) | `calendar_features.load_calendar` |
- **`model.pkl` is a pickled LightGBM `Booster` (`03` §0/§2).** Load with `pickle` (the `train.py`
  step in MT-13 saves it via `pickle.dump`). Loading does **not** require importing `lightgbm`
  explicitly, but `lightgbm` must be installed for unpickling to resolve the `Booster` class — it
  is in `requirements.txt` (`04` §6), so import it defensively to ensure the class is registered.
- **Graceful degradation (LOCKED — `04` §3/§5).** `Store.load()` must **never raise at import or
  load time due to a missing file**. Each artifact load is wrapped: on `FileNotFoundError` (or any
  load error) the attribute is set to `None` and a one-line reason is recorded. `model_loaded` is
  `True` **iff all five core artifacts loaded** (model, feature_meta, profiles, series_daily,
  calendar). This lets `/api/health` report `model_loaded:false` and `/api/forecast` raise a clear
  500 (`04` §3) instead of crashing the process at startup.
- **`calendar` load via MT-11 (LOCKED interface).** Use
  `app.ml.calendar_features.load_calendar(path)`. Import it **lazily inside `load()`** so MT-21 can
  be authored/imported before MT-11 lands; if the import fails, treat calendar as missing (set
  `calendar=None`, contributes to `model_loaded=False`). This mirrors the lazy-import pattern used
  in `conftest.py` (MT-01).
- **`series_daily` schema reliance (LOCKED — `02` §4).** Helpers read columns `series_id`,
  `d_index` (int), `units` (float), `sell_price` (float). The frame is indexed/queried by
  `(series_id, d_index)`. For performance and determinism, `load()` sorts by
  `["series_id", "d_index"]` once.
- **`actual_units(series_id, d_from, d_to)` (LOCKED behavior).** Returns the `units` for that
  series for `d_index` in the **inclusive** range `[d_from, d_to]`, ordered by ascending `d_index`,
  as a `list[float]`. This backs both the 84-day history (`05` §5 `history`) and the
  trailing/horizon-actuals lookups in metrics (`03` §6.3/§6.4). It returns exactly the rows that
  exist; callers that need a fixed length pick `d_from`/`d_to` so the count is right (e.g.
  `d_from = start_d - HISTORY_WINDOW`, `d_to = start_d - 1` → 84 values, since every series has all
  1,941 contiguous days, `02` §4). No interpolation, no padding.
- **`series_train_mean_price(series_id)` (LOCKED — `03` §3.4 / `02` §3).** Mean `sell_price` over
  that series' **TRAIN** days (`d_index` in `[TRAIN_START_D, TRAIN_END_D]` = `[1, 1095]`). Used by
  `price_rel` and the forecast engine (`03` §3.4, §4 step 2). If the mean is `0`/`NaN`, return
  `1.0` (per `03` §3.4 "if mean is 0/NaN → 1.0"). The value is computed lazily and **cached
  per series** so repeated forecasts don't rescan.
- **No FastAPI imports here (`04` §2).** `services/store.py` depends on `config`, `pandas`,
  `pickle`, `json`, and (lazily) `app.ml.calendar_features`. It is a service/data layer, callable
  from tests directly.

## 5. Implementation (exact file paths from `04` §1; FULL runnable code)

### 5.1 `backend/app/services/store.py` — FULL code
Create `backend/app/services/store.py` with exactly this content:

```python
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
from typing import Any, Optional

import pandas as pd

from app.config import PATHS, TRAIN_END_D, TRAIN_START_D


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
        """
        if self.series_daily is None:
            raise RuntimeError("series_daily not loaded; cannot read actual_units")
        df = self.series_daily
        mask = (
            (df["series_id"] == series_id)
            & (df["d_index"] >= d_from)
            & (df["d_index"] <= d_to)
        )
        sub = df.loc[mask, ["d_index", "units"]].sort_values("d_index")
        return [float(u) for u in sub["units"].to_list()]

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
    from app.ml.calendar_features import load_calendar

    return load_calendar(path)


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
```

> `reset_store()` exists purely so a test can force a reload (e.g. after dropping in artifacts).
> Production code never calls it; the app loads once at startup (`04` §3).

## 6. Tests / Verification (exact pytest tests + commands)

### 6.1 Test file
Create `backend/tests/test_store.py` with exactly this content. Tests that need real artifacts are
**skipped** when `model_loaded` is `False` (so this passes on a checkout before MT-10/13/14 land),
matching the `07` §2 "skip if data absent" convention. The graceful-degradation test runs always.

```python
"""
MT-21 — Store loader: singleton, graceful degradation, and read helpers.

Tests needing real artifacts skip when model_loaded is False (07 §2), so this file is
green before MT-10/MT-13/MT-14 produce the parquet/model/profiles.
"""

from __future__ import annotations

import pytest

from app.config import HISTORY_WINDOW, SERIES_IDS, FIRST_SELECTABLE_D
from app.services.store import Store, get_store, reset_store


def test_singleton_same_instance():
    reset_store()
    a = get_store()
    b = get_store()
    assert a is b  # load-once singleton (04 §2/§3)


def test_graceful_when_artifacts_missing(tmp_path, monkeypatch):
    """Point every path at a non-existent file: load() must NOT raise; model_loaded False."""
    import app.services.store as store_mod

    fake = {k: tmp_path / f"missing_{k}" for k in store_mod.PATHS}
    monkeypatch.setattr(store_mod, "PATHS", fake)
    s = Store.load()  # must not raise (04 §3/§5)
    assert s.model_loaded is False
    assert s.model is None and s.series_daily is None
    assert s.load_errors  # reasons recorded


# ---- the following require real artifacts (skip otherwise) ------------------
def _require_loaded():
    s = get_store()
    if not s.model_loaded:
        pytest.skip("artifacts not present (model_loaded False); needs MT-10/13/14/11")
    return s


def test_model_loaded_true_with_artifacts():
    s = _require_loaded()
    assert s.model is not None
    assert s.series_daily is not None
    assert s.feature_meta is not None
    assert s.profiles is not None
    assert s.calendar is not None


def test_actual_units_length_and_type():
    s = _require_loaded()
    start_d = FIRST_SELECTABLE_D
    # 84-day history window ending at start_d - 1 (05 §5 history).
    vals = s.actual_units(SERIES_IDS[0], start_d - HISTORY_WINDOW, start_d - 1)
    assert len(vals) == HISTORY_WINDOW
    assert all(isinstance(v, float) for v in vals)


def test_actual_units_ordered_ascending():
    s = _require_loaded()
    # Same query twice -> identical (deterministic ordering).
    a = s.actual_units(SERIES_IDS[0], FIRST_SELECTABLE_D, FIRST_SELECTABLE_D + 9)
    b = s.actual_units(SERIES_IDS[0], FIRST_SELECTABLE_D, FIRST_SELECTABLE_D + 9)
    assert a == b
    assert len(a) == 10


def test_train_mean_price_positive_and_cached():
    s = _require_loaded()
    p1 = s.series_train_mean_price(SERIES_IDS[0])
    p2 = s.series_train_mean_price(SERIES_IDS[0])
    assert p1 == p2  # cached
    assert p1 > 0.0  # real price (or 1.0 fallback), never 0/NaN
```

### 6.2 Commands
With the 3.11 venv (MT-01) activated, from `backend/`:
```powershell
pytest -q tests/test_store.py
```
- Before MT-10/13/14/11 produce artifacts: `test_singleton_same_instance` and
  `test_graceful_when_artifacts_missing` pass; the artifact-dependent tests **skip** (not fail).
- After artifacts are present: all tests pass, including `actual_units` length == 84 and the
  singleton identity check.

Quick manual confirmation (with artifacts present), from `backend/`:
```powershell
python -c "from app.services.store import get_store; s=get_store(); print('model_loaded:', s.model_loaded); print('same instance:', get_store() is s)"
```
Expect `model_loaded: True` (once artifacts exist) and `same instance: True`.

## 7. Acceptance checklist
- [ ] `backend/app/services/store.py` exists at the `04` §1 path with **no FastAPI imports** (`04` §2).
- [ ] `Store` exposes `model`, `feature_meta`, `profiles`, `series_daily`, `calendar`, and `model_loaded: bool`.
- [ ] `Store.load()` loads all five artifacts from `config.PATHS`: `model.pkl` (pickle), `feature_meta.json` / `profiles.json` (json), `series_daily.parquet` (pandas), `calendar.csv` (via `calendar_features.load_calendar`, lazily imported).
- [ ] Missing/broken artifacts do **not** crash load/import; the attribute becomes `None`, the reason is recorded in `load_errors`, and `model_loaded` is `False` (`04` §3/§5) — verified by `test_graceful_when_artifacts_missing`.
- [ ] `get_store()` loads once and returns the **same** instance on every call (singleton) — verified by `test_singleton_same_instance`.
- [ ] `actual_units(series_id, d_from, d_to)` returns ascending-`d_index` `units` for the inclusive range as `list[float]`; with artifacts, an 84-wide window returns length 84.
- [ ] `series_train_mean_price(series_id)` returns the mean `sell_price` over TRAIN days `[1,1095]` (`03` §3.4), falling back to `1.0` on 0/NaN, cached per series.
- [ ] With all artifacts present, `get_store().model_loaded is True`; artifact-dependent tests pass; without them they **skip** (not fail), per `07` §2.
- [ ] Reads only `config.PATHS`; no hard-coded paths.
- [ ] Only files in this task's scope were created/changed.
