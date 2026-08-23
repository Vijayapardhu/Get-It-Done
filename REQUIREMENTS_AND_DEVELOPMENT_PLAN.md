# GET IT NOW

## Requirements and Development Plan

**Problem Statement:** 26089  
**Title:** Cooperative Gig Services Platform for Household and Community Services  
**Organization:** Ministry of Cooperation  
**Department:** National Council for Cooperative Training (NCCT)  
**Theme:** Smart Automation

## 1. Product Definition

GET IT NOW is a cooperative-owned service network, not only a worker booking app. It connects households, institutions, cooperative societies, and federations with verified workers while making trust, fair opportunity, welfare, and local operational intelligence visible.

### Product promise

- Customers get a trusted, nearby, fairly priced service with clear accountability.
- Workers get verified profiles, transparent job allocation, reliable earnings records, and welfare visibility.
- Societies get tools to operate their local workforce.
- Federations get cross-society demand intelligence and policy controls.

## 2. Differentiating Capabilities

These capabilities make the solution distinctive without making the first release unbuildable:

1. **Cooperative trust graph:** Every worker has verified skills, documents, cooperative membership, service history, training, and verification events. Customers see trust signals without seeing sensitive documents.
2. **Fair-match engine:** Matching balances skill, distance, urgency, availability, certification, rating, workload, travel cost, and fair opportunity. Every recommendation returns human-readable reasons and an audit record.
3. **Worker welfare passport:** A private worker view tracks insurance, training, earnings, completed jobs, safety incidents, and benefit eligibility. Welfare gaps become actionable admin tasks.
4. **Cooperative control tower:** Society and federation dashboards show demand, response time, unassigned work, worker utilization, welfare gaps, disputes, and service quality by locality.
5. **Emergency response mode:** Emergency jobs use a bounded radius, availability and ETA rules, escalation timers, duplicate-request prevention, and an operations timeline.
6. **Low-connectivity workflow:** Worker actions are designed for intermittent networks with queued status updates, retry-safe APIs, compact screens, and explicit sync state.
7. **Institutional service plans:** Schools, apartments, offices, and public institutions can create recurring or bulk requests with service-level targets and one invoice trail.
8. **AI with human approval:** Forecasts explain expected demand, confidence, drivers, and shortages. AI recommends staffing actions; authorized administrators approve or reject them. AI never silently changes worker assignments or pay.
9. **Multilingual and accessible by design:** English, Hindi, and Telugu first, with server-managed translation keys, locale-aware notifications, readable contrast, voice-friendly labels, and low-literacy booking flows.

## 3. Users and Permissions

| Role | Primary responsibilities | Scope |
| --- | --- | --- |
| Customer | Discover, book, pay, track, review, raise complaints | Own account and bookings |
| Worker | Maintain profile, availability, jobs, status, earnings, welfare | Own profile and assigned jobs |
| Society admin | Verify workers, manage local services, resolve operations | Assigned society |
| Federation admin | Manage societies, policies, analytics, allocation approvals | Federation |
| Support staff | Handle complaints, refunds, safety escalations | Assigned support queue |
| System admin | Platform configuration, security, audit, access management | Whole platform |
| Institutional customer | Create recurring and bulk service requests | Organization account |

Every API must enforce both role and resource ownership. A role alone is not sufficient authorization.

## 4. Functional Requirements

### 4.1 Identity and access

- Register and sign in by verified phone OTP; support email/password for approved administrative and institutional users.
- Issue short-lived access tokens and rotating refresh tokens.
- Support logout, refresh-token revocation, account suspension, and current-user lookup.
- Support Google sign-in only when production credentials are configured; do not use placeholder OAuth credentials in production.
- Enforce role-based and scope-based authorization.
- Record security events: login success/failure, OTP requests, token reuse, password reset, role changes, document decisions, and account suspension.
- Do not reveal whether an email or phone is registered in recovery responses.

### 4.2 Worker and cooperative operations

- Worker onboarding with identity, contact, address, cooperative, skills, experience, certifications, service areas, availability, and payout profile.
- Document upload to private object storage with malware scanning, type/size validation, expiry tracking, and review history.
- Verification states: `draft`, `submitted`, `under_review`, `verified`, `rejected`, `suspended`, `expired`.
- Cooperative membership and society/federation scope management.
- Availability, location sharing consent, location freshness, and low-network sync state.
- Earnings ledger, welfare records, training, insurance status, and safety escalation.

### 4.3 Services and bookings

- Browse localized service categories, pricing rules, emergency eligibility, and service areas.
- Create immediate, scheduled, emergency, recurring, and institutional bookings.
- Show an estimated price range and its inputs before confirmation.
- Match only eligible, verified, available workers within a configured radius.
- Allow worker accept/reject, customer cancellation, rescheduling, reassignment, and operations escalation.
- Use a server-controlled booking state machine:
  `requested -> matching -> assigned -> accepted -> en_route -> started -> completed`.
- Terminal states are `cancelled`, `expired`, `disputed`, and `refunded` where applicable.
- Store every transition with actor, timestamp, reason, request id, and source.
- Prevent invalid transitions and duplicate acceptance.

### 4.4 Payments, invoicing, and reviews

- Create payment orders server-side and verify provider signatures server-side.
- Make order creation, webhook processing, refunds, and status updates idempotent.
- Never store card or UPI credentials; store provider references and an immutable payment ledger.
- Generate invoices with booking, tax, platform/cooperative share, worker share, discounts, and payment status.
- Permit ratings only after an eligible completed booking; prevent duplicate reviews and abusive manipulation.
- Provide complaint, dispute, refund, and escalation workflows.

### 4.5 Intelligence and administration

- Live operations board for open, emergency, delayed, and unassigned jobs.
- Demand forecast by service, geography, date, time window, and confidence interval.
- Workforce allocation recommendations with explanation, constraints, fairness impact, and approval status.
- Dashboard metrics must define their calculation window and data freshness.
- Export reports with authorization, audit logging, and privacy-safe aggregation.

## 5. Non-Functional Requirements

### Security and privacy

- TLS in every non-local environment; secure headers, strict CORS allowlist, request size limits, and structured input validation.
- Argon2id preferred for passwords; bcrypt is acceptable for the MVP with a documented cost factor and migration path.
- OTPs are random, single-use, short-lived, rate-limited, and stored hashed. The fixed demo OTP must be disabled outside local development.
- Access tokens expire quickly. Refresh tokens are opaque, hashed at rest, rotated on use, device-scoped, and revocable.
- Secrets come from environment or a secret manager, never source control or logs.
- Encrypt sensitive data in transit and at rest; minimize collected personal data and define retention/deletion rules.
- Protect against brute force, enumeration, replay, injection, broken object-level authorization, SSRF, unsafe uploads, and webhook forgery.
- Use append-only audit events for security, payments, permissions, verification, and AI approvals.
- Run dependency, secret, static analysis, and container vulnerability scans in CI.

### Reliability and performance

- API p95 target: under 500 ms for normal reads, excluding external providers.
- Booking and payment writes must be idempotent and transactionally consistent.
- PostgreSQL is the source of truth; Redis is a cache/coordination layer and must be rebuildable.
- Use database constraints, foreign keys, indexes, migrations, backups, restore drills, and connection-pool limits.
- Use timeouts, retries with jitter, circuit breakers, and dead-letter handling for external services.
- Target 99.5% monthly availability for the MVP backend.
- Define RPO of 15 minutes and RTO of 2 hours for the first production release.
- Provide health, readiness, metrics, centralized logs, traces, alerting, and correlation/request IDs.
- Do not log OTPs, passwords, access tokens, payment secrets, or private documents.

### Accessibility and usability

- Mobile-first flows, clear status feedback, localization, accessible color contrast, large touch targets, and graceful empty/error/offline states.
- All important actions must be possible without relying on color alone.
- Provide user-visible consent controls for location, notifications, documents, and data sharing.

## 6. Recommended Architecture

Use a modular monolith for the transactional backend and a separately deployable AI service:

```text
Flutter customer app        Flutter worker app
          \                  /
           Next.js admin and institution portal
                         |
              API gateway / Express backend
       auth | users | workers | bookings | payments
       matching | reviews | welfare | notifications | admin
          |             |                 |
   PostgreSQL/PostGIS   Redis       Object storage
                         |
                   Python AI service
```

Keep module boundaries explicit. Use PostgreSQL transactions for booking, payment, and ledger operations. Use an outbox table for reliable events and notifications instead of making a booking depend on a live notification provider.

## 7. Core Data Model Additions

The current schema is a useful start, but production auth and reliability require at least:

- `users`: normalized phone/email, status, locale, last login, timestamps.
- `credentials`: user id, password hash, provider, provider subject, verification state.
- `otp_challenges`: destination hash, purpose, code hash, attempts, expiry, consumed time, request metadata.
- `refresh_tokens`: token hash, user id, device id, expiry, rotated/revoked timestamps, predecessor id.
- `sessions` or device records: device, platform, last seen, revoke state.
- `roles`, `permissions`, `user_scopes`: explicit authorization rather than role string checks alone.
- `audit_events`: actor, action, resource, before/after summary, request id, IP/device metadata.
- `booking_status_events`: immutable transition history with reason and actor.
- `idempotency_keys`: user, endpoint, key, request hash, response, expiry.
- `payment_ledger`, `webhook_events`, `outbox_events`: financial and integration consistency.
- `welfare_records`, `training_records`, `insurance_records`, and document review history.

Use UUIDs, UTC timestamps, unique constraints on normalized identifiers, check constraints for statuses, and PostGIS indexes for location queries.

## 8. API and Integration Standards

- Version public APIs under `/api/v1`.
- Validate every request and response with shared schemas.
- Return stable error codes, safe messages, request IDs, and field-level validation details.
- Require `Idempotency-Key` for booking creation, payment creation, refunds, and other non-repeatable writes.
- Require bearer authentication on protected endpoints and enforce ownership/scope checks.
- Use signed webhooks with timestamp tolerance and replay protection.
- Use Socket.IO only for timely hints; clients must reconcile with REST state after reconnect.
- External dependencies: payment provider, maps/geocoding, FCM, object storage, and AI service all need timeout and fallback behavior.

Initial API groups:

- `/api/v1/auth`: OTP, registration, login, refresh, logout, password recovery, OAuth, me.
- `/api/v1/users` and `/api/v1/workers`: profiles, verification, documents, availability, location, welfare.
- `/api/v1/services`: categories, service areas, pricing rules.
- `/api/v1/bookings`: create, list, detail, transition, cancel, reschedule, dispute.
- `/api/v1/payments`: order, verify, webhook, invoice, refund.
- `/api/v1/admin`: verification queues, operations, policies, reports, AI approvals.
- `/api/v1/ai`: forecast and allocation recommendation requests.

## 9. Delivery Roadmap

### Phase 0: Discovery and acceptance (2-3 days)

- Confirm pilot geography, languages, service categories, cooperative hierarchy, identity requirements, pricing, commission, cancellation, refunds, and welfare rules.
- Define personas, user journeys, threat model, data classification, API conventions, and success metrics.
- Produce clickable flows for customer booking, worker onboarding, admin verification, and emergency response.

### Phase 1: Secure platform foundation (1 week)

- Normalize configuration and secrets.
- Complete migrations and seed data.
- Implement validation, error format, request IDs, structured logging, health/readiness, and CI quality gates.
- Implement complete auth: registration, OTP challenge lifecycle, password login, access/refresh tokens, logout/revocation, `/me`, OAuth configuration, and authorization middleware.
- Add auth integration tests and security rate-limit tests.

### Phase 2: Cooperative workforce (1 week)

- Worker onboarding, document review, skills/certifications, cooperative scope, availability, location consent, welfare records, and admin queues.
- Add private file storage and audit history.

### Phase 3: Trustworthy booking core (1-2 weeks)

- Services, pricing estimates, booking state machine, PostGIS matching, fair-match explanations, reassignment, cancellation, emergency escalation, and realtime updates.
- Add concurrency, idempotency, and ownership tests.

### Phase 4: Money and trust (1 week)

- Payment provider sandbox, signed webhooks, payment ledger, invoices, refunds, reviews, complaints, and support workflows.
- Add reconciliation and failure-recovery tests.

### Phase 5: Cooperative intelligence (1 week)

- Operations dashboard, federation rollups, demand forecasts, shortage detection, allocation recommendations, approval workflow, and AI quality monitoring.
- Show confidence and explanation, never only a prediction number.

### Phase 6: Mobile, offline, and multilingual polish (1-2 weeks)

- Customer and worker mobile flows, localization, offline queue/retry, notification preferences, accessibility, and field testing on slow networks.

### Phase 7: Hardening and pilot (1 week)

- Load, mobile, security, backup-restore, disaster-recovery, accessibility, and penetration testing.
- Run a controlled pilot with one society and a small verified workforce before federation rollout.
- Prepare operational runbooks, incident response, support escalation, and demo data.

## 10. MVP Exit Criteria

The MVP is ready for a controlled pilot when:

- A customer can authenticate, book a service, receive a fair-match explanation, track status, pay in sandbox, receive an invoice, and review a completed job.
- A worker can complete onboarding, receive verification, set availability, accept a job, work through the state machine, and view earnings/welfare status.
- A society admin can verify workers, monitor emergency jobs, resolve a complaint, and inspect audit history.
- A federation admin can compare demand and capacity across societies and approve an AI allocation recommendation.
- Invalid role access, cross-user resource access, duplicate writes, replayed webhooks, expired tokens, OTP abuse, and invalid booking transitions are rejected and tested.
- Backup restore is demonstrated, logs and alerts are visible, and no sensitive credentials appear in logs or client responses.

## 11. Success Metrics

Track these from the pilot:

- Verified worker activation rate.
- Booking completion rate and median time to assignment.
- Emergency response time and cancellation rate.
- Worker earnings per active hour and job distribution fairness.
- Repeat customer rate, rating quality, complaint resolution time.
- Forecast error by service and locality.
- Notification delivery and offline sync success rate.
- Authentication failure, abuse, and account recovery rates.
- API availability, p95 latency, error rate, and restore-test results.

## 12. Decisions Required Before Build

1. Pilot state/district and first three service categories.
2. Whether phone OTP is the primary identity method and which SMS provider will be used.
3. Required worker identity, police verification, certification, and insurance evidence.
4. Pricing, taxes, cooperative share, worker payout, cancellation, refund, and dispute rules.
5. Payment provider and settlement timeline.
6. Exact society/federation hierarchy and admin approval boundaries.
7. Location precision, consent, retention, and worker safety policy.
8. Language launch set and translation ownership.
9. Data hosting region, retention period, incident response owner, and backup policy.
10. Pilot success thresholds and who can approve AI recommendations.
