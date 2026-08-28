from datetime import date, timedelta

from fastapi.testclient import TestClient

from main import MIN_TRAINING_SAMPLES, app

client = TestClient(app)


def _history(days: int, area: str = "16.50,80.64", service: str = "Plumbing", base: int = 10):
    """Synthetic daily demand with a weekday effect, so a model has something to learn."""
    start = date.today() - timedelta(days=days)
    return [
        {
            "date": (start + timedelta(days=offset)).isoformat(),
            "area": area,
            "locality": "Kukatpally",
            "service": service,
            "requests": base + (offset % 7),
        }
        for offset in range(days)
    ]


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_no_input_returns_no_forecast_rather_than_inventing_areas():
    """The previous version defaulted to three hardcoded Vijayawada suburbs."""
    body = client.post("/forecast/demand", json={"days": 1}).json()

    assert body["forecasts"] == []
    assert body["model_trained"] is False


def test_available_workers_comes_from_supply_not_a_literal():
    body = client.post(
        "/forecast/demand",
        json={
            "days": 1,
            "history": _history(30),
            "supply": [{"area": "16.50,80.64", "service": "Plumbing", "available": 3}],
        },
    ).json()

    row = body["forecasts"][0]
    assert row["available_workers"] == 3
    assert row["predicted_shortage"] == max(row["expected_requests"] - 3, 0)


def test_missing_supply_reports_zero_and_says_so():
    """Silently assuming workers exist is what made every shortage number wrong."""
    body = client.post("/forecast/demand", json={"days": 1, "history": _history(30)}).json()

    row = body["forecasts"][0]
    assert row["available_workers"] == 0
    assert any("no worker supply reported" in driver for driver in row["drivers"])


def test_model_trains_on_geography_keyed_history():
    """The regression this file exists for.

    History keyed on a grid cell used to be filtered against a hardcoded area
    list, match nothing, and leave the forest unfitted on every single request.
    """
    body = client.post("/forecast/demand", json={"days": 3, "history": _history(60)}).json()

    assert body["model_trained"] is True
    assert body["training_samples"] >= MIN_TRAINING_SAMPLES
    assert all(row["model_trained"] for row in body["forecasts"])


def test_thin_history_falls_back_to_the_observed_average_not_a_magic_number():
    history = _history(4, base=7)
    body = client.post("/forecast/demand", json={"days": 1, "history": history}).json()

    assert body["model_trained"] is False
    expected = body["forecasts"][0]["expected_requests"]

    # The mean of the four observed days, not `18 + area_index * 5 + ...`.
    observed = [row["requests"] for row in history]
    assert expected == round(sum(observed) / len(observed))


def test_locality_is_carried_through_for_display():
    body = client.post("/forecast/demand", json={"days": 1, "history": _history(30)}).json()
    assert body["forecasts"][0]["locality"] == "Kukatpally"


def test_forecast_horizon_is_respected():
    body = client.post("/forecast/demand", json={"days": 5, "history": _history(30)}).json()
    assert len({row["date"] for row in body["forecasts"]}) == 5


def test_allocation_only_recommends_where_there_is_a_real_shortage():
    supply = [{"area": "16.50,80.64", "service": "Plumbing", "available": 500}]
    body = client.post(
        "/allocation/recommend",
        json={"horizonDays": 2, "history": _history(30), "supply": supply},
    ).json()

    # Supply far exceeds demand, so there is nothing to recommend.
    assert body["recommendations"] == []


def test_allocation_returns_an_envelope_the_backend_can_read():
    body = client.post(
        "/allocation/recommend",
        json={"horizonDays": 2, "history": _history(30), "supply": []},
    ).json()

    assert isinstance(body["recommendations"], list)
    assert body["recommendations"], "a zero-supply area should produce a shortage"
    first = body["recommendations"][0]
    assert first["recommended_workers"] == first["workers_needed"]
    assert first["locality"] == "Kukatpally"
    assert "Kukatpally" in first["recommendation"]


def test_malformed_history_rows_are_dropped_not_fatal():
    history = _history(30) + [
        {"area": "16.50,80.64", "service": "Plumbing"},  # no date, no requests
        {"date": "not-a-date", "area": "16.50,80.64", "service": "Plumbing", "requests": 3},
    ]
    response = client.post("/forecast/demand", json={"days": 1, "history": history})

    assert response.status_code == 200
    assert response.json()["model_trained"] is True
