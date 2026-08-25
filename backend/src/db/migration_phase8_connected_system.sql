-- Phase 8: Connected System - Missing Entities, OTP Verification & Escalations

-- 1. Scoped User Addresses
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS addresses_user_idx ON addresses(user_id, is_default);

-- 2. Customer Favorite Workers
CREATE TABLE IF NOT EXISTS customer_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, worker_id)
);
CREATE INDEX IF NOT EXISTS customer_favorites_customer_idx ON customer_favorites(customer_id);

-- 3. Booking OTP Verification Columns
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_otp_hash text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completion_otp_hash text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_verified_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completion_verified_at timestamptz;

-- 4. Emergency Escalations & Failovers
CREATE TABLE IF NOT EXISTS emergency_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  to_worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  reason text NOT NULL,
  attempt_number int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emergency_escalations_booking_idx ON emergency_escalations(booking_id, created_at DESC);

-- 5. AI Recommendation Persistence
CREATE TABLE IF NOT EXISTS ai_recommendation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  recommended_workers int NOT NULL DEFAULT 0,
  drivers jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_recommendations_status_idx ON ai_recommendation_records(status, created_at DESC);
