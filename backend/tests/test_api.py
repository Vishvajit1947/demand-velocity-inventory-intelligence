"""MT-22/23/24 — API endpoint tests (07 §2).

Uses the `client` fixture (TestClient over app.main:app) from conftest.py.
All artifact-dependent tests are de-facto skipped when model_loaded is False
(the client fixture itself skips if main.py is absent; endpoints that call
get_store() return 500 if artifacts are missing, which the happy-path tests
would catch — those tests only assert on 200 responses with real data).
"""
from app import config
from app.services.store import get_store


# ── GET /api/health ────────────────────────────────────────────────────────────
def test_health_200_and_keys(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {"status", "model_loaded", "version"}
    assert body["status"] == "ok"
    assert body["version"] == "1.0.0"
    assert isinstance(body["model_loaded"], bool)
    assert body["model_loaded"] == get_store().model_loaded


# ── GET /api/products ──────────────────────────────────────────────────────────
def test_products_returns_8_in_series_order(client):
    r = client.get("/api/products")
    assert r.status_code == 200
    products = r.json()["products"]
    assert len(products) == 8
    # order matches SERIES_IDS (02 §6) exactly
    assert [p["series_id"] for p in products] == config.SERIES_IDS
    # each item carries the full ProductInfo shape (05 §3)
    expected_keys = {
        "series_id", "item_id", "name", "dept_id",
        "archetype", "overall_mean", "seasonal_cv",
    }
    for p in products:
        assert set(p.keys()) == expected_keys
        meta = config.PRODUCTS[p["series_id"]]
        assert p["item_id"] == meta["item_id"]
        assert p["name"] == meta["name"]
        assert p["dept_id"] == meta["dept_id"]
        assert p["archetype"] in {
            "Event-driven", "Seasonal", "Perishable seasonal", "Stable baseline",
        }
        assert isinstance(p["overall_mean"], (int, float))
        assert isinstance(p["seasonal_cv"], (int, float))


def test_products_turkey_matches_contract_example(client):
    """05 §3 example row for turkey."""
    products = client.get("/api/products").json()["products"]
    turkey = next(p for p in products if p["series_id"] == "turkey")
    assert turkey["item_id"] == "FOODS_3_069"
    assert turkey["name"] == "Fresh Whole Turkey"
    assert turkey["dept_id"] == "FOODS_3"
    assert turkey["archetype"] == "Event-driven"


# ── GET /api/calendar/bounds ───────────────────────────────────────────────────
def test_bounds_matches_contract_literals(client):
    """05 §4 — exact literal values."""
    r = client.get("/api/calendar/bounds")
    assert r.status_code == 200
    assert r.json() == {
        "train_start": "2011-01-29",
        "train_end": "2014-01-27",
        "test_start": "2014-01-28",
        "test_end": "2016-05-22",
        "first_selectable_date": "2014-01-28",
        "last_selectable_date": "2016-04-25",
        "horizon": 28,
        "history_window": 84,
    }


# ── POST /api/forecast — happy-path ───────────────────────────────────────────
def test_forecast_happy_path_turkey(client):
    r = client.post(
        "/api/forecast",
        json={"product_ids": ["turkey"], "start_date": "2015-11-01"},
    )
    assert r.status_code == 200
    body = r.json()

    # top level (05 §5)
    assert body["start_date"] == "2015-11-01"
    assert body["horizon"] == 28
    assert set(body.keys()) == {"start_date", "horizon", "summary", "results"}

    # summary (05 §5)
    summary = body["summary"]
    assert set(summary.keys()) == {
        "total_predicted_demand", "high_risk_count",
        "avg_velocity", "avg_accuracy", "active_events",
    }
    assert isinstance(summary["high_risk_count"], int)
    assert isinstance(summary["active_events"], list)

    # exactly one result, for the requested product
    assert len(body["results"]) == 1
    res = body["results"][0]
    assert res["series_id"] == "turkey"
    assert res["item_id"] == "FOODS_3_069"
    assert res["product_name"] == "Fresh Whole Turkey"

    # array lengths (05 §5)
    assert len(res["history"]["dates"]) == 84
    assert len(res["history"]["units"]) == 84
    assert len(res["horizon_dates"]) == 28
    assert len(res["actual"]) == 28
    assert len(res["forecast"]) == 28
    assert len(res["inventory"]["projected_stock"]) == 28
    assert res["horizon_dates"][0] == "2015-11-01"

    # forecast rounded to 1 dp (03 §4 / 05 §5)
    for v in res["forecast"]:
        assert round(v, 1) == v

    # every locked block present (05 §5)
    for key in (
        "metrics", "velocity", "inventory", "explainability",
        "events_in_horizon", "seasonal", "event_uplift",
    ):
        assert key in res

    # metrics typed (05 §5)
    m = res["metrics"]
    assert set(m.keys()) == {
        "accuracy", "coherence", "coherence_label", "smape", "mae", "rmse",
    }
    assert m["coherence_label"] in {"Strong", "Moderate", "Weak"}

    # velocity (05 §1 status set)
    assert res["velocity"]["status"] in {
        "Critical Decline", "Declining", "Stable", "Growing", "Accelerating",
    }

    # inventory (05 §5)
    assert res["inventory"]["stockout_risk"] in {"Low", "Medium", "High"}
    assert isinstance(res["inventory"]["overstock"], bool)

    # seasonal (05 §5)
    assert len(res["seasonal"]["monthly_avg"]) == 12
    assert len(res["seasonal"]["weekday_avg"]) == 7
    assert res["seasonal"]["month"] == 11


def test_forecast_results_order_matches_request(client):
    r = client.post(
        "/api/forecast",
        json={"product_ids": ["milk", "turkey"], "start_date": "2015-11-01"},
    )
    assert r.status_code == 200
    ids = [res["series_id"] for res in r.json()["results"]]
    assert ids == ["milk", "turkey"]   # request order preserved (05 §5)


# ── POST /api/forecast — error cases ──────────────────────────────────────────
def test_out_of_range_date_422_field_start_date(client):
    """05 §7 — date outside selectable range -> 422 with field=='start_date'."""
    r = client.post(
        "/api/forecast",
        json={"product_ids": ["turkey"], "start_date": "2016-12-01"},
    )
    assert r.status_code == 422
    body = r.json()
    assert body["error"] == "validation_error"
    assert body["field"] == "start_date"
    assert "outside the selectable range" in body["message"]
    # exact 05 §7 message
    assert body["message"] == (
        "start_date 2016-12-01 is outside the selectable range "
        "[2014-01-28, 2016-04-25]."
    )


def test_invalid_product_id_422(client):
    """Invalid SeriesId rejected by ForecastRequest (MT-20) -> 422."""
    r = client.post(
        "/api/forecast",
        json={"product_ids": ["banana"], "start_date": "2015-11-01"},
    )
    assert r.status_code == 422
    body = r.json()
    assert body["error"] == "validation_error"
    assert "message" in body
    # error body uses the 05 §7 shape (not FastAPI's default {"detail": ...})
    assert "detail" not in body


# ── wiring / CORS / routing ────────────────────────────────────────────────────
def test_unknown_route_404(client):
    r = client.get("/api/does-not-exist")
    assert r.status_code == 404


def test_cors_header_present_on_options(client):
    """Preflight from the Vite origin returns the allow-origin header (05 intro)."""
    r = client.options(
        "/api/forecast",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code in (200, 204)
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
