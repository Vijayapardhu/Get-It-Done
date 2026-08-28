# GET IT DONE — Platform gap audit

What is missing across the whole platform, outside the two plans already
written (`WORKER_APP_PLAN.md`, `TRAINING_MODULE_PLAN.md`).

Same rule as those: every finding points at a file and a line. Nothing here is
inferred from a document.

---

## Summary

| | Finding | Area |
|---|---|---|
| 🔴 | **The web console does not exist.** `App.tsx` is the Vite starter template. | web |
| 🔴 | **A worker's declared skills are written to a table matching never reads.** | backend |
| 🔴 | **The mobile app has no localisation at all.** Every string is a hardcoded English literal. | mobile |
| 🟠 | **The AI forecast never trains and its supply figure is a hardcoded literal.** | ai |
| 🟠 | **Operator accounts have no second factor**, despite a column, env vars and a migration for one. | backend |
| 🟠 | **No CI.** No `.github/workflows`. Nothing runs the 12 test files. | repo |
| 🟠 | **Sentry is configured and not installed.** | backend |
| 🟠 | **The institutional module has 21 endpoints and no client anywhere.** | backend |
| 🟡 | Rate limiting covers `/auth` and nothing else. | backend |
| 🟡 | An incompletely-onboarded worker is invisible to matching with no diagnostic. | backend |
| 🟡 | Documentation drift: `TASKLIST.md` is 368/369 unchecked while much of it is built. | docs |
| 🟡 | Test coverage, and 124 committed golden-failure artifacts. | repo |
| 🟡 | The web app has no Dockerfile and no compose service. | deploy |

---

## 🔴 1. The web console does not exist

`web/src/App.tsx`, in full, is the Vite starter:

```tsx
function App() {
  const [count, setCount] = useState(0)
  return (<>
    <h1>Get started</h1>
    <p>Edit <code>src/App.tsx</code> and save to test <code>HMR</code></p>
    <button onClick={() => setCount((count) => count + 1)}>Count is {count}</button>
    ...Explore Vite / Learn more / Discord / Bluesky
  </>)
}
```

Someone built real chrome around it — `Layout`, `Header`, `Sidebar`,
`AuthContext`, an axios client with a refresh queue, `DataTable`,
`DetailDrawer`, `FilterBar`, `ConfirmDialog`, `Badge`, `EmptyState`,
`useWorkers`. `main.tsx` even wraps the app in `BrowserRouter` and a
`QueryClientProvider`.

But `web/src/pages/` does not exist, `App` contains no `<Routes>`, and the
`Sidebar` declares eleven destinations — Overview, Operations, Workforce,
Catalogue, Pricing, Finance, Customers, Support, Insight, Organisation,
System — that all point at routes nothing serves.

**What this strands.** These routers are built, mounted and serving, with no
client on any surface:

| Router | Endpoints | Purpose |
|---|---|---|
| `admin.ts` | ~40 | Verification queue, user management, audit log, AI approvals |
| `analytics.ts` | 10 | Overview, bookings, workers, revenue, services, geography, satisfaction, welfare, fairness |
| `cooperativeDashboard.ts` | — | Society view |
| `federationDashboard.ts` | — | Federation roll-up |
| `settlements.ts` | 5 | Generate, process, pay out — the only path money leaves the platform |
| `reports.ts` | — | Cooperative welfare exports |
| `ai.ts` | 7 | Forecast, allocation, recommendation approval |
| `institutions.ts` + `institutional.ts` | 21 | Institutional customers, procurement |

`srs.txt` names three of the platform's deliverables as the **Admin Dashboard**
(§22), the **Cooperative Dashboard** and the **Federation Dashboard** (§23).
None of them has a single screen.

This is a bigger hole than the worker app. The worker app is missing a client
for a backend that also needs two new events; the console is missing a client
for a backend that is finished and waiting.

**Scale.** Roughly 25–30 screens. The component library and the API client are
already there, so this is composition work, not architecture — but it is not a
week.

---

## 🔴 2. Skills split-brain — declared skills are invisible to matching

There are **two** worker-skill tables and **two** taxonomies, and they are both
live.

```
worker_skills       (worker_id, service_id → services.id,  certification_level)
worker_skills_new   (worker_id, skill_id   → skills.id,    level, years_experience, verified)
```

The write path and the read path use different ones:

```ts
// routes/workers.ts:437  →  services/workerService.ts:33
workersRouter.put("/me/skills", ...)  →  replaceWorkerSkills()
    delete from worker_skills where worker_id = $1
    insert into worker_skills (worker_id, service_id, certification_level) ...
```

```ts
// services/matching.ts:86
exists (select 1 from worker_skills_new ws
        join skills s on s.id = ws.skill_id
        where ws.worker_id = w.id and ... and ws.verified = true) as "hasCertification"
```

A worker who sets their trades through the API writes `worker_skills`.
Matching reads `worker_skills_new`. `GET /workers/me/skills` reads the old table
back, so the client looks perfectly consistent while being disconnected from
dispatch entirely.

`worker_skills_new` is read by `matching.ts`, `admin.ts`, `skills.ts`,
`cooperativeDashboard.ts` and `serviceDiscovery.ts`. `worker_skills` is written
by `workerService.ts` and read by `trust.ts` and `seed.sql`. Both are load-bearing.

**Why it matters twice over.** `WORKER_APP_PLAN.md` screen 29 is a skills
manager — as written today it would be a no-op. And `TRAINING_MODULE_PLAN.md`
hangs certificates off `skill_id`, which is the *other* taxonomy from the one
the worker's own app writes to.

**Fix:** pick `worker_skills_new` (it has the level and verification the rest of
the platform needs), backfill from `worker_skills` through a
`services → skills` mapping, repoint `workerService`, `trust.ts` and the seed,
then drop the old table in a follow-up migration. Do this **before** the worker
app is built, not after.

---

## 🔴 3. The mobile app has no localisation

There is no `l10n.yaml`, no `.arb` file anywhere, no `flutter_localizations` in
`pubspec.yaml`, and no `AppLocalizations` import in any of the 82 Dart files.
Every string is a hardcoded English literal:

```dart
// lib/app/app.dart:482
const AppNavItem(icon: AppIcons.home,     label: 'Home'),
const AppNavItem(icon: AppIcons.bookings, label: 'Bookings'),
```

Around it, the *scaffolding* for three languages is complete and working:

- `pubspec.yaml` bundles **Noto Sans Telugu** and **Noto Sans Devanagari** at
  four weights each
- `AppTheme.light(locale)` / `.dark(locale)` do a script-aware font swap
- `lib/features/account/language_screen.dart` exists
- `MaterialApp.locale` is driven from `user.language`
- the backend serves `GET /i18n/translations/:lang`, and `/config/mobile`
  advertises `supportedLanguages: ["en","te","hi"]`
- `gid_api.dart` calls `/i18n/languages` and `PATCH /i18n/user/language`

**It calls `/i18n/translations/:lang` from nowhere.** So a customer picks
Telugu, the preference persists to their account, the typeface changes — and
every word on screen stays in English.

`srs.txt` §25 requires multilingual support, and the demo script in
`GET_IT_DONE_IMPLEMENTATION_PLAN.md` §11 opens with *"Customer opens Flutter app
and selects Telugu/Hindi/English."*

**Fix:** `flutter_localizations` + `l10n.yaml` + `app_en.arb` / `app_te.arb` /
`app_hi.arb`, extract the literals, and layer `/i18n/translations/:lang` over
the bundled ARB for operator-editable strings. Do it in the shared `gid_ui`
package (`WORKER_APP_PLAN.md` §2.2) so both apps get it once — and do it
**before** the worker app has 50 screens of English literals to retrofit.

---

## 🟠 4. The AI forecast is inert

Three independent problems, each enough on its own.

**a) The supply figure is a literal.** `ai/main.py:112`:

```python
available = 12 + area_index + service_index
```

`predicted_shortage = max(expected - available, 0)` — so the entire output of
the module, the input to allocation recommendations and (per
`TRAINING_MODULE_PLAN.md` §9) to training recommendations, is computed against a
worker count that was typed in by hand and never touches the database.

**b) "Area" is a full street address.** `routes/ai.ts:96`:

```sql
SELECT b.created_at::date as date, b.address as area, s.name as service, count(*)
FROM bookings b ... GROUP BY b.created_at::date, b.address, s.name
```

`bookings.address` is the free-text address the customer typed — *"Flat 302, Sai
Enclave, Road No 4, Kukatpally"*. Every booking is its own unique "area", so the
group-by returns roughly one row per booking and the area dimension carries no
signal. There is no locality or ward concept on a booking at all.

**c) Because of (b), the model never trains.** `ai/main.py:72` defaults
`areas` to three hardcoded names — `"Vijayawada Central"`, `"Benz Circle"`,
`"Gannavaram"` — and then filters the supplied history to rows whose `area` is
in that list. Real history keyed on street addresses matches none of them, so
`history` filters to empty, `len(history) >= 3` is false, the `RandomForestRegressor`
is never fitted, and every request falls to the baseline branch:

```python
expected = 18 + (area_index * 5) + (service_index * 3) + day_offset
drivers  = ["insufficient history; baseline estimate"]
```

The forecast in production is an arithmetic sequence, one hundred percent of the
time. The `drivers` string says so honestly, which is to the code's credit — but
nothing surfaces it.

**Fix, in order:** add a locality to bookings (reverse-geocode once at creation
— `maps/reverse-geocode` already exists — and store `locality` / `ward`
alongside the address); key the history query on that; read `available_workers`
from `workers` joined to `worker_service_areas` for the same locality; drop the
hardcoded area list in favour of what the caller passes; and hold the model
across requests rather than refitting per call. Also surface
`"insufficient history"` in the admin UI rather than presenting a baseline as a
forecast.

---

## 🟠 5. Operator accounts have no second factor

The pieces exist:

- `users.totp_secret` — `migration_phase18_admin_totp.sql`, in the migration list
- `TOTP_ISSUER` and `ADMIN_TOTP_SECRET` — `config/env.ts:135–138`
- `config/env.ts:165`: *"An admin account without TOTP is a single password
  between the internet and…"*

The migration's own header says:

> `POST /auth/admin/login` already reads `user.totpSecret` and refuses any role
> above support_staff without one.

**That route does not exist.** `routes/auth.ts` serves register, login, refresh,
logout, logout-all, me, forgot-password, reset-password, password/set,
password/change, sessions, security-events and oauth/google — and no
`admin/login`. There is no `otplib` or equivalent in `package.json`, and
`grep -i totp` over `src/routes` and `src/services` returns nothing.

So operator accounts — the ones that approve worker verifications, generate
settlements and trigger payouts — sign in through the ordinary `/auth/login`
with a password and nothing else.

**Fix:** install `otplib`, add `POST /auth/admin/login` with TOTP verification
and an enrolment flow (`/auth/admin/totp/enrol` → QR → confirm one code), and
refuse `society_admin` and above without an enrolled device. Then correct the
migration comment, which currently documents a route that was never written.

---

## 🟠 6. No CI

There is no `.github/workflows` directory. Nothing runs on push:

- 3 backend test files (`integration`, `razorpayClient`, `revenueSplit`) against
  42 route files
- 9 mobile test files, plus a golden suite that is currently **failing** — 124
  diff artifacts sit in `mobile/test/golden/failures/` (untracked, and not
  gitignored either, so they are permanent noise in `git status`)
- `oxlint` on web, `tsc -b` on web, `flutter analyze` on mobile — all manual

**Fix:** one workflow, four jobs — backend (`tsc` + `vitest`), web
(`tsc -b` + `oxlint` + `vite build`), mobile (`flutter analyze` + `flutter test`),
ai (`ruff` + `pytest`). Add `**/test/golden/failures/` to `.gitignore` while you
are there. This is half a day and it is the cheapest quality intervention
available, especially with two more apps about to be added to the repo.

---

## 🟠 7. Sentry is configured and not installed

`.env.example` carries `SENTRY_DSN=`. There is no `@sentry/node` in
`backend/package.json` and no `Sentry.init` anywhere in `src/`.

Same failure class as FCM (`WORKER_APP_PLAN.md` gap 4.2): an environment
variable that reads as "observability is handled" when nothing consumes it.
`core/logger.ts` (pino) and `core/metrics.ts` (Prometheus) are real and working;
what is missing is error aggregation with stack traces and release tagging.

**Fix:** either install and initialise it, or delete the variable. A config key
that does nothing is worse than an absent one, because it stops anyone asking
the question again.

---

## 🟠 8. The institutional module has no client

`routes/institutions.ts` and `routes/institutional.ts` are 624 lines and 21
endpoints of real, working code — institutional customers, contracts,
procurement. `srs.txt` and `REQUIREMENTS_AND_DEVELOPMENT_PLAN.md` both call for
it.

Nothing calls it. The customer app's 59 endpoints (`gid_api.dart`) include none
of them, and there is no web console to call them from.

**Decision needed, not code.** Either it is in scope — in which case it needs a
surface, and the web console is the natural home — or it is not, in which case
it should be marked experimental so nobody maintains it as if it were shipped.
Leaving 624 lines of unreachable feature code in the tree is the worst of the
three options.

---

## 🟡 9. Rate limiting covers `/auth` and nothing else

`app.ts:119` is the only `rateLimit()` in the codebase:

```ts
app.use("/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 60 }));
```

Unthrottled and worth throttling:

- `POST /payments/webhooks/:provider` — HMAC-verified, but signature checking is
  itself work an attacker can force
- `POST /bookings` — idempotency-keyed, so a replay is cheap, but a *new* key
  per request is not
- `POST /bookings/:id/verify-start` / `verify-complete` — 6-digit OTPs.
  `core/otp.ts` may cap attempts per booking; a per-IP limit is the second lock
- `POST /maps/*` — every one of these spends money on a Google API call, on a
  server key, behind `requireAuth`. One compromised account can run up a bill
- `/ai/*` — each call fits a model

**Fix:** a small set of named limiters — `strict` for OTP and webhooks,
`metered` for anything that calls a paid third party, `standard` elsewhere.

---

## 🟡 10. An unmatched worker has no way to find out why

`findMatchingWorkers` requires **five** conditions, every one of them silent:

```sql
join worker_locations wl on wl.worker_id = w.id          -- ever posted a fix?
join worker_service_areas wsa on ... and wsa.service_id in (...)
where w.verification_status = 'verified'
  and u.status = 'active'
  and w.location_sharing_enabled = true
  and st_dwithin(...) and st_distance(...) <= wsa.radius_km * 1000
```

Both joins are INNER. A worker who is verified, has set skills, and has simply
never toggled location sharing is invisible to dispatch, forever, with no
message anywhere telling them so. Add the skills split-brain (§2) and it is
entirely possible to complete onboarding and never receive a single offer.

**Fix:** `GET /workers/me/dispatch-readiness` returning a per-condition
checklist — verified ✓, location shared ✗, service areas set ✓, skills declared
✓, inside a service area ✓ — and render it on the worker app's Today screen
whenever the worker is online and ineligible. This belongs in
`WORKER_APP_PLAN.md` Phase 1; it is cheap and it is the difference between a
worker who stays and one who deletes the app.

---

## 🟡 11. The written specs cannot be trusted as specs

- `TASKLIST.md` is **368 unchecked, 1 checked** — while `workers.ts`,
  `earnings.ts`, `documents.ts`, `skills.ts` and most of §2 and §4 are built and
  serving. The document says almost nothing is done; the code says otherwise.
- `routes/compat.ts` exists *because* the blueprint documented routes the code
  never served. Its own header:

  > `SYSTEM_INTEGRATION_AND_ARCHITECTURE_BLUEPRINT.md` documents a set of routes
  > as "Implemented" that the code actually serves under different spellings […]
  > A client written against the specification got a 404 from every one of them.

- `migration_phase18_admin_totp.sql` describes a route that does not exist (§5).

Four planning documents at the repo root, and the reliable one is
`swagger.json`, which is generated. **Fix:** demote the narrative docs to
history, keep the generated OpenAPI spec as the contract, and let `TASKLIST.md`
either be maintained or be deleted. A stale checklist is worse than none,
because it hides the real remaining work — which is what this audit had to go to
the source to find.

---

## 🟡 12. The web app has no deployment path

`docker-compose.yml` has `postgres`, `redis`, `backend`, `ai` and `minio`.
Dockerfiles exist for `backend` and `ai`. There is no `web` service and no
`web/Dockerfile`.

Not urgent while there are no pages (§1), but it lands on the same critical path
the moment there are.

---

## Where this leaves the roadmap

The two existing plans cover the **worker** and the **training** sides. This
audit says the sequencing has to change in three places:

1. **§2 (skills split-brain) and §3 (localisation) must be fixed before the
   worker app is built**, not after. Both are cheap now and expensive once there
   are 50 more screens and a second set of writers.
2. **§1 (the web console) is a third plan**, comparable in size to the worker
   app, and it unblocks a backend that is already finished. Settlements — the
   only path money leaves the platform — currently have no operator UI at all.
3. **§4 (the AI forecast) blocks `TRAINING_MODULE_PLAN.md` §9.** Training
   recommendations are scored on predicted shortage; today that number is
   fabricated. Fix the locality and the supply query before building anything
   on top of the forecast.

Suggested order, before anything else starts:

| | Work | Effort |
|---|---|---|
| 1 | §6 CI, §7 Sentry decision, §9 rate limiters | ~1 day |
| 2 | §2 skills consolidation + backfill | ~2 days |
| 3 | §3 localisation into `gid_ui` (both apps) | ~3 days |
| 4 | §5 admin TOTP | ~1 day |
| 5 | §4 AI locality + real supply query | ~2 days |
| 6 | §1 web console — its own plan | weeks |
