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
