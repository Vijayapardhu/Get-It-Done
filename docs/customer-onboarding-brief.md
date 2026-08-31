# Customer Onboarding Flow — Product Design Brief

## 1. The Goal

A customer opens the app for the first time and, inside ninety seconds, has:
- an account,
- a verified identity,
- a cooperative assigned to their location,
- and a home screen showing services available in their area.

Everything before the home screen is a means to that end. Nothing is optional except the photo, and even that is deferred gracefully.

---

## 2. The Logic Before the Screens

### 2.1 Cooperative Routing Rule

**All tasks booked at a customer's address are routed exclusively to workers belonging to that address's nearest cooperative.**

This is a backend routing rule, not a UI suggestion. The UI reflects it; it does not decide it.

```
Customer signup
  → GPS / pincode resolves to a cooperative_id
  → All bookings at this address carry cooperative_id
  → Worker matching queries WHERE cooperative_id = X AND status = 'available'
  → No cross-cooperative leakage
```

### 2.2 Cooperative Resolution Order

1. **GPS first.** On the permission screen, ask for location. If granted, reverse-geocode to a cooperative boundary.
2. **Pincode fallback.** If GPS is denied or unavailable, ask for a pincode. The backend has a `pincode → cooperative_id` lookup table.
3. **Manual fallback.** If both fail (airplane mode, dead zone), present a searchable list of cooperatives by name and city. The customer picks one. This is the rare path.

### 2.3 Cooperative Switching

A customer may move. A "Change area" button in Settings re-runs resolution. Existing bookings stay with the original cooperative (the worker is already en route). New bookings use the new one.

---

## 3. The Screens

### Screen 1 — Language Gate

**When:** First launch, every time until chosen.

**What:** Three large buttons: తెలుగు, English, हिंदी. Full-bleed navy background. No other text.

**Logic:**
- Tap → persist `locale` to secure storage → push `/sign-in`.
- Never ask again, but remain changeable from Settings.

**Why first:** An app that opens in English and hides Telugu three taps deep is an English app with a Telugu setting. The worker app already does this; the customer app must match.

---

### Screen 2 — Sign In / Register

**When:** After language chosen. Single route, two modes (tab or toggle).

**Mode A — Sign In**
- Email + password fields.
- "Sign in" button.
- "Create account" link below.

**Mode B — Register**
- Full name (required).
- Phone number (required, validated as 10-digit Indian mobile).
- Email (required).
- Password (8+ characters, shown/hidden toggle).
- Confirm password (live match indicator).

**Logic:**
- On submit → `POST /auth/register` with `role: customer`.
- On success → push `/onboarding/location`.
- On error → inline message, no navigation away.

**Google Sign-In:** Available on sign-in only (not register). The Google account supplies email and name; the phone field is still required because the cooperative needs a number the worker can call. If the Google account has no phone, show the field post-OAuth.

---

### Screen 3 — Location Permission

**When:** Immediately after sign-up. Not buried in onboarding.

**What:**
- Hero icon: a map pin.
- Heading: "Find workers near you"
- Body: "We use your location to connect you with the cooperative that serves your area. Your exact address is only shared after you book a job."
- Two buttons:
  - **"Use my location"** (primary, filled) → requests `ACCESS_FINE_LOCATION`.
  - **"Enter pincode instead"** (secondary, text button) → pushes `/onboarding/pincode`.

**Logic:**
- Permission granted → reverse geocode → `POST /customers/me/area` with `{ cooperativeId, latitude, longitude, addressSnippet }` → push `/onboarding/photo`.
- Permission denied → show a non-dismissible banner: "Location is needed to show available services. You can enter your pincode below." → show pincode field inline.
- If resolution returns a cooperative → push `/onboarding/photo`.
- If resolution returns **no cooperative** (edge of service area) → show screen 3A.

---

### Screen 3A — No Cooperative Found

**When:** Rare. GPS/pincode resolved to a location outside current cooperative boundaries.

**What:**
- Heading: "We are not in your area yet"
- Body: "GET IT DONE is expanding. Right now, cooperatives are active in [list of nearby cities]. Enter your email and we will notify you when we launch nearby."
- Email field + "Notify me" button.
- Below: "Or browse services in [nearest city]" → navigates to that city's service catalogue in read-only mode.

**Logic:**
- Email saved to launch waitlist.
- Account created but `cooperative_id = null`.
- App enters a limited "coming soon" state — catalogue visible, booking disabled.

---

### Screen 3B — Pincode Entry

**When:** Chosen from Screen 3, or shown inline after permission denial.

**What:**
- 6-digit pincode field, numeric keyboard.
- "Continue" button.
- "Back" link.

**Logic:**
- On submit → `POST /customers/me/area?method=pincode`.
- Backend looks up cooperative. Same success/no-cooperative paths as Screen 3.

---

### Screen 4 — Profile Photo

**When:** After cooperative assigned. Presented as a single question: "How should workers recognise you?"

**What:**
- Large circular preview area (placeholder with camera icon).
- "Take a photo" button (launches camera).
- "Choose from gallery" button.
- "Skip for now" (small, text button at bottom).

**Logic:**
- Photo taken → compressed client-side (max 400×400, 80% JPEG) → `POST /customers/me/photo`.
- Skipped → continue. The photo is requested again at first booking if still absent.
- On success → push `/onboarding/complete`.

---

### Screen 5 — Confirmation

**When:** After photo (or skip).

**What:**
- Checkmark animation.
- "You are set up"
- Body: "Your cooperative is [name]. Services available in your area will appear on the home screen."
- "Go to home" button.

**Logic:**
- Tap → `GET /services?cooperativeId=X&near=lat,lng` to pre-fetch the catalogue → push `/` (home).
- The home screen now shows services for this cooperative only.

---

## 4. The Backend Logic

### 4.1 Cooperative Resolution Endpoint

```
POST /customers/me/area
Body: { method: 'gps'|'pincode'|'manual', cooperativeId?: string, latitude?: number, longitude?: number, pincode?: string }
Response: { cooperativeId, cooperativeName, city, addressSnippet }
```

### 4.2 Cooperative Lookup Rules

| Input | Resolution |
|---|---|
| GPS + cooperative boundary polygon contains point | Nearest cooperative by centroid distance |
| GPS + no polygon contains point | Fall back to pincode lookup |
| Pincode | Hard lookup in `pincode_cooperative` table |
| Manual search | Exact match on cooperative name |

### 4.3 Cooperative Boundary Data

Maintained by platform admins. Each cooperative has:
- A polygon (GeoJSON) or a radius+centroid for simpler cases.
- A pincode list (explicit, for rural areas where polygons are coarse).
- A `service_radius_km` — beyond this, the cooperative does not accept bookings.

### 4.4 Booking Routing

```
CREATE TABLE bookings (
  ...
  cooperative_id uuid REFERENCES cooperatives(id),
  ...
);

-- Worker matching query:
SELECT w.* FROM workers w
WHERE w.cooperative_id = :cooperative_id
  AND w.current_status = 'available'
  AND w.verification_status = 'verified'
ORDER BY w.distance_to_customer ASC
LIMIT 1;
```

No join table, no override. The cooperative_id on the booking is the authority.

---

## 5. Edge Cases and How They Feel

| Situation | What the Customer Sees | What the System Does |
|---|---|---|
| GPS on, cooperative found | Silent progress to photo screen | Writes cooperative_id to profile |
| GPS on, no cooperative | "Not in your area yet" screen | Creates account with `cooperative_id = null` |
| GPS denied | Inline pincode field + banner | No cooperative written until pincode resolved |
| Pincode has no cooperative | Same "Not in your area yet" screen | Adds pincode to launch waitlist for nearest cooperative |
| Customer moves | "Change area" in Settings | Re-runs resolution; new bookings use new cooperative |
| Cooperative closes | App shows "Area unavailable" on home | Backend flags `cooperative.active = false`; customer prompted to pick another |

---

## 6. The Home Screen After Onboarding

The home screen is a service catalogue, but filtered:

```
GET /services?cooperativeId={customer.cooperativeId}&near={lat,lng}
```

Only services from the assigned cooperative are returned. If the cooperative offers no plumbers, the plumbing category is absent from the grid — not greyed out, not hidden behind a tap, simply not there.

This is the moment the customer experiences cooperative routing as normal: they see what their neighbours see, booked by their neighbours' workers, and the worker who arrives is someone from the same area who belongs to the same cooperative.

---

## 7. Data Model Changes

### 7.1 Customer Profile

```sql
alter table users add column if not exists cooperative_id uuid references cooperatives(id);
alter table users add column if not exists home_address text;
alter table users add column if not exists home_latitude double precision;
alter table users add column if not exists home_longitude double precision;
alter table users add column if not exists location_resolution_method text check (location_resolution_method in ('gps','pincode','manual'));
alter table users add column if not exists location_resolved_at timestamptz;
```

### 7.2 Booking

```sql
alter table bookings add column if not exists cooperative_id uuid references cooperatives(id);
create index idx_bookings_cooperative on bookings(cooperative_id);
```

### 7.3 Cooperative Boundaries

```sql
create table if not exists cooperative_boundaries (
  cooperative_id uuid references cooperatives(id) on delete cascade,
  pincode text not null,
  primary key (cooperative_id, pincode)
);

-- For polygon-based boundaries, store as GeoJSON in cooperatives table:
alter table cooperatives add column if not exists boundary_geojson jsonb;
```

---

## 8. Success Criteria

1. A new customer reaches the home screen in under 90 seconds on a 3G connection.
2. 95% of sign-ups resolve to a cooperative without manual intervention (GPS or pincode).
3. Zero cross-cooperative bookings: enforced by DB foreign key and matching query, not by convention.
4. A customer who skips the photo is re-prompted at first booking, not at second launch.
5. Changing cooperative does not orphan existing bookings.
