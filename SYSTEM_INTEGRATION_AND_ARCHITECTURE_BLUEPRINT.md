# GET IT DONE — Comprehensive Connected System Architecture, Entity Relationship & API Gap Blueprint

**Platform:** GET IT DONE (Cooperative Gig Services Platform for Household & Community Services)  
**Problem Statement ID:** 26089  
**Authority:** Ministry of Cooperation | National Council for Cooperative Training (NCCT)  
**Document Type:** System Integration & Architecture Blueprint, Entity Model, API Inventory & Gap Analysis  
**Status:** Canonical Reference Specification  

---

## Executive Summary & System Philosophy

**GET IT DONE** is an enterprise-grade, cooperative-owned digital gig services network. Unlike traditional private aggregator platforms that optimize purely for platform extraction, GET IT DONE is architected around five cooperative pillars:
1. **Cooperative Trust Graph:** Multi-tier verification (Identity, Skills, Certifications, Society Membership) giving transparent trust signals without exposing sensitive worker documents.
2. **Fair-Match Engine:** Multi-objective worker recommendation algorithm balancing distance, skill, availability, certification, ratings, and workload equity to eliminate job hoarding.
3. **Worker Welfare Passport:** Embedded tracking of insurance, skills certifications, safety records, and automated welfare fund contributions per transaction.
4. **Cooperative & Federation Control Tower:** Real-time visibility into local workforce capacity, demand spikes, emergency readiness, and dispute resolution.
5. **AI with Human-in-the-Loop:** Predictive demand forecasting and cross-zone workforce allocation recommendations requiring administrator authorization before execution.

---

## 1. Complete End-to-End System Workflow (The Connected Non-Breaking Lifecycle)

The diagram below illustrates how all 10 core subsystems interconnect seamlessly without dead ends or orphaned states:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                GET IT DONE SYSTEM LIFECYCLE FLOW                                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

 [ 1. Onboarding & Verification ]
 Customer / Organization / Worker Signup (Phone OTP / Google OAuth / Password)
   │
   ├─► Worker Profile Created ──► Upload Docs (S3/MinIO) ──► Society Admin Reviews KYC
   │                                                               │
   │   ┌───────────────────────────────────────────────────────────┴───────────────────────────────┐
   │   ▼                                                           ▼                               ▼
   │ [ Approved / Verified Badge ]                       [ Needs Correction ]             [ Rejected ]
   │   │
   └───┼───────────────────────────────────────────────────────────────────────────────────────────┐
       │                                                                                           │
 [ 2. Service Discovery & Pricing ]                                                                │
 Customer selects Service Category / Variant / Location                                           │
   │                                                                                               │
   ├─► Pricing Engine calculates Fare Estimate (Base + Dist + Emergency Surge + Tax + Split Preview)│
   │                                                                                               │
 [ 3. Booking Creation & Idempotency ]                                                             │
 Customer initiates Booking (Immediate / Scheduled / Emergency) with Client Idempotency Key       │
   │                                                                                               │
   ├─► DB Booking record inserted (Status: 'requested' -> 'matching')                             │
   │                                                                                               │
 [ 4. Smart Matching Engine ]                                                                      │
 Geo-Spatial Radius (PostGIS + Redis) ──► Filter by Skill & Status ('available')                   │
   │                                                                                               │
   ├─► Multi-Objective Scoring: Skill(30%) + Dist(20%) + Avail(15%) + Cert(15%) + Rate(10%) + Workload(10%)
   │                                                                                               │
   ├─► Top Candidate Selected ──► Lock worker slot in Redis ──► Status: 'assigned'                │
   │   │                                                                                           │
   │   └─► Socket.IO / FCM Push to Worker App with 45s countdown timer                            │
   │         │                                                                                     │
   │         ├─► [ Worker Rejects / Timeout ] ──► Auto-reassign to Next Candidate in Fair Queue   │
   │         │                                                                                     │
   │         └─► [ Worker Accepts ] ──► Status: 'accepted' ──► Notification to Customer           │
   │                                                                                               │
 [ 5. Service Delivery & Verification ]                                                            │
 Worker toggles 'en_route' (Live Geo-tracking stream to Customer via Socket.IO)                    │
   │                                                                                               │
   ├─► Arrival at Customer Location ──► Customer provides Start Job OTP ──► Status: 'started'     │
   │                                                                                               │
   ├─► Work Executed ──► Upload Before/After Photos ──► Customer Completion OTP ──► Status: 'completed'
   │                                                                                               │
 [ 6. Digital Payment & Automated Split Ledger ]                                                   │
 Payment Order Created (UPI / Razorpay / Wallet / Net Banking)                                    │
   │                                                                                               │
   ├─► Webhook Verified (HMAC Signature) ──► Status: 'paid'                                       │
   │                                                                                               │
   ├─► Automated Split Execution (Atomic DB Transaction):                                          │
   │     ├─► Worker Net Earnings (80-85%) ──► `worker_earnings_ledger` & `payout_accounts`         │
   │     ├─► Cooperative Society Share (8-10%) ──► `settlements` escrow                            │
   │     ├─► Platform Management Fee (3-5%) ──► Platform revenue ledger                           │
   │     └─► Worker Welfare Fund (2%) ──► `welfare_records` insurance & training escrow            │
   │                                                                                               │
   ├─► PDF Invoice Generated (RFC-7807 compliant metadata & download URL)                          │
   │                                                                                               │
 [ 7. Trust, Feedback & Welfare Update ]                                                           │
 Customer submits 1-5 Star Rating & Review ──► Anti-Fraud Check ──► Update Worker Aggregate Rating │
   │                                                                                               │
   ├─► Worker Welfare Passport updated (Completed jobs counter, welfare points, training credits)  │
   │                                                                                               │
 [ 8. Control Tower & AI Workforce Planning ]                                                      │
 Booking & Telemetry Stream ──► Aggregated into Daily/Weekly Data Warehouse                        │
   │                                                                                               │
   ├─► Python AI Sidecar analyzes seasonal, day-of-week, geo-hotspots ──► Demand Forecast         │
   │                                                                                               │
   └─► Shortage Warnings ──► AI recommends inter-society worker shifts ──► Admin Approves in Portal│
```

---

## 2. Comprehensive Entity Relationship Diagram (ERD) & Data Model

```
 ┌─────────────────┐       1:N       ┌────────────────────────┐
 │   federations   │────────────────►│      cooperatives      │
 └─────────────────┘                 └───────────┬────────────┘
                                                 │ 1:N
                                                 ▼
 ┌─────────────────┐       1:1       ┌────────────────────────┐       1:N       ┌──────────────────────┐
 │      users      │◄───────────────►│        workers         │────────────────►│    worker_skills     │
 └────────┬────────┘                 └───────────┬────────────┘                 └──────────────────────┘
          │                                      │                                         │
          │ 1:N                                  │ 1:N                                     ▼
          ├────────────────────────┐             ├─────────────────► ┌─────────────────────────────────┐
          │                        │             │                   │      services / categories      │
          ▼                        ▼             │                   └─────────────────────────────────┘
 ┌─────────────────┐     ┌─────────────────┐     │                                         ▲
 │ user_addresses  │     │ favorite_workers│     │                                         │
 └─────────────────┘     └─────────────────┘     │                                         │ 1:N
          │                                      │                                         ▼
          │ 1:N                                  │ 1:N                       ┌─────────────────────────┐
          ▼                                      ▼                           │      pricing_rules      │
 ┌────────────────────────────────────────────────────────┐                  └─────────────────────────┘
 │                        bookings                        │
 └───────────────────────────┬────────────────────────────┘
                             │
         ┌───────────────────┼──────────────────────────────┬─────────────────────────────┐
         │ 1:1               │ 1:N                          │ 1:1                         │ 1:N
         ▼                   ▼                              ▼                             ▼
 ┌──────────────┐   ┌─────────────────┐            ┌─────────────────┐           ┌──────────────────┐
 │   payments   │   │ booking_events  │            │     invoices    │           │ booking_attach   │
 └───────┬──────┘   └─────────────────┘            └─────────────────┘           └──────────────────┘
         │ 1:N                                              ▲
         ▼                                                  │
 ┌──────────────┐                                           │
 │payment_ledger│───────────────────────────────────────────┘
 └───────┬──────┘
         │
         ├────────────────────────────────────────────────────────┐
         │ 1:N                                                    │ 1:N
         ▼                                                        ▼
 ┌────────────────────────┐                              ┌─────────────────┐
 │ worker_earnings_ledger │                              │   settlements   │
 └────────────────────────┘                              └─────────────────┘
```

---

## 3. Entity Inventory & Schema Gap Analysis

### Existing Tables (Audited):
- `users`: Core authentication, contact, language, role, status.
- `refresh_tokens`: Secure token rotation & revocation tracking.
- `otp_challenges`: Multi-purpose mobile/email OTP validation.
- `audit_events`: Full compliance audit trail.
- `federations` & `cooperatives`: Multi-tier cooperative hierarchy.
- `admin_scopes`: Role-based territory boundaries.
- `services` & `pricing_rules` & `service_variants`: Catalog & dynamic rates.
- `workers`: Worker profile, experience, verification, rating, status.
- `worker_verification_events`: Status transition logs (pending -> verified -> suspended).
- `worker_skills`: Worker to service mapping with certification levels.
- `worker_service_areas`: Bounded coverage radius per service.
- `worker_documents`: Document upload URLs, types, verification state.
- `worker_locations`: PostGIS geography points for live worker locations.
- `bookings`: Core booking lifecycle records with geo-location.
- `booking_status_events`: Immutable transition log with timestamps.
- `booking_attachments` & `booking_notes`: Job site photos, audio notes.
- `idempotency_keys`: Zero-duplicate payment & booking protection.
- `payments`, `payment_orders`, `payment_transactions`, `payment_refunds`: Financial state machine.
- `payment_ledger` & `worker_earnings_ledger`: Double-entry financial records.
- `settlements`: Society-level batch payouts and revenue sharing.
- `invoices`: Formal customer billing documents.
- `reviews`: Ratings and feedback per completed booking.
- `notifications`: Multichannel notification inbox.
- `complaints` / `support_tickets`: Dispute resolution.
- `welfare_records`, `worker_training_records`, `worker_insurance_records`: Welfare passport.
- `payout_accounts`: Bank account & UPI VPA verification.
- `organizations`, `organization_members`, `organization_addresses`, `service_contracts`, `service_plans`: Institutional B2B accounts.

### Identified Entity Gaps & Solutions:

| Missing / Incomplete Entity | Description & Relationship | Impact Without Fix | Recommended Action |
|---|---|---|---|
| **`user_addresses` (Linked)** | Table `addresses` currently lacks `user_id` foreign key. Needs `user_id uuid references users(id) on delete cascade`. | Users cannot isolate their private saved homes/offices. Cross-tenant leakage. | Add `user_id` foreign key and compound index `(user_id, is_default)`. |
| **`customer_favorites`** | Linking `customer_id (users.id)` to `worker_id (workers.id)` with notes and preference order. | Customer app cannot display "My Preferred Electrician/Plumber". | Create `customer_favorites` table with unique constraint `(customer_id, worker_id)`. |
| **`booking_verifications` (OTPs)** | Job start OTP and job completion OTP on `bookings` (`start_otp_hash`, `completion_otp_hash`, `verified_at`). | Fraud risk where a worker marks job started/completed without customer being present. | Add OTP verification columns on `bookings` table. |
| **`emergency_reassignments`** | Audit trail of emergency timeout failovers (`booking_id`, `from_worker_id`, `to_worker_id`, `reason: timeout | rejected`, `attempt_number`). | Inability to track worker SLA compliance during critical emergency response. | Add `emergency_escalations` table. |
| **`ai_allocations` & `ai_recommendations`** | Persistence of AI workforce re-balancing suggestions with admin approval states (`pending`, `approved`, `rejected`, `applied`). | AI suggestions are ephemeral in-memory without accountability or audit logs. | Create `ai_recommendation_records` table. |

---

## 4. Complete API Surface Inventory & Gap Analysis

Below is the exhaustive matrix of all API endpoints across all functional modules:

### Module 1: Authentication & Identity (`/auth`)
| HTTP Method | Route | Access | Purpose | Status in Codebase |
|---|---|---|---|---|
| `POST` | `/auth/register` | Public | Create Customer/Worker/Admin account | **Implemented** |
| `POST` | `/auth/login` | Public | Authenticate with Password | **Implemented** |
| `POST` | `/auth/refresh` | Public | Rotate JWT Access Token | **Implemented** |
| `POST` | `/auth/logout` | Authenticated | Revoke refresh token | **Implemented** |
| `POST` | `/auth/otp/send` | Public | Send mobile/email OTP | **Implemented** |
| `POST` | `/auth/otp/verify` | Public | Verify OTP code | **Implemented** |
| `GET` | `/auth/google` | Public | Google OAuth redirect | **Implemented** |
| `GET` | `/auth/google/callback` | Public | OAuth code exchange & session issuance | **Implemented** |
| `POST` | `/auth/password/reset-request`| Public | Initiate password recovery | **Implemented** |
| `POST` | `/auth/password/reset` | Public | Complete password reset with token | **Implemented** |

### Module 2: User Profile & Customer Management (`/users`, `/addresses`)
| HTTP Method | Route | Access | Purpose | Status in Codebase |
|---|---|---|---|---|
| `GET` | `/users/me` | Authenticated | Get current user profile & role | **Implemented** |
| `PATCH` | `/users/me` | Authenticated | Update name, language, timezone, avatar | **Implemented** |
| `GET` | `/users/me/preferences` | Authenticated | Get notification & UI preferences | **Implemented** |
| `PUT` | `/users/me/preferences` | Authenticated | Update notification channels (SMS/Push/Email) | **Implemented** |
| `GET` | `/addresses` | Authenticated | List saved addresses for logged-in user | **Implemented (Needs user_id scoping)** |
| `POST` | `/addresses` | Authenticated | Save new home/office address with Lat/Lng | **Implemented (Needs user_id scoping)** |
| `PATCH` | `/addresses/:id` | Authenticated | Update address or toggle default flag | **Implemented** |
| `DELETE`| `/addresses/:id` | Authenticated | Remove saved address | **Implemented** |
| `GET` | `/users/favorites` | Customer | List customer's saved favorite workers | **Needs Endpoint Linkage** |
| `POST` | `/users/favorites/:workerId` | Customer | Add worker to customer favorites | **Needs Endpoint Linkage** |
| `DELETE`| `/users/favorites/:workerId` | Customer | Remove worker from favorites | **Needs Endpoint Linkage** |

### Module 3: Worker Onboarding, Trust & Welfare (`/workers`, `/skills`, `/documents`, `/welfare`)
| HTTP Method | Route | Access | Purpose | Status in Codebase |
|---|---|---|---|---|
| `GET` | `/workers/me` | Worker | Get full worker profile & verification state | **Implemented** |
| `POST` | `/workers/me` | Worker | Initialize worker profile with cooperative | **Implemented** |
| `PATCH` | `/workers/me/availability` | Worker | Toggle status (`available`, `busy`, `offline`) | **Implemented** |
| `POST` | `/workers/me/location` | Worker | Stream live GPS coordinates | **Implemented** |
| `GET` | `/workers/me/skills` | Worker | List current certified skills | **Implemented** |
| `PUT` | `/workers/me/skills` | Worker | Submit skills for society approval | **Implemented** |
| `GET` | `/workers/me/service-areas` | Worker | Get configured radius & zones | **Implemented** |
| `PUT` | `/workers/me/service-areas` | Worker | Update operating distance | **Implemented** |
| `POST` | `/documents/upload-url` | Worker | Get S3/MinIO presigned upload URL | **Implemented** |
| `POST` | `/documents` | Worker | Register uploaded document for verification | **Implemented** |
| `GET` | `/documents/my` | Worker | List uploaded KYC & certification documents | **Implemented** |
| `GET` | `/welfare/passport` | Worker | Worker Welfare Passport (insurance, safety) | **Implemented** |
| `GET` | `/welfare/training` | Worker | List completed & upcoming training programs | **Implemented** |
| `GET` | `/welfare/insurance` | Worker | View policy status and coverage details | **Implemented** |
| `POST` | `/welfare/payout-account` | Worker | Set Bank Account / UPI VPA for payouts | **Implemented** |
| `GET` | `/trust/workers/:id` | Public/Auth | Public Trust Graph (Badges, rating, skills) | **Implemented** |

### Module 4: Service Catalog & Dynamic Pricing (`/services`, `/pricing`)
| HTTP Method | Route | Access | Purpose | Status in Codebase |
|---|---|---|---|---|
| `GET` | `/services` | Public/Auth | List all active services & categories | **Implemented** |
| `GET` | `/services/:id` | Public/Auth | Get service details, base price, prerequisites | **Implemented** |
| `POST` | `/services` | Admin | Create new service catalog item | **Implemented** |
| `PATCH` | `/services/:id` | Admin | Update service description, rate, icon | **Implemented** |
| `GET` | `/pricing/rules` | Admin | List dynamic pricing rules & multipliers | **Implemented** |
| `POST` | `/pricing/estimate` | Authenticated | Calculate upfront fare estimate & breakdown | **Implemented** |

### Module 5: Smart Matching & Bounded Emergency Engine (`/matching`, `/emergency`)
| HTTP Method | Route | Access | Purpose | Status in Codebase |
|---|---|---|---|---|
| `GET` | `/workers/nearby` | Authenticated | PostGIS radius search for available workers | **Implemented** |
| `POST` | `/matching/recommend` | Authenticated | Execute multi-objective Fair-Match scoring | **Implemented** |
| `POST` | `/emergency/request` | Authenticated | Dispatch priority emergency booking | **Implemented** |
| `GET` | `/emergency/active` | Admin/Staff | Live map of active emergency incidents | **Implemented** |
| `POST` | `/emergency/:id/escalate` | Admin/System | Automatic failover to next qualified worker | **Needs Dedicated Route** |
| `GET` | `/emergency/zones` | Admin | High-risk emergency density heatmaps | **Implemented** |

### Module 6: Booking Lifecycle & Execution (`/bookings`)
| HTTP Method | Route | Access | Purpose | Status in Codebase |
|---|---|---|---|---|
| `POST` | `/bookings` | Customer | Create booking (Immediate / Scheduled) | **Implemented** |
| `GET` | `/bookings` | Authenticated | List bookings (Filtered by role: customer/worker) | **Implemented** |
| `GET` | `/bookings/:id` | Authenticated | Get booking details & live status | **Implemented** |
| `PATCH` | `/bookings/:id/accept` | Worker | Worker accepts assigned job request | **Implemented** |
| `PATCH` | `/bookings/:id/reject` | Worker | Worker declines job request (triggers failover) | **Implemented** |
| `PATCH` | `/bookings/:id/status` | Worker | Transition status (`en_route`, `started`, `completed`) | **Implemented** |
| `POST` | `/bookings/:id/verify-start`| Worker | Validate customer Start OTP | **Needs Integration Route** |
| `POST` | `/bookings/:id/verify-complete`| Worker | Validate customer Completion OTP | **Needs Integration Route** |
| `PATCH` | `/bookings/:id/cancel` | Customer/Admin | Cancel booking with policy-based fee | **Implemented** |
| `POST` | `/bookings/:id/attachments`| Authenticated | Upload before/after job photos | **Implemented** |
| `GET` | `/bookings/:id/timeline` | Authenticated | Complete audit timeline of booking events | **Implemented** |

### Module 7: Payments, Settlements, Invoices & Earnings (`/payments`, `/settlements`, `/invoices`, `/earnings`)
| HTTP Method | Route | Access | Purpose | Status in Codebase |
|---|---|---|---|---|
| `POST` | `/payments/orders` | Customer | Create payment order with Idempotency Key | **Implemented** |
| `POST` | `/payments/webhook` | Gateway/Webhook | Handle Razorpay/UPI asynchronous confirmation | **Implemented** |
| `GET` | `/payments/:id` | Authenticated | Check payment transaction status | **Implemented** |
| `POST` | `/payments/:id/refund` | Admin/Support | Issue partial or full refund | **Implemented** |
| `GET` | `/invoices/booking/:bookingId` | Authenticated | View formal invoice metadata | **Implemented** |
| `GET` | `/invoices/:id/pdf` | Authenticated | Stream binary PDF invoice | **Implemented** |
| `GET` | `/earnings/summary` | Worker | Today's, Weekly, Monthly earnings summary | **Implemented** |
| `GET` | `/earnings/ledger` | Worker | Itemized earnings ledger with job references | **Implemented** |
| `GET` | `/settlements` | Society Admin | List cooperative settlement batches | **Implemented** |
| `POST` | `/settlements/generate` | Admin/Cron | Aggregate completed bookings into settlement | **Implemented** |
| `POST` | `/settlements/:id/payout` | Admin | Execute payout transfer to cooperative escrow | **Implemented** |

### Module 8: Reviews, Reputation & Quality (`/reviews`, `/support`)
| HTTP Method | Route | Access | Purpose | Status in Codebase |
|---|---|---|---|---|
| `POST` | `/reviews` | Customer | Submit 1-5 star review after job completion | **Implemented** |
| `GET` | `/reviews/worker/:workerId` | Public/Auth | List verified reviews for a worker | **Implemented** |
| `POST` | `/support/tickets` | Authenticated | Raise complaint or safety dispute | **Implemented** |
| `GET` | `/support/tickets` | Authenticated | List tickets for customer/worker/admin | **Implemented** |
| `PATCH` | `/support/tickets/:id` | Support Staff | Resolve dispute, issue refund, or apply penalty | **Implemented** |

### Module 9: Cooperative & Federation Administration (`/admin`, `/cooperatives`, `/reports`, `/analytics`)
| HTTP Method | Route | Access | Purpose | Status in Codebase |
|---|---|---|---|---|
| `GET` | `/cooperatives` | Admin | List registered societies in federation | **Implemented** |
| `POST` | `/cooperatives` | Federation Admin | Register new local Labour Cooperative Society | **Implemented** |
| `GET` | `/admin/workers/pending` | Society Admin | List workers awaiting document verification | **Implemented** |
| `POST` | `/admin/workers/:id/verify`| Society Admin | Approve worker KYC & issue Verified Badge | **Implemented** |
| `POST` | `/admin/workers/:id/suspend`| Society Admin | Temporarily suspend worker on violations | **Implemented** |
| `GET` | `/analytics/cooperative/:id`| Society Admin | Local demand, response times, revenue | **Implemented** |
| `GET` | `/analytics/federation` | Federation Admin | State/District cross-society benchmark metrics | **Implemented** |
| `GET` | `/reports/export` | Admin | Export CSV/Excel operational reports | **Implemented** |

### Module 10: Institutional Customers & Recurring Services (`/institutions`, `/recurring`)
| HTTP Method | Route | Access | Purpose | Status in Codebase |
|---|---|---|---|---|
| `POST` | `/institutions/organizations` | Institutional | Register School/Hospital/Apartment entity | **Implemented** |
| `GET` | `/institutions/organizations/me`| Institutional | Get institutional dashboard & members | **Implemented** |
| `POST` | `/institutions/contracts` | Institutional | Create master service agreement | **Implemented** |
| `POST` | `/recurring/plans` | Institutional/Cust | Create recurring service plan (daily/weekly) | **Implemented** |
| `GET` | `/recurring/plans` | Authenticated | List active recurring schedules | **Implemented** |
| `POST` | `/recurring/plans/:id/generate`| System/Cron | Spawn booking instances from active schedules | **Needs Scheduled Hook** |

### Module 11: AI Demand Forecasting & Workforce Rebalancing (`/ai`)
| HTTP Method | Route | Access | Purpose | Status in Codebase |
|---|---|---|---|---|
| `GET` | `/ai/health` | Admin | Check Python AI engine connectivity | **Implemented** |
| `POST` | `/ai/forecast` | Admin | Query 7-14 day demand forecast by zone/service | **Implemented** |
| `POST` | `/ai/allocation` | Admin | Request AI workforce rebalancing recommendation| **Implemented** |
| `POST` | `/ai/allocation/approve` | Society/Fed Admin| Authorize worker shift between zones | **Implemented** |

---

## 5. Architectural Decisions & Non-Breaking Recommendations

1. **Route Collision Resolution in `ba.ts`:**
   - In `app.ts`, `bookingAttachmentsRouter` was mounted at `/bookings` while `ba.ts` had inner paths like `/bookings/:bookingId/attachments`. This caused duplicate prefixes `/bookings/bookings/...`.
   - **Decision:** Normalize route declarations in `ba.ts` to `/:bookingId/attachments` and mount cleanly under `/bookings` or integrate directly with `bookings.ts`.

2. **Address Tenant Isolation:**
   - **Decision:** Extend `addresses` table with `user_id uuid not null references users(id) on delete cascade` and filter all queries by `req.user.id`.

3. **Job Handshake Integrity (OTP Verification):**
   - **Decision:** Implement 4-digit start and completion OTPs generated at booking time. The worker must input the customer's OTP to move state from `accepted` -> `started` and `started` -> `completed`. This eliminates ghost bookings and unverified billing.

4. **Failover Reassignment Timer:**
   - **Decision:** When an emergency booking is assigned, a BullMQ delayed job or Redis TTL key is set for 45 seconds. If the worker does not accept within 45 seconds, the state machine triggers auto-rejection and dispatches the booking to the next best candidate in the Fair-Match queue.

5. **Human-in-the-Loop AI Governance:**
   - **Decision:** The AI sidecar purely acts as an advisory engine. AI predictions generate actionable recommendations stored in the database. Only when a Society or Federation Administrator clicks "Approve Recommendation" are worker zone assignments updated.
