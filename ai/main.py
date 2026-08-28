from datetime import date, timedelta
from typing import Dict, List, Tuple

import numpy as np
from sklearn.ensemble import RandomForestRegressor

from fastapi import FastAPI
from pydantic import BaseModel, Field


app = FastAPI(title="GET IT DONE AI Engine", version="0.2.0")


class SupplyItem(BaseModel):
    """How many workers could actually take a job in one area, for one service.

    Supplied by the backend, which counts the way matching selects: verified,
    active, sharing location, with a service area whose radius reaches the cell.

    This used to be computed here as ``12 + area_index + service_index`` -- a
    literal that never touched a database. ``predicted_shortage`` is
    ``expected - available``, so that single line made the whole output of this
    service, the allocation recommendations built on it, and anything scoring on
    shortage, fiction.
    """

    area: str
    service: str
    available: int


class DemandForecastRequest(BaseModel):
    days: int = Field(default=1, ge=1, le=14)
    area: str | None = None
    service: str | None = None
    history: List[dict] = Field(default_factory=list)
    supply: List[SupplyItem] = Field(default_factory=list)


class DemandForecastItem(BaseModel):
    date: date
    area: str
    # Human-readable name for the area when the backend has one. The area key
    # itself is a ~2km grid cell, which is correct for grouping and unreadable
    # in a dashboard.
    locality: str | None = None
    service: str
    expected_requests: int
    available_workers: int
    predicted_shortage: int
    confidence_low: int
    confidence_high: int
    drivers: List[str]
    # False when there was not enough history to fit a model and the numbers
    # below are a baseline estimate. Previously this state existed but was
    # reported only inside `drivers`, where no caller looked -- and since the
    # history could never match the hardcoded area list, it was ALWAYS this
    # state.
    model_trained: bool = False


class DemandForecastResponse(BaseModel):
    forecasts: List[DemandForecastItem]
    # Set once for the whole response so a dashboard can label the panel rather
    # than inspecting every row.
    model_trained: bool = False
    training_samples: int = 0


class AllocationRequest(BaseModel):
    horizonDays: int = Field(default=1, ge=1, le=14)
    history: List[dict] = Field(default_factory=list)
    supply: List[SupplyItem] = Field(default_factory=list)


class AllocationRecommendation(BaseModel):
    area: str
    locality: str | None = None
    service: str
    priority: str
    recommendation: str
    workers_needed: int
    # The backend persists each recommendation for human approval and keys the
    # row on these. Aliases match the snake_case column names it inserts.
    recommended_workers: int
    drivers: List[str] = Field(default_factory=list)


class AllocationResponse(BaseModel):
    """Envelope, not a bare list.

    The endpoint previously declared ``response_model=list[...]``, so the
    backend's ``Array.isArray(aiData.recommendations)`` check was always false
    and nothing was ever written to ai_recommendation_records -- the entire
    human-in-the-loop approval flow was dead on arrival.
    """

    recommendations: List[AllocationRecommendation]
    model_trained: bool = False


# A RandomForest on two samples is noise with a confidence interval attached.
# This is still a low bar, but it is a bar.
MIN_TRAINING_SAMPLES = 12


def _dimensions(
    request_history: List[dict],
    supply: List[SupplyItem],
    area_filter: str | None,
    service_filter: str | None,
) -> Tuple[List[str], List[str], Dict[str, str]]:
    """Work out which areas and services to forecast for.

    Derived from the data the caller actually sent. The previous version
    defaulted to three hardcoded names -- "Vijayawada Central", "Benz Circle",
    "Gannavaram" -- and then FILTERED the supplied history down to rows whose
    area appeared in that list. Real history is keyed on geography, so it
    matched none of them, the history filtered to empty, and the model was never
    fitted. Deriving the dimensions from the input means the filter can no
    longer silently discard everything it was given.
    """
    areas: List[str] = []
    services: List[str] = []
    localities: Dict[str, str] = {}

    for row in list(request_history) + [item.model_dump() for item in supply]:
        area = row.get("area")
        service = row.get("service")
        if area and area not in areas:
            areas.append(area)
        if service and service not in services:
            services.append(service)
        locality = row.get("locality")
        if area and locality and area not in localities:
            localities[area] = locality

    if area_filter:
        areas = [area_filter]
    if service_filter:
        services = [service_filter]

    return areas, services, localities


def _fit(history: List[dict], area_codes: Dict[str, int], service_codes: Dict[str, int]):
    """Fit a demand model, or return None when there is not enough to learn from."""
    features: List[List[float]] = []
    targets: List[float] = []

    for row in history:
        area = row.get("area")
        service = row.get("service")
        if area not in area_codes or service not in service_codes:
            continue
        try:
            row_date = date.fromisoformat(str(row["date"])[:10])
            requests = float(row["requests"])
        except (KeyError, ValueError, TypeError):
            # A malformed row is dropped rather than failing the whole forecast.
            continue
        features.append(
            [row_date.weekday(), row_date.toordinal(), area_codes[area], service_codes[service]]
        )
        targets.append(requests)

    if len(features) < MIN_TRAINING_SAMPLES:
        return None, len(features)

    model = RandomForestRegressor(n_estimators=80, random_state=42, min_samples_leaf=1)
    model.fit(np.array(features), np.array(targets))
    return model, len(features)


def _baseline(history: List[dict], area: str, service: str) -> int:
    """Mean daily requests for this area and service, when a model cannot be fitted.

    Still an estimate, but an estimate OF SOMETHING: it is the average of what
    actually happened here, not `18 + area_index * 5 + service_index * 3`, which
    was a number with no relationship to any observation and which the previous
    version returned on every single request.
    """
    observed = [
        float(row["requests"])
        for row in history
        if row.get("area") == area and row.get("service") == service and "requests" in row
    ]
    if not observed:
        return 0
    return max(0, int(round(sum(observed) / len(observed))))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/forecast/demand", response_model=DemandForecastResponse)
def forecast_demand(request: DemandForecastRequest):
    areas, services, localities = _dimensions(
        request.history, request.supply, request.area, request.service
    )

    # Nothing to forecast for. An empty list is the honest answer; inventing
    # areas is what produced three Vijayawada suburbs on a Telangana platform.
    if not areas or not services:
        return DemandForecastResponse(forecasts=[], model_trained=False, training_samples=0)

    area_codes = {area: index for index, area in enumerate(areas)}
    service_codes = {service: index for index, service in enumerate(services)}

    model, sample_count = _fit(request.history, area_codes, service_codes)

    supply_by_key = {(item.area, item.service): item.available for item in request.supply}

    forecasts: List[DemandForecastItem] = []
    today = date.today()

    for day_offset in range(request.days):
        forecast_date = today + timedelta(days=day_offset + 1)
        for area in areas:
            for service in services:
                if model is not None:
                    features = np.array(
                        [[
                            forecast_date.weekday(),
                            forecast_date.toordinal(),
                            area_codes[area],
                            service_codes[service],
                        ]]
                    )
                    # Per-tree predictions give a real spread rather than a
                    # made-up +/- 5 band.
                    trees = np.array([tree.predict(features)[0] for tree in model.estimators_])
                    expected = max(0, int(round(float(np.mean(trees)))))
                    confidence_low = max(0, int(round(float(np.percentile(trees, 10)))))
                    confidence_high = max(expected, int(round(float(np.percentile(trees, 90)))))
                    drivers = [
                        f"{sample_count} observations in the last 90 days",
                        f"weekday={forecast_date.strftime('%A')}",
                    ]
                else:
                    expected = _baseline(request.history, area, service)
                    confidence_low = max(0, expected - 2)
                    confidence_high = expected + 2
                    drivers = [
                        f"only {sample_count} usable observations; "
                        f"need {MIN_TRAINING_SAMPLES} to fit a model",
                        "showing the observed daily average",
                    ]

                available = supply_by_key.get((area, service), 0)
                if (area, service) not in supply_by_key:
                    drivers.append("no worker supply reported for this area and service")

                forecasts.append(
                    DemandForecastItem(
                        date=forecast_date,
                        area=area,
                        locality=localities.get(area),
                        service=service,
                        expected_requests=expected,
                        available_workers=available,
                        predicted_shortage=max(expected - available, 0),
                        confidence_low=confidence_low,
                        confidence_high=confidence_high,
                        drivers=drivers,
                        model_trained=model is not None,
                    )
                )

    return DemandForecastResponse(
        forecasts=forecasts,
        model_trained=model is not None,
        training_samples=sample_count,
    )


@app.post("/allocation/recommend", response_model=AllocationResponse)
def recommend_allocation(request: AllocationRequest):
    forecast = forecast_demand(
        DemandForecastRequest(
            days=request.horizonDays,
            history=request.history,
            supply=request.supply,
        )
    )

    recommendations: List[AllocationRecommendation] = []

    for item in forecast.forecasts:
        if item.predicted_shortage <= 0:
            continue

        priority = "high" if item.predicted_shortage >= 8 else "medium"
        where = item.locality or item.area
        recommendations.append(
            AllocationRecommendation(
                area=item.area,
                locality=item.locality,
                service=item.service,
                priority=priority,
                recommendation=(
                    f"Allocate {item.predicted_shortage} additional {item.service} "
                    f"workers to {where}."
                ),
                workers_needed=item.predicted_shortage,
                recommended_workers=item.predicted_shortage,
                drivers=item.drivers,
            )
        )

    recommendations.sort(key=lambda rec: rec.workers_needed, reverse=True)
    return AllocationResponse(
        recommendations=recommendations[:10],
        model_trained=forecast.model_trained,
    )
