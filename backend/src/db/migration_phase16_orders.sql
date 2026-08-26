-- Multi-service checkout.
--
-- A cart can hold plumbing and electrical work at once, but a BOOKING cannot:
-- it is assigned to exactly one worker, and those are two different trades.
-- Matching, the start/completion OTP handshake, the price freeze and the
-- worker-accept timeout are all per booking and per worker, and none of that
-- survives being pointed at a list of services.
--
-- So a cart does not become one booking with many lines. It becomes an ORDER
-- that groups several bookings — one per service — each matched and tracked on
-- its own, while the customer checks out once, for one address, at one time.
--
-- Named service_orders because `payment_orders` (Razorpay) and
-- `purchase_orders` (institutional procurement) already exist and mean
-- entirely different things.

create table if not exists service_orders (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references users(id),

  -- How the customer wants it done. `instant` matches now, `scheduled` holds a
  -- slot, `recurring` also creates rows in recurring_bookings.
  mode          text not null check (mode in ('instant', 'scheduled', 'recurring')),

  scheduled_at  timestamptz,

  -- The address is copied onto the order, not only referenced. A saved address
  -- that is later edited or deleted must not silently rewrite where a past job
  -- was carried out.
  address       text not null,
  address_id    uuid references addresses(id) on delete set null,
  location      geography(Point, 4326) not null,

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- A scheduled order without a time is not scheduled. Enforced here because the
-- alternative is a booking that never surfaces in anyone's calendar.
alter table service_orders drop constraint if exists service_orders_scheduled_needs_time;
alter table service_orders add constraint service_orders_scheduled_needs_time
  check (mode <> 'scheduled' or scheduled_at is not null);

-- Nullable: every booking made before this existed has no order, and a booking
-- made straight from a service page still does not need one.
alter table bookings add column if not exists order_id uuid references service_orders(id) on delete set null;

create index if not exists bookings_order_idx on bookings (order_id);
create index if not exists service_orders_customer_idx on service_orders (customer_id, created_at desc);
