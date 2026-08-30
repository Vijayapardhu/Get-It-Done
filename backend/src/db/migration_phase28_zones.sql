-- Zone-based pricing: federation sets base price per zone, cooperatives override locally

CREATE TABLE IF NOT EXISTS zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  polygon geography(Polygon, 4326) NOT NULL,
  base_price numeric(10,2) NOT NULL DEFAULT 0,
  demand_multiplier numeric(4,2) NOT NULL DEFAULT 1.0 CHECK (demand_multiplier >= 0.5 AND demand_multiplier <= 5.0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zones_polygon_idx ON zones USING GIST (polygon);
CREATE INDEX IF NOT EXISTS zones_status_idx ON zones (status);

-- Cooperative pricing override per zone
CREATE TABLE IF NOT EXISTS zone_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id uuid NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  price_override numeric(10,2),
  demand_multiplier numeric(4,2) NOT NULL DEFAULT 1.0 CHECK (demand_multiplier >= 0.5 AND demand_multiplier <= 5.0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cooperative_id, zone_id)
);
CREATE INDEX IF NOT EXISTS zone_pricing_cooperative_idx ON zone_pricing (cooperative_id);
CREATE INDEX IF NOT EXISTS zone_pricing_zone_idx ON zone_pricing (zone_id);

-- Update trigger for zones
DROP TRIGGER IF EXISTS update_zones_updated_at ON zones;
CREATE TRIGGER update_zones_updated_at
  BEFORE UPDATE ON zones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update trigger for zone_pricing
DROP TRIGGER IF EXISTS update_zone_pricing_updated_at ON zone_pricing;
CREATE TRIGGER update_zone_pricing_updated_at
  BEFORE UPDATE ON zone_pricing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
