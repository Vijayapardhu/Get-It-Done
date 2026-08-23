-- Phase 5: Analytics, Institutions, Recurring, Welfare

-- Organizations (institutional customers)
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('school', 'apartment', 'office', 'government', 'ngo', 'hospital', 'hotel', 'other')),
  registration_number text,
  gst_number text,
  address text,
  contact_person text,
  contact_email text,
  contact_phone text,
  billing_address text,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  invited_by uuid references users(id),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists organization_addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text not null,
  latitude double precision,
  longitude double precision,
  is_default boolean not null default false,
  instructions text,
  created_at timestamptz not null default now()
);

create table if not exists service_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  service_id uuid not null references services(id),
  variant_id uuid,
  pricing_rule_id uuid,
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('draft', 'active', 'expired', 'cancelled')),
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  services jsonb not null default '[]',
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'custom')),
  preferred_days int[] not null default '{}',
  preferred_time_start time,
  preferred_time_end time,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contract_id uuid references service_contracts(id) on delete set null,
  po_number text not null unique,
  amount numeric(14, 2) not null,
  status text not null default 'draft' check (status in ('draft', 'issued', 'acknowledged', 'completed', 'cancelled')),
  issued_at timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now()
);

-- Recurring bookings
create table if not exists recurring_bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  customer_id uuid not null references users(id),
  service_id uuid not null references services(id),
  variant_id uuid,
  address_id uuid references organization_addresses(id) on delete set null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'custom')),
  days_of_week int[] not null default '{}',
  time_window_start time,
  time_window_end time,
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  last_generated_at timestamptz,
  next_generation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_bookings_next_gen_idx on recurring_bookings(next_generation_at) where status = 'active';

-- Safety incidents
create table if not exists safety_incidents (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  booking_id uuid references bookings(id) on delete set null,
  type text not null check (type in ('injury', 'near_miss', 'equipment_failure', 'hazardous_condition', 'other')),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  description text not null,
  location geography(point, 4326),
  reported_at timestamptz not null default now(),
  status text not null default 'reported' check (status in ('reported', 'investigating', 'resolved', 'closed')),
  investigated_by uuid references users(id),
  investigated_at timestamptz,
  created_at timestamptz not null default now()
);

-- Device tokens for push notifications
create table if not exists device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  app_version text not null,
  last_used_at timestamptz not null default now(),
  unique (user_id, token)
);
create index if not exists device_tokens_user_idx on device_tokens(user_id);

-- Benefits
create table if not exists benefits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  eligibility_criteria jsonb,
  value numeric(12, 2),
  provider text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create table if not exists benefit_eligibility (
  worker_id uuid not null references workers(id) on delete cascade,
  benefit_id uuid not null references benefits(id) on delete cascade,
  eligible boolean not null default false,
  determined_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb,
  primary key (worker_id, benefit_id)
);

-- Materialized views for analytics (after all tables)

-- Surge rules for dynamic pricing
create table if not exists surge_rules (
  id uuid primary key default gen_random_uuid(),
  area geography(polygon, 4326) not null,
  service_id uuid references services(id),
  multiplier numeric(4, 2) not null default 1.0 check (multiplier >= 1.0 and multiplier <= 10.0),
  trigger text not null check (trigger in ('demand_threshold', 'time', 'weather')),
  demand_threshold numeric(6, 2),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists surge_rules_area_idx on surge_rules using gist (area);
create index if not exists surge_rules_service_idx on surge_rules(service_id);

-- Travel fees per cooperative
create table if not exists travel_fees (
  id uuid primary key default gen_random_uuid(),
  cooperative_id uuid not null references cooperatives(id) on delete cascade,
  base_km int not null default 5 check (base_km > 0),
  base_fee numeric(10, 2) not null default 0 check (base_fee >= 0),
  per_km_rate numeric(8, 2) not null default 0 check (per_km_rate >= 0),
  max_distance_km int not null default 50 check (max_distance_km > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists travel_fees_coop_idx on travel_fees(cooperative_id);

-- Tax rules
create table if not exists tax_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric(5, 4) not null check (rate >= 0 and rate <= 1),
  applies_to text not null check (applies_to in ('service', 'worker', 'platform')),
  jurisdiction text not null,
  created_at timestamptz not null default now()
);

create materialized view if not exists mv_booking_stats as
select
  date_trunc('day', b.created_at)::date as day,
  b.service_id,
  s.name as service_name,
  s.category,
  b.is_emergency,
  count(*) as total_bookings,
  count(*) filter (where b.status = 'completed') as completed_bookings,
  count(*) filter (where b.status = 'cancelled') as cancelled_bookings,
  count(*) filter (where b.status = 'expired') as expired_bookings
from bookings b
join services s on s.id = b.service_id
group by 1, 2, 3, 4, 5;

create unique index if not exists mv_booking_stats_idx on mv_booking_stats(day, service_id, is_emergency);

create materialized view if not exists mv_worker_performance as
select
  w.id as worker_id,
  w.user_id,
  w.verification_status,
  w.current_status,
  w.rating,
  count(b.id) as total_assigned,
  count(b.id) filter (where b.status = 'completed') as completed_jobs,
  count(b.id) filter (where b.status = 'cancelled') as cancelled_jobs,
  avg(r.rating) as avg_rating,
  count(r.id) as total_reviews
from workers w
left join bookings b on b.worker_id = w.id
left join reviews r on r.worker_id = w.id
group by 1, 2, 3, 4, 5;

create unique index if not exists mv_worker_performance_idx on mv_worker_performance(worker_id);

create materialized view if not exists mv_revenue as
select
  date_trunc('day', po.created_at)::date as day,
  po.provider,
  po.status,
  count(*) as total_orders,
  sum(po.amount) as total_amount,
  sum(po.amount) filter (where po.status = 'paid') as paid_amount,
  sum(pr.amount) filter (where pr.status = 'completed') as refunded_amount
from payment_orders po
left join payment_refunds pr on pr.payment_order_id = po.id
group by 1, 2, 3;

create unique index if not exists mv_revenue_idx on mv_revenue(day, provider, status);

create materialized view if not exists mv_customer_satisfaction as
select
  date_trunc('week', r.created_at)::date as week_start,
  avg(r.rating)::numeric(2,1) as avg_rating,
  count(*) as total_reviews,
  count(*) filter (where r.rating >= 4) as positive_reviews,
  count(*) filter (where r.rating <= 2) as negative_reviews
from reviews r
group by 1;

create unique index if not exists mv_customer_satisfaction_idx on mv_customer_satisfaction(week_start);

create materialized view if not exists mv_geography as
select
  b.address as area,
  b.service_id,
  s.name as service_name,
  count(*) as total_bookings,
  count(*) filter (where b.status = 'completed') as completed,
  count(*) filter (where b.status = 'cancelled') as cancelled,
  count(distinct b.worker_id) as unique_workers,
  min(st_distance(b.location, wl.location)/1000) as min_distance_km,
  avg(st_distance(b.location, wl.location)/1000) as avg_distance_km
from bookings b
join services s on s.id = b.service_id
left join workers w on w.id = b.worker_id
left join worker_locations wl on wl.worker_id = w.id
where wl.location is not null
group by 1, 2, 3;

create unique index if not exists mv_geography_idx on mv_geography(area, service_id);

create materialized view if not exists mv_welfare as
select
  c.id as cooperative_id,
  c.name as cooperative_name,
  count(w.id) as total_workers,
  count(w.id) filter (where w.verification_status = 'verified') as verified_workers,
  count(distinct it.id) as insured_workers,
  count(distinct tr.id) as trained_workers,
  count(distinct si.id) as safety_incidents
from cooperatives c
left join workers w on w.cooperative_id = c.id
left join worker_insurance_records it on it.worker_id = w.id and it.status = 'active'
left join worker_training_records tr on tr.worker_id = w.id and tr.status = 'completed'
left join safety_incidents si on si.worker_id = w.id
group by 1, 2;

create unique index if not exists mv_welfare_idx on mv_welfare(cooperative_id);

create materialized view if not exists mv_fairness as
select
  c.id as cooperative_id,
  c.name as cooperative_name,
  count(distinct w.id) as workers,
  count(distinct job_counts.worker_id) as workers_with_jobs,
  avg(job_counts.jobs) as avg_jobs_per_worker,
  stddev(job_counts.jobs) as stddev_jobs,
  max(job_counts.jobs) as max_jobs,
  min(job_counts.jobs) as min_jobs
from cooperatives c
left join workers w on w.cooperative_id = c.id and w.verification_status = 'verified'
left join (
  select worker_id, count(*) as jobs
  from bookings
  where status = 'completed'
  and created_at >= now() - interval '30 days'
  group by worker_id
) job_counts on job_counts.worker_id = w.id
group by 1, 2;

create unique index if not exists mv_fairness_idx on mv_fairness(cooperative_id);

-- Function to refresh all materialized views
create or replace function refresh_analytics_views() returns void language plpgsql as $$
begin
  refresh materialized view concurrently mv_booking_stats;
  refresh materialized view concurrently mv_worker_performance;
  refresh materialized view concurrently mv_revenue;
  refresh materialized view concurrently mv_customer_satisfaction;
  refresh materialized view concurrently mv_geography;
  refresh materialized view concurrently mv_welfare;
  refresh materialized view concurrently mv_fairness;
end $$;