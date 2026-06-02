"""MT-22 — GET /api/products and GET /api/calendar/bounds.

Both endpoints are static (no request params) and source every value from
config.py (MT-01) + profiles via the store (MT-21). Shapes are locked in
05_API_CONTRACT §3 and §4.
"""
from __future__ import annotations

from fastapi import APIRouter

from app import config
from app.schemas.contracts import BoundsResponse, ProductInfo, ProductsResponse
from app.services.store import get_store

router = APIRouter()


@router.get("/products", response_model=ProductsResponse)
def get_products() -> ProductsResponse:
    """05 §3: the 8 products in SERIES_IDS order, with profile summary stats."""
    store = get_store()
    products: list[ProductInfo] = []
    for series_id in config.SERIES_IDS:                  # 02 §6 — locked order
        meta = config.PRODUCTS[series_id]                # item_id / name / dept_id
        profile = store.profiles[series_id]              # 03 §5 — from profiles.json
        products.append(
            ProductInfo(
                series_id=series_id,
                item_id=meta["item_id"],
                name=meta["name"],
                dept_id=meta["dept_id"],
                archetype=config.ARCHETYPE[series_id],   # 05 §3 label (02 §2)
                overall_mean=float(profile["overall_mean"]),
                seasonal_cv=float(profile["seasonal_cv"]),
            )
        )
    return ProductsResponse(products=products)


@router.get("/calendar/bounds", response_model=BoundsResponse)
def get_calendar_bounds() -> BoundsResponse:
    """05 §4: selectable window + split metadata, derived from config constants."""
    store = get_store()

    def iso(d: int) -> str:
        return store.d_to_date(d).isoformat()            # 02 §2 calendar map -> "YYYY-MM-DD"

    return BoundsResponse(
        train_start=iso(config.TRAIN_START_D),           # 2011-01-29
        train_end=iso(config.TRAIN_END_D),               # 2014-01-27
        test_start=iso(config.TEST_START_D),             # 2014-01-28
        test_end=iso(config.TEST_END_D),                 # 2016-05-22
        first_selectable_date=iso(config.FIRST_SELECTABLE_D),  # 2014-01-28
        last_selectable_date=iso(config.LAST_SELECTABLE_D),    # 2016-04-25
        horizon=config.HORIZON,                          # 28
        history_window=config.HISTORY_WINDOW,            # 84
    )
