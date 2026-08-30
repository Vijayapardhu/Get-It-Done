-- Phase 30: Society/Cooperative Territory System
-- Core territory management for geographic service areas

-- 1. Create cooperative_territories table
CREATE TABLE IF NOT EXISTS cooperative_territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id uuid NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  polygon geography(Polygon, 4326) NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
  version integer NOT NULL DEFAULT 1,
  area_km2 numeric(12,4),
  center_lat numeric(10,6),
  center_lng numeric(10,6),
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  validated_at timestamptz,
  validation_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Spatial index for fast point-in-polygon queries
CREATE INDEX IF NOT EXISTS cooperative_territories_polygon_idx ON cooperative_territories USING GIST (polygon);
CREATE INDEX IF NOT EXISTS cooperative_territories_cooperative_idx ON cooperative_territories (cooperative_id);
CREATE INDEX IF NOT EXISTS cooperative_territories_status_idx ON cooperative_territories (status);

-- 2. Add cooperative_id to bookings for historical resolution
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cooperative_id uuid REFERENCES cooperatives(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS territory_id uuid REFERENCES cooperative_territories(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS territory_version integer;

CREATE INDEX IF NOT EXISTS bookings_cooperative_idx ON bookings (cooperative_id);

-- 3. Update trigger for territories
DROP TRIGGER IF EXISTS update_cooperative_territories_updated_at ON cooperative_territories;
CREATE TRIGGER update_cooperative_territories_updated_at
  BEFORE UPDATE ON cooperative_territories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
