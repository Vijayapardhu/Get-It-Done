# GET IT DONE — Training & Certification

The skilling module, and how it integrates with the worker app, matching, the
welfare fund and the AI forecast.

Companion to `WORKER_APP_PLAN.md`. Same rule: written against the code that
exists, not the blueprint.

---

## 0. Why this is not a side feature

From `srs.txt`, line 11:

> **Organization:** Ministry of Cooperation
> **Department:** National Council for Cooperative Training (NCCT)

The sponsoring department's name is *Training*. It is the whole mandate.

Here is what the platform does about training today, in full:

```sql
create table worker_training_records (
  worker_id   uuid,
  course_name text,        -- free text
  provider    text,        -- free text
  completed_on date,
  expires_on   date,
  status      text
);
```

A worker POSTs to `/welfare/workers/me/training` and types whatever they like.
Nothing verifies it. Nothing is issued. Nothing expires on its own. And then
`routes/reports.ts` counts those self-typed rows as `trained_workers` in the
cooperative welfare report, and `federationDashboard.ts` aggregates them
upward — so an unverified free-text field is currently being reported to the
federation as a training statistic.

That is the gap. Everything below is how to close it.

---

## 1. What exists today

| Thing | Where | State |
|---|---|---|
| `worker_training_records` | `schema.sql:265` | Self-declared free text. No verification, no issuer, no link to anything. |
| `welfare_records.training_status` | `schema.sql:257` | A single string per worker: `not_started` and nothing that sets it otherwise. |
| `certifications` | `migration_phase1_2.sql:160` | worker + skill + document + expiry. Populated by hand from an uploaded file. No exam behind it. |
| `skills.requires_certification` | `migration_phase1_2.sql:95` | Column exists. **Read by nothing.** |
| `worker_skills_new.level` | `migration_phase1_2.sql:104` | beginner / intermediate / expert / master. Set by the worker, verified by an admin toggle. |
| `welfare_contributions` | `migration_phase11_financials.sql:33` | 2% of every job, accrued per booking, attached to settlements. **Never spent on anything.** |
| `POST /welfare/workers/me/training` | `routes/welfare.ts:214` | The self-declare endpoint. |
| `GET /welfare/workers/me/training` | `routes/welfare.ts:94` | List + status counts. |
| `ai/main.py` | — | Forecasts demand and worker shortage by area and service. Has no idea training exists. |
| Web admin | `web/src/pages/` | Empty directory. The training admin is greenfield. |
| `roles` | `migration_roles.sql:32` | customer, worker, institutional_customer, society_admin, federation_admin, support_staff, system_admin. **No trainer.** |

---

## 2. The six things that are wrong

### 2.1 🔴 Training is self-declared and reported as fact

A worker types "Advanced Plumbing — XYZ Institute" and the federation dashboard
counts them as trained. There is no issuer, no assessment, no document, no
expiry enforcement. The one statistic the sponsoring department cares most about
is the least trustworthy number in the database.

### 2.2 🔴 Training pays the worker nothing, so nobody will do it

This is the one that decides whether the module lives or dies.

`services/matching.ts:44`:

```ts
const certificationScore = candidate.hasCertification ? 1 : 0.55;
```

and `hasCertification` resolves to `worker_skills_new.verified = true` — an
admin flag. Certification is **15% of the match score** (10% on emergencies),
and completing every course NCCT offers moves it by exactly zero. Training costs
a worker two unpaid days and returns nothing measurable. Of course the table is
empty.

Nothing else pays either: `services.price_per_minute` is flat per service, so a
certified plumber and an uncertified one earn the same rate for the same job.

### 2.3 🟠 The welfare fund collects for training and never spends it

2% of the net of every booking lands in `welfare_contributions`, auditable per
booking, attached to a settlement. The SRS describes the fund as *"insurance &
training escrow"*. The insurance half has records. The training half has no
budget, no allocation, no disbursement, and no way for a worker to be told
"this course was paid for out of the fund your own jobs contributed to".

### 2.4 🟠 There is no catalogue, no batch, no trainer, no assessment

No courses table. No cohorts, venues, seats or schedules. No trainer role in
`roles`. No exam, no score, no assessor, no certificate number, no verification
code. `certifications` rows are typed in by an admin looking at a PDF.

### 2.5 🟠 Nothing is NSQF-aligned, so nothing is portable

Under the Ministry of Cooperation, a certificate that is not aligned to the
**National Skills Qualifications Framework** and registered on the **National
Qualification Register** is a picture. A worker who leaves the platform takes
nothing with them, and no other employer can read it.

The trades this platform serves have real qualification packs already:

| Trade | QP code | NSQF level | Awarding body |
|---|---|---|---|
| General Housekeeper (household & small establishment) | `DWC/Q0102` | 2 | Domestic Workers SSC |
| Caregiver (mother and newborn) | `DWC/Q0203` | 3 | Domestic Workers SSC |
| Plumber — General | `PSC/Q0104` | 4 | Water Management & Plumbing SC |

Codes and levels are versioned; take the current ones from
[nqr.gov.in](https://nqr.gov.in/) at build time rather than hard-coding these.

### 2.6 🟡 The AI forecast and the training module never meet

`ai/main.py` already predicts, per area and service, expected requests,
available workers and **predicted shortage**. Nothing turns *"Kukatpally will be
twelve electricians short in March"* into *"enrol these twelve workers on this
course in January"*. `srs.txt:1038` files "Worker training recommendations"
under **Future Enhancements** — but it is not a new capability, it is one join
between two modules that both already exist.

---

## 3. The model: three tracks, not one table

Conflating these is why the current design is a single free-text row. They have
different lengths, different funders, different consequences and different
failure modes.

| | **Compliance** | **Skill certification** | **RPL** |
|---|---|---|---|
| Example | Safety at the customer's home, POSH, conduct, first aid | Plumber — General, NSQF 4 | Certify twenty years of plumbing already done |
| Length | 1–3 hours | 40–200 hours | One assessment |
| Delivery | In-app, self-paced, offline-capable | Blended: in-app theory + classroom practical | No course — assessment only |
| Ends in | An internal pass, valid 12–24 months | An NCVET-recognised NSQF certificate | The same NSQF certificate |
| Funded by | Platform (cost of doing business) | Welfare fund / cooperative / scheme | Welfare fund |
| If missing | **Cannot be matched at all** | Cannot take certain services; lower match score; lower rate | Nothing — but the worker stays invisible on paper |

**RPL is the one to lead with.** Recognition of Prior Learning exists precisely
for people who have the skill and none of the paper, which describes most
cooperative workers. And this platform holds a better RPL evidence file than any
candidate could assemble on their own: OTP-verified attendance on every job,
completed job counts per service, before/after photographs, customer ratings,
complaint history, years active. §7.

---

## 4. Schema

New tables. Everything follows the existing conventions — uuid PKs, `timestamptz`,
check constraints on enums, cooperative scoping.

```sql
-- ── Catalogue ────────────────────────────────────────────────────────────────
create table training_courses (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,             -- internal, human-readable
  title             text not null,
  summary           text,
  track             text not null check (track in ('compliance','skill','rpl')),
  mode              text not null check (mode in ('self_paced','classroom','blended','assessment_only')),
  skill_id          uuid references skills(id) on delete set null,

  -- NSQF alignment. Null for internal compliance courses, which are ours and
  -- are not claimed to be anything else.
  qp_code           text,
  nsqf_level        numeric(3,1) check (nsqf_level between 1 and 8),
  awarding_body     text,
  assessment_agency text,

  duration_hours    numeric(6,1) not null check (duration_hours > 0),
  validity_months   int check (validity_months > 0),  -- null = does not expire
  fee               numeric(10,2) not null default 0,
  welfare_funded    boolean not null default false,
  languages         text[] not null default '{en}',
  status            text not null default 'draft' check (status in ('draft','active','retired')),
  created_at        timestamptz not null default now()
);

create table course_modules (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references training_courses(id) on delete cascade,
  position       int not null,
  title          text not null,
  media_kind     text not null check (media_kind in ('video','audio','pdf','text')),
  file_id        uuid references uploaded_files(id) on delete set null,
  duration_seconds int,
  downloadable   boolean not null default true,       -- see §6.3
  unique (course_id, position)
);

-- ── Delivery ─────────────────────────────────────────────────────────────────
create table training_batches (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references training_courses(id),
  cooperative_id uuid references cooperatives(id) on delete set null,
  trainer_id     uuid references users(id),
  language       text not null default 'te',
  venue_address  text,
  venue_location geography(point,4326),
  starts_on      date not null,
  ends_on        date not null,
  seats_total    int not null check (seats_total > 0),
  status         text not null default 'open'
                 check (status in ('open','full','running','completed','cancelled')),
  created_at     timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table batch_sessions (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references training_batches(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  topic      text,
  check (ends_at > starts_at)
);

-- ── Enrolment ────────────────────────────────────────────────────────────────
create table training_enrolments (
  id             uuid primary key default gen_random_uuid(),
  worker_id      uuid not null references workers(id) on delete cascade,
  course_id      uuid not null references training_courses(id),
  batch_id       uuid references training_batches(id) on delete set null,
  status         text not null default 'applied'
                 check (status in ('applied','approved','waitlisted','in_progress',
                                   'completed','failed','dropped','expired')),
  funding_source text not null default 'self'
                 check (funding_source in ('self','welfare_fund','cooperative','scheme')),
  fee_paid       numeric(10,2) not null default 0,
  budget_draw_id uuid,                                -- -> training_budget_draws
  enrolled_at    timestamptz not null default now(),
  started_at     timestamptz,
  completed_at   timestamptz,
  -- one live enrolment per worker per course; retakes get a new row after the
  -- previous one reaches a terminal status
  unique (worker_id, course_id, enrolled_at)
);

create table module_progress (
  enrolment_id    uuid not null references training_enrolments(id) on delete cascade,
  module_id       uuid not null references course_modules(id) on delete cascade,
  seconds_watched int not null default 0,
  completed_at    timestamptz,
  synced_at       timestamptz not null default now(),  -- written offline, §6.3
  primary key (enrolment_id, module_id)
);

create table batch_attendance (
  id           uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references training_enrolments(id) on delete cascade,
  session_id   uuid not null references batch_sessions(id) on delete cascade,
  method       text not null check (method in ('qr','geo','trainer','otp')),
  marked_by    uuid references users(id),
  location     geography(point,4326),
  marked_at    timestamptz not null default now(),
  unique (enrolment_id, session_id)
);

-- ── Assessment & credential ──────────────────────────────────────────────────
create table assessments (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references training_courses(id) on delete cascade,
  kind         text not null check (kind in ('mcq','practical','viva')),
  pass_mark    numeric(5,2) not null check (pass_mark between 0 and 100),
  max_attempts int not null default 3,
  agency       text                                    -- NCVET assessment agency
);

create table assessment_attempts (
  id            uuid primary key default gen_random_uuid(),
  enrolment_id  uuid not null references training_enrolments(id) on delete cascade,
  assessment_id uuid not null references assessments(id),
  score         numeric(5,2),
  result        text check (result in ('pass','fail','absent')),
  assessed_by   uuid references users(id),
  evidence_file_id uuid references uploaded_files(id) on delete set null,
  attempted_at  timestamptz not null default now()
);

create table training_certificates (
  id                 uuid primary key default gen_random_uuid(),
  enrolment_id       uuid not null references training_enrolments(id) on delete cascade,
  worker_id          uuid not null references workers(id) on delete cascade,
  skill_id           uuid references skills(id) on delete set null,
  certificate_number text not null unique,
  verification_code  text not null unique,             -- public /verify/:code
  qp_code            text,
  nsqf_level         numeric(3,1),
  awarding_body      text,
  issued_on          date not null,
  expires_on         date,
  pdf_file_id        uuid references uploaded_files(id) on delete set null,
  external_ref       text,                             -- SIDH / DigiLocker id, §8
  status             text not null default 'active'
                     check (status in ('active','expired','revoked')),
  created_at         timestamptz not null default now()
);
create index training_certificates_worker_idx on training_certificates (worker_id, status);

-- ── Money ────────────────────────────────────────────────────────────────────
create table training_budgets (
  id             uuid primary key default gen_random_uuid(),
  cooperative_id uuid not null references cooperatives(id) on delete cascade,
  period_start   date not null,
  period_end     date not null,
  allocated      numeric(12,2) not null default 0,     -- from the welfare fund
  created_at     timestamptz not null default now(),
  unique (cooperative_id, period_start)
);

create table training_budget_draws (
  id           uuid primary key default gen_random_uuid(),
  budget_id    uuid not null references training_budgets(id) on delete cascade,
  enrolment_id uuid not null references training_enrolments(id) on delete cascade,
  amount       numeric(10,2) not null check (amount >= 0),
  created_at   timestamptz not null default now(),
  unique (enrolment_id)                                -- one draw per enrolment
);

-- ── Recommendations ──────────────────────────────────────────────────────────
create table training_recommendations (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references workers(id) on delete cascade,
  course_id    uuid not null references training_courses(id) on delete cascade,
  source       text not null check (source in ('demand_forecast','skill_gap',
                                               'expiry','rating','compliance')),
  reason       text not null,                          -- shown to the worker
  score        numeric(5,2) not null,
  created_at   timestamptz not null default now(),
  dismissed_at timestamptz,
  unique (worker_id, course_id, source)
);
```

**Migrating what is there.** `worker_training_records` is not dropped — it holds
real history that a worker typed in good faith. Add
`source text not null default 'self_declared'` and keep it as a log. Then change
every report and dashboard to count `training_certificates` instead, so a
self-typed row is never again reported to the federation as a trained worker.

**New role.** Add `trainer` to `roles`, scoped to a cooperative through
`admin_scopes`. A trainer can see their own batches, mark attendance, record a
practical result and upload session evidence. A trainer must **not** see worker
earnings, personal documents or customer contact details.

---

## 5. Making training pay

Nothing else in this plan matters if a worker cannot answer "what do I get".
Four levers, and every one of them has a hook already sitting in the code.

### 5.1 Matching — make certification real

Replace the boolean with a graded score derived from actual credentials:

```ts
// services/matching.ts — replaces `candidate.hasCertification ? 1 : 0.55`
function certificationScore(c: MatchingCandidate): number {
  if (!c.certifiedForSkill) return 0.55;             // unchanged baseline
  const byLevel = { 2: 0.75, 3: 0.85, 4: 0.95, 5: 1.0 };   // NSQF
  const base = byLevel[Math.floor(c.nsqfLevel)] ?? 0.8;
  return c.certificationExpiringSoon ? base - 0.1 : base;   // < 60 days
}
```

Certification is already weighted at 15%. This is a scoring change, not an
architecture change — and it is the moment training starts producing jobs.

Add the reason string too. `scoreCandidate` already returns human-readable
`reasons`; `"NSQF level 4 certified plumber"` belongs in that list, and the
customer should see it.

### 5.2 Access — enforce `requires_certification`

The column exists on `skills` and is read by nothing. Some work should simply
not be dispatched to an uncertified worker: anything electrical, anything
involving gas, childcare, eldercare. Add the filter to `findMatchingWorkers`,
and surface it in the worker app as *"Certify to unlock 6 more services"* with
the list.

### 5.3 Rate — a certified worker earns more per minute

Since phase 17 the customer buys **minutes** at `services.price_per_minute`. Add
a multiplier on the worker's side of the split, funded by a modest premium the
customer pays for a certified worker:

```sql
alter table services add column if not exists certified_rate_multiplier
  numeric(4,2) not null default 1.00 check (certified_rate_multiplier between 1 and 2);
```

Applied at quote time when a certified worker is assigned, and shown in the
offer's payout figure (worker-app gap 4.3). The customer app already has a place
to explain it: the worker card carries trust signals today.

Keep it modest — 1.10–1.20. The point is that the uplift is *visible and
attributable*, not that it is large.

### 5.4 Money — close the welfare loop

The fund already collects. Give it somewhere to go:

1. A scheduled job allocates a share of each cooperative's unspent
   `welfare_contributions` into a `training_budgets` row per period.
2. An enrolment with `funding_source = 'welfare_fund'` writes a
   `training_budget_draws` row inside the same transaction that approves it, or
   fails if the budget is exhausted. Same idempotency discipline as
   `settleBooking`.
3. The worker is told, in plain words: *"This course cost ₹4,500. It was paid
   from the welfare fund. ₹380 of that fund came from your own jobs this year."*

That sentence is the cooperative difference made concrete, and it is computable
today from `welfare_contributions` filtered by `worker_id`.

---

## 6. The worker app

Training is **episodic**, not daily. It does not get a fourth bottom-nav tab —
`WORKER_APP_PLAN.md` §3.1 argues against a fourth destination and that argument
does not change here. It earns a card on **Today** only when there is something
to act on, and otherwise lives as a section under the profile.

### 6.1 Where it surfaces

| Surface | When |
|---|---|
| Card on **Today** | A recommended course with a stated payoff · a certificate expiring in under 60 days · a classroom session tomorrow · a compliance course overdue |
| **Welfare passport** (screen 32) | Always — certificates and history live here |
| **Skills** (screen 29) | Each skill shows its NSQF level and what the next level unlocks |
| **Job offer** (screen 10) | Nothing. Never interrupt the offer with a course. |

### 6.2 New screens — area H

Eleven screens, taking the worker app from 39 to **50**.

| # | Screen | Notes |
|---|---|---|
| 40 | **Training home** | In-progress course, my certificates, recommended, expiring. The section root. |
| 41 | **Course catalogue** | Filtered to my trades first. Every row states the payoff, not the syllabus. |
| 42 | **Course detail** | Hours, fee, who funds it, NSQF level, QP code, what it unlocks — services, match uplift, rate multiplier. |
| 43 | **Batch picker** | Dates, venue on a map with distance from home, seats left, language of instruction. |
| 44 | **Enrol & funding** | Self / welfare fund / cooperative, with the "₹380 of this came from your own jobs" line. |
| 45 | **Lesson player** | Video or audio, resumable, **downloadable**. Telugu default. §6.3. |
| 46 | **Session check-in** | QR at the venue, or a geofenced check-in. Attendance is a certification requirement, so it has to be hard to fake. |
| 47 | **Assessment** | MCQ in-app; a practical is scheduled and marked by an assessor. |
| 48 | **Certificate** | Certificate number, verification code, QR, NSQF level, share and save. |
| 49 | **RPL portfolio** | "340 plumbing jobs at 4.6 stars. Get certified for what you already do." §7. |
| 50 | **Skill passport** | NSQF level per skill, progress to the next, and what each level unlocks. |

### 6.3 Content on a worker's actual phone

The audience is on 2G/3G, cheap Android, limited storage, and pays for data.
This is the constraint that decides the whole delivery design:

- **Audio-first, video-optional.** A 40-hour course as video is ~2GB. The same
  course as narrated audio plus stills is under 150MB. Ship audio as the
  default track and video as an opt-in download on Wi-Fi.
- **Download the batch, not the stream.** Lessons download whole, on Wi-Fi, and
  play offline. Streaming a lesson on a metered connection is not a feature this
  audience wants.
- **Progress is written locally first** and drained through the same
  `sqflite` action queue as job transitions (`WORKER_APP_PLAN.md` §7.3).
  `module_progress.synced_at` exists for exactly this.
- **Telugu is the default**, not a setting. `languages` on the course and
  `language` on the batch both exist so a worker is never enrolled into a
  classroom taught in a language they do not speak.
- **Content production is the real cost of this module**, and no plan should
  pretend otherwise. Twenty trades × Telugu narration × assessment banks is a
  months-long editorial job, not an engineering one. Start with **two** trades
  and the compliance track, and prove the loop pays before commissioning more.

---

## 7. RPL — the part worth building first

Most cooperative workers have the skill and none of the paper. Recognition of
Prior Learning exists for exactly them: an assessment against an NSQF
qualification with no course attached, on the strength of an evidence portfolio.

The usual difficulty with RPL is assembling that portfolio. This platform has
already been assembling it, per worker, since the day it launched:

- OTP-verified attendance on every job — `booking_status_events`,
  `verify-start` and `verify-complete` timestamps
- Completed job counts per service, with dates
- Before/after photographs — `booking_attachments`
- Customer ratings and written reviews — `reviews`
- Complaint and safety-incident history — `complaints`, `safety_incidents`
- Years active, cooperative membership, verified identity documents

**Build `GET /workers/me/rpl-portfolio/:skillId`** — a generated PDF that
assembles all of the above into an evidence pack an NCVET assessment agency can
act on, with a public verification code so the agency can confirm it came from
the platform and not from a word processor.

Then the flow is short: worker taps "Get certified for what you already do" →
portfolio generated → assessment booked (`mode: 'assessment_only'`) → assessor
marks a practical → NSQF certificate issued.

It is mostly a report generator over data already stored, it is the fastest path
to a real certificate in a worker's hand, and for a 45-year-old plumber with
twenty years and nothing on paper it is the single most valuable thing this
platform can do.

---

## 8. The national ecosystem

The platform is not an Awarding Body and must never print something that looks
like one. What it can do is carry, record and hand off.

| System | What it is | What we do |
|---|---|---|
| **NSQF** | Eight-level national framework | Every skill course carries an `nsqf_level`. Compliance courses carry none, and say so. |
| **NQR** — [nqr.gov.in](https://nqr.gov.in/) | Public register of every NSQF-aligned qualification | Source `qp_code`, level and awarding body from here. Do not hard-code. |
| **NCVET** | Regulator; recognises Awarding Bodies and Assessment Agencies | Model both as fields on the course and the assessment. Record who issued and who assessed. |
| **Sector Skill Councils** | The awarding bodies for our trades — DWSSC, WMPSC and others | The partner a cooperative federation signs with. Institutional work, not engineering work. |
| **Skill India Digital Hub** | Open API stack, one learner identity, credentials that travel, DigiLocker-backed | Design the adapter, gate it behind config. `training_certificates.external_ref` is the hook. |
| **DigiLocker** | Government document wallet | Push issued certificates so they outlive the platform. |

Two honest notes:

1. **Affiliation is paperwork, not code.** Becoming a recognised training partner
   of an SSC, or onboarding to SIDH, is an institutional process measured in
   months. Build the module so it is *ready* for it — carry the codes, model the
   bodies, generate the certificate — and light the integration up when the
   paperwork lands.
2. **Follow the existing pattern for unconfigured integrations.** Razorpay, FCM
   and SMS all no-op with a clear log when credentials are absent, and refuse to
   fake it in production. SIDH and DigiLocker adapters do the same: without
   credentials, certificates are issued internally with a verification code and
   nothing claims a national registration that did not happen.

---

## 9. Closing the AI loop

`ai/main.py` already returns, per area and service: `expected_requests`,
`available_workers`, `predicted_shortage`, and `drivers`. Add one endpoint:

```python
POST /training/recommendations
  in : forecasts[]                 # existing shortage output
       workers[]                   # skills, NSQF levels, job history, area
       courses[]                   # catalogue with skill_id and duration
  out : [{ workerId, courseId, score, reason }]
```

Scored on: forecast shortage for that skill in the worker's service area,
lead time (does the course finish before the shortage?), the worker's existing
adjacent skills, their rating trend, and fairness — spread opportunity rather
than sending every course to the same twenty workers, exactly as the match score
already balances workload.

Written to `training_recommendations` and surfaced twice:

- **To the worker**, as a reason they can act on: *"Kukatpally needs 12 more
  certified electricians by March. This course is 40 hours and unlocks 6
  services."*
- **To the cooperative admin**, as a batch-planning tool: the shortage, the
  eligible workers, the budget available, and a button that opens a batch.

That is `srs.txt:1038`'s "Worker training recommendations" — filed under Future
Enhancements, but it is one join between two modules that both already ship.

---

## 10. The other surfaces

**Customer app.** `worker_card.dart` already carries trust signals. Add the NSQF
badge and certified-trade list. This is the demand-side half of §5.3 — a
customer will only pay a premium for certification they can see.

**Cooperative dashboard** (`cooperativeDashboard.ts`, currently no training).
Batch planning from the skill-gap heatmap, seat fill, attendance registers,
budget allocated and drawn, workers overdue on compliance, certificates expiring
this quarter.

**Federation dashboard** (`federationDashboard.ts`, currently counts
self-declared rows). Replace with the NCCT reporting set: workers trained by
QP and NSQF level, certificates issued and expired, welfare fund spent on
training, RPL conversions, cost per certificate, and society-by-society
comparison. This is the department's own KPI set, and it is the report that
justifies the platform's existence to its sponsor.

**Admin.** Course and module authoring, batch scheduling, trainer management,
assessment agency records, certificate issuance and revocation, budget
allocation. All greenfield — `web/src/pages/` is empty.

**Notifications.** `srs.txt:643` lists *certification expiry* and
`TASKLIST.md` §2.6 has an unchecked daily expiry job. Both land here, with new
categories on `/notifications/preferences`: `training_recommended`,
`session_reminder`, `certificate_issued`, `certificate_expiring`.

---

## 11. Delivery

A parallel track. It does not block the offer loop, which is the worker app's
critical path, so it starts once identity is done and runs alongside phases 3–5.

| Phase | Weeks | Backend | Apps & dashboards | Done when |
|---|---|---|---|---|
| **T0 · Catalogue** | 5–6 | All tables · `trainer` role · course/module/batch CRUD · `worker_training_records.source` migration · reports switched to `training_certificates` | Admin: course authoring, batch scheduling, trainer management | An operator can publish a course and open a batch, and no report counts a self-declared row again |
| **T1 · Enrol & learn** | 7–8 | Enrolment, budget allocation and draw-down, progress sync, offline media endpoints | Worker app screens 40–45; cooperative dashboard seat fill and budget | A worker enrols, downloads a Telugu course on Wi-Fi, and completes it on a train with no signal |
| **T2 · Assess & certify** | 9–10 | Attendance, assessments, certificate issuance with QP + NSQF, public `/verify/:code`, daily expiry job | Worker screens 46–48, 50; trainer attendance view; expiry notifications | A certificate is issued, verifiable by a stranger with the code, and expires on its own |
| **T3 · Make it pay** | 11–12 | Graded `certificationScore` · `requires_certification` enforced · `certified_rate_multiplier` · AI recommendations · RPL portfolio generator | Worker screen 49; customer app NSQF badge; federation NCCT reporting | A certified worker measurably gets more offers and a higher rate, and can point at the reason |

**T3 is the phase that matters**, for the same reason Phase 2 matters in the
worker app plan. T0–T2 build a training system; T3 is what makes a worker
willing to give it two unpaid days.

---

## 12. Risks worth naming now

- **Content is the budget.** Twenty trades of Telugu narration, stills and
  assessment banks is an editorial programme, not a sprint. Start with two
  trades plus compliance.
- **Assessment integrity.** A worker can hand the phone to a nephew. Mitigate
  with the shift-start face check already planned for the worker app
  (`WORKER_APP_PLAN.md` §5.6), geofenced session check-in, and practicals marked
  in person. Do not pretend an in-app MCQ is a proctored exam.
- **Certification inflation.** If the rate multiplier is generous and the
  assessment is soft, everybody certifies and the signal dies. Keep the
  multiplier modest and the practical genuinely marked.
- **Fairness.** Recommendations must spread opportunity, not concentrate it.
  The match score already balances workload for this reason; the recommender
  needs the same discipline, and the federation dashboard should show the
  distribution.
- **A certificate that means nothing.** Until an SSC partnership exists, be
  explicit in the UI about what has been issued: an internal platform
  certificate is useful and honest; calling it an NSQF qualification before it
  is one is not.
