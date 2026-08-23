-- Phase 1-2: Auth, Users, Workers, Cooperatives extensions

-- Security events for auth
create table if not exists security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_type text not null check (event_type in (
    'login_success', 'login_failed', 'password_changed', 'password_reset',
    'device_new', 'device_revoked', 'oauth_linked', 'oauth_unlinked',
    'mfa_enabled', 'mfa_disabled', 'suspicious_activity'
  )),
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists security_events_user_idx on security_events(user_id, created_at desc);

-- User profile extensions
alter table users add column if not exists display_name text;
alter table users add column if not exists date_of_birth date;
alter table users add column if not exists gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say'));
alter table users add column if not exists preferred_language text not null default 'en';
alter table users add column if not exists timezone text not null default 'IST';
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists avatar_url text;
alter table users add column if not exists oauth_provider text;
alter table users add column if not exists oauth_subject text;

create table if not exists user_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  notifications jsonb not null default '{"push": true, "sms": true, "email": true, "in_app": true}'::jsonb,
  ui jsonb not null default '{}'::jsonb,
  privacy jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Worker profile extensions
alter table workers add column if not exists worker_code text unique;
alter table workers add column if not exists employment_type text check (employment_type in ('full_time', 'part_time', 'contract'));
alter table workers add column if not exists total_jobs int not null default 0;
alter table workers add column if not exists completed_jobs int not null default 0;
alter table workers add column if not exists cancelled_jobs int not null default 0;
alter table workers add column if not exists current_workload int not null default 0;
alter table workers add column if not exists service_radius_km numeric(6, 2) not null default 15 check (service_radius_km > 0 and service_radius_km <= 100);
alter table workers add column if not exists bio text;

-- Refresh token extensions
alter table refresh_tokens add column if not exists last_used_at timestamptz;
alter table refresh_tokens add column if not exists device_fingerprint text;
alter table refresh_tokens add column if not exists ip inet;
alter table refresh_tokens add column if not exists user_agent text;

-- Cooperative extensions
alter table federations add column if not exists code text unique;
alter table federations add column if not exists contact_email text;
alter table federations add column if not exists contact_phone text;
alter table federations add column if not exists address text;
alter table federations add column if not exists status text not null default 'active' check (status in ('active', 'inactive', 'suspended'));

alter table cooperatives add column if not exists code text unique;
alter table cooperatives add column if not exists registration_number text;
alter table cooperatives add column if not exists address text;
alter table cooperatives add column if not exists contact_email text;
alter table cooperatives add column if not exists contact_phone text;
alter table cooperatives add column if not exists status text not null default 'active' check (status in ('active', 'inactive', 'suspended'));
alter table cooperatives add column if not exists commission_rate numeric(5, 2) not null default 10.00 check (commission_rate >= 0 and commission_rate <= 100);
alter table cooperatives add column if not exists min_workers int not null default 1;
alter table cooperatives add column if not exists max_workers int not null default 1000;

create table if not exists cooperative_members (
  user_id uuid not null references users(id) on delete cascade,
  cooperative_id uuid not null references cooperatives(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin', 'supervisor')),
  joined_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  primary key (user_id, cooperative_id)
);

create table if not exists memberships (
  worker_id uuid not null references workers(id) on delete cascade,
  cooperative_id uuid not null references cooperatives(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  approved_at timestamptz,
  approved_by uuid references users(id),
  primary key (worker_id, cooperative_id)
);

-- Skills
create table if not exists skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  description text,
  requires_certification boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);
create index if not exists skills_category_idx on skills(category);

create table if not exists worker_skills_new (
  worker_id uuid not null references workers(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  level text not null default 'beginner' check (level in ('beginner', 'intermediate', 'expert', 'master')),
  years_experience int not null default 0,
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references users(id),
  created_at timestamptz not null default now(),
  primary key (worker_id, skill_id)
);

create table if not exists skill_verifications (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  actor_id uuid not null references users(id),
  from_level text,
  to_level text not null,
  from_verified boolean,
  to_verified boolean not null,
  reason text,
  created_at timestamptz not null default now()
);

-- Document types
create table if not exists document_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  required_for_skills uuid[] not null default '{}',
  max_size_mb int not null default 10,
  allowed_mime_types text[] not null default '{}',
  expires boolean not null default true,
  created_at timestamptz not null default now()
);

-- Worker documents (extended)
alter table worker_documents add column if not exists file_hash text;
alter table worker_documents add column if not exists file_size bigint;
alter table worker_documents add column if not exists mime_type text;
alter table worker_documents add column if not exists status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired'));
alter table worker_documents add column if not exists issued_by text;
alter table worker_documents add column if not exists issued_at timestamptz;
alter table worker_documents add column if not exists expires_at timestamptz;
alter table worker_documents add column if not exists reviewed_by uuid references users(id);
alter table worker_documents add column if not exists reviewed_at timestamptz;
alter table worker_documents add column if not exists rejection_reason text;

create table if not exists document_reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references worker_documents(id) on delete cascade,
  actor_id uuid not null references users(id),
  action text not null check (action in ('submitted', 'approved', 'rejected')),
  reason text,
  created_at timestamptz not null default now()
);

-- Certifications
create table if not exists certifications (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  document_id uuid references worker_documents(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists certifications_worker_idx on certifications(worker_id);