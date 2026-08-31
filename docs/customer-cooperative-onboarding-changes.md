# Customer Cooperative Onboarding — Implementation Tracker

## Goal

A new customer signs up, the app detects their location, links them to the
local cooperative, and the worker image (avatar) is shown consistently across
the home screen, active booking, chat, and trust screens.

This file is the change log. Each item lists what to do, the file to touch,
and a status.

---

## 1. Backend

### 1.1 Migration — `users.cooperative_id` and home fields ✅ DONE

**File:** `backend/src/db/migrations/migration_phase35_customer_cooperative.sql`

Added:
- `users.cooperative_id` (FK → `cooperatives.id`, ON DELETE SET NULL)
- `users.home_address`, `home_latitude`, `home_longitude`
- `users.location_resolution_method` (check constraint: gps | pincode | manual)
- `users.location_resolved_at`
- Partial index on `users(cooperative_id)` WHERE not null

### 1.2 `publicUser` exposes cooperative info ✅ DONE

**File:** `backend/src/routes/auth.ts` line ~166

Added `cooperativeId`, `cooperativeName`, `homeAddress` to the `publicUser`
shape so every authenticated response carries the user's cooperative.

### 1.3 `authService.toUser` + `publicUserColumns` JOIN cooperatives ✅ DONE

**File:** `backend/src/services/authService.ts` lines 12–22

Added a `LEFT JOIN cooperatives ON cooperatives.id = users.cooperative_id` and
a `userJoinClause` constant. Every query that returns a `User` now includes
`cooperative_id`, `cooperative_name`, and `home_address`. INSERT and UPDATE
statements use a CTE wrapper so the join still works against RETURNING:

```sql
WITH inserted AS (INSERT INTO users ... RETURNING *)
SELECT ... FROM inserted users LEFT JOIN cooperatives ON ...
```

### 1.4 New endpoint — `POST /auth/onboard/location` ⏳ IN PROGRESS

**File:** `backend/src/routes/auth.ts` (new route, just before `export default authRouter`)

**Why:** today the customer app skips onboarding and goes straight to home. The
`locationBootstrapProvider` only saves a saved address; it never resolves a
cooperative. This endpoint does the resolution server-side and persists it.

**Behaviour:**

```ts
POST /auth/onboard/location
Body: {
  method: "gps" | "pincode" | "manual",
  latitude?: number,
  longitude?: number,
  pincode?: string,
  cooperativeId?: string,    // only for method=manual
  homeAddress?: string         // optional formatted address
}
```

**Logic:**
1. If `method === "gps"`, call
   `territoryService.resolveSocietyByCoordinates(lat, lng)`.
2. If `method === "pincode"`, look up the pincode in a new
   `cooperative_pincodes` table (add migration if not present). Fallback: also
   call `resolveSocietyByCoordinates` against the pincode centroid if
   available, else 404.
3. If `method === "manual"`, require `cooperativeId` in the body and verify the
   cooperative exists and is `status='active'`.
4. `UPDATE users SET cooperative_id, home_address, home_latitude, home_longitude,
   location_resolution_method, location_resolved_at = now() WHERE id = $userId`.
5. Return `{ user: <updated publicUser>, cooperative: { id, name, district, state,
   federationId } }`.

**Status codes:**
- 200 — cooperative resolved and persisted
- 404 — `NO_COOPERATIVE_IN_AREA` (the customer is outside every active
  territory; the app shows the "coming soon" screen)
- 400 — malformed body

### 1.5 `GET /territories/resolve` already exists — reuse it ✅ DONE

**File:** `backend/src/routes/territory.ts` line 216

`GET /territories/resolve?lat=X&lng=Y` is already implemented. The onboarding
endpoint can call `territoryService.resolveSocietyByCoordinates` directly
without hitting the route, but the route is preserved for the address picker
screen.

### 1.6 New endpoint — `GET /cooperatives/list-for-picker` ⏳ PENDING

**File:** `backend/src/routes/cooperatives.ts` (new route)

**Why:** the manual fallback path of onboarding needs a searchable list of
cooperatives for the customer to pick from. `GET /cooperatives/societies`
already exists but is admin-scoped; this is a public version that returns
`{ id, name, district, state, federationName }` for cooperatives with
`status='active'`.

```ts
GET /cooperatives/picker?q=search
Response: { cooperatives: [{ id, name, district, state, federationName }] }
```

No auth required. Soft cap at 50 results. Used only by the manual fallback
path of onboarding.

### 1.7 Worker avatar already in worker models ✅ DONE (verified)

**File:** `backend/src/routes/workers.ts`, `admin.ts`, `workerDashboard.ts`,
`workerApp.ts`

`u.avatar_url` is selected in the worker endpoints (search, detail, dashboard).
The Dart `Worker` / `WorkerJob` models already carry `avatarUrl`. The `WorkerAvatar`
widget is used in:
- `mobile/lib/features/home/home_screen.dart` (favourites)
- `mobile/lib/features/booking/track_booking_screen.dart`
- `mobile/lib/features/booking/booking_otp_screen.dart`
- `mobile/lib/features/booking/review_screen.dart`
- `mobile/lib/features/chat/chat_screens.dart`
- `mobile/lib/features/account/edit_profile_screen.dart`
- `mobile/lib/app/trust_screen.dart`
- `mobile_worker/lib/features/profile/profile_screen.dart` (worker side)

Gap: `active_job_screen.dart` on the worker side and the customer's
`order_confirmed_screen.dart` show a worker but do not show the avatar. See
section 3.3.

---

## 2. Shared package — `gid_core`

### 2.1 `AppUser` carries cooperative info ✅ DONE

**File:** `packages/gid_core/lib/models/models.dart` lines 13–117

Added `cooperativeId`, `cooperativeName`, `homeAddress` fields. `fromJson` reads
both camelCase (`/auth/me`) and snake_case (`/users/me`) forms. New getter
`hasCooperative` returns `true` when the user is a customer AND has a non-empty
`cooperativeId`.

---

## 3. Customer app (`mobile/`)

### 3.1 New onboarding flow — 4 screens ⏳ PENDING

**New directory:** `mobile/lib/features/onboarding/`

The flow runs after successful sign-in or registration, BEFORE the app shell,
when the user has no cooperative yet. Each screen has a single job and a
single primary action.

**`onboarding_gate.dart`** — A `ConsumerWidget` that watches
`currentUserProvider`. If the user is signed in and `!user.hasCooperative`,
it pushes the onboarding flow. Otherwise transparent.

**`welcome_screen.dart`** — One full-bleed hero card:
- Headline: "Welcome to your cooperative"
- Body: "GET IT DONE works with local cooperatives. We need to know where you
  are to connect you with yours. It takes ten seconds."
- Single button: "Find my cooperative".

**`location_permission_screen.dart`** — Asks for location. The copy explains
why: "We use your location to find the cooperative that serves your address.
We never share it with anyone outside that cooperative." Two buttons:
- "Use my location" (primary) → requests `ACCESS_FINE_LOCATION`. On grant,
  reads the fix, calls reverse-geocode, then resolves.
- "Enter pincode instead" (secondary) → pushes `pincode_screen.dart`.
- "Choose from a list" (tertiary, text) → pushes `manual_picker_screen.dart`.

**`confirm_screen.dart`** — Shows the resolved cooperative as a card with
logo, name, district. Asks the user to confirm. On confirm, calls
`POST /auth/onboard/location` with `method: 'gps'`, lat, lng, formatted
address.

**`pincode_screen.dart`** — Single 6-digit field. On submit, calls
`POST /auth/onboard/location` with `method: 'pincode'`. Backend maps
pincode → cooperative centroid → territory.

**`manual_picker_screen.dart`** — Search field, calls
`GET /cooperatives/picker?q=...`, renders the list, lets the user pick one.
On pick, calls `POST /auth/onboard/location` with `method: 'manual'`.

**`done_screen.dart`** — "You're set up." with the cooperative name. One
button: "Open GET IT DONE". Tapping pops the entire onboarding flow back to
the root.

### 3.2 Gate the root to onboarding ⏳ PENDING

**File:** `mobile/lib/app/app.dart` lines 116–152

Add to `_rootFor`:
```dart
if (auth.isAuthenticated &&
    auth.user != null &&
    auth.user!.isCustomer &&
    !auth.user!.hasCooperative) {
  return const OnboardingGate(key: ValueKey('onboarding'));
}
```

The gate rebuilds when `currentUserProvider` changes, so as soon as the
onboarding flow persists the cooperative, the root swaps to the shell.

### 3.3 Worker avatar where it is missing ⏳ PENDING

**`mobile_worker/lib/features/job/active_job_screen.dart`**
Add `WorkerAvatar(name: job.contactName, imageUrl: ???)` next to the contact
name in the "The door" section. The `WorkerJob` model already has
`contactName` and `contactPhone`; the `avatarUrl` is on the booking
endpoint but not on the `WorkerJob` today. Add it.

**`mobile/lib/features/orders/order_confirmed_screen.dart`**
The booking confirmed screen shows a worker — render their `WorkerAvatar`
above the worker name.

### 3.4 Home screen shows the user's cooperative ⏳ PENDING

**File:** `mobile/lib/features/home/home_hero.dart` lines 87–115

Replace the static "Verified workers, from your local cooperative" line with
the user's actual cooperative name: "Verified workers from
**{user.cooperativeName}**". When the cooperative is unset (during
onboarding), the line is hidden — the onboarding flow is the source of
truth at that point.

### 3.5 Profile tab shows the cooperative ⏳ PENDING

**File:** `mobile/lib/features/account/profile_tab.dart`

Add a section between the avatar and the menu: "Your cooperative —
{name}", with a "Change" button that reopens the onboarding flow's
`location_permission_screen` (skip the welcome step on a re-run).

---

## 4. Worker app (`mobile_worker/`)

### 4.1 No changes needed for this feature

The worker app already has its own onboarding flow that links a worker to a
cooperative. The customer-side change does not touch the worker app.

---

## 5. Testing

### 5.1 Backend unit tests ⏳ PENDING

Add to `backend/src/__tests__/authService.test.ts`:
- `publicUser` shape includes `cooperativeId`, `cooperativeName`, `homeAddress`
  for a user linked to a cooperative
- A user with no cooperative returns `cooperativeId: null`,
  `cooperativeName: null`, `homeAddress: null`
- The cooperative_id field is null after a fresh INSERT and is non-null after
  the onboarding endpoint runs

### 5.2 Customer app widget tests ⏳ PENDING

- `OnboardingGate` pushes the flow when `user.hasCooperative === false`
- `OnboardingGate` is transparent when `user.hasCooperative === true`
- `WorkerAvatar` renders the photo when `imageUrl` is non-null and the
  initials otherwise

### 5.3 Manual test plan

1. Sign up with a fresh email. App should land on the welcome screen, not
   the home screen.
2. Grant location permission. Confirm screen should show the cooperative
   resolved from the device's current location.
3. Decline location. Pincode screen should appear. Enter a known pincode in
   an active area. Confirm.
4. Decline location and choose "list". The picker should show at least one
   active cooperative. Pick one. Confirm.
5. After onboarding, the home header should show the cooperative name. The
   profile tab should show the cooperative. A booking at the current
   location should be routed to the chosen cooperative.
6. Force-quit the app, relaunch. The onboarding flow should not re-appear;
   the user goes straight to home with their cooperative.

---

## 6. Risks and rollouts

- **Migration on a live DB:** the migration adds columns, no destructive
  changes. Safe to run while the API is up.
- **Backward compatibility:** `publicUser` adds new fields. Existing clients
  ignore unknown fields. No breaking change.
- **Routing:** the customer app, the worker app, and the admin app all hit
  `/auth/me`. The new fields are additive.
- **Privacy:** location is stored server-side. Audit the `users` table for
  encryption-at-rest; the existing `home_latitude/home_longitude` columns
  are nullable and do not change the threat model.

---

## 7. Out of scope

- Showing the customer's avatar to the worker (already done in
  `order_contact` migration phase 20).
- Cooperative-side admin screens for "approve a customer" (out of scope;
  the customer is auto-linked to the cooperative by territory, not approved
  by an admin).
- A worker-side screen for "my cooperative's customers" (out of scope;
  workers only see the customer at the booking level, not a roster).
