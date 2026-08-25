# GET IT DONE — Enterprise Backend Platform

> **A cooperative-owned service network platform** connecting households, institutions, cooperative societies, and federations with verified workers — making trust, fair opportunity, welfare, and local operational intelligence visible.

---

## 📖 Table of Contents

- [Project Overview](#-project-overview)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [End Users](#-end-users)
- [System Architecture Diagram](#-system-architecture-diagram)
- [API Endpoints](#-api-endpoints)
- [Database Schema](#-database-schema)
- [Why This Tech Stack](#-why-this-tech-stack)
- [Getting Started](#-getting-started)
- [Environment Configuration](#-environment-configuration)
- [Running the Project](#-running-the-project)
- [API Documentation](#-api-documentation)
- [Database Schema Overview](#-database-schema-overview)
- [Why This Tech Stack](#-why-this-tech-stack)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Project Overview

**GET IT DONE** is a **cooperative-owned service network platform** (not just a worker booking app) that connects:

| User Type | Description |
|-----------|-------------|
| **Customers** | Households booking home services (plumbing, electrical, cleaning, etc.) |
| **Workers** | Verified skilled professionals with certified skills, documents, and welfare tracking |
| **Cooperative Societies** | Local worker collectives managing verification, availability, and operations |
| **Federations** | Regional bodies overseeing multiple societies with policy controls and analytics |
| **Institutional Customers** | Schools, apartments, offices, hospitals with recurring/bulk service needs |
| **Support Staff** | Complaint handling, refunds, safety escalations |

### Core Differentiators

| Feature | Description |
|---------|-------------|
| **Cooperative Trust Graph** | Every worker has verified skills, documents, cooperative membership, service history, training, and verification events |
| **Fair-Match Engine** | Balances skill, distance, urgency, availability, certification, rating, workload, travel cost, and fair opportunity — with human-readable reasons |
| **Worker Welfare Passport** | Private worker view tracking insurance, training, earnings, completed jobs, safety incidents, and benefit eligibility |
| **Cooperative Control Tower** | Society/Federation dashboards showing demand, response time, unassigned work, worker utilization, welfare gaps, disputes |
| **Emergency Response Mode** | Bounded radius, ETA rules, escalation timers, duplicate-request prevention, operations timeline |
| **Low-Connectivity Workflows** | Worker actions designed for intermittent networks with queued status updates |
| **Institutional Service Plans** | Schools, apartments, offices can create recurring/bulk requests with SLAs |
| **AI with Human Approval** | Forecasts explain demand, confidence, drivers, shortages — AI recommends, humans approve |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GET IT DONE ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Flutter   │    │  Flutter    │    │  Next.js    │    │   Admin     │
│  Customer   │    │   Worker    │    │   Admin     │    │  Dashboard  │
│    App      │    │    App      │    │  Portal     │    │             │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                   │                   │
       └──────────────────┼───────────────────┼───────────────────┘
                          ▼
              ┌─────────────────────────┐
              │   API Gateway / Express │
              │      Backend (Node.js)  │
              └───────────┬─────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  PostgreSQL   │ │     Redis     │ │ Object Storage│
│  + PostGIS    │ │   (Cache/WS)  │ │  (MinIO/S3)   │
└───────────────┘ └───────────────┘ └───────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Python AI Service   │
              │  (FastAPI + scikit)   │
              └───────────────────────┘
```

### Module Structure (Modular Monolith)

```
src/
├── core/                    # Cross-cutting concerns
│   ├── logger.ts           # Structured logging (Pino)
│   ├── redis.ts            # Redis client + Pub/Sub
│   ├── metrics.ts          # Prometheus metrics
│   ├── health.ts           # Health/Readiness checks
│   ├── realtime.ts         # Socket.IO + Redis adapter
│   ├── storage.ts          # File upload pipeline (S3/MinIO)
│   ├── errors.ts           # RFC 7807 Problem Details
│   └── audit.ts            # Audit event logging
├── modules/                 # Domain modules
│   ├── auth/               # Authentication & Authorization
│   ├── users/              # User profiles & preferences
│   ├── workers/            # Worker lifecycle & matching
│   ├── cooperatives/       # Federations, societies, memberships
│   ├── skills/             # Skill catalog & verification
│   ├── documents/          # Document upload & verification
│   ├── pricing/            # Pricing rules, surge, travel, tax
│   ├── bookings/           # Booking lifecycle & state machine
│   ├── emergency/          # Emergency booking workflows
│   ├── payments/           # Orders, webhooks, refunds, ledger
│   ├── settlements/        # Cooperative settlements
│   ├── earnings/           # Worker earnings & payouts
│   ├── invoices/           # PDF invoice generation
│   ├── analytics/          # Materialized views + dashboards
│   ├── institutions/       # Organizations, contracts, POs
│   ├── recurring/          # Recurring booking schedules
│   ├── admin/              # Admin dashboard & verification
│   ├── reports/            # Async exports & reports
│   ├── support/            # Ticketing system
│   ├── files/              # File upload & management
│   ├── reviews/            # Reviews & ratings
│   ├── welfare/            # Worker welfare passport
│   ├── institutions/       # Organizational customers
│   ├── recurring/          # Recurring bookings
│   ├── matching/           # Fair-match engine
│   └── ai/                 # AI service proxy
├── routes/                 # HTTP route handlers
├── services/               # Business logic
├── db/                     # Database schema & migrations
├── middleware/             # Auth, RBAC, validation
├── tests/                  # Jest + Supertest
└── app.ts                  # Express app factory
```

---

## 🛠️ Tech Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Runtime** | Node.js | 22.x (LTS) | TypeScript runtime |
| **Framework** | Express.js | 4.x | Web framework |
| **Language** | TypeScript | 5.x | Type safety |
| **Database** | PostgreSQL | 16 + PostGIS | Primary data + geospatial |
| **Cache/Queue** | Redis | 7.x | Cache, Pub/Sub, WebSocket adapter |
| **Object Storage** | MinIO / S3 | Latest | Private file storage |
| **AI Service** | Python FastAPI | 3.12+ | ML forecasting & allocation |
| **ML Library** | scikit-learn | 1.6+ | RandomForest for demand forecasting |
| **WebSocket** | Socket.IO | 4.x | Real-time updates |
| **Validation** | Zod | 3.x | Schema validation |
| **Auth** | JWT + bcrypt | - | Stateless auth + password hashing |
| **Logging** | Pino | 9.x | Structured JSON logging |
| **Metrics** | Prometheus | 2.x | Metrics exposition |
| **Testing** | Jest + Supertest | 29.x | Unit + Integration tests |
| **Containerization** | Docker + Compose | - | Multi-container deployment |
| **AI/ML** | scikit-learn, numpy, pandas | Latest | Demand forecasting & workforce allocation |

---

## 👥 End Users

| User Type | Capabilities |
|-----------|--------------|
| **Customer** | Discover services, book (immediate/scheduled/emergency/recurring), track status, pay, review, raise complaints |
| **Worker** | Onboarding, verification, skills/certs, availability, location sharing, job acceptance, earnings, welfare passport |
| **Society Admin** | Verify workers, manage local services, resolve operations, view analytics |
| **Federation Admin** | Manage societies, policies, cross-society analytics, approve AI allocations |
| **Support Staff** | Handle complaints, refunds, safety escalations |
| **Institutional Customer** | Create recurring/bulk requests, SLAs, single invoice trail |
| **System Admin** | Platform config, security, audit, access management |

---

## 📡 API Endpoints (150+ Documented)

### Core Domains

| Domain | Endpoints | Key Features |
|--------|-----------|--------------|
| **Authentication** | 17 | OTP, JWT, Google OAuth, sessions, security events |
| **Users** | 8 | Profile, avatar, preferences, admin management |
| **Workers** | 15 | Onboarding, skills, areas, availability, location, earnings, welfare |
| **Cooperatives** | 12 | Federations, societies, memberships, scopes |
| **Skills** | 9 | Catalog, worker skills, verification |
| **Documents** | 12 | Types, upload, review workflow, certifications |
| **Pricing** | 9 | Rules, surge, travel fees, tax, estimates |
| **Bookings** | 12 | Full lifecycle, state machine, matching, emergency |
| **Emergency** | 5 | Priority booking, escalation, reassignment |
| **Payments** | 12 | Orders, webhooks, verification, refunds, ledger, reconciliation |
| **Settlements** | 3 | Cooperative settlement processing |
| **Earnings** | 5 | Ledger, summary, payouts, payout accounts |
| **Invoices** | 2 | PDF generation & listing |
| **Analytics** | 9 | Overview, bookings, workers, revenue, services, geography, satisfaction, welfare, fairness |
| **Institutions** | 10 | Organizations, contracts, POs, recurring plans |
| **Recurring** | 6 | Schedules, pause/resume, auto-generation |
| **Matching** | 7 | Candidates, recommendation, assignment, reassign, audit |
| **Admin** | 12 | Users, roles, audit, security events, operations, verification |
| **Reports** | 8 | 6 reports + async exports |
| **Support** | 8 | Tickets, messages, assignment, categories |
| **Files** | 4 | Presigned URLs, malware scan, private storage |
| **Reviews** | 7 | Create, list, update, delete, report, ratings |
| **Welfare** | 9 | Training, insurance, safety, benefits, eligibility |
| **Matching** | 7 | Candidates, recommendation, assign, reassign, audit |
| **AI** | 2 | Demand forecast, workforce allocation |
| **Services** | 6 | Catalog, categories, CRUD |

**Total: 150+ REST endpoints** with full OpenAPI 3.0 documentation.

---

## 🗄️ Database Schema (55 Tables)

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | All system users | id, name, phone, email, role, language, status, timezone (IST) |
| `refresh_tokens` | JWT refresh tokens | id, user_id, token_hash, device_id, expires_at, revoked_at |
| `otp_challenges` | Phone OTP challenges | phone, purpose, code_hash, attempts, expires_at |
| `audit_events` | Immutable audit trail | actor_id, action, resource_type, resource_id, request_id, metadata |
| `outbox_events` | Event-driven reliability | event_type, aggregate_type, aggregate_id, payload, processed_at |
| `security_events` | Security audit | user_id, event_type, ip, user_agent, metadata |

### Cooperative Hierarchy

| Table | Purpose |
|-------|---------|
| `federations` | Top-level regional bodies |
| `cooperatives` | Local societies (district, state, federation_id) |
| `cooperative_members` | User ↔ Society membership with roles |
| `memberships` | Worker ↔ Society verification status |
| `admin_scopes` | Admin ↔ Society/Federation authorization |

### Worker Ecosystem

| Table | Purpose |
|-------|---------|
| `workers` | Worker profiles (verification, rating, status, location, welfare) |
| `worker_skills_new` | Skills with levels (beginner→master) & verification |
| `skill_verifications` | Audit trail for skill changes |
| `worker_service_areas` | Service radius per service |
| `worker_documents` | Documents with malware scan, review workflow |
| `document_reviews` | Document review audit trail |
| `certifications` | Skill certifications linked to documents |
| `worker_training_records` | Courses, providers, expiry |
| `worker_insurance_records` | Policies, coverage, expiry |
| `safety_incidents` | Injuries, near-misses, investigations |
| `welfare_records` | Aggregate welfare status |
| `payout_accounts` | Worker bank/UPI details |

### Booking & Matching

| Table | Purpose |
|-------|---------|
| `bookings` | Core booking (state machine, PostGIS location, pricing) |
| `booking_status_events` | Immutable status transition audit |
| `worker_locations` | PostGIS Point for real-time matching |
| `worker_service_areas` | Service radius per service |
| `emergency_bookings` | Emergency-specific (priority, radius, escalation) |

### Payments & Finance

| Table | Purpose |
|-------|---------|
| `payment_orders` | Server-side order creation with idempotency |
| `payment_transactions` | Charge/capture/refund/void attempts |
| `payment_refunds` | Refund tracking |
| `payment_webhook_events` | Provider webhook deduplication |
| `payment_ledger` | Immutable financial ledger |
| `invoices` | PDF invoices with tax/platform/cooperative/worker breakdown |
| `settlements` | Cooperative periodic settlements |
| `worker_earnings_ledger` | Immutable earnings/payout/refund/adjustment ledger |
| `payout_accounts` | Worker bank/UPI details |

### Reviews & Trust

| Table | Purpose |
|-------|---------|
| `reviews` | 1-5 star + feedback (one per completed booking) |
| `review_reports` | Abuse reporting |
| `complaints` | Customer/worker complaints |
| `disputes` | Dispute resolution workflow |

### Institutions & Recurring

| Table | Purpose |
|-------|---------|
| `organizations` | Schools, apartments, offices, govt, NGOs |
| `organization_members` | User roles within organization |
| `organization_addresses` | Multiple service addresses |
| `service_contracts` | Service-level agreements with pricing |
| `service_plans` | Recurring service schedules |
| `purchase_orders` | Institutional POs |
| `recurring_bookings` | Schedule-driven auto-booking generation |

### Analytics & Welfare

| Table | Purpose |
|-------|---------|
| `mv_booking_stats` | Daily/hourly booking counts by service, area, status |
| `mv_worker_performance` | Completion rate, rating, response time, earnings |
| `mv_revenue` | Daily revenue by service, cooperative, payment method |
| `mv_customer_satisfaction` | Rating trends, NPS proxy |
| `mv_geography` | Demand heatmap, worker coverage gaps |
| `mv_welfare` | Insurance coverage, training completion, incidents |
| `mv_fairness` | Assignment distribution, earnings variance |

---

## 🔐 Why This Tech Stack?

| Requirement | Choice | Rationale |
|-------------|--------|-----------|
| **Type Safety** | TypeScript + Zod | Catch errors at compile time; shared schemas for API contracts |
| **Geospatial** | PostgreSQL + PostGIS | Native geospatial queries (distance, containment, radius) |
| **Reliability** | PostgreSQL + Redis | ACID transactions + Redis for cache/WS/pubsub |
| **Scalability** | Modular Monolith | Clear boundaries; extract to services later if needed |
| **Real-time** | Socket.IO + Redis Adapter | Horizontal scaling of WebSocket servers |
| **ML/AI** | Python FastAPI + scikit-learn | Best-in-class ML ecosystem; separate service for GPU scaling |
| **File Storage** | MinIO (S3-compatible) | Self-hosted, private, malware-scanned, presigned URLs |
| **Observability** | Pino + Prometheus | Structured logs + Prometheus metrics + health checks |
| **Auth** | JWT + bcrypt + rotating refresh tokens | Stateless, secure, revocable |
| **Validation** | Zod | Runtime + compile-time schema validation |
| **Testing** | Jest + Supertest | Fast, reliable, isolated tests |
| **Containerization** | Docker + Compose | Consistent dev/staging/prod |

---

## 🚀 Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 22+ (for local dev)
- Python 3.12+ (for AI service dev)

### Quick Start (Docker)

```bash
# Clone repository
git clone https://github.com/Vijayapardhu/Get-It-Done.git
cd Get-It-Done

# Copy environment template
cp .env.example .env

# Edit .env with your secrets (JWT_SECRET, etc.)

# Start all services
docker-compose up -d

# Verify services
curl http://localhost:4000/health/live
curl http://localhost:4000/health/ready
curl http://localhost:8001/health
```

### Local Development (without Docker)

```bash
# Backend
cd backend
npm install
cp .env.example .env
# Edit .env with local DB/Redis URLs
npm run dev

# AI Service
cd ../ai
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

---

## ⚙️ Environment Configuration

### Required Variables

```bash
# Core
NODE_ENV=development|production
PORT=4000
DATABASE_URL=postgres://user:pass@host:5432/db
REDIS_URL=redis://host:6379
JWT_SECRET=your-32-char-minimum-secret
AI_SERVICE_URL=http://localhost:8001

# Timezone (IST)
TZ=Asia/Kolkata

# Storage (MinIO/S3)
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=getitdone
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
STORAGE_PROVIDER=minio

# AI Service
AI_SERVICE_URL=http://localhost:8001

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback
```

### Production Checklist

- [ ] `JWT_SECRET` ≥ 32 random characters
- [ ] `NODE_ENV=production`
- [ ] Database SSL enabled
- [ ] Redis AUTH enabled
- [ ] MinIO TLS enabled
- [ ] CORS origins restricted
- [ ] Rate limits configured
- [ ] Backup/restore tested
- [ ] Log aggregation configured
- [ ] Alerting rules defined

---

## 🏃 Running the Project

### Development (with Hot Reload)

```bash
# All services
docker-compose up -d

# Backend only (with hot reload)
cd backend && npm run dev

# AI Service
cd ai && source .venv/bin/activate && uvicorn main:app --reload --port 8001
```

### Production Build

```bash
# Build images
docker-compose build

# Deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Health Checks

```bash
curl http://localhost:4000/health/live   # Liveness
curl http://localhost:4000/health/ready  # Readiness (DB, Redis, AI, Storage)
curl http://localhost:4000/metrics       # Prometheus metrics
curl http://localhost:4000/version       # Version info
```

---

## 📚 API Documentation

| Interface | URL |
|-----------|-----|
| **Swagger UI** | `http://localhost:4000/docs` |
| **OpenAPI JSON** | `http://localhost:4000/docs.json` |
| **AI Service Docs** | `http://localhost:8001/docs` |

### Key Conventions

- **Authentication**: `Authorization: Bearer <access_token>`
- **Idempotency**: `Idempotency-Key: <uuid>` (required for mutations)
- **Request ID**: `x-request-id` (auto-generated, returned in header)
- **Pagination**: `?page=1&limit=20` → `{ data: [], pagination: { page, limit, total, totalPages } }`
- **Filtering**: `?status=completed&serviceId=uuid`
- **Sorting**: `?sort=createdAt&order=desc`

### Error Format (RFC 7807)

```json
{
  "type": "https://api.getitdone.in/errors/not_found",
  "title": "Not Found",
  "status": 404,
  "detail": "Booking not found",
  "instance": "req_01J...",
  "code": "NOT_FOUND"
}
```

---

## 🚢 Deployment

### Docker Compose (Production)

```yaml
# docker-compose.prod.yml
services:
  backend:
    image: getitdone-backend:latest
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health/ready"]
      interval: 30s
      timeout: 10s
      retries: 3

  ai:
    image: getitdone-ai:latest
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 2G
          cpus: '2.0'
```

### Kubernetes (Helm)

```bash
helm repo add getitdone https://charts.getitdone.in
helm install getitdone getitdone/getitdone --namespace production
```

---

## 🤝 Contributing

```bash
# Fork & Clone
git clone https://github.com/Vijayapardhu/Get-It-Done.git
cd Get-It-Done

# Create feature branch
git checkout -b feature/amazing-feature

# Run tests
cd backend && npm test
cd ../ai && pytest

# Commit with conventional messages
git commit -m "feat(booking): add emergency reassignment endpoint"

# Push & PR
git push origin feature/amazing-feature
```

### Commit Convention

```
feat:     New feature
fix:      Bug fix
docs:     Documentation
refactor: Code restructuring
test:     Test additions
chore:    Maintenance
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Ministry of Cooperation, NCCT** — Problem statement & domain guidance
- **Open Source Community** — PostgreSQL, Redis, Node.js, FastAPI, scikit-learn communities
- **Cooperative Movement** — For inspiring the cooperative-owned model

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Vijayapardhu/Get-It-Done/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Vijayapardhu/Get-It-Done/discussions)
- **Email**: support@getitdone.in

---

> **Built with ❤️ for the Cooperative Movement** — *Making trusted, fair, and welfare-aware services accessible to every household and institution.*