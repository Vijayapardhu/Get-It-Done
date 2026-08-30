-- Phase 26: the schema the worker app needs and the platform does not yet have.
--
-- Everything here is drawn from WORKER_APP_PLAN.md section 4 -- the gaps found
-- by reading the code rather than the blueprint. Grouped by the gap it closes,
-- so a reader can go from a numbered section in that document to the tables
-- here.

-- =========================================================================
-- 4.1  The job offer is a row, not a hope
-- =========================================================================
--
-- Today an assignment writes a notification and arms a 45-second timer the
-- client is never told about. The worker app cannot render a countdown against
-- a deadline it cannot see, and a socket event alone is not a source of truth:
-- an app that was in a pocket when the offer fired needs somewhere to ask
-- "what is live for me right now?".
--
-- One row per offer made to one worker. `expires_at` is the SERVER's deadline
-- and is what the countdown renders against; nothing client-side invents it.
create table if not exists job_offers (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings(id) on delete cascade,
  worker_id    uuid not null references workers(id) on delete cascade,
  -- Denormalised so the offer list is one query keyed on the authenticated
  -- user, without a join back through workers on every poll.
  user_id      uuid not null references users(id) on delete cascade,
  status       text not null default 'offered'
    check (status in ('offered', 'accepted', 'declined', 'expired', 'revoked')),
  -- The payload as it was actually sent: payout, distance, ETA, area name.
  -- Frozen, because a worker who accepted a job showing 412 rupees must be able
  -- to point at what they were shown, not at what the price is now.
  payload      jsonb not null default '{}'::jsonb,
  attempt      int not null default 1,
  offered_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  responded_at timestamptz,
  -- Structured, not prose: the decline sheet has four buttons and matching has
  -- to be able to count them. 4.6 applies the same rule to cancellation.
  decline_reason text
    check (decline_reason is null or decline_reason in
      ('too_far', 'busy', 'not_my_trade', 'unsafe', 'rate_too_low', 'other')),
  revoked_reason text
    check (revoked_reason is null or revoked_reason in
      ('timeout', 'reassigned', 'cancelled', 'taken'))
);

-- One live offer per (booking, worker): re-offering the same job to the same
-- worker on a later attempt is a new row, but only once the previous is closed.
create unique index if not exists job_offers_live_unique_idx
  on job_offers (booking_id, worker_id) where status = 'offered';
create index if not exists job_offers_worker_live_idx
  on job_offers (user_id, expires_at) where status = 'offered';
create index if not exists job_offers_booking_idx on job_offers (booking_id);

-- =========================================================================
-- 4.4  Working hours
-- =========================================================================
--
-- `workers.current_status` is three values and no calendar. A worker who
-- forgets to go offline is offered a 2am drain unblock, and matching has no way
-- to know they are asleep.
--
-- Local wall-clock times, evaluated in Asia/Kolkata. A worker thinks "I work
-- eight to six", not "I work 02:30Z to 12:30Z", and a stored timestamptz would
-- silently shift their shift.
create table if not exists worker_availability_schedule (
  worker_id uuid not null references workers(id) on delete cascade,
  weekday   smallint not null check (weekday between 0 and 6),   -- 0 = Sunday
  starts_at time not null,
  ends_at   time not null,
  primary key (worker_id, weekday, starts_at),
  constraint worker_schedule_range_check check (ends_at > starts_at)
);

create table if not exists worker_time_off (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references workers(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  created_at timestamptz not null default now(),
  constraint worker_time_off_range_check check (ends_at > starts_at)
);

create index if not exists worker_time_off_window_idx
  on worker_time_off (worker_id, starts_at, ends_at);

-- =========================================================================
-- 4.5  Time is bought but never tracked
-- =========================================================================
--
-- phase 17 sells `duration_minutes`. Nothing records how long the work actually
-- took, so a two-hour clean that needs a third hour has no path today other
-- than the worker doing it free or the customer booking again.
alter table bookings add column if not exists work_started_at  timestamptz;
alter table bookings add column if not exists work_finished_at timestamptz;

create table if not exists booking_time_extensions (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings(id) on delete cascade,
  requested_by uuid not null references users(id),
  minutes      int not null check (minutes > 0 and minutes <= 480),
  -- Priced at the rate frozen onto the booking, never at today's rate: the
  -- customer agreed to a per-minute figure, and an extension is more of the
  -- same work rather than a new quote.
  amount       numeric(10, 2) not null,
  status       text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'expired')),
  note         text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references users(id)
);

create index if not exists booking_time_extensions_booking_idx
  on booking_time_extensions (booking_id, created_at desc);
create unique index if not exists booking_time_extensions_one_pending_idx
  on booking_time_extensions (booking_id) where status = 'pending';

-- =========================================================================
-- 4.6  Arrival, waiting and the no-show
-- =========================================================================
--
-- There is no state between `en_route` and `started`, so nothing records that
-- the worker was at the door at 10:02 and the customer opened it at 10:19. And
-- there is no no-show path at all: the current failure mode is a worker outside
-- a locked gate with no button to press.
alter table bookings drop constraint if exists bookings_status_check;
alter table bookings add  constraint bookings_status_check
  check (status in ('requested', 'matching', 'assigned', 'accepted', 'en_route',
                    'arrived', 'started', 'completed', 'cancelled', 'expired',
                    'disputed', 'refunded', 'no_show'));

alter table bookings add column if not exists arrived_at timestamptz;
-- The GPS fix taken at the moment "I'm here" was pressed. Kept apart from
-- worker_locations, which is a moving cursor: this one must never change.
alter table bookings add column if not exists arrival_location geography(point, 4326);
alter table bookings add column if not exists arrival_accuracy_m numeric(8, 2);

-- Free-text prose cannot be counted. The fairness analytics in analytics.ts
-- need an enum, so a cancellation carries one alongside whatever was typed.
alter table bookings add column if not exists cancellation_reason_code text;
alter table bookings drop constraint if exists bookings_cancellation_reason_check;
alter table bookings add  constraint bookings_cancellation_reason_check
  check (cancellation_reason_code is null or cancellation_reason_code in
    ('customer_unreachable', 'customer_cancelled', 'address_wrong',
     'unsafe_site', 'job_not_as_described', 'worker_emergency',
     'vehicle_breakdown', 'no_show', 'other'));

-- =========================================================================
-- 4.7  Location has nowhere to queue
-- =========================================================================
--
-- `worker_locations` holds exactly one fix per worker. A worker in a basement
-- accumulates fixes with nothing to do with them, and the customer's map
-- freezes. The trail is what a batch drains into; the single-row cursor stays
-- exactly as it is, so every existing matching query keeps working unchanged.
alter table worker_locations add column if not exists accuracy_m  numeric(8, 2);
alter table worker_locations add column if not exists is_mocked   boolean not null default false;
alter table worker_locations add column if not exists recorded_at timestamptz;

create table if not exists worker_location_trail (
  id          bigserial primary key,
  worker_id   uuid not null references workers(id) on delete cascade,
  booking_id  uuid references bookings(id) on delete set null,
  location    geography(point, 4326) not null,
  accuracy_m  numeric(8, 2),
  -- 4.9: a platform that pays per completed job and verifies arrival by GPS is
  -- a fraud target, and mock-location apps are one Play Store search away.
  -- Recorded on every fix, so a dispute has evidence rather than an argument.
  is_mocked   boolean not null default false,
  recorded_at timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists worker_location_trail_worker_idx
  on worker_location_trail (worker_id, recorded_at desc);
create index if not exists worker_location_trail_booking_idx
  on worker_location_trail (booking_id, recorded_at) where booking_id is not null;

-- =========================================================================
-- 4.8  SOS
-- =========================================================================
--
-- welfare.ts has a safety-incident form, filed after the fact. Nothing gets a
-- distressed worker's live position in front of a human right now.
create table if not exists worker_sos_incidents (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references workers(id) on delete cascade,
  booking_id      uuid references bookings(id) on delete set null,
  location        geography(point, 4326),
  note            text,
  status          text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved', 'false_alarm')),
  acknowledged_by uuid references users(id),
  acknowledged_at timestamptz,
  resolved_at     timestamptz,
  resolution      text,
  created_at      timestamptz not null default now()
);

create index if not exists worker_sos_open_idx
  on worker_sos_incidents (created_at desc) where status in ('open', 'acknowledged');

-- =========================================================================
-- 4.9  Mock-location defence
-- =========================================================================
alter table workers add column if not exists mock_location_flags int not null default 0;
alter table workers add column if not exists mock_location_flagged_at timestamptz;

-- =========================================================================
-- 4.11  Offer preferences
-- =========================================================================
--
-- TASKLIST section 3 lists "preferred areas, excluded customers" unchecked. The
-- minimum that changes a worker's day: how far they are willing to travel, and
-- never being offered a customer they filed a safety incident about.
create table if not exists worker_offer_preferences (
  worker_id                 uuid primary key references workers(id) on delete cascade,
  max_travel_km             numeric(6, 2)
    check (max_travel_km is null or (max_travel_km > 0 and max_travel_km <= 100)),
  accept_emergency          boolean not null default true,
  -- End of shift turns the duty toggle off by itself, so going offline is not
  -- something to remember at the end of a twelve-hour day.
  auto_offline_at_shift_end boolean not null default true,
  updated_at                timestamptz not null default now()
);

create table if not exists worker_blocked_customers (
  worker_id   uuid not null references workers(id) on delete cascade,
  customer_id uuid not null references users(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  primary key (worker_id, customer_id)
);
