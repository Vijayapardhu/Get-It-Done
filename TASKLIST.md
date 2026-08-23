# GET IT NOW — Enterprise Backend Implementation Tasklist

> Generated from gap analysis against the Enterprise Module Plan. Each task maps to a specific module, API endpoint, or schema change.

---

## Phase 0: Documentation & Planning

- [x] Create TASKLIST.md (this file)
- [ ] Update README.md with architecture overview
- [ ] Generate OpenAPI spec from route annotations
- [ ] Document database schema (ERD)

---

## Phase 1: Core Backend Foundation

### 1.1 Configuration & Environment
- [ ] Validate all env vars in `env.ts` against production requirements
- [ ] Add missing env vars: `SENTRY_DSN`, `LOG_LEVEL`, `METRICS_ENABLED`, `WS_ENABLED`, `STORAGE_PROVIDER`, `STORAGE_BUCKET`, `MALWARE_SCAN_API`, `GOOGLE_OAUTH_ENABLED`

### 1.2 Structured Logging
- [ ] Install `pino` + `pino-pretty`
- [ ] Create `src/core/logger.ts` with request-scoped logger (includes requestId)
- [ ] Replace all `console.*` calls with structured logger
- [ ] Add log levels: debug, info, warn, error, fatal
- [ ] Configure JSON output for production, pretty for development

### 1.3 Redis Integration
- [ ] Install `ioredis`
- [ ] Create `src/core/redis.ts` singleton client
- [ ] Implement session cache (refresh token lookup)
- [ ] Implement rate limit store (replace in-memory)
- [ ] Implement idempotency key cache (with TTL)
- [ ] Implement distributed locking for critical sections
- [ ] Add Redis health check to readiness probe

### 1.4 Metrics & Observability
- [ ] Install `prom-client`
- [ ] Create `src/core/metrics.ts` with:
  - HTTP request duration histogram (by route, method, status)
  - HTTP request counter
  - Active connections gauge
  - DB query duration histogram
  - Business metrics: bookings_created, bookings_completed, payments_processed, workers_matched
- [ ] Expose `/metrics` endpoint
- [ ] Add custom metrics for matching engine scores

### 1.5 Health & Readiness Endpoints
- [ ] Extend `health.ts`:
  - `GET /health/live` - liveness (process alive)
  - `GET /health/ready` - readiness (DB, Redis, AI service, Storage, Payment provider)
- [ ] Implement dependency checks with timeouts
- [ ] Return structured JSON with component statuses

### 1.6 WebSocket / Real-time
- [ ] Install `socket.io`
- [ ] Create `src/core/realtime.ts`:
  - Authenticated namespace per user
  - Rooms: `user:{id}`, `worker:{id}`, `booking:{id}`, `admin:operations`
  - Events: `booking:status_changed`, `worker:availability:update`, `worker:location:update`, `notification:new`, `emergency:escalated`
- [ ] Integrate with Express app
- [ ] Add connection auth via JWT in handshake
- [ ] Scale with Redis adapter for multi-instance

### 1.7 File Storage Pipeline
- [ ] Install `multer`, `@aws-sdk/client-s3` (or compatible)
- [ ] Create `src/core/storage.ts`:
  - Presigned upload URL generation (PUT)
  - Type validation (magic bytes + extension)
  - Size limits per type
  - Malware scan integration (ClamAV API or ClamAV daemon)
  - Private storage (no public URLs)
  - Signed download URLs (GET, TTL)
  - Metadata recording in DB
- [ ] Add `POST /files/upload-url`, `POST /files/:id/complete`, `GET /files/:id`, `DELETE /files/:id`

### 1.8 Error Handling & Problem Details
- [ ] Implement RFC 7807 Problem Details format
- [ ] Standard error codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `IDEMPOTENCY_KEY_REUSED`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
- [ ] Add error codes to all existing responses

---

## Phase 1: Authentication & Identity Completion

### 1.9 Auth Endpoints (Missing)
- [ ] `POST /auth/logout-all` - revoke all user sessions
- [ ] `GET /auth/sessions` - list active devices (device_id, last_used, ip, user_agent)
- [ ] `DELETE /auth/sessions/:id` - revoke specific device
- [ ] `POST /auth/password/set` - set initial password (for OTP-only users)
- [ ] `POST /auth/password/change` - change password (requires current)
- [ ] `GET /auth/security-events` - paginated security history (login, password_change, device_new, suspicious_activity)

### 1.10 OAuth (Google)
- [ ] Add Google OAuth config to `env.ts`
- [ ] Create `src/services/oauthService.ts`
- [ ] Implement `GET /auth/oauth/google` (redirect)
- [ ] Implement `GET /auth/oauth/google/callback`
- [ ] Link/unlink OAuth accounts to user
- [ ] Store `google_id`, `oauth_provider`, `oauth_subject` in users table

### 1.11 Security Events
- [ ] Create `security_events` table:
  ```sql
  id, user_id, event_type, ip, user_agent, metadata, created_at
  ```
- [ ] Event types: `login_success`, `login_failed`, `password_changed`, `password_reset`, `device_new`, `device_revoked`, `oauth_linked`, `mfa_enabled`, `mfa_disabled`, `suspicious_activity`
- [ ] Record events in authService
- [ ] Add index on `user_id, created_at DESC`

### 1.12 Session Management Enhancements
- [ ] Track device fingerprint in refresh_tokens
- [ ] Add `last_used_at` to refresh_tokens
- [ ] Implement concurrent session limits (configurable per role)
- [ ] Add automatic cleanup job for expired tokens

---

## Phase 2: User Module

### 2.1 User Profile APIs
- [ ] Create `src/routes/users.ts`
- [ ] `GET /users/me` - full profile
- [ ] `PATCH /users/me` - update profile (name, avatar, language, timezone, preferences)
- [ ] `GET /users/:id` - public profile (limited fields)
- [ ] `PATCH /users/:id` - admin update (status, role)
- [ ] `POST /users/me/avatar` - upload avatar (uses storage pipeline)
- [ ] `DELETE /users/me/avatar` - remove avatar
- [ ] `PATCH /users/me/language` - update language
- [ ] `PATCH /users/me/preferences` - notification preferences, UI preferences

### 2.2 User Schema Extensions
- [ ] Add columns to `users`:
  - `display_name`, `date_of_birth`, `gender`, `preferred_language`, `timezone`, `last_login_at`, `avatar_url`
- [ ] Add `user_preferences` table (JSONB)

---

## Phase 2: Worker Module (Extended)

### 2.3 Worker Public APIs
- [ ] `GET /workers/:id` - public worker profile
- [ ] `GET /workers` - paginated list with filters (service, location, rating, availability)
- [ ] `GET /workers/search` - advanced search with geo filters
- [ ] `GET /workers/:id/jobs` - worker's job history (paginated)
- [ ] `GET /workers/:id/earnings` - earnings summary + ledger
- [ ] `GET /workers/:id/ratings` - reviews with pagination
- [ ] `GET /workers/:id/statistics` - completion rate, response time, ratings breakdown

### 2.4 Worker Schema Extensions
- [ ] Add columns to `workers`:
  - `worker_code` (unique, human-readable)
  - `employment_type` (full_time, part_time, contract)
  - `total_jobs`, `completed_jobs`, `cancelled_jobs`
  - `current_workload` (active bookings count)
  - `service_radius_km` (default service radius)
  - `bio`, `verification_status` (extend enum)

---

## Phase 2: Skills Module

### 2.5 Skills Schema
- [ ] Create `skills` table:
  ```sql
  id, name, category, description, requires_certification, status, created_at
  ```
- [ ] Create `worker_skills` table (replace current):
  ```sql
  worker_id, skill_id, level (beginner/intermediate/expert/master), years_experience, verified, verified_at, verified_by, created_at
  ```
- [ ] Create `skill_verifications` table (audit trail)

### 2.6 Skills APIs
- [ ] `GET /skills` - list all skills (categorized)
- [ ] `POST /skills` - admin create skill
- [ ] `GET /workers/:id/skills` - worker's skills with levels
- [ ] `POST /workers/:id/skills` - add skill (worker)
- [ ] `PATCH /workers/:id/skills/:skillId` - update level/experience
- [ ] `DELETE /workers/:id/skills/:skillId` - remove skill
- [ ] `POST /workers/:id/skills/:skillId/verify` - admin/cooperative verify

---

## Phase 2: Certifications & Documents

### 2.7 Document Schema
- [ ] Create `document_types` table:
  ```sql
  id, name, category, required_for_skills (skill_ids[]), max_size_mb, allowed_mime_types, expires, created_at
  ```
- [ ] Extend `worker_documents`:
  - `file_hash`, `file_size`, `mime_type`, `status` (pending/approved/rejected/expired), `issued_by`, `issued_at`, `expires_at`, `reviewed_by`, `reviewed_at`, `rejection_reason`
- [ ] Create `document_reviews` table (audit)

### 2.8 Document APIs
- [ ] `POST /workers/:id/documents` - submit document (returns upload URL)
- [ ] `GET /workers/:id/documents` - list with status
- [ ] `GET /workers/:id/documents/:documentId` - document details
- [ ] `POST /documents/:id/submit` - worker submits for review
- [ ] `POST /documents/:id/approve` - admin approves
- [ ] `POST /documents/:id/reject` - admin rejects with reason
- [ ] `GET /workers/:id/certifications` - derived from approved documents
- [ ] `POST /workers/:id/certifications` - manual certification entry
- [ ] `PATCH /certifications/:id` - update
- [ ] `DELETE /certifications/:id` - revoke

### 2.9 Document Processing
- [ ] Background job: check expiry daily, mark expired, notify worker
- [ ] Malware scan on upload completion
- [ ] Auto-extract metadata (PDF info, image EXIF)

---

## Phase 2: Cooperatives & Societies

### 2.10 Cooperative Schema (Extend)
- [ ] Extend `federations`: `code`, `contact_email`, `contact_phone`, `address`, `status`
- [ ] Extend `cooperatives` (rename from societies?): `code`, `registration_number`, `address`, `contact_email`, `contact_phone`, `status`, `commission_rate`, `min_workers`, `max_workers`
- [ ] Create `cooperative_members`: `user_id`, `cooperative_id`, `role` (member, admin, supervisor), `joined_at`, `status`
- [ ] Create `memberships`: `worker_id`, `cooperative_id`, `status`, `approved_at`, `approved_by`

### 2.11 Cooperative APIs
- [ ] `POST /federations` - create (system_admin)
- [ ] `GET /federations` - list
- [ ] `GET /federations/:id` - details
- [ ] `PATCH /federations/:id` - update
- [ ] `POST /societies` - create (federation_admin)
- [ ] `GET /societies` - list (with federation filter)
- [ ] `GET /societies/:id` - details
- [ ] `PATCH /societies/:id` - update
- [ ] `POST /societies/:id/members` - add member
- [ ] `GET /societies/:id/members` - list members
- [ ] `PATCH /memberships/:id` - update membership
- [ ] `DELETE /memberships/:id` - remove member

---

## Phase 3: Service Catalog & Pricing

### 3.1 Service Schema Extensions
- [ ] Create `service_categories` table:
  ```sql
  id, name, description, icon, display_order, status, created_at
  ```
- [ ] Create `service_variants` table:
  ```sql
  id, service_id, name, description, base_price, duration_minutes, emergency_supported, status
  ```
- [ ] Create `service_areas` table:
  ```sql
  id, service_id, cooperative_id, polygon (geography), status
  ```
- [ ] Create `service_requirements` table:
  ```sql
  id, service_id, skill_id, required_level, mandatory
  ```

### 3.2 Service APIs
- [ ] `GET /services` - enhanced with variants, categories
- [ ] `GET /services/:id` - with variants, areas, requirements
- [ ] `POST /services` - create with variants
- [ ] `PATCH /services/:id` - update
- [ ] `DELETE /services/:id` - soft delete
- [ ] `GET /service-categories` - tree structure
- [ ] `POST /service-categories` - admin create
- [ ] `GET /services/:id/areas` - service coverage areas
- [ ] `POST /services/:id/areas` - add coverage area
- [ ] `DELETE /services/:id/areas/:areaId` - remove

### 3.3 Pricing Engine
- [ ] Create `pricing_rules` table:
  ```sql
  id, name, service_id, variant_id, cooperative_id, rule_type (base/travel/surge/emergency/discount/tax), formula (JSON), priority, valid_from, valid_to, status
  ```
- [ ] Create `surge_rules` table:
  ```sql
  id, area (polygon), service_id, multiplier, trigger (demand_threshold/time/weather), starts_at, ends_at
  ```
- [ ] Create `travel_fees` table:
  ```sql
  id, cooperative_id, base_km, base_fee, per_km_rate, max_distance_km
  ```
- [ ] Create `tax_rules` table:
  ```sql
  id, name, rate, applies_to (service/worker/platform), jurisdiction
  ```

### 3.4 Pricing APIs
- [ ] `POST /pricing/estimate` - input: service, variant, location, distance, urgency, time → output: breakdown
- [ ] `GET /pricing/rules` - list (admin)
- [ ] `POST /pricing/rules` - create (admin)
- [ ] `PATCH /pricing/rules/:id` - update (admin)
- [ ] `DELETE /pricing/rules/:id` - delete (admin)
- [ ] Integrate pricing into booking creation

---

## Phase 3: Booking Module (Complete)

### 3.5 Booking Schema Extensions
- [ ] Add columns to `bookings`:
  - `booking_number` (human-readable, unique)
  - `society_id`, `type` (immediate/scheduled/emergency/recurring/institutional)
  - `estimated_price`, `final_price`, `cancellation_reason`
  - `attachments` (JSONB array of file IDs)
  - `customer_notes`, `worker_notes`

### 3.6 Booking APIs (New)
- [ ] `POST /bookings/:id/cancel` - customer/worker cancel with reason
- [ ] `POST /bookings/:id/reschedule` - new scheduled_at
- [ ] `POST /bookings/:id/accept` - worker accepts assigned booking
- [ ] `POST /bookings/:id/reject` - worker rejects (triggers re-match)
- [ ] `POST /bookings/:id/start` - worker starts job
- [ ] `POST /bookings/:id/complete` - worker completes (with evidence)
- [ ] `POST /bookings/:id/reassign` - admin reassign to different worker
- [ ] `GET /bookings/:id/timeline` - status history with actors

### 3.7 Booking State Machine Enhancements
- [ ] Add `reassigned` transition
- [ ] Add `evidence_submitted` state for completion
- [ ] Implement timeout transitions (expired auto-cancel)
- [ ] Add SLA tracking per status

---

## Phase 3: Matching Engine

### 3.8 Matching APIs
- [ ] `POST /matching/preview` - dry run, return ranked candidates with scores
- [ ] `POST /matching/assign` - manually assign worker (admin)
- [ ] `GET /matching/:bookingId/candidates` - paginated candidates
- [ ] `GET /matching/:bookingId/recommendation` - top recommendation with reasons
- [ ] `POST /matching/:bookingId/reassign` - trigger re-match

### 3.9 Matching Algorithm Enhancements
- [ ] Fairness score (worker earnings variance, assignment distribution)
- [ ] Certification score (required vs held)
- [ ] Travel cost estimation
- [ ] ETA calculation (traffic API integration)
- [ ] Worker preference matching (preferred areas, excluded customers)
- [ ] Batch matching for efficiency

---

## Phase 3: Emergency Module

### 3.10 Emergency Schema
- [ ] Create `emergency_bookings` table (extends bookings):
  ```sql
  booking_id (FK), priority (critical/high/standard), radius_km, max_response_minutes, eta_minutes, escalation_level, escalated_at, duplicate_key, resolved_at
  ```

### 3.11 Emergency APIs
- [ ] `POST /emergency/bookings` - create emergency booking (bypass normal matching)
- [ ] `GET /emergency/active` - list active emergencies (admin/dispatch)
- [ ] `GET /emergency/:id` - emergency details with timeline
- [ ] `POST /emergency/:id/escalate` - escalate to wider radius/notify supervisors
- [ ] `POST /emergency/:id/resolve` - mark resolved
- [ ] `POST /emergency/:id/reassign` - force reassign

### 3.12 Emergency Logic
- [ ] Bounded radius search (configurable per service)
- [ ] ETA rules (max_response_minutes based on priority)
- [ ] Escalation timers (auto-escalate after N minutes)
- [ ] Duplicate prevention (same location + service within window)
- [ ] Priority queue for dispatchers

---

## Phase 4: Payments v2

### 4.1 Payment Schema Extensions
- [ ] Create `payment_orders` table:
  ```sql
  id, booking_id, customer_id, amount, currency, status, provider, provider_order_id, idempotency_key, expires_at, created_at
  ```
- [ ] Create `payment_transactions` table:
  ```sql
  id, payment_order_id, type (charge/refund/capture/void), amount, status, provider_transaction_id, raw_response, created_at
  ```
- [ ] Create `payment_refunds` table:
  ```sql
  id, payment_order_id, amount, reason, status, provider_refund_id, processed_at, created_at
  ```
- [ ] Create `webhook_events` table (extend existing):
  ```sql
  provider, event_id, event_type, payload, processed_at, attempts, last_error, created_at
  ```
- [ ] Create `payment_ledger` table (immutable):
  ```sql
  id, payment_order_id, entry_type (debit/credit/fee/refund), amount, balance_after, description, reference, created_at
  ```
- [ ] Create `settlements` table:
  ```sql
  id, cooperative_id, period_start, period_end, total_bookings, total_revenue, platform_fee, cooperative_share, worker_share, tax, status, processed_at, created_at
  ```

### 4.2 Payment APIs
- [ ] `POST /payments/orders` - create payment order (with idempotency)
- [ ] `POST /payments/:id/verify` - verify payment (server-side signature)
- [ ] `GET /payments/:id` - payment details
- [ ] `GET /payments` - list with filters
- [ ] `POST /payments/webhooks/:provider` - handle provider webhooks
- [ ] `POST /payments/:id/refund` - initiate refund
- [ ] `GET /payments/:id/refunds` - refund history
- [ ] `GET /payments/ledger` - immutable ledger (admin)
- [ ] `GET /payments/reconciliation` - reconciliation report (admin)

### 4.3 Payment Integrations
- [ ] Implement provider adapters (Razorpay, Stripe, PhonePe, UPI)
- [ ] Server-side signature verification for all providers
- [ ] Idempotent payment operations
- [ ] Automatic reconciliation job (daily)

---

## Phase 4: Settlements, Invoices & Earnings

### 4.4 Worker Earnings APIs
- [ ] `GET /workers/me/earnings` - paginated ledger
- [ ] `GET /workers/me/earnings/summary` - this week/month/year
- [ ] `GET /workers/me/earnings/ledger` - full ledger export
- [ ] `GET /workers/me/payouts` - payout history
- [ ] `POST /workers/me/payout-account` - add/update payout account

### 4.5 Settlement APIs
- [ ] `GET /admin/settlements` - list with filters
- [ ] `POST /admin/settlements/:id/process` - process settlement
- [ ] `GET /admin/settlements/:id` - settlement details
- [ ] Auto-generate settlements per cooperative (weekly/monthly)

### 4.6 Invoice Module
- [ ] Create `invoices` table:
  ```sql
  id, invoice_number, booking_id, customer_id, worker_id, service_id, subtotal, discount, tax, platform_fee, cooperative_share, worker_share, total, payment_status, issued_at, pdf_url
  ```
- [ ] `POST /invoices` - generate (auto on booking completion)
- [ ] `GET /invoices` - list
- [ ] `GET /invoices/:id` - details
- [ ] `GET /invoices/:id/pdf` - download PDF
- [ ] PDF generation with template (company info, GST, breakdown)

---

## Phase 5: Reviews, Disputes & Welfare

### 5.1 Reviews Enhancement
- [ ] `GET /workers/:id/reviews` - paginated
- [ ] `GET /workers/:id/rating-summary` - aggregate stats
- [ ] `PATCH /reviews/:id` - update (time-limited)
- [ ] `DELETE /reviews/:id` - delete (admin)
- [ ] `POST /reviews/:id/report` - report inappropriate

### 5.2 Disputes Module
- [ ] Create `disputes` table:
  ```sql
  id, booking_id, raised_by, type (quality/price/no_show/damage/other), status, description, resolution, resolved_by, resolved_at, created_at
  ```
- [ ] Create `dispute_messages`, `dispute_evidence`, `escalations` tables
- [ ] `POST /disputes` - raise dispute
- [ ] `GET /disputes` - list (party or admin)
- [ ] `POST /disputes/:id/messages` - add message
- [ ] `POST /disputes/:id/evidence` - add evidence
- [ ] `POST /disputes/:id/escalate` - escalate to admin
- [ ] `POST /disputes/:id/resolve` - admin resolves
- [ ] `POST /disputes/:id/refund` - process refund from dispute

### 5.3 Welfare Passport Enhancement
- [ ] Create `safety_incidents` table:
  ```sql
  id, worker_id, booking_id, type, severity, description, location, reported_at, status, investigated_by, investigated_at
  ```
- [ ] Create `benefits` table:
  ```sql
  id, name, description, eligibility_criteria, value, provider, status
  ```
- [ ] Create `benefit_eligibility` table:
  ```sql
  worker_id, benefit_id, eligible, determined_at, expires_at, metadata
  ```
- [ ] `GET /workers/me/welfare` - full welfare dashboard
- [ ] `PATCH /workers/me/welfare` - update preferences
- [ ] `GET /workers/:id/insurance` - list
- [ ] `POST /workers/:id/insurance` - add
- [ ] `GET /workers/:id/training` - list
- [ ] `POST /workers/:id/training` - add
- [ ] `GET /workers/:id/safety-incidents` - list
- [ ] `POST /workers/:id/safety-incidents` - report
- [ ] `GET /workers/:id/benefits` - eligible benefits
- [ ] `GET /workers/:id/eligibility` - eligibility check

---

## Phase 5: Institutional Customers & Recurring

### 5.4 Organizations Schema
- [ ] Create `organizations` table:
  ```sql
  id, name, type (school/apartment/office/government/ngo), registration_number, gst_number, address, contact_person, contact_email, contact_phone, billing_address, status, created_at
  ```
- [ ] Create `organization_members`:
  ```sql
  organization_id, user_id, role (admin/member/viewer), invited_by, joined_at
  ```
- [ ] Create `organization_addresses`:
  ```sql
  id, organization_id, name, address, latitude, longitude, is_default, instructions
  ```
- [ ] Create `service_contracts`:
  ```sql
  id, organization_id, service_id, variant_id, pricing_rule_id, start_date, end_date, status, terms
  ```
- [ ] Create `service_plans`:
  ```sql
  id, organization_id, name, services (JSON), frequency, preferred_days, preferred_time, status
  ```
- [ ] Create `purchase_orders`:
  ```sql
  id, organization_id, contract_id, po_number, amount, status, issued_at, valid_until
  ```

### 5.5 Organization APIs
- [ ] `POST /organizations` - create
- [ ] `GET /organizations` - list (admin)
- [ ] `GET /organizations/:id` - details
- [ ] `PATCH /organizations/:id` - update
- [ ] `POST /organizations/:id/members` - invite member
- [ ] `DELETE /organizations/:id/members/:userId` - remove member
- [ ] `POST /organizations/:id/bookings` - create booking on behalf
- [ ] `POST /organizations/:id/contracts` - create contract
- [ ] `GET /organizations/:id/bookings` - booking history
- [ ] `GET /organizations/:id/invoices` - invoice history

### 5.6 Recurring Bookings
- [ ] Create `recurring_bookings` table:
  ```sql
  id, organization_id, customer_id, service_id, variant_id, address_id, frequency (daily/weekly/monthly/custom), days_of_week, time_window_start, time_window_end, start_date, end_date, status, last_generated_at, next_generation_at
  ```
- [ ] `POST /recurring-bookings` - create
- [ ] `GET /recurring-bookings` - list
- [ ] `GET /recurring-bookings/:id` - details
- [ ] `PATCH /recurring-bookings/:id` - update
- [ ] `POST /recurring-bookings/:id/pause` - pause
- [ ] `POST /recurring-bookings/:id/resume` - resume
- [ ] `DELETE /recurring-bookings/:id` - cancel
- [ ] Background job: generate bookings from recurring schedules

---

## Phase 6: Notifications, Support & AI

### 6.1 Notifications Enhancement
- [ ] Create `notification_templates` table:
  ```sql
  id, key, channel (push/sms/email/in_app), subject, body_template, variables, locale
  ```
- [ ] Create `notification_preferences` table:
  ```sql
  user_id, channel, event_type, enabled
  ```
- [ ] Create `device_tokens` table:
  ```sql
  id, user_id, token, platform (ios/android/web), app_version, last_used_at
  ```
- [ ] Create `notification_deliveries` table (tracking)
- [ ] `GET /notifications` - paginated with filters
- [ ] `POST /notifications/:id/read` - mark read
- [ ] `POST /notifications/read-all` - mark all read
- [ ] `GET /notification-preferences` - get preferences
- [ ] `PATCH /notification-preferences` - update
- [ ] `POST /devices` - register device token
- [ ] `DELETE /devices/:id` - unregister

### 6.2 Support/Ticketing
- [ ] Create `support_tickets` table:
  ```sql
  id, ticket_number, user_id, category_id, subject, description, status, priority, assigned_to, created_at, updated_at, resolved_at
  ```
- [ ] Create `support_categories`, `ticket_messages`, `ticket_assignments` tables
- [ ] `POST /support/tickets` - create
- [ ] `GET /support/tickets` - list (user or admin)
- [ ] `GET /support/tickets/:id` - details with messages
- [ ] `POST /support/tickets/:id/messages` - add message
- [ ] `POST /support/tickets/:id/assign` - assign to agent
- [ ] `POST /support/tickets/:id/close` - close ticket

### 6.3 AI Module Enhancement
- [ ] `POST /ai/forecasts` - request forecast
- [ ] `GET /ai/forecasts` - list forecasts
- [ ] `POST /ai/allocation-recommendations` - request allocation
- [ ] `GET /ai/allocation-recommendations/:id` - details
- [ ] `POST /ai/recommendations/:id/approve` - admin approve
- [ ] `POST /ai/recommendations/:id/reject` - admin reject
- [ ] `GET /ai/model-health` - model metrics
- [ ] `GET /ai/model-metrics` - performance metrics
- [ ] Store forecast/allocation results in DB for audit
- [ ] Add model versioning

---

## Phase 6: Analytics

### 6.4 Analytics Materialized Views
- [ ] `mv_booking_stats` - daily/hourly booking counts by service, area, status
- [ ] `mv_worker_performance` - worker completion rate, rating, response time, earnings
- [ ] `mv_revenue` - daily revenue by service, cooperative, payment method
- [ ] `mv_customer_satisfaction` - rating trends, NPS proxy
- [ ] `mv_geography` - demand heatmap, worker coverage gaps
- [ ] `mv_welfare` - insurance coverage, training completion, incident rates
- [ ] `mv_fairness` - assignment distribution, earnings variance by cooperative
- [ ] Refresh schedule: hourly for operational, daily for strategic

### 6.5 Analytics APIs
- [ ] `GET /analytics/overview` - KPIs
- [ ] `GET /analytics/bookings` - with filters (period, service, area, status)
- [ ] `GET /analytics/workers` - utilization, performance
- [ ] `GET /analytics/revenue` - breakdown
- [ ] `GET /analytics/services` - popularity, profitability
- [ ] `GET /analytics/geography` - heatmaps, coverage
- [ ] `GET /analytics/customer-satisfaction` - ratings, complaints
- [ ] `GET /analytics/welfare` - coverage, incidents
- [ ] `GET /analytics/fairness` - distribution metrics
- [ ] Every response includes: `value`, `period`, `comparison`, `dataFreshness`, `calculationVersion`

---

## Phase 6: Admin Module

### 6.6 System Admin APIs
- [ ] `GET /admin/users` - paginated, filterable
- [ ] `PATCH /admin/users/:id/status` - activate/suspend/ban
- [ ] `GET /admin/roles` - list roles
- [ ] `POST /admin/roles` - create custom role
- [ ] `PATCH /admin/roles/:id` - update permissions
- [ ] `GET /admin/audit-events` - paginated, filterable
- [ ] `GET /admin/security-events` - security dashboard

### 6.7 Worker Verification Admin
- [ ] `GET /admin/verifications` - queue with filters
- [ ] `GET /admin/verifications/:id` - details with documents
- [ ] `POST /admin/verifications/:id/approve` - approve
- [ ] `POST /admin/verifications/:id/reject` - reject with reason
- [ ] `POST /admin/verifications/:id/suspend` - suspend

### 6.8 Operations Dashboard
- [ ] `GET /admin/operations/live` - real-time bookings map
- [ ] `GET /admin/operations/emergency` - active emergencies
- [ ] `GET /admin/operations/unassigned` - bookings without workers
- [ ] `GET /admin/operations/delayed` - bookings past SLA

---

## Phase 6: Reports & Exports

### 6.9 Reports
- [ ] `GET /reports/bookings` - booking report with filters
- [ ] `GET /reports/workers` - worker performance report
- [ ] `GET /reports/earnings` - earnings report
- [ ] `GET /reports/payments` - payment reconciliation
- [ ] `GET /reports/welfare` - welfare coverage
- [ ] `GET /reports/cooperative-performance` - cooperative KPIs

### 6.10 Exports
- [ ] Create `report_exports` table:
  ```sql
  id, report_type, filters, format (csv/xlsx/pdf), status, file_url, requested_by, created_at, completed_at
  ```
- [ ] `POST /reports/export` - queue export job
- [ ] `GET /reports/exports/:id` - download when ready
- [ ] Background worker for export generation
- [ ] Permission checks on export access
- [ ] Audit all exports

---

## Phase 7: Production Hardening

### 7.1 Testing
- [ ] Unit tests for all services (Jest)
- [ ] Integration tests for all routes (Supertest)
- [ ] Contract tests for AI service
- [ ] Load testing (k6) - target: 1000 RPS
- [ ] Security testing (OWASP ZAP, dependency audit)
- [ ] Chaos engineering (random failures)

### 7.2 Performance
- [ ] Query optimization (EXPLAIN ANALYZE)
- [ ] Add missing indexes
- [ ] Connection pooling tuning
- [ ] Caching strategy (Redis) for frequent reads
- [ ] Pagination optimization (keyset vs offset)
- [ ] Background job queue (BullMQ or pg-boss)

### 7.3 Security
- [ ] Rate limiting per endpoint (not just auth)
- [ ] CORS hardening
- [ ] CSP headers
- [ ] Input sanitization audit
- [ ] SQL injection review
- [ ] Secrets rotation procedure
- [ ] Penetration testing

### 7.4 Deployment
- [ ] Docker multi-stage builds
- [ ] Kubernetes manifests (Deployment, Service, Ingress, ConfigMap, Secret)
- [ ] Helm chart
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Database migration strategy
- [ ] Blue-green deployment
- [ ] Rollback procedures

### 7.5 Monitoring & Alerting
- [ ] Grafana dashboards
- [ ] Alert rules (error rate, latency, queue depth, DB connections)
- [ ] Log aggregation (Loki/ELK)
- [ ] Distributed tracing (Jaeger/Zipkin)
- [ ] SLO/SLI definitions

---

## Database Migrations Needed

### New Tables (30+)
1. `skills`
2. `worker_skills` (replacement)
3. `skill_verifications`
4. `document_types`
5. `worker_documents` (extend)
6. `document_reviews`
7. `certifications`
8. `service_categories`
9. `service_variants`
10. `service_areas`
11. `service_requirements`
12. `pricing_rules`
13. `surge_rules`
14. `travel_fees`
15. `tax_rules`
16. `payment_orders`
17. `payment_transactions`
18. `payment_refunds`
19. `webhook_events` (extend)
20. `payment_ledger`
21. `settlements`
22. `invoices`
23. `disputes`
24. `dispute_messages`
25. `dispute_evidence`
26. `escalations`
27. `safety_incidents`
28. `benefits`
29. `benefit_eligibility`
30. `organizations`
31. `organization_members`
32. `organization_addresses`
33. `service_contracts`
34. `service_plans`
35. `purchase_orders`
36. `recurring_bookings`
38. `notification_templates`
39. `notification_preferences`
40. `device_tokens`
41. `notification_deliveries`
42. `support_tickets`
43. `support_categories`
44. `ticket_messages`
45. `ticket_assignments`
46. `report_exports`
47. `security_events`
48. `emergency_bookings`
49. `user_preferences`
50. `materialized views` (7+)

### Schema Modifications
- `users`: add 7 columns
- `workers`: add 8 columns
- `bookings`: add 7 columns
- `cooperatives`: add 6 columns
- `federations`: add 4 columns
- `refresh_tokens`: add 2 columns

---

## Dependencies to Add

```json
{
  "dependencies": {
    "ioredis": "^5.x",
    "pino": "^9.x",
    "pino-pretty": "^11.x",
    "prom-client": "^15.x",
    "socket.io": "^4.x",
    "@socket.io/redis-adapter": "^8.x",
    "multer": "^1.x",
    "@aws-sdk/client-s3": "^3.x",
    "@aws-sdk/s3-request-presigner": "^3.x",
    "clamscan": "^1.x",
    "pdfkit": "^0.15.x",
    "bullmq": "^5.x",
    "zod": "^3.x",
    "passport": "^0.7.x",
    "passport-google-oauth20": "^2.x",
    "k6": "^0.52.x"
  },
  "devDependencies": {
    "@types/multer": "^1.x",
    "@types/passport": "^1.x",
    "@types/passport-google-oauth20": "^2.x",
    "@types/pdfkit": "^0.13.x",
    "jest": "^29.x",
    "supertest": "^7.x",
    "@types/supertest": "^6.x"
  }
}
```

---

## Implementation Order (Sequential)

1. **Core**: Logger → Redis → Metrics → Health → WebSocket → Storage → Errors
2. **Auth**: Logout-all → Sessions → Google OAuth → Security Events
3. **Users**: Profile APIs → Schema extensions
4. **Workers**: Public APIs → Schema extensions
5. **Cooperatives**: Full CRUD → Memberships
6. **Skills**: Catalog → Worker skills → Verification
7. **Documents**: Types → Upload → Review workflow → Expiry jobs
8. **Services**: Categories → Variants → Areas → Requirements
9. **Pricing**: Rules → Surge → Travel → Tax → Estimates
10. **Bookings**: Extended workflow → State machine → Timeline
11. **Matching**: Preview → Assign → Candidates → Reassign
12. **Emergency**: Bookings → Active → Escalate → Resolve
13. **Payments**: Orders → Webhooks → Verify → Refunds → Ledger → Reconciliation
14. **Settlements/Invoices**: Auto-generate → PDF → Process
15. **Earnings**: Worker APIs → Payout accounts
16. **Reviews/Disputes**: Full CRUD → Workflow
17. **Welfare**: Safety → Benefits → Eligibility
18. **Organizations**: CRUD → Members → Contracts → POs
19. **Recurring**: Schedules → Generation job
20. **Notifications**: Templates → Preferences → Devices → Deliveries
21. **Support**: Tickets → Messages → Assignment
22. **AI**: Forecasts → Allocations → Approval → Model health
23. **Analytics**: MVs → 9 endpoints
24. **Admin**: Users → Roles → Audit → Verification → Operations
25. **Reports/Exports**: 6 reports → Async exports
26. **Testing/Performance/Security/Deployment**

---

## Tracking

| Phase | Modules | Est. Days | Status |
|-------|---------|-----------|--------|
| 1 | Core + Auth | 5 | 🔄 In Progress |
| 2 | Users/Workers/Cooperatives/Skills/Docs | 7 | ⏳ Pending |
| 3 | Services/Pricing/Bookings/Matching/Emergency | 7 | ⏳ Pending |
| 4 | Payments/Settlements/Invoices/Earnings | 5 | ⏳ Pending |
| 5 | Reviews/Disputes/Welfare/Orgs/Recurring | 5 | ⏳ Pending |
| 6 | Notifications/Support/AI/Analytics/Admin/Reports | 7 | ⏳ Pending |
| 7 | Hardening/Testing/Deploy | 5 | ⏳ Pending |
| **Total** | **28 modules** | **~41 days** | |

---

> **Note**: This is a living document. Update status as tasks complete. Each task should result in: code + tests + migration + OpenAPI docs.