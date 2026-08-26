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


-- ── Service detail copy ────────────────────────────────────────────────────
--
-- Written to answer the questions that make someone hesitate before booking,
-- which means the "does not include" list is the load-bearing one. A customer
-- who learns on the doorstep that stain removal was never part of a mop is a
-- dispute and a refund; a line on the page costs nothing.
--
-- Prices are not repeated here. They live in base_price and would drift.

update services set
  includes = '[
    "Sweeping and mopping of all agreed rooms",
    "Bathroom cleaning: floor, basin, WC and fittings",
    "Kitchen surfaces, sink and the outside of appliances",
    "Dusting of reachable surfaces and furniture",
    "Rubbish collected and bagged for your bin"
  ]'::jsonb,
  excludes = '[
    "Stain removal, deep scrubbing or floor polishing",
    "Moving heavy furniture such as beds or cupboards",
    "Cleaning inside fridges, ovens or washing machines",
    "Exterior windows, balconies above ground floor and terraces",
    "Removal of construction debris or garden waste"
  ]'::jsonb,
  steps = '[
    {"title": "A quick walk-through", "description": "You show the worker which rooms are in scope and anything to avoid."},
    {"title": "Dry cleaning first", "description": "Sweeping and dusting, so loose dirt is gone before any water is used."},
    {"title": "Wet cleaning", "description": "Floors mopped, bathroom and kitchen surfaces washed down."},
    {"title": "You check the work", "description": "Anything missed is put right before the job is closed on the app."}
  ]'::jsonb,
  faqs = '[
    {"question": "Do I need to provide cleaning supplies?",
     "answer": "The worker brings their own cloths, brushes and standard cleaning liquid. If you would rather they used a specific product of yours, leave it out and tell them at the walk-through."},
    {"question": "How long does it take?",
     "answer": "A two-bedroom flat is usually two to three hours. Larger homes or a first clean after a long gap take longer, and the worker will tell you before starting rather than after."},
    {"question": "Can I book the same person again?",
     "answer": "Yes. After the job you can add the worker to your preferred list, and future bookings are offered to them first."},
    {"question": "What if something is damaged?",
     "answer": "Report it from the booking within 48 hours. Every worker on the platform is covered by the cooperative''s liability insurance, funded by the welfare share of each job."}
  ]'::jsonb
where name = 'Cleaning';

update services set
  includes = '[
    "Diagnosing the fault and explaining what is wrong",
    "Tap, mixer and shower fitting repair or replacement",
    "Clearing blocked sinks, basins and floor drains",
    "Fixing leaking pipe joints and flush tanks",
    "Testing the repair under pressure before leaving"
  ]'::jsonb,
  excludes = '[
    "Replacement parts and fittings, which are billed separately at cost",
    "Concealed pipe work requiring wall or floor breaking",
    "Borewell, sump and overhead tank installation",
    "Municipal or shared-line faults outside your property",
    "Sewage line desludging"
  ]'::jsonb,
  steps = '[
    {"title": "Find the fault", "description": "The worker traces the leak or blockage rather than guessing from where the water shows."},
    {"title": "Agree the fix", "description": "You are told what is needed and what any parts will cost before work starts."},
    {"title": "The repair", "description": "Water isolated at the nearest valve, the fault fixed, the joint sealed."},
    {"title": "Test and clean up", "description": "Run under pressure to confirm it holds, and the work area left dry."}
  ]'::jsonb,
  faqs = '[
    {"question": "Are parts included in the price?",
     "answer": "No. The booking price covers the visit and the labour. Any tap, washer or length of pipe is shown to you and billed at cost on the invoice, so you can see exactly what was fitted."},
    {"question": "What if the leak comes back?",
     "answer": "Report it from the same booking within 30 days and the return visit is free. A repair that did not hold is not a new job."},
    {"question": "Do you work on concealed pipes inside walls?",
     "answer": "Not under a standard booking, because it needs breaking and re-plastering. The worker will diagnose it and can quote for the larger job separately."},
    {"question": "Can I get someone today?",
     "answer": "Use \"Get it done now\" on the home screen. It matches you with the nearest available plumber rather than a scheduled slot."}
  ]'::jsonb
where name = 'Plumbing';

update services set
  includes = '[
    "Diagnosing the fault and explaining what is wrong",
    "Switch, socket and regulator repair or replacement",
    "Fan, light and fixture installation on existing points",
    "Tracing tripping circuits and restoring supply",
    "Checking earthing at the point that was worked on"
  ]'::jsonb,
  excludes = '[
    "Replacement parts and fixtures, which are billed separately at cost",
    "New wiring runs or chasing cable into walls",
    "Meter, main line and distribution board replacement, which is the utility''s work",
    "Appliance internals: motors, compressors and circuit boards",
    "Anything requiring a supply shutdown for the whole building"
  ]'::jsonb,
  steps = '[
    {"title": "Make it safe", "description": "The affected circuit is isolated at the board before anything is opened."},
    {"title": "Find the fault", "description": "The worker tests the circuit to locate the fault rather than replacing parts hopefully."},
    {"title": "Agree the fix", "description": "You are told what is needed and what any parts will cost before work starts."},
    {"title": "Repair and test", "description": "The fix is made, the circuit restored, and the point tested with you watching."}
  ]'::jsonb,
  faqs = '[
    {"question": "Are fittings included in the price?",
     "answer": "No. The booking price covers the visit and the labour. Any switch, socket or fan is shown to you and billed at cost on the invoice."},
    {"question": "Is the worker qualified?",
     "answer": "Every electrician on the platform has had their trade certificate and identity verified by their cooperative before being allowed to accept work. You can see the verification on their profile from the booking."},
    {"question": "My whole flat has no power. Can you help?",
     "answer": "Often yes, if it is your board or a tripped circuit. If the fault is on the utility''s side of the meter, the worker will tell you and no labour is charged."},
    {"question": "Can you install a new AC point?",
     "answer": "Not under a standard booking, because it needs a new wiring run. The worker can assess it and quote separately."}
  ]'::jsonb
where name = 'Electrical';
