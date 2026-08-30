-- Add priority column to pricing_rules (used by pricing.ts route)
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS pricing_rules_priority_idx ON pricing_rules (priority DESC, created_at DESC);
