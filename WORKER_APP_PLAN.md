# GET IT DONE — Worker App

A complete plan for the second Flutter app: the one the person doing the work
holds.

This is written against the code that exists today, not against the blueprint.
Every "already there" claim below points at a real route or file; every "gap" is
something I looked for and did not find.

---

## 0. The one idea this app is built around

The customer app is a **catalogue**. You browse, you choose, you wait.

The worker app is a **shift**. It is opened at 8am and closed at 8pm, it lives
in a pocket between jobs, and it is looked at with one hand, outdoors, in
sunlight, sometimes with wet hands. For most of the day it should be showing
exactly one thing: *what do I do next*.

Three consequences that shape every screen below:

1. **There is no browsing.** No search, no grid, no discovery. The home screen
   is a duty toggle and the next job. Everything else is one tap away, not on
   the way.
2. **Money is the second screen, not the fifth.** A worker checks earnings
   several times a day. It is a bottom-nav destination.
3. **A missed offer is lost income.** The 45-second acceptance window
   (`WORKER_ACCEPT_TIMEOUT_SECONDS`) is the highest-stakes moment on the whole
   platform, and it happens while the app is in a pocket. Getting that moment
   right is worth more than every other screen combined — and today the backend
   cannot actually deliver it. See §4.1.

---

## 1. What already exists (audited, not assumed)

### 1.1 Backend surface the worker app can use today

Worker identity and profile — `backend/src/routes/workers.ts`

| Endpoint | Use in app |
|---|---|
| `POST /auth/register` (`role: worker`) | Sign up |
| `POST /workers/me/onboarding` | Create the worker profile |
| `GET/PATCH /workers/me` | Profile, experience, photo |
| `GET/PUT /workers/me/skills` | Trades the worker offers |
| `GET/PUT /workers/me/service-areas` | Per-service radius |
| `PATCH /workers/me/availability` | available / busy / offline |
| `PUT /workers/me/location` | Position ping |
| `POST /workers/me/verification/submit` | Submit for review |
| `GET /workers/me/verification/status` | Onboarding funnel state |
| `GET /workers/:id/statistics` | Completion rate, response time |
| `GET /workers/:id/ratings` | Reviews received |

Job lifecycle — `backend/src/routes/bookings.ts`

`POST /bookings/:id/accept` · `reject` · `start` · `complete` · `cancel` ·
`PATCH /:id/status` · `GET /:id/timeline` · `POST /:id/verify-start` ·
`POST /:id/verify-complete` (6-digit OTP through `checkOtp`, and it settles the
booking).

Worker dashboard — `backend/src/routes/workerDashboard.ts`

`GET /worker-dashboard` · `/upcoming-jobs` · `/earnings/summary` ·
`/welfare/summary` · `/jobs/history` · `POST /navigate/:bookingId` — the last
one already returns a Google distance-matrix ETA, directions, an embed URL and a
`google.navigation:` deep link, all computed server-side with the server key.

Money — `backend/src/routes/earnings.ts`, `services/revenueSplit.ts`

`GET /workers/me/earnings` · `/earnings/summary` · `/earnings/ledger` ·
`/payouts` · `GET/PUT /workers/me/payout-account`.
`computeSplit()` is the single source of truth: tax is backed **out** of the
customer's inclusive total, then platform 5% + cooperative 10% + welfare 2% come
off the subtotal and **the worker takes the remainder** — ~83%, or ~85% for a
worker with no cooperative.

Welfare — `backend/src/routes/welfare.ts`
Training, insurance, benefits, eligibility, safety incidents. All `me`-scoped.

Documents — `backend/src/routes/documents.ts`
Presigned upload URL → upload → register → submit → admin approve/reject, plus
certifications with expiry dates.

Also usable as-is: `chat`, `notifications` (with device-token registration),
`support`, `reviews`, `i18n` (en/te/hi strings served from the DB),
`config/mobile`, `files`, `ba` (booking attachments — the before/after photos).

### 1.2 The customer app, as a source of parts

`mobile/` is `getitdone_customer`, 82 Dart files, and the design system in it is
genuinely good — better than something written fresh for the worker app would
be. What is worth taking verbatim:

- `lib/design/tokens/` — `AppColors` (blue scale, semantic, service accents),
  `Space`/`Radii`/`Sizes` (4pt base, 48dp tap floor), `Motion`, typography.
- `lib/design/components/` — `AppButton`, `AppInput`, `AppCard`/`Section`,
  `AppBottomNav`, `AppBanner`, the state components, the badges.
- `lib/design/icons/app_icons.dart` — Phosphor, named by role not by glyph.
- `lib/core/network/api_client.dart` — **the refresh queue**. Access tokens are
  short-lived and the backend rotates refresh tokens on use, so this client
  serialises concurrent 401s onto one shared refresh future. Rewriting it for
  the worker app would faithfully reproduce the bug it was written to fix.
- `lib/core/realtime/realtime_service.dart` — Socket.IO with room re-join after
  reconnect.
- `lib/core/storage/token_store.dart` — keystore-backed tokens.
- `lib/core/models/models.dart`, `lib/core/config/`, `lib/core/location/`.
- Fonts: Plus Jakarta Sans + Noto Sans Telugu + Noto Sans Devanagari, bundled
  rather than fetched.

### 1.3 Realtime, as it stands

`backend/src/core/realtime.ts` puts every socket in `user:{id}`, workers
additionally in `worker:{id}`, admins in `admin:operations`. Booking rooms are
joined on demand. The events emitted today are `booking:status_changed`,
`worker:location:update`, `notification:new`, `emergency:escalated`.

---

## 2. Architecture: a separate app on a shared package

### 2.1 Why not one app with a role switch

Tempting, and wrong here. The two apps disagree on nearly everything that
matters at the top level. The customer app is a browsing shell with a cart bar
and a catalogue; the worker app is a duty shell with a foreground location
service, a full-screen offer interrupt and an on-device action queue. Merging
them means every worker ships the catalogue, every customer ships the
location-service permission strings, and one Play listing has to describe both.
Two listings, two icons, two audiences.

### 2.2 The structure

```
getitdone/
  packages/
    gid_core/          # api client, models, realtime, storage, config, location
    gid_ui/            # tokens, components, icons, theme  (depends on nothing)
  mobile/              # getitdone_customer   -> path deps on both
  mobile_worker/       # getitdone_worker     -> path deps on both
```

Step 0 of the build is a mechanical extraction: move `mobile/lib/design/` to
`packages/gid_ui/lib/`, move `mobile/lib/core/{network,storage,realtime,models,
config,location,notifications}/` to `packages/gid_core/lib/`, rewrite the
imports, then `flutter analyze && flutter test` the customer app to prove
nothing moved that shouldn't have. Half a day, and afterwards there is exactly
one definition of the token scale and one auth refresh queue for both apps
forever.

**What does not go in the shared packages:** anything with a customer noun in
it. `service_tile.dart`, `worker_card.dart`, `cart_bar.dart` and the service
artwork stay in `mobile/`.

---

## 3. The design language: a sibling, not a clone

Same family, different job.

**Keep, unchanged:** the whole token scale, the type ramp, Phosphor icons, Plus
Jakarta Sans, the 4pt rhythm, `Space.page = 20`, the flat full-width bottom bar
with labels on every destination, the blue-tinted shadows, the cross-fade root
transitions.

**Change, deliberately:**

| | Customer app | Worker app | Why |
|---|---|---|---|
| Chrome | White surfaces, blue accents | `blue900` navy header over a white body | Instantly distinguishable on a phone that has both installed |
| Hero state colour | `blue500` (primary action) | `success` green online, `n400` grey offline | Duty status is the most-read fact in the app; it gets its own colour and never shares it |
| Primary button height | `Sizes.buttonMd` 52 | **56**, and **64** for job-state actions | Gloved, wet, one-handed, outdoors |
| Type floor | 11pt nav labels | **13pt minimum anywhere** | Bright sun, older workers, cracked screens |
| Text-scale clamp | 0.9–1.3 | **0.9–1.5** | Same reason; worker layouts are single-column and can take it |
| Density | Editorial, generous | Tighter list rows, much bigger actions | More rows on screen between jobs; huge targets during one |
| Themes | Light / dark | Light / dark / **high-contrast daylight** | A navy-on-navy app is unreadable on a roof at noon |

New tokens for `gid_ui` — worker-specific roles, but they belong with the rest
of the scale rather than scattered through screens:

```dart
// tokens/duty.dart
online      = AppColors.success;   onlineSoft  = AppColors.successSoft;
busy        = AppColors.warning;   busySoft    = AppColors.warningSoft;
offline     = AppColors.n400;      offlineSoft = AppColors.n100;
offerUrgent = AppColors.danger;    // the countdown ring under 10s
```

### 3.1 Navigation

Mirror the customer app's decision exactly — three destinations in the bar,
profile behind the header avatar, alerts behind the header bell:

```
┌──────────────────────────────────────┐
│ [avatar]   Online ●          [bell³] │   navy header
├──────────────────────────────────────┤
│                                      │
│              content                 │
│                                      │
├──────────────────────────────────────┤
│   Today      Jobs      Earnings      │
└──────────────────────────────────────┘
```

Not four tabs. "Today" and "Jobs" are already close enough to be confusable;
adding Profile as a fourth would spend a third of the bar on settings, which is
the exact mistake `mobile/lib/app/app.dart` documents having already fixed.

---

## 4. The gaps — backend work the app cannot exist without

This is the "what did we miss" section. Ordered by how badly it blocks.

### 4.1 🔴 There is no job-offer event. This is *the* blocker.

Today, when a worker is assigned (`bookingService.placeBooking`), the backend
writes a notification row and an outbox row. `processOutboxEvents()` polls every
`JOB_POLL_INTERVAL_MS` (5s) and then calls `emitNotification(user:{id})` — a
generic `notification:new` carrying a title and a body string. Meanwhile
`scheduleAssignmentTimeout` starts a 45-second clock the client is never told
about.

So a worker app built on today's backend would learn about a job up to five
seconds late, as an untyped notification with no booking payload, no deadline,
no pay figure, and no way to know the offer had already been passed to somebody
else. That is not a 45-second countdown; that is a guess.

**Add:**

```ts
// core/realtime.ts
emitJobOffered(workerUserId, {
  bookingId, orderId, offerId,
  service: { id, name, categoryIcon },
  scheduledAt, durationMinutes, isEmergency,
  area: "Kukatpally",          // area name only — never the exact address
  distanceKm, etaMinutes,      // from getDistanceMatrix, already available
  payout: computeSplit(price, hasCooperative).workerShare,   // §4.3
  expiresAt,                   // now + WORKER_ACCEPT_TIMEOUT_SECONDS
})
emitJobRevoked(workerUserId, { bookingId, reason: 'timeout'|'reassigned'|'cancelled' })
```

Emitted **directly at assignment**, not through the outbox — the outbox stays
for the durable notification row. Call sites: `placeBooking`,
`matching.assignWorker`, `matching.reassignWorker`,
`emergencyService.reassignAfterTimeout`.

`POST /bookings/:id/accept` must also start returning a **typed 409** when the
offer has already lapsed, so the app can say "this job went to someone else"
instead of a generic failure.

And one new REST endpoint, because a socket is not a source of truth:
`GET /workers/me/offers` — the offers live for me right now, with their
deadlines. This is what the app calls on cold start, on reconnect, and whenever
an FCM push arrives while the socket is down.

### 4.2 🔴 Push notifications do not exist

`device_tokens` is populated by `POST /notifications/devices`, and
`processOutboxEvents` contains this, verbatim:

> `"FCM not configured: notification delivered over socket only"`

Honest, and completely fatal for a worker app. A socket only exists while the
app is foregrounded. Every offer that arrives while the phone is in a pocket is
currently lost.

**Add:** `firebase-admin`, a `services/pushService.ts`, and a high-priority
**data** message (not a notification message — the app must render it itself)
sent alongside every `emitJobOffered`, with `android: { priority: 'high' }` and
a TTL equal to the remaining offer window so a stale offer can never ring. Clean
up tokens on an `UNREGISTERED` response.

§5.4 has the Firebase setup this needs from you.

### 4.3 🟠 The worker cannot see what they will be paid

`computeSplit` is only ever called at settlement, inside `settleBooking`.
Nothing exposes it before or during a job. A worker deciding whether to cross
the city for a booking is currently shown either nothing, or the customer's
price — which is not their money.

**Add:** `GET /bookings/:id/payout-preview` (worker-scoped) returning the full
split, and an inline `payout` on the offer payload. The breakdown — gross, −5%
platform, −10% cooperative, −2% welfare, = your share — should be one tap from
the offer and from every earnings row. On a cooperative platform that
transparency is not a nicety, it is the product.

### 4.4 🟠 There are no working hours

`workers.current_status` is one of three values. There is no schedule anywhere
in the schema. A worker who forgets to go offline gets a 2am plumbing offer, and
matching has no idea they are asleep.

**Add:**

```sql
create table worker_availability_schedule (
  worker_id uuid references workers(id) on delete cascade,
  weekday   smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at   time not null,
  primary key (worker_id, weekday, starts_at),
  check (ends_at > starts_at)
);

create table worker_time_off (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references workers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  reason    text
);
```

Plus `GET/PUT /workers/me/schedule`, `GET/POST/DELETE /workers/me/time-off`, and
a clause in `findMatchingWorkers` that excludes workers outside their hours.
Also an auto-offline job at end of shift, so the toggle is not something a
worker has to remember at the end of a twelve-hour day.

### 4.5 🟠 Time is bought but never tracked

`migration_phase17_time_pricing.sql` sells `duration_minutes`. Nothing records
how long the work actually took, and there is no way for a job to run over. A
two-hour clean that needs a third hour has no path today other than the worker
doing it free or the customer booking again.

**Add:**

```sql
alter table bookings add column if not exists work_started_at  timestamptz;
alter table bookings add column if not exists work_finished_at timestamptz;

create table booking_time_extensions (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings(id) on delete cascade,
  requested_by uuid not null references users(id),
  minutes      int not null check (minutes > 0),
  amount       numeric(10,2) not null,      -- priced at the frozen rate
  status       text not null default 'pending'
    check (status in ('pending','approved','declined','expired')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
```

`POST /bookings/:id/extensions` (worker requests) →
`POST /bookings/:id/extensions/:eid/approve` (customer, in their app) → re-quote
and re-freeze. The worker's in-progress screen runs a live timer against the
purchased minutes and offers "Need more time?" once it crosses ~85%.

### 4.6 🟠 No arrival, no-show or worker-cancel taxonomy

`POST /bookings/:id/cancel` takes free-text prose. There is no `arrived` state
between `en_route` and `started`, so nothing records that the worker was at the
door at 10:02 and the customer opened it at 10:19. There is no no-show path at
all, which means the current failure mode is a worker standing outside a locked
gate with no button to press.

**Add:** an `arrived` status (extend the `bookings` status check), a
`POST /bookings/:id/arrived` that stamps the time and a GPS fix, and a
structured no-show flow — arrival stamped → 10-minute waiting timer → "Customer
not responding" → notification plus call/chat prompt → after the window, release
with `no_show` and a compensation ledger entry. Reason codes as an enum, not
prose, so the fairness analytics in `analytics.ts` can actually count them.

### 4.7 🟡 Location is a single ping with nowhere to queue

`PUT /workers/me/location` takes one fix. A worker in a basement, a lift or a 2G
dead zone accumulates fixes with nothing to do with them, and the customer's
tracking map freezes.

**Add:** `POST /workers/me/location/batch` taking an ordered array of
`{lat, lng, accuracy, recordedAt}`, writing the newest to `worker_locations` and
fanning the trail out through the existing `emitWorkerLocationToBookings`. Also
reject fixes with implausible accuracy, and record `is_mock` (§4.9).

### 4.8 🟡 There is no SOS

`welfare.ts` has `POST /workers/me/safety-incidents` — a form, filed after the
fact. There is nothing that gets a distressed worker's live position in front of
a human right now. `emitEmergencyEscalated` → `admin:operations` already exists
and is exactly the pipe this needs.

**Add:** `POST /workers/me/sos` — records the incident, attaches the last known
fix and the active booking, emits to `admin:operations`, and returns the
cooperative's emergency number for the app to dial. Surfaced as a held button on
the active-job screen and in the profile.

### 4.9 🟡 Nothing defends against a faked location

A platform that pays per completed job, verifies arrival by GPS and settles
automatically is a fraud target, and mock-location apps are one Play Store
search away. As it stands a worker could mark themselves at a customer's door
from their sofa.

**Add:** send `Position.isMocked` with every fix, store it, refuse to stamp
`arrived` on a mocked fix, and flag the worker for review. Pair it with Play
Integrity (§5.6). Cheap now, expensive to retrofit after the first dispute.

### 4.10 🟡 The worker cannot see the order they are part of

Since `migration_phase16_orders.sql`, a checkout produces one order and several
bookings — a plumber and an electrician at the same address in the same hour,
each matched separately. A worker sees only their own booking and has no idea
two other trades are arriving, which is genuinely useful for parking, access and
sequencing.

**Add:** an `order` block on the worker's booking payload — sibling services,
their statuses, the shared contact. Not the other workers' phone numbers.

### 4.11 🟡 Smaller things

- **Offer preferences** — `TASKLIST.md` §3 lists "preferred areas, excluded
  customers" unchecked. Minimum viable: a maximum travel distance, and never
  offer me this customer again after a safety incident.
- **Acceptance-rate transparency** — `GET /workers/:id/statistics` computes it;
  nothing tells the worker what it is or what it affects. If it feeds matching,
  it must be visible, with the window it is measured over.
- **Document expiry warnings** — `TASKLIST.md` §2.6 has an unchecked daily
  expiry job. A worker whose insurance lapsed silently stops getting matched and
  never finds out why.
- **Notification preferences** exist (`/notifications/preferences`) but have no
  worker-relevant categories. Add `job_offer`, `job_reminder`, `payout`,
  `document_expiry` — and make `job_offer` non-mutable.
- **`GET /workers/me/reviews`** — reviews are readable by worker *id* only; add
  the `me` alias so the app does not need a second round trip.

---

## 5. Google services — what to enable and what each is for

You said you would add the credentials. Here is exactly what to create, split by
whether it is a **server** key (never leaves the backend) or a **client** key
(ships inside the APK and must be restricted).

### 5.1 Already wired, nothing new needed

`GOOGLE_MAPS_API_KEY` (server) already powers Geocoding, Reverse Geocoding,
Distance Matrix, Places Search and Autocomplete, Place Details, Directions,
Static Maps and Embed — all proxied through `/maps/*` so the key never reaches a
phone. The worker app uses the same proxy. **Enable if not already:** Geocoding
API, Places API, Distance Matrix API, Directions API (or Routes API), Maps
Static API, Maps Embed API.

### 5.2 Maps SDK for Android / iOS — client key

The customer app already declares `com.google.android.geo.API_KEY` from
`MAPS_API_KEY` in `local.properties`. The worker app needs **its own restricted
key**: same project, restricted to the worker package name
(`com.getitdone.worker`) and its signing certificate. Used for the active-job
map, the service-area radius editor and the route polyline.

### 5.3 Turn-by-turn navigation — free, no key

Do **not** build navigation. `googleMaps.getNavigationUrl()` already produces a
`google.navigation:q=lat,lng` intent; `url_launcher` hands it to Google Maps,
which the worker already knows how to use and which has the traffic data. One
button, zero maintenance, better than anything we would ship.

### 5.4 Firebase Cloud Messaging — **the one thing you must create**

A new Firebase project (or new apps inside an existing one):

1. Add an Android app `com.getitdone.worker` → download `google-services.json`
   → `mobile_worker/android/app/`.
2. Add an iOS app → `GoogleService-Info.plist` → `mobile_worker/ios/Runner/`,
   plus an **APNs auth key** (.p8) uploaded to Firebase — without it, iOS pushes
   silently do nothing.
3. Generate a **service account JSON** (Project settings → Service accounts) for
   the backend:
   ```
   FIREBASE_PROJECT_ID=
   FIREBASE_CLIENT_EMAIL=
   FIREBASE_PRIVATE_KEY=          # keep the \n escapes
   ```
   Absent, `pushService` no-ops and logs — exactly as the codebase already does
   for Razorpay and SMS. That pattern is good; keep it.
4. Do the same for the **customer** app while you are in there. It has the same
   hole: booking updates are socket-only for customers too.

### 5.5 Google Sign-In — reuse

`GOOGLE_CLIENT_IDS` is already a comma-separated allow-list precisely so several
clients can mint acceptable tokens. Create an **Android OAuth client for the
worker package + SHA-1**, and pass the existing *web* client id as
`--dart-define=GOOGLE_SERVER_CLIENT_ID` for the worker build. No backend change.

Note there is no SMS provider (`SMS_PROVIDER=console`, and `.env.example`
records that OTP sign-in was deliberately removed). So worker sign-in is **email
+ password, or Google** — which is worth a second thought for this audience, and
is the one product question in this plan I would put back to you (§9).

### 5.6 New Google services worth adding

| Service | What it does here | Cost |
|---|---|---|
| **ML Kit Document Scanner** | Aadhaar / PAN / licence capture during onboarding — edge detection, deskew, glare handling, on-device. Replaces "take a photo of your ID" and the large fraction of those that come back unreadable. | Free, on-device |
| **ML Kit Text Recognition** | Read the ID number off the scan and pre-fill it, so the worker types 12 digits zero times. Never trust it — pre-fill, always confirm. | Free, on-device |
| **ML Kit Face Detection** | Shift-start selfie check: exactly one face, eyes open, not a photo of a photo. Not identity verification — a cheap liveness gate that makes account-sharing awkward. | Free, on-device |
| **Play Integrity API** | Device attestation on sign-in and on `arrived`. The counterpart to mock-location detection (§4.9). | Free tier is ample |
| **Firebase Crashlytics** | A worker app crashing mid-job is invisible to us today. Non-negotiable for an app used by people who will not file bug reports. | Free |
| **Firebase Performance** | Cold start and API latency on the 2G/3G networks this audience actually has. | Free |
| **Firebase Remote Config** | Feature flags and kill-switches. `/config/mobile` covers static config; Remote Config covers "turn the new offer screen off at 9pm on a Friday". | Free |
| **Play Console — internal testing track** | How the first 20 workers get the app before it is public. Set this up early; review takes days. | — |

### 5.7 Explicitly not

Google Maps **Navigation SDK** (expensive, and the intent in §5.3 is better),
Roads API (snap-to-road is polish, not product), Google Wallet (payouts are bank
transfers through the settlement pipeline).

---

## 6. The screens

50 screens across eight areas. Each lists the endpoints it calls. Area H —
training — is specified in full in `TRAINING_MODULE_PLAN.md`; it is summarised
here so the inventory is complete.

### A · Onboarding and identity — 6 screens

1. **Splash** — restore session, fetch `/config/mobile`, decide the route. Same
   cross-fade root gate as the customer app.
2. **Sign in** — email + password, Google. Navy hero, worker photography.
   `POST /auth/login`, `POST /auth/oauth/google`.
3. **Register** — `POST /auth/register` with `role: worker`.
4. **Onboarding wizard** — six steps behind a persistent progress rail, each one
   resumable and independently saved, because a worker will not finish this in
   one sitting on a 2G connection: personal → cooperative → skills → service
   areas → documents → payout.
   `POST /workers/me/onboarding`, `PUT /me/skills`, `PUT /me/service-areas`,
   `POST /documents/upload-url` (+ ML Kit scanner), `PUT /me/payout-account`,
   `POST /me/verification/submit`.
5. **Verification status** — the funnel state as a checklist, not a spinner.
   Rejected shows the reason and the exact document to redo.
   `GET /workers/me/verification/status`.
6. **Pending gate** — an unverified worker sees *what is left*, never an empty
   job feed. The empty state here is the difference between a worker who
   finishes onboarding and one who deletes the app.

### B · Today — 3 screens

7. **Today** — the app's home. Top to bottom: duty toggle (full-width, green
   when online), active job card if there is one, next scheduled job, today's
   earnings and jobs done, this week's strip, document and insurance warnings.
   `GET /worker-dashboard`, `/upcoming-jobs`, `/earnings/summary`.
8. **Duty status sheet** — available / busy / offline, with a "back online at"
   for a break. `PATCH /workers/me/availability`.
9. **Working hours** — weekly grid, per-day ranges, time off. §4.4.

### C · The job — 9 screens, the heart of the app

10. **Job offer** ⭐ — full-screen over everything, with sound and haptics. A
    countdown ring that turns `danger` under ten seconds. Service, **your
    payout** (not the customer's price), duration bought, distance and ETA, area
    name, emergency flag. Two 64dp buttons: Accept, Decline. Auto-dismisses on
    `job:revoked`. Arrives over the socket when foregrounded, over an FCM
    full-screen intent when not. §4.1, §4.2.
11. **Decline reason** — a four-option sheet, not free text. Feeds matching.
12. **Active job** — one screen whose chrome changes with the state:
    `accepted → en_route → arrived → started → completed`. A sticky bottom
    action that is always the single next thing to do. Map, customer name and
    contact (from `service_orders.contact_name/phone`, not the account —
    `migration_phase20` explains why), address, notes, and the sibling services
    from the same order (§4.10).
13. **Navigate** — Google Maps intent plus an in-app route preview.
    `POST /worker-dashboard/navigate/:bookingId`.
14. **Arrived / waiting** — arrival stamped with a GPS fix, ten-minute waiting
    timer, call and chat prompts, no-show path at the end. §4.6.
15. **Start OTP** — six-digit entry, large keypad, "the customer will read it to
    you". `POST /bookings/:id/verify-start`.
16. **In progress** — a live timer against the purchased minutes, before-photo
    capture, notes, "need more time?" at ~85%. `POST /ba/…`, §4.5.
17. **Complete** — after photos, work summary, completion OTP, then the payout
    with its full split. `POST /bookings/:id/verify-complete`.
18. **Job detail** — read-only history: timeline, photos, rating received,
    earnings. `GET /bookings/:id/timeline`.

### D · Jobs — 3 screens

19. **Jobs** — segmented Today / Upcoming / History, with a calendar strip for
    scheduled work. `GET /worker-dashboard/upcoming-jobs`, `/jobs/history`.
20. **Schedule** — week view of committed jobs against working hours.
21. **Cancel job** — reason codes, and an honest statement of what cancelling
    does to acceptance rate. §4.6.

### E · Earnings — 5 screens

22. **Earnings** — this week as the hero, a seven-day bar chart, then the
    ledger. `GET /workers/me/earnings/summary`, `/earnings`.
23. **Job earnings breakdown** — gross → tax out → −5% platform → −10%
    cooperative → −2% welfare → **your share**, every line labelled with where
    it goes. §4.3.
24. **Payouts** — history and status, honestly labelled: settlements are
    generated and processed by admins, and the app must not imply a worker can
    pull money on demand. `GET /workers/me/payouts`.
25. **Payout account** — bank/UPI, verification state.
    `GET/PUT /workers/me/payout-account`.
26. **Statements** — monthly PDF through `filesRouter` / `invoices`.

### F · Profile and welfare — 9 screens

27. **Profile** — photo, worker code, rating, verification badge, stats
    (completion rate, response time, acceptance rate — §4.11).
28. **Edit profile** — `PATCH /workers/me`.
29. **Skills** — add and remove, certification level, verification state.
    `GET/PUT /workers/me/skills`, `POST /skills/workers/:id/skills`.
30. **Service areas** — map with a draggable radius per service, Places
    autocomplete for the centre. `PUT /workers/me/service-areas`.
31. **Documents** — status per document, expiry warnings, re-upload, ML Kit
    scanner. `GET /documents/my`.
32. **Welfare passport** — training, insurance, benefits, eligibility. This is
    the cooperative's differentiator and should look like it, not like a
    settings list. `GET /welfare/workers/me`, `/benefits`, `/eligibility`.
33. **Ratings received** — reviews in the customer's own words.
    `GET /reviews/workers/:id/reviews`.
34. **Settings** — language (en/te/hi), theme plus daylight mode, notifications,
    sessions, sign out.
35. **Safety** — SOS button, incident history, emergency contacts. §4.8.

### G · Cross-cutting — 4 screens

36. **Alerts** — `GET /notifications`, live over `notification:new`.
37. **Chat** — per-booking thread. `GET/POST /chat`.
38. **Support** — tickets. `GET/POST /support/tickets`.
39. **Offline state** — a persistent banner and a queued-actions count. Less a
    screen than a permanent citizen of the shell. §7.3.

### H · Training and certification — 11 screens

Specified in `TRAINING_MODULE_PLAN.md`. Training is **episodic**, not daily, so
it gets no bottom-nav destination — it earns a card on Today only when there is
something to act on (a recommendation with a stated payoff, a certificate
expiring inside 60 days, a session tomorrow, an overdue compliance course), and
otherwise lives under the profile. It never interrupts a job offer.

40. **Training home** — in-progress course, my certificates, recommended,
    expiring. The section root.
41. **Course catalogue** — my trades first. Every row states the payoff, not the
    syllabus.
42. **Course detail** — hours, fee, funder, NSQF level, QP code, and what it
    unlocks: services, match uplift, rate multiplier.
43. **Batch picker** — dates, venue on a map with distance from home, seats
    left, language of instruction.
44. **Enrol and funding** — self / welfare fund / cooperative, with the "₹380 of
    this came from your own jobs" line.
45. **Lesson player** — audio-first, video optional, resumable, downloadable on
    Wi-Fi, Telugu by default. Progress drains through the same offline queue as
    job transitions (§7.3).
46. **Session check-in** — QR at the venue or a geofenced check-in. Attendance
    gates certification, so it has to be hard to fake.
47. **Assessment** — MCQ in-app; a practical is scheduled and marked in person.
48. **Certificate** — number, verification code, QR, NSQF level, share and save.
49. **RPL portfolio** — "340 plumbing jobs at 4.6 stars. Get certified for what
    you already do." Generated from job history the platform already holds.
50. **Skill passport** — NSQF level per skill, progress to the next, and what
    each level unlocks.

---

## 7. The hard parts

### 7.1 The offer interrupt

Three delivery paths, one handler, and it must be idempotent because on a good
day all three fire:

| App state | Path | Rendering |
|---|---|---|
| Foreground | Socket `job:offered` | Push the offer route |
| Background | FCM data message, high priority | Full-screen intent notification; tapping opens the offer route |
| Killed | FCM data message | `flutter_local_notifications` full-screen intent from the background isolate; cold start deep-links to the offer |
| Any, after a gap | `GET /workers/me/offers` on resume/reconnect | Reconciles — shows live offers, silently drops expired ones |

The countdown is rendered from `expiresAt` against **server time**, with clock
skew measured at connect. A client-side `Duration(seconds: 45)` started on
receipt is wrong by the network latency plus whatever the phone's clock says,
and being wrong here costs the worker a job.

Android specifics: a dedicated `job_offers` channel at `Importance.max` with a
custom sound, and `USE_FULL_SCREEN_INTENT`, which needs a Play Console
declaration — file that early, it is reviewed. The `clock` package is already a
dependency of the customer app, so injectable time for tests comes free.

### 7.2 The foreground location service

While online, or during an active job, the app pushes fixes. This is a
**foreground service** with a persistent notification. A background service is
killed by Android the moment memory is tight, and losing a worker's position
mid-job is the failure the customer sees.

- `flutter_foreground_task` + `geolocator`.
- Manifest: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
  `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`,
  and `ACCESS_BACKGROUND_LOCATION` **only** if we decide to track between jobs.
  I would not — asking for it makes the Play review materially harder for very
  little gain.
- Cadence by state: idle-online **120s**, en route **10s**, on site **60s**,
  with a 25m distance filter so a stationary worker does not burn battery.
- Android 14 requires `foregroundServiceType="location"` and a user-visible
  justification.
- Batched to `POST /workers/me/location/batch` (§4.7) so the queue drains rather
  than drops.
- The notification says what it is for in plain language, in the worker's
  language, and going offline stops it completely. A worker must be able to
  prove to themselves that the app is not watching them off shift.

### 7.3 Offline-first

A worker in a lift, a basement or a village must still be able to press
"Started". The action queue:

- Every lifecycle transition and location batch is written to a local queue
  (`sqflite`) *before* the request, with the idempotency key generated at press
  time — `ApiClient.newIdempotencyKey()` already exists for exactly this shape
  of problem.
- Drain on connectivity restore, in order, with backoff.
- The UI shows the optimistic state with a small "queued" mark and reconciles
  from the server response. It never shows a spinner over a job the worker has
  already finished.
- OTP verification is the one thing that **cannot** be queued — it needs a live
  server check. Say so plainly on that screen rather than failing oddly.

### 7.4 Language

Telugu first, not Telugu eventually. The audience is Telangana cooperative
workers. `/i18n/translations/:lang` already serves strings from the DB, and the
fonts are already bundled.

- ARB files for the app shell; `/i18n` for anything operators need to change
  without a release, cached, with the bundled ARB as the offline fallback.
- Language is asked **before** sign-in, not buried in settings.
- Telugu runs ~30% wider than English at the same point size. Every layout gets
  checked at `te` × 1.5 text scale before it ships, and the numeric-heavy
  screens (earnings, OTP, countdown) stay in Latin digits.

---

## 8. Delivery plan

Twelve weeks, six phases. Each phase ends with something a real worker could
hold.

| Phase | Weeks | Backend | App | Done when |
|---|---|---|---|---|
| **0 · Foundation** | 1 | — | Extract `gid_core` + `gid_ui`; scaffold `mobile_worker`; navy theme, duty tokens, worker components; CI for three targets | Customer app still green; worker app builds and shows a themed empty shell |
| **1 · Identity** | 2–3 | Firebase project, `pushService`, device-token cleanup | Sign in, register, six-step onboarding, ML Kit document scanner, verification status, pending gate | A real worker can sign up and be verified by an admin |
| **2 · The offer** ⭐ | 4–6 | §4.1 offer events, `GET /me/offers`, §4.2 FCM, §4.3 payout preview, typed 409 on a lapsed accept | Offer screen with a server-time countdown, all four delivery paths, decline reasons, Today screen, duty toggle | An offer wakes a killed app, rings, and is accepted inside 45s on a 3G connection |
| **3 · The job** | 7–8 | §4.6 `arrived` + no-show, §4.7 location batch, §4.10 order context | Active-job state machine, navigation, foreground location service, arrival, OTP start/complete, photos, offline queue | A job runs end to end, in a lift, and the customer's map keeps moving |
| **4 · Money and self** | 9–10 | §4.5 time extensions, §4.4 schedule, §4.11 expiry job + `me` review alias | Earnings, split breakdown, payouts, payout account, profile, skills, service areas, documents, welfare passport, ratings | A worker can answer "how much did I make, and why" without calling anyone |
| **5 · Safety and polish** | 11–12 | §4.8 SOS, §4.9 mock-location + Play Integrity | SOS, chat, support, alerts, Telugu/Hindi pass, daylight theme, accessibility, Crashlytics, Play internal track | Twenty workers on the internal track for a fortnight |

Phase 2 is *the* phase. If it slips, everything after it is worth less; if it is
right, the rest is ordinary app work.

**Training runs as a parallel track**, T0–T3 over weeks 5–12, specified in
`TRAINING_MODULE_PLAN.md`. It does not touch the offer loop and so does not
compete with Phase 2 for the critical path; it does touch matching in its last
phase, which is why that phase sits alongside Phase 5 rather than earlier.

### 8.1 Packages to add

```yaml
firebase_core, firebase_messaging, firebase_crashlytics, firebase_performance
flutter_local_notifications        # already in the customer app
flutter_foreground_task            # the location service
geolocator, google_maps_flutter    # already in the customer app
google_mlkit_document_scanner, google_mlkit_text_recognition, google_mlkit_face_detection
sqflite                            # the offline action queue
connectivity_plus                  # queue drain trigger
vibration                          # offer haptics
```

### 8.2 Testing

- **Unit** — countdown against an injected `clock`; offline queue ordering and
  replay; split arithmetic mirrored from `computeSplit`, with one golden fixture
  shared with the backend test so the two cannot drift.
- **Widget** — every screen at `en`/`te` × 1.0/1.5 text scale ×
  light/dark/daylight. Golden tests on the offer screen; it is the one screen
  where a layout regression costs money.
- **Integration** — the full lifecycle against a seeded backend, including the
  paths that are easy to skip: an offer expiring mid-decision, an accept losing
  the race, the network dropping between "Started" and the OTP.
- **Field** — throttled to 2G, with location spoofing, on a cheap Android 11
  device with 2GB of RAM. Not a flagship. The worker's phone is not a flagship.

---

## 9. The one question I would put back to you

**How does a worker sign in?**

`SMS_PROVIDER=console`, no OTP endpoints, and `.env.example` records that SMS
sign-in was deliberately removed from the platform. So today the answer is email
+ password, or Google.

For Telangana cooperative workers that is real friction — many will not have an
email they check, and Google Sign-In assumes a working Play account. Three
options, none of which I want to choose for you:

1. **Keep email/password + Google.** Zero work. Onboarding happens with a
   cooperative admin sitting next to the worker anyway, so an email can be
   created then. Weakest for self-serve growth.
2. **Bring phone + OTP back, for workers only.** MSG91 is already adaptered in
   `smsService.ts` and the DLT plumbing — the expensive part — is done. Costs an
   SMS budget and template approval. Best fit for the audience.
3. **Worker code + PIN**, issued by the cooperative at onboarding. No SMS cost,
   fits the cooperative model, and is how a lot of Indian field-workforce apps
   actually work. Needs new auth work and careful PIN handling.

Everything else in this plan is independent of the answer, so Phase 0 and the
backend gaps can start regardless.
