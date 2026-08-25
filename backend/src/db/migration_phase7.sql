
-- General addresses table that can be referenced by multiple entities
CREATE TABLE IF NOT EXISTS addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    address text NOT NULL,
    latitude double precision,
    longitude double precision,
    is_default boolean NOT NULL DEFAULT false,
    instructions text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS addresses_name_idx ON addresses(name);

-- Shared updated_at trigger function (idempotent, top-level so dollar-quoting is safe)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $fn$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_addresses_updated_at ON addresses;
CREATE TRIGGER update_addresses_updated_at
    BEFORE UPDATE ON addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
