from datetime import date, timedelta
from typing import List

import numpy as np
from sklearn.ensemble import RandomForestRegressor

from fastapi import FastAPI
from pydantic import BaseModel, Field


app = FastAPI(title="GET IT DONE AI Engine", version="0.1.0")


class DemandForecastRequest(BaseModel):
    days: int = Field(default=1, ge=1, le=14)
    area: str | None = None
    service: str | None = None
    history: List[dict] = Field(default_factory=list)


class DemandForecastItem(BaseModel):
    date: date
    area: str
    service: str
    expected_requests: int
    available_workers: int
    predicted_shortage: int
    confidence_low: int
    confidence_high: int
    drivers: List[str]


class DemandForecastResponse(BaseModel):
    forecasts: List[DemandForecastItem]


class AllocationRequest(BaseModel):
    horizonDays: int = Field(default=1, ge=1, le=14)
    history: List[dict] = Field(default_factory=list)


class AllocationRecommendation(BaseModel):
    area: str
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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/forecast/demand", response_model=DemandForecastResponse)
def forecast_demand(request: DemandForecastRequest):
    areas = [request.area] if request.area else ["Vijayawada Central", "Benz Circle", "Gannavaram"]
    services = [request.service] if request.service else ["Plumbing", "Electrical", "Cleaning"]

    forecasts: list[DemandForecastItem] = []
    model = None
    area_codes = {area: index for index, area in enumerate(areas)}
    service_codes = {service: index for index, service in enumerate(services)}
    history = [item for item in request.history if item.get("area") in area_codes and item.get("service") in service_codes]
    if len(history) >= 3:
        features = []
        targets = []
        for item in history:
            item_date = date.fromisoformat(str(item["date"])[:10])
            features.append([item_date.weekday(), item_date.toordinal(), area_codes[item["area"]], service_codes[item["service"]]])
            targets.append(float(item["requests"]))
        model = RandomForestRegressor(n_estimators=80, random_state=42, min_samples_leaf=1)
        model.fit(np.array(features), np.array(targets))
    for day_offset in range(request.days):
        forecast_date = date.today() + timedelta(days=day_offset + 1)
        for area_index, area in enumerate(areas):
            for service_index, service in enumerate(services):
                expected_date = date.today() + timedelta(days=day_offset + 1)
                features = np.array([[expected_date.weekday(), expected_date.toordinal(), area_index, service_index]])
                if model:
                    trees = np.array([tree.predict(features)[0] for tree in model.estimators_])
                    expected = int(round(float(np.mean(trees))))
                    confidence_low = max(0, int(round(float(np.percentile(trees, 10)))))
                    confidence_high = max(expected, int(round(float(np.percentile(trees, 90)))))
                    drivers = ["historical booking volume", f"weekday={expected_date.strftime('%A')}"]
                else:
                    expected = 18 + (area_index * 5) + (service_index * 3) + day_offset
                    confidence_low = max(0, expected - 5)
                    confidence_high = expected + 5
                    drivers = ["insufficient history; baseline estimate"]
                available = 12 + area_index + service_index
                forecasts.append(
                    DemandForecastItem(
                        date=forecast_date,
                        area=area,
                        service=service,
                        expected_requests=expected,
                        available_workers=available,
                        predicted_shortage=max(expected - available, 0),
                        confidence_low=confidence_low,
                        confidence_high=confidence_high,
                        drivers=drivers,
                    )
                )

    return DemandForecastResponse(forecasts=forecasts)


@app.post("/allocation/recommend", response_model=AllocationResponse)
def recommend_allocation(request: AllocationRequest):
    forecast = forecast_demand(DemandForecastRequest(days=request.horizonDays, history=request.history)).forecasts
    recommendations: list[AllocationRecommendation] = []

    for item in forecast:
        if item.predicted_shortage <= 0:
            continue

        priority = "high" if item.predicted_shortage >= 8 else "medium"
        recommendations.append(
            AllocationRecommendation(
                area=item.area,
                service=item.service,
                priority=priority,
                recommendation=f"Allocate {item.predicted_shortage} additional {item.service} workers to {item.area}.",
                workers_needed=item.predicted_shortage,
                recommended_workers=item.predicted_shortage,
                drivers=item.drivers,
            )
        )

    recommendations.sort(key=lambda rec: rec.workers_needed, reverse=True)
    return AllocationResponse(recommendations=recommendations[:10])

