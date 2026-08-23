# GET IT NOW Implementation Plan

Source reviewed: `srs.txt`

## 1. Product Direction

GET IT NOW should be built as a cooperative-owned gig services platform for local household and community services. The core value is not just booking a worker; it is verified cooperative workers, fair job distribution, welfare visibility, emergency response, and AI-assisted workforce planning.

For the hackathon, build a focused MVP that proves the full story:

- A customer can book a verified nearby worker.
- A worker can accept, update status, and complete the job.
- Admins can verify workers and monitor operations.
- Matching uses location, skill, availability, rating, and workload.
- AI shows demand forecasting and workforce allocation recommendations.
- Payments, notifications, maps, and multilingual UI are demonstrated.

## 2. Recommended MVP Architecture

Use a modular monolith backend with one database and one small AI sidecar.

```text
Customer Flutter App
Worker Flutter App
Next.js Admin Dashboard
        |
 REST APIs + Socket.IO
        |
Node.js + TypeScript + Express
        |
PostgreSQL + PostGIS
Redis
Cloudinary or S3
        |
Python FastAPI AI Engine
```

Do not split auth, booking, payment, worker, and notification into separate deployed services for the MVP. Keep them as backend modules inside one Express app. This keeps the system demoable and easier to finish.

## 3. Stack Mapping

| Requirement | Technology | MVP Use |
| --- | --- | --- |
| Customer app | Flutter | Search services, book worker, track status, pay, review |
| Worker app | Flutter | Availability, job requests, accept/reject, start/complete job, earnings |
| Admin dashboard | Next.js + React | Verify workers, monitor bookings, view analytics and AI recommendations |
| Backend | Node.js + TypeScript + Express | REST APIs, role-based logic, booking lifecycle, matching |
| Database | PostgreSQL + PostGIS | Users, workers, services, bookings, location queries |
| Real-time | Redis + Socket.IO | Worker availability, booking status, live job updates |
| AI | Python + FastAPI + Scikit-learn | Demand forecast and allocation recommendations |
| Maps | Google Maps API or OpenStreetMap | Address selection, worker distance, navigation links |
| Payments | Razorpay / UPI | Payment order, payment verification, invoice record |
| Auth | JWT + OTP | Phone login, role-based access |
| Notifications | Firebase Cloud Messaging | Booking and worker job alerts |
| Storage | Cloudinary / S3 | Worker documents, profile images, job images |
| Deployment | Vercel + Render/AWS | Admin on Vercel, APIs and database on Render/AWS |

## 4. MVP Modules

### Customer App

- OTP login
- Language selector: English, Telugu, Hindi
- Service category list
- Current/manual location selection
- Immediate or scheduled booking
- Nearby worker recommendation
- Booking status timeline
- Razorpay/UPI payment flow
- Rating and feedback
- Booking history

### Worker App

- OTP login
- Profile and verification status
- Skill list and service areas
- Availability toggle
- Incoming job request screen
- Accept/reject job
- Job status updates: accepted, on the way, started, completed
- Navigation link to customer location
- Earnings summary

### Admin Dashboard

- Login with admin role
- Worker verification queue
- Worker list with skills, status, workload, rating
- Live booking board
- Emergency booking monitor
- Basic complaints list
- Analytics cards: bookings, completed jobs, active workers, earnings
- AI demand forecast page
- Workforce allocation recommendation page

## 5. Backend Modules

Build the Express backend with these modules:

- `auth`: OTP login, JWT issue/refresh, role checks
- `users`: customer, worker, admin profile management
- `workers`: skills, certifications, documents, availability, verification
- `services`: service categories and pricing rules
- `bookings`: create booking, assign worker, status lifecycle
- `matching`: PostGIS worker search and weighted matching score
- `payments`: Razorpay order creation, webhook/verification, invoice record
- `reviews`: ratings, feedback, review eligibility
- `notifications`: FCM push and in-app notification records
- `admin`: dashboards, reports, worker verification, complaints
- `ai`: proxy routes to Python FastAPI forecasts and recommendations

## 6. Core Database Tables

Minimum PostgreSQL/PostGIS schema:

- `users`: id, name, phone, email, role, language, status
- `cooperatives`: id, name, district, state, federation_id
- `workers`: id, user_id, cooperative_id, experience_years, verification_status, rating, current_status
- `worker_skills`: worker_id, service_id, certification_level
- `worker_documents`: worker_id, type, file_url, status
- `worker_locations`: worker_id, geography_point, updated_at
- `services`: id, name, category, base_price, emergency_supported
- `bookings`: id, customer_id, worker_id, service_id, status, scheduled_at, is_emergency, location_point, address, price
- `booking_status_events`: booking_id, status, actor_id, created_at
- `payments`: id, booking_id, provider, provider_order_id, amount, status
- `reviews`: id, booking_id, customer_id, worker_id, rating, feedback
- `notifications`: id, user_id, type, title, body, read_at
- `complaints`: id, booking_id, raised_by, status, description
- `welfare_records`: worker_id, insurance_status, training_status, notes

Use PostGIS indexes on worker and booking location columns.

## 7. Matching Logic

For the MVP, implement transparent scoring instead of a black-box model:

```text
score =
  skill_match * 0.30 +
  distance_score * 0.20 +
  availability_score * 0.15 +
  certification_score * 0.15 +
  rating_score * 0.10 +
  workload_balance_score * 0.10
```

Use PostGIS to first filter workers within a service radius, then calculate score in the backend. Emergency bookings should increase the weight of distance and availability.

## 8. AI Engine Plan

The Python FastAPI service should expose:

- `POST /forecast/demand`: predict demand by area, service, and date
- `POST /allocation/recommend`: recommend worker movement or staffing gaps
- `GET /health`: health check

For hackathon data, use seeded booking history and a simple Scikit-learn model such as Random Forest or Gradient Boosting. Inputs can include service type, area, day of week, hour, emergency flag, and past demand. Output should be visual and judge-friendly: expected requests, available workers, shortage/surplus, and recommendation.

## 9. API Plan

Key REST endpoints:

- `POST /auth/request-otp`
- `POST /auth/verify-otp`
- `GET /services`
- `POST /bookings`
- `GET /bookings/:id`
- `PATCH /bookings/:id/status`
- `GET /workers/nearby`
- `PATCH /workers/me/availability`
- `POST /workers/me/documents`
- `PATCH /admin/workers/:id/verify`
- `GET /admin/dashboard`
- `GET /admin/bookings/live`
- `POST /payments/create-order`
- `POST /payments/verify`
- `POST /reviews`
- `GET /ai/demand-forecast`
- `GET /ai/workforce-allocation`

Socket.IO events:

- `worker:location:update`
- `worker:availability:update`
- `booking:created`
- `booking:assigned`
- `booking:status_changed`
- `payment:completed`
- `emergency:new`

## 10. Hackathon Build Sequence

### Day 1: Foundation

- Create monorepo structure.
- Set up Express TypeScript backend.
- Set up PostgreSQL/PostGIS schema.
- Add auth, roles, seed services, seed workers.

### Day 2: Booking and Matching

- Build booking APIs.
- Implement nearby worker query with PostGIS.
- Add matching score.
- Add booking lifecycle.

### Day 3: Flutter Customer App

- Build login, service list, booking form, nearby worker recommendation, booking status.
- Add basic multilingual labels.

### Day 4: Flutter Worker App

- Build worker login, availability toggle, incoming job request, accept/reject, status updates, earnings.

### Day 5: Admin Dashboard

- Build worker verification, booking board, analytics cards, emergency monitor.
- Add federation/cooperative summary view.

### Day 6: AI, Payments, Notifications

- Build Python FastAPI demand forecast.
- Connect backend to AI service.
- Add Razorpay test flow.
- Add FCM or mocked push notification demo.

### Day 7: Polish and Demo

- Seed realistic data.
- Add dashboard charts.
- Test full booking lifecycle.
- Prepare judging demo script.
- Deploy admin, backend, database, and AI service.

## 11. Demo Script

1. Customer opens Flutter app and selects Telugu/Hindi/English.
2. Customer chooses emergency plumbing and current location.
3. System shows recommended verified worker using smart matching.
4. Worker receives real-time request and accepts.
5. Customer sees live booking status change.
6. Worker starts and completes job.
7. Customer pays using Razorpay/UPI test payment.
8. Invoice and rating are created.
9. Admin dashboard updates live.
10. Admin opens AI forecast showing tomorrow's shortage and allocation recommendation.

## 12. SRS Gaps To Clarify Later

- Exact pricing model: fixed, hourly, inspection-based, or admin-defined.
- Platform/cooperative commission rules.
- Refund and cancellation policy.
- Worker identity document requirements.
- Complaint escalation and dispute resolution workflow.
- Data retention and privacy policy.
- Offline behavior for workers in low-network areas.
- Admin approval rules for AI workforce allocation.
- Institutional customer bulk booking workflow.

## 13. Judge-Focused Highlights

Emphasize these during presentation:

- Cooperative-first platform, not a private gig marketplace clone.
- Verified local workers and trust badges.
- Smart workload-balanced matching.
- Emergency service flow.
- PostGIS-powered location intelligence.
- Real-time booking and worker status updates.
- AI demand forecasting and workforce allocation.
- Digital payments and transparent worker earnings.
- Multilingual access for Indian users.
- Worker welfare and cooperative administration dashboards.
