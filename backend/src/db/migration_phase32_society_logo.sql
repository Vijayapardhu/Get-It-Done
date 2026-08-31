-- Add logo_key to cooperatives for file upload support
ALTER TABLE cooperatives ADD COLUMN IF NOT EXISTS logo_key text;
CREATE INDEX IF NOT EXISTS cooperatives_logo_key_idx ON cooperatives(logo_key) WHERE logo_key IS NOT NULL;
