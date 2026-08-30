-- Phase 24: the booking columns the application has always read but no
-- migration ever created.
--
-- These existed only on developer databases predating the migration runner. On
-- any database built from the migration list every one of them is a 500:
--
--   address_id      bookingService.ts INSERTs it on every create-booking, and
--                   seed.sql writes it -- so creating a booking against a saved
--                   address died with `column "address_id" does not exist`.
--   booking_number  read by the worker dashboard, the cooperative dashboard and
--                   GET /workers/:id/bookings.
--   started_at      read by the cooperative dashboard's in-progress list.
--   completed_at    read by the worker dashboard's completed list.
--   organization_id read by every institutional analytics query.

-- ── the saved address a booking was placed against ───────────────────────────
-- `on delete set null`, matching service_orders: deleting a saved address must
-- not delete the booking history that referenced it. The free-text `address`
-- column stays authoritative for what was actually dispatched against, so a
-- nulled link loses the shortcut, not the destination.
alter table bookings
  add column if not exists address_id uuid references addresses(id) on delete set null;
create index if not exists bookings_address_idx on bookings(address_id);

-- ── human-readable reference ─────────────────────────────────────────────────
-- Defaulted, not application-assigned: bookingService.ts does not supply one,
-- so without a default every booking created through the API would carry a null
-- reference on the very screens that exist to display it.
create sequence if not exists booking_number_seq;
alter table bookings add column if not exists booking_number text;
alter table bookings
  alter column booking_number
  set default 'GID-' || lpad(nextval('booking_number_seq')::text, 6, '0');

update bookings
   set booking_number = 'GID-' || lpad(nextval('booking_number_seq')::text, 6, '0')
 where booking_number is null;

create unique index if not exists bookings_booking_number_idx on bookings(booking_number);

-- ── lifecycle timestamps ─────────────────────────────────────────────────────
-- The OTP handshake already stamps start_verified_at / completion_verified_at.
-- These are the same two moments under the names the dashboards query, and are
-- backfilled from them so existing rows are not silently blank.
alter table bookings add column if not exists started_at   timestamptz;
alter table bookings add column if not exists completed_at timestamptz;

update bookings set started_at   = start_verified_at      where started_at   is null;
update bookings set completed_at = completion_verified_at where completed_at is null;

-- ── institutional bookings ───────────────────────────────────────────────────
alter table bookings
  add column if not exists organization_id uuid references organizations(id) on delete set null;
create index if not exists bookings_organization_idx on bookings(organization_id);
