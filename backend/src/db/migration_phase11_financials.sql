-- ============================================================================
-- Phase 11: Close the financial loop.
--   * Worker Welfare Fund (2%) -- blueprint pillar #3, previously not deducted
--     anywhere in the split.
--   * Settlement generation -- nothing ever INSERTed into `settlements`, so
--     GET /settlements was permanently empty and POST /:id/process unreachable.
--   * Settlement payout execution state.
--   * A durable job queue so scheduled work survives a restart.
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Welfare fund as a first-class line on every invoice and settlement
-- ---------------------------------------------------------------------------
ALTER TABLE invoices    ADD COLUMN IF NOT EXISTS welfare_fund numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS welfare_fund numeric(14,2) NOT NULL DEFAULT 0;

-- One invoice per booking. This constraint is what makes settleBooking()
-- idempotent under a race between payment capture and job completion, so drop
-- any historical duplicates (keeping the earliest) before enforcing it.
DELETE FROM invoices a
 USING invoices b
 WHERE a.booking_id = b.booking_id
   AND (a.issued_at, a.id) > (b.issued_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_booking_unique_idx ON invoices (booking_id);

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_booking_id_key;
ALTER TABLE invoices ADD CONSTRAINT invoices_booking_id_key UNIQUE USING INDEX invoices_booking_unique_idx;

-- Per-transaction welfare escrow ledger. One row per booking, credited at the
-- moment payment is captured, so the fund is auditable independently of the
-- aggregate columns above.
CREATE TABLE IF NOT EXISTS welfare_contributions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  worker_id        uuid REFERENCES workers(id) ON DELETE SET NULL,
  cooperative_id   uuid REFERENCES cooperatives(id) ON DELETE SET NULL,
  payment_order_id uuid REFERENCES payment_orders(id) ON DELETE SET NULL,
  amount           numeric(12,2) NOT NULL CHECK (amount >= 0),
  rate             numeric(6,4) NOT NULL,
  settlement_id    uuid REFERENCES settlements(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- exactly one contribution per booking: webhook redelivery must not double-credit
  UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS welfare_contributions_worker_idx
  ON welfare_contributions (worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS welfare_contributions_unsettled_idx
  ON welfare_contributions (cooperative_id, created_at)
  WHERE settlement_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Settlement payout state
-- ---------------------------------------------------------------------------
-- routes/settlements.ts has always written `updated_at = now()` on this table,
-- but phase 4 never created the column, so every process call errored.
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_settlements_updated_at ON settlements;
CREATE TRIGGER update_settlements_updated_at
  BEFORE UPDATE ON settlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE settlements ADD COLUMN IF NOT EXISTS payout_reference text;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS payout_method    text;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS paid_at          timestamptz;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS generated_by     uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS notes            text;

-- 'paid' is a distinct terminal state from 'completed' (books closed vs money
-- actually transferred to the society escrow).
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_status_check;
ALTER TABLE settlements ADD CONSTRAINT settlements_status_check
  CHECK (status IN ('draft', 'processing', 'completed', 'paid', 'failed'));

-- Which bookings rolled into which settlement. The UNIQUE on booking_id is what
-- makes POST /settlements/generate idempotent: a booking can never settle twice.
CREATE TABLE IF NOT EXISTS settlement_bookings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id     uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  booking_id        uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  gross_amount      numeric(12,2) NOT NULL DEFAULT 0,
  platform_fee      numeric(12,2) NOT NULL DEFAULT 0,
  cooperative_share numeric(12,2) NOT NULL DEFAULT 0,
  worker_share      numeric(12,2) NOT NULL DEFAULT 0,
  welfare_fund      numeric(12,2) NOT NULL DEFAULT 0,
  tax               numeric(12,2) NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS settlement_bookings_settlement_idx
  ON settlement_bookings (settlement_id);

-- ---------------------------------------------------------------------------
-- 3. Durable job queue
--    Backs the 45s worker-acceptance failover, recurring-booking generation,
--    settlement batching and outbox draining. Postgres-backed so a restart
--    cannot silently drop scheduled work.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at        timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled')),
  attempts      int NOT NULL DEFAULT 0,
  max_attempts  int NOT NULL DEFAULT 5,
  last_error    text,
  -- Optional caller-supplied key. Lets a producer say "at most one live
  -- failover job for this booking" without a read-modify-write race.
  dedupe_key    text,
  locked_at     timestamptz,
  locked_by     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS job_queue_dedupe_idx
  ON job_queue (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('pending', 'running');

-- The claim query orders by run_at over pending rows; this is its covering index.
CREATE INDEX IF NOT EXISTS job_queue_claim_idx
  ON job_queue (run_at)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS update_job_queue_updated_at ON job_queue;
CREATE TRIGGER update_job_queue_updated_at
  BEFORE UPDATE ON job_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Booking OTP hardening
--    verify-start / verify-complete treated a NULL hash as "no OTP required",
--    so any 6 digits passed on bookings created outside bookingService
--    (emergency, institutional bulk, recurring). The route now rejects a NULL
--    hash outright; these columns cap brute-force guessing on top of that.
-- ---------------------------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_otp_attempts      int NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completion_otp_attempts int NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS otp_issued_at           timestamptz;

-- ---------------------------------------------------------------------------
-- 5. Payment webhook audit
--    processWebhook de-dupes on (provider, event_id); record the signature
--    verification outcome alongside it.
-- ---------------------------------------------------------------------------
ALTER TABLE payment_webhook_events ADD COLUMN IF NOT EXISTS signature_verified boolean NOT NULL DEFAULT false;
ALTER TABLE payment_webhook_events ADD COLUMN IF NOT EXISTS received_ip        text;

-- ---------------------------------------------------------------------------
-- 6. AI recommendation de-duplication
--    GET /ai/workforce-allocation INSERTed a fresh row on every call, so
--    polling the endpoint buried the approval queue in duplicates. COALESCE
--    because service_id is nullable and NULLs never collide in a unique index.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ai_recommendations_pending_unique_idx
  ON ai_recommendation_records (area, COALESCE(service_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 7. Emergency dispatch failover bookkeeping
--    emergency_escalations records what happened; these columns record what is
--    scheduled to happen next so the failover job is restart-safe.
-- ---------------------------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assignment_expires_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assignment_attempts   int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS bookings_assignment_expiry_idx
  ON bookings (assignment_expires_at)
  WHERE assignment_expires_at IS NOT NULL AND status = 'assigned';
