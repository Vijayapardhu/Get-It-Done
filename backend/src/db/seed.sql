insert into federations (id, name, state)
values ('00000000-0000-0000-0000-000000000111', 'Andhra Pradesh Labour Cooperative Federation', 'Andhra Pradesh')
on conflict do nothing;

insert into cooperatives (id, name, district, state)
values
  ('00000000-0000-0000-0000-000000000101', 'Vijayawada Labour Cooperative Society', 'NTR', 'Andhra Pradesh')
on conflict do nothing;

update cooperatives set federation_id = '00000000-0000-0000-0000-000000000111'
where id = '00000000-0000-0000-0000-000000000101';

insert into services (id, name, category, description, base_price, emergency_supported)
values
  ('00000000-0000-0000-0000-000000000201', 'Plumbing', 'Home Repair', 'Leak fixes, pipe repairs, taps and fittings', 299, true),
  ('00000000-0000-0000-0000-000000000202', 'Electrical', 'Home Repair', 'Switches, wiring, power failures and fixtures', 349, true),
  ('00000000-0000-0000-0000-000000000203', 'Cleaning', 'Household', 'Home and office cleaning services', 499, false)
on conflict do nothing;

insert into users (id, name, phone, role, language)
values
  ('00000000-0000-0000-0000-000000000301', 'Demo Customer', '+919999990001', 'customer', 'en'),
  ('00000000-0000-0000-0000-000000000401', 'Ravi Kumar', '+919999990101', 'worker', 'te'),
  ('00000000-0000-0000-0000-000000000402', 'Sita Devi', '+919999990102', 'worker', 'hi'),
  ('00000000-0000-0000-0000-000000000501', 'Society Admin', '+919999990201', 'society_admin', 'en')
on conflict do nothing;

insert into admin_scopes (user_id, cooperative_id)
values ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000101')
on conflict do nothing;

insert into workers (id, user_id, cooperative_id, experience_years, verification_status, rating, current_status)
values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000101', 6, 'verified', 4.8, 'available'),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000101', 4, 'verified', 4.6, 'available')
on conflict do nothing;

insert into worker_skills (worker_id, service_id, certification_level)
values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000201', 'certified'),
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000202', 'certified'),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000201', 'trained'),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000203', 'trained')
on conflict do nothing;

insert into worker_service_areas (worker_id, service_id, radius_km)
values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000201', 15),
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000202', 15),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000201', 15),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000203', 15)
on conflict do nothing;

insert into worker_locations (worker_id, location)
values
  ('00000000-0000-0000-0000-000000000601', st_setsrid(st_makepoint(80.6480, 16.5062), 4326)::geography),
  ('00000000-0000-0000-0000-000000000602', st_setsrid(st_makepoint(80.6505, 16.5150), 4326)::geography)
on conflict do nothing;

update workers
set location_sharing_enabled = true,
    location_updated_at = now()
where id in ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000602');


-- Update users with email and hashed passwords for admin/stakeholders


-- ── Demo account contents ──────────────────────────────────────────────────
--
-- The demo customer exists above but owns nothing, so POST /auth/demo used to
-- open onto empty states on every tab, which demonstrates the empty states and
-- nothing else. This gives it a saved address, one booking in each of the three
-- states the customer app renders differently, and a settled invoice behind the
-- completed one.
--
-- Timestamps are relative to now() rather than fixed, so the demo reads as
-- current however long after seeding it is opened. Everything is keyed on fixed
-- uuids and conflict-free, so re-seeding neither duplicates nor resets it.

insert into addresses (id, user_id, name, address, latitude, longitude, is_default, instructions)
values (
  '00000000-0000-0000-0000-0000000009a1',
  '00000000-0000-0000-0000-000000000301',
  'Home',
  'Flat 402, Sai Enclave, Benz Circle, Vijayawada 520010',
  16.5062, 80.6480, true,
  'Second gate, blue building. Lift is on the right.'
)
on conflict (id) do nothing;

insert into bookings (
  id, customer_id, worker_id, service_id, status, scheduled_at, address, address_id,
  location, description, price, booking_number, created_at, started_at, completed_at
)
values
  -- Live: the home screen's "your active booking" card and the tracking screen.
  (
    '00000000-0000-0000-0000-0000000009b1',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000601',
    '00000000-0000-0000-0000-000000000201',
    'en_route',
    now() + interval '25 minutes',
    'Flat 402, Sai Enclave, Benz Circle, Vijayawada 520010',
    '00000000-0000-0000-0000-0000000009a1',
    st_setsrid(st_makepoint(80.6480, 16.5062), 4326)::geography,
    'Kitchen tap is leaking from the base.',
    299.00, 'GID-DEMO-0001',
    now() - interval '40 minutes', null, null
  ),
  -- Upcoming: still being matched, so the bookings tab has something under
  -- "in progress" that is not the same shape as the live one.
  (
    '00000000-0000-0000-0000-0000000009b2',
    '00000000-0000-0000-0000-000000000301',
    null,
    '00000000-0000-0000-0000-000000000203',
    'matching',
    now() + interval '2 days',
    'Flat 402, Sai Enclave, Benz Circle, Vijayawada 520010',
    '00000000-0000-0000-0000-0000000009a1',
    st_setsrid(st_makepoint(80.6480, 16.5062), 4326)::geography,
    'Full house deep clean before Sankranti.',
    499.00, 'GID-DEMO-0002',
    now() - interval '3 hours', null, null
  ),
  -- History: completed and paid, which is what puts a receipt in the invoices
  -- screen and a past job on the home screen.
  (
    '00000000-0000-0000-0000-0000000009b3',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000602',
    '00000000-0000-0000-0000-000000000202',
    'completed',
    now() - interval '9 days',
    'Flat 402, Sai Enclave, Benz Circle, Vijayawada 520010',
    '00000000-0000-0000-0000-0000000009a1',
    st_setsrid(st_makepoint(80.6480, 16.5062), 4326)::geography,
    'Bedroom switchboard sparking.',
    349.00, 'GID-DEMO-0003',
    now() - interval '10 days', now() - interval '9 days', now() - interval '9 days'
  )
on conflict (id) do nothing;

-- The split matches revenueSplit.ts on a tax-INCLUSIVE total of 349: subtotal
-- 295.76, tax 53.24, platform fee 10% of subtotal, cooperative 5%, welfare 2%,
-- and the worker takes the remainder. Numbers that do not reconcile are worse
-- than no numbers on a screen whose whole point is that the split is visible.
insert into invoices (
  id, invoice_number, booking_id, customer_id, worker_id, service_id,
  subtotal, tax, platform_fee, cooperative_share, welfare_fund, worker_share,
  total, payment_status, issued_at, paid_at
)
values (
  '00000000-0000-0000-0000-0000000009c1',
  'GID-DEMO-000001',
  '00000000-0000-0000-0000-0000000009b3',
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000602',
  '00000000-0000-0000-0000-000000000202',
  295.76, 53.24, 29.58, 14.79, 5.92, 245.47,
  349.00, 'paid',
  now() - interval '9 days', now() - interval '9 days'
)
on conflict (id) do nothing;
