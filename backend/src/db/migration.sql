-- Add new columns to users table for enhanced authentication
ALTER TABLE users 
ALTER COLUMN phone DROP NOT NULL,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS reset_token TEXT,
ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('customer', 'worker', 'institutional_customer', 'society_admin', 'federation_admin', 'support_staff', 'system_admin'));

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS federations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, state text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE cooperatives ADD COLUMN IF NOT EXISTS federation_id uuid;
DO $$ BEGIN ALTER TABLE cooperatives ADD CONSTRAINT cooperatives_federation_fk FOREIGN KEY (federation_id) REFERENCES federations(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS admin_scopes (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, cooperative_id uuid REFERENCES cooperatives(id) ON DELETE CASCADE, federation_id uuid REFERENCES federations(id) ON DELETE CASCADE, CHECK (cooperative_id IS NOT NULL OR federation_id IS NOT NULL));

CREATE TABLE IF NOT EXISTS refresh_tokens (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash text NOT NULL UNIQUE,
	device_id text,
	expires_at timestamptz NOT NULL,
	revoked_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_challenges (
	id uuid PRIMARY KEY,
	phone text NOT NULL,
	purpose text NOT NULL,
	code_hash text NOT NULL,
	attempts int NOT NULL DEFAULT 0,
	expires_at timestamptz NOT NULL,
	consumed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	actor_id uuid REFERENCES users(id),
	action text NOT NULL,
	resource_type text NOT NULL,
	resource_id text,
	request_id text,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	event_type text NOT NULL,
	aggregate_type text NOT NULL,
	aggregate_id text NOT NULL,
	payload jsonb NOT NULL,
	processed_at timestamptz,
	attempts int NOT NULL DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbox_events_pending_idx ON outbox_events(processed_at, created_at);

CREATE INDEX IF NOT EXISTS audit_events_resource_idx ON audit_events(resource_type, resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS worker_training_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE, course_name text NOT NULL, provider text, completed_on date, expires_on date, status text NOT NULL DEFAULT 'completed' CHECK (status IN ('planned', 'in_progress', 'completed', 'expired')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS worker_insurance_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE, provider text NOT NULL, policy_reference text NOT NULL, coverage_amount numeric(12, 2) NOT NULL DEFAULT 0, starts_on date NOT NULL, expires_on date NOT NULL, status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'expired', 'cancelled')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS payout_accounts (worker_id uuid PRIMARY KEY REFERENCES workers(id) ON DELETE CASCADE, provider text NOT NULL, account_reference text NOT NULL, verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS worker_earnings_ledger (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE, booking_id uuid REFERENCES bookings(id), entry_type text NOT NULL CHECK (entry_type IN ('earning', 'adjustment', 'payout', 'refund')), amount numeric(12, 2) NOT NULL, reference text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS worker_earnings_worker_idx ON worker_earnings_ledger(worker_id, created_at DESC);

ALTER TABLE workers
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
ADD COLUMN IF NOT EXISTS location_sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS workers_user_unique_idx ON workers(user_id);

CREATE TABLE IF NOT EXISTS worker_verification_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
	actor_id uuid NOT NULL REFERENCES users(id),
	from_status text,
	to_status text NOT NULL,
	reason text,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_service_areas (
	worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
	service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
	radius_km numeric(6, 2) NOT NULL DEFAULT 15 CHECK (radius_km > 0 AND radius_km <= 100),
	PRIMARY KEY (worker_id, service_id)
);

CREATE INDEX IF NOT EXISTS worker_service_areas_service_idx ON worker_service_areas(service_id);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('requested', 'matching', 'assigned', 'accepted', 'en_route', 'started', 'completed', 'cancelled', 'expired', 'disputed', 'refunded'));
ALTER TABLE booking_status_events ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE booking_status_events ADD COLUMN IF NOT EXISTS request_id TEXT;

CREATE TABLE IF NOT EXISTS idempotency_keys (
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	endpoint text NOT NULL,
	key text NOT NULL,
	request_hash text NOT NULL,
	response_status int,
	response_body jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL,
	PRIMARY KEY (user_id, endpoint, key)
);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('created', 'pending', 'paid', 'failed', 'refunded'));
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_order_unique_idx ON payments(provider, provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS payment_webhook_events (provider text NOT NULL, event_id text NOT NULL, payload jsonb NOT NULL, processed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (provider, event_id));
CREATE UNIQUE INDEX IF NOT EXISTS reviews_booking_unique_idx ON reviews(booking_id);
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_status_check;
ALTER TABLE complaints ADD CONSTRAINT complaints_status_check CHECK (status IN ('open', 'investigating', 'resolved', 'rejected'));
