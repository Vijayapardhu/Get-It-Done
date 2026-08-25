-- Phase 9: coverage service areas, extended pricing rules, uploaded files registry

CREATE TABLE IF NOT EXISTS service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  polygon geography(Polygon,4326) NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_areas_service_idx ON service_areas(service_id);

-- Pricing rules API contract (rule CRUD) extends the legacy surge-shaped table
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS formula jsonb;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS variant_id uuid;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS cooperative_id uuid REFERENCES cooperatives(id) ON DELETE SET NULL;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS rule_type text NOT NULL DEFAULT 'base';
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS valid_from timestamptz;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS valid_to timestamptz;
ALTER TABLE pricing_rules ALTER COLUMN trigger DROP NOT NULL;
ALTER TABLE pricing_rules DROP CONSTRAINT IF EXISTS pricing_rules_trigger_check;

-- Generic upload registry referenced by verification flows
CREATE TABLE IF NOT EXISTS uploaded_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  file_key text UNIQUE NOT NULL,
  file_url text,
  file_hash text,
  content_type text,
  size_bytes bigint,
  created_at timestamptz DEFAULT now()
);

-- Align recurring bookings with the documented API contract (inline address snapshot)
ALTER TABLE recurring_bookings ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE recurring_bookings ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE recurring_bookings ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE recurring_bookings ADD COLUMN IF NOT EXISTS description text;

-- Chat message attachments (array of file keys)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]';

-- Settlement lifecycle timestamps
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Service categories (admin-managed browse taxonomy)
CREATE TABLE IF NOT EXISTS service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  icon text,
  display_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
