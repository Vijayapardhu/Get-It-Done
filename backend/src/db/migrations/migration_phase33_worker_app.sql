-- Migration: Worker App Support
-- Adds columns needed for worker registration, wallet, and payout features

-- Add worker_code sequence
CREATE SEQUENCE IF NOT EXISTS worker_code_seq START 1;

-- Add missing columns to workers table
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8),
  ADD COLUMN IF NOT EXISTS federation_id UUID REFERENCES federations(id);

-- Add missing columns to payout_accounts table
ALTER TABLE payout_accounts
  ADD COLUMN IF NOT EXISTS account_holder TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS ifsc_code TEXT,
  ADD COLUMN IF NOT EXISTS upi_id TEXT;

-- Add index on worker federation_id
CREATE INDEX IF NOT EXISTS workers_federation_idx ON workers(federation_id);

-- Add index on payout_accounts worker_id
CREATE INDEX IF NOT EXISTS payout_accounts_worker_idx ON payout_accounts(worker_id);
