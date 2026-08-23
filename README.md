# GET IT NOW

Cooperative gig services platform for verified household and community service workers.

This repository is scaffolded for a hackathon MVP based on `srs.txt` and `GET_IT_NOW_IMPLEMENTATION_PLAN.md`.

## MVP Stack

- Customer app: Flutter
- Worker app: Flutter
- Admin dashboard: Next.js + React
- Backend: Node.js + TypeScript + Express
- Database: PostgreSQL + PostGIS
- Real-time/cache: Redis + Socket.IO
- AI service: Python + FastAPI + Scikit-learn
- Payments: Razorpay / UPI
- Notifications: Firebase Cloud Messaging
- Storage: Cloudinary / S3

## Current Structure

```text
backend/       Express API, matching logic, database schema
ai/            FastAPI demand forecasting and allocation service
docker-compose.yml
.env.example
srs.txt
GET_IT_NOW_IMPLEMENTATION_PLAN.md
```

## Local Infra

Start PostgreSQL/PostGIS and Redis:

```powershell
docker compose up -d
```

## Backend

```powershell
cd backend
npm install
npm run dev
```

For a no-database demo while Docker images are still downloading:

```powershell
cd backend
$env:USE_MOCK_DB = "true"
npm run dev
```

## AI Service

```powershell
cd ai
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

## MVP Demo Flow

1. Customer logs in and books an emergency plumbing service.
2. Backend uses PostGIS and matching score to recommend a worker.
3. Worker receives the job through real-time events and accepts.
4. Customer tracks status updates.
5. Payment is recorded and invoice data is created.
6. Admin dashboard shows active operations.
7. AI service shows demand forecast and workforce recommendations.
