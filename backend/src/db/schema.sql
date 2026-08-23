create extension if not exists postgis;
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text unique,
  email text unique,
  password_hash text,
  google_id text unique,
  role text not null check (role in ('customer', 'worker', 'institutional_customer', 'society_admin', 'federation_admin', 'support_staff', 'system_admin')),
  language text not null default 'en',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists refresh_tokens (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  device_id text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists otp_challenges (
  id uuid primary key,
  phone text not null,
  purpose text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  action text not null,
  resource_type text not null,
  resource_id text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists outbox_events_pending_idx on outbox_events(processed_at, created_at);

create index if not exists audit_events_resource_idx on audit_events(resource_type, resource_id, created_at desc);

create index if not exists refresh_tokens_user_idx on refresh_tokens(user_id);
create index if not exists otp_challenges_lookup_idx on otp_challenges(phone, purpose, created_at desc);

create table if not exists federations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text not null,
  created_at timestamptz not null default now()
);

create table if not exists cooperatives (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text not null,
  state text not null,
  federation_id uuid references federations(id),
  created_at timestamptz not null default now()
);

create table if not exists admin_scopes (
  user_id uuid primary key references users(id) on delete cascade,
  cooperative_id uuid references cooperatives(id) on delete cascade,
  federation_id uuid references federations(id) on delete cascade,
  check ((cooperative_id is not null) or (federation_id is not null))
);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  base_price numeric(10, 2) not null default 0,
  emergency_supported boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists workers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  cooperative_id uuid references cooperatives(id),
  experience_years int not null default 0,
  verification_status text not null default 'pending',
  rating numeric(2, 1) not null default 0,
  current_status text not null default 'offline',
  address text,
  profile_photo_url text,
  location_sharing_enabled boolean not null default false,
  location_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workers_user_unique_idx on workers(user_id);

create table if not exists worker_verification_events (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  actor_id uuid not null references users(id),
  from_status text,
  to_status text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists worker_service_areas (
  worker_id uuid not null references workers(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  radius_km numeric(6, 2) not null default 15 check (radius_km > 0 and radius_km <= 100),
  primary key (worker_id, service_id)
);

create index if not exists worker_service_areas_service_idx on worker_service_areas(service_id);

create table if not exists worker_skills (
  worker_id uuid not null references workers(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  certification_level text,
  primary key (worker_id, service_id)
);

create table if not exists worker_documents (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  type text not null,
  file_url text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists worker_locations (
  worker_id uuid primary key references workers(id) on delete cascade,
  location geography(point, 4326) not null,
  updated_at timestamptz not null default now()
);

create index if not exists worker_locations_location_idx on worker_locations using gist (location);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references users(id),
  worker_id uuid references workers(id),
  service_id uuid not null references services(id),
  status text not null default 'requested' check (status in ('requested', 'matching', 'assigned', 'accepted', 'en_route', 'started', 'completed', 'cancelled', 'expired', 'disputed', 'refunded')),
  scheduled_at timestamptz,
  is_emergency boolean not null default false,
  location geography(point, 4326) not null,
  address text not null,
  description text,
  price numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_location_idx on bookings using gist (location);
create index if not exists bookings_status_idx on bookings (status);

create table if not exists booking_status_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  status text not null,
  actor_id uuid references users(id),
  reason text,
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists idempotency_keys (
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null,
  key text not null,
  request_hash text not null,
  response_status int,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, endpoint, key)
);

create index if not exists idempotency_keys_expiry_idx on idempotency_keys(expires_at);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  provider text not null,
  provider_order_id text,
  amount numeric(10, 2) not null,
  status text not null default 'created' check (status in ('created', 'pending', 'paid', 'failed', 'refunded')),
  created_at timestamptz not null default now()
);

create unique index if not exists payments_provider_order_unique_idx on payments(provider, provider_order_id) where provider_order_id is not null;

create table if not exists payment_webhook_events (
  provider text not null,
  event_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  customer_id uuid not null references users(id),
  worker_id uuid not null references workers(id),
  rating int not null check (rating between 1 and 5),
  feedback text,
  created_at timestamptz not null default now()
);

create unique index if not exists reviews_booking_unique_idx on reviews(booking_id);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists complaints (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id),
  raised_by uuid references users(id),
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'rejected')),
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists welfare_records (
  worker_id uuid primary key references workers(id) on delete cascade,
  insurance_status text not null default 'unknown',
  training_status text not null default 'not_started',
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists worker_training_records (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  course_name text not null,
  provider text,
  completed_on date,
  expires_on date,
  status text not null default 'completed' check (status in ('planned', 'in_progress', 'completed', 'expired')),
  created_at timestamptz not null default now()
);

create table if not exists worker_insurance_records (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  provider text not null,
  policy_reference text not null,
  coverage_amount numeric(12, 2) not null default 0,
  starts_on date not null,
  expires_on date not null,
  status text not null default 'active' check (status in ('pending', 'active', 'expired', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists payout_accounts (
  worker_id uuid primary key references workers(id) on delete cascade,
  provider text not null,
  account_reference text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists worker_earnings_ledger (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  booking_id uuid references bookings(id),
  entry_type text not null check (entry_type in ('earning', 'adjustment', 'payout', 'refund')),
  amount numeric(12, 2) not null,
  reference text,
  created_at timestamptz not null default now()
);

create index if not exists worker_earnings_worker_idx on worker_earnings_ledger(worker_id, created_at desc);

