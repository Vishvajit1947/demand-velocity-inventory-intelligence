"""Central configuration — the single source of truth for constants & product identity.
See docs/02_DATA_SPEC.md (sec 3, 6) and docs/03_ALGORITHM_SPEC.md.
"""
from pathlib import Path

# ---- repo paths (robust: walk up to the folder containing data/ and backend/) ----
def _repo_root() -> Path:
    p = Path(__file__).resolve()
    for parent in p.parents:
        if (parent / "data").exists() and (parent / "backend").exists():
            return parent
    return Path(__file__).resolve().parents[2]

ROOT = _repo_root()
DATA_RAW = ROOT / "data" / "raw"
DATA_PROCESSED = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "backend" / "app" / "models"

SERIES_DAILY_PATH = DATA_PROCESSED / "series_daily.parquet"
CALENDAR_PATH = DATA_RAW / "calendar.csv"
MODEL_PATH = MODELS_DIR / "model.pkl"
FEATURE_META_PATH = MODELS_DIR / "feature_meta.json"
PROFILES_PATH = MODELS_DIR / "profiles.json"

# ---- timeline (docs/02_DATA_SPEC.md sec 3) ----
TRAIN_START_D = 1
TRAIN_END_D = 1095
TEST_START_D = 1096
TEST_END_D = 1941
HORIZON = 28
FIRST_SELECTABLE_D = 1096          # 2014-01-28
LAST_SELECTABLE_D = 1914           # 2016-04-25  (LAST_SELECTABLE_D + HORIZON - 1 == TEST_END_D)
HISTORY_WINDOW = 84                # days of context returned before the start date
D1_DATE = "2011-01-29"             # date of d_1

# ---- training fold split for early stopping (docs/03_ALGORITHM_SPEC.md sec 2) ----
FIT_START_D = 29
FIT_END_D = 1011
VALID_START_D = 1012
VALID_END_D = 1095

# ---- inventory simulation (docs/03_ALGORITHM_SPEC.md sec 6.4) ----
INITIAL_COVER_DAYS = 14
LEAD_TIME_DAYS = 7
SERVICE_Z = 1.65

# ---- products (docs/02_DATA_SPEC.md sec 2 & 6) ----
# series_id -> metadata. THE single source of product identity in code.
PRODUCTS = {
    "turkey":       {"item_id": "FOODS_3_069", "name": "Fresh Whole Turkey", "dept_id": "FOODS_3", "archetype": "Event-driven"},
    "candy":        {"item_id": "FOODS_1_206", "name": "Halloween Candy",     "dept_id": "FOODS_1", "archetype": "Event-driven"},
    "strawberries": {"item_id": "FOODS_1_123", "name": "Fresh Strawberries",  "dept_id": "FOODS_1", "archetype": "Perishable seasonal"},
    "icecream":     {"item_id": "FOODS_3_660", "name": "Vanilla Ice Cream",   "dept_id": "FOODS_3", "archetype": "Seasonal"},
    "cocoa":        {"item_id": "FOODS_1_116", "name": "Hot Cocoa Mix",       "dept_id": "FOODS_1", "archetype": "Seasonal"},
    "chips":        {"item_id": "FOODS_2_022", "name": "Tortilla Chips",      "dept_id": "FOODS_2", "archetype": "Event-driven"},
    "milk":         {"item_id": "FOODS_3_586", "name": "Fresh Whole Milk",    "dept_id": "FOODS_3", "archetype": "Stable baseline"},
    "bread":        {"item_id": "FOODS_3_080", "name": "Sliced White Bread",  "dept_id": "FOODS_3", "archetype": "Stable baseline"},
}
SERIES_IDS = list(PRODUCTS.keys())
ITEM_TO_SERIES = {v["item_id"]: k for k, v in PRODUCTS.items()}
VERSION = "1.0.0"
