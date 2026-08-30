-- Phase 31: Society Onboarding Status
-- Adds onboarding workflow status to cooperatives

ALTER TABLE cooperatives ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('draft', 'territory_pending', 'admin_pending', 'active', 'suspended'));

CREATE INDEX IF NOT EXISTS cooperatives_status_idx ON cooperatives (status);

-- Add temporary password tracking for society admins
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_must_change boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS temporary_password boolean NOT NULL DEFAULT false;
