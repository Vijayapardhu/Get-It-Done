-- ============================================================================
-- Phase 10: Entities referenced by application code but never created.
-- Every table here had live SQL against it in src/routes or src/services
-- while having no CREATE TABLE in any prior migration.
-- Idempotent: safe to re-run.
-- ============================================================================

-- Shared updated_at trigger function. Defined here too so this migration is
-- self-sufficient regardless of which earlier files have been applied.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $fn$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 1. emergency_bookings
--    Used by: emergency.ts (create/active/detail/escalate/resolve/reassign),
--             admin.ts (/operations/live, /operations/emergency),
--             cooperativeDashboard.ts (overview, operations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emergency_bookings (
  booking_id            uuid PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  priority              text NOT NULL DEFAULT 'high'
                          CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  radius_km             numeric(6,2) NOT NULL DEFAULT 10,
  max_response_minutes  int NOT NULL DEFAULT 60,
  escalation_level      int NOT NULL DEFAULT 0,
  duplicate_key         text,
  escalated_at          timestamptz,
  resolved_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ORDER BY eb.priority DESC must rank critical > high > medium > low, but the
-- column is text so a plain DESC sorts alphabetically (medium > low > high >
-- critical). Rank helper keeps the dispatch queue honest.
CREATE OR REPLACE FUNCTION emergency_priority_rank(p text)
RETURNS int AS $fn$
  SELECT CASE p
    WHEN 'critical' THEN 4
    WHEN 'high'     THEN 3
    WHEN 'medium'   THEN 2
    WHEN 'low'      THEN 1
    ELSE 0
  END;
$fn$ LANGUAGE sql IMMUTABLE;

CREATE INDEX IF NOT EXISTS emergency_bookings_open_idx
  ON emergency_bookings (emergency_priority_rank(priority) DESC, created_at ASC)
  WHERE resolved_at IS NULL;

-- Backs the 10-minute duplicate-suppression lookup in emergency.ts
CREATE INDEX IF NOT EXISTS emergency_bookings_duplicate_key_idx
  ON emergency_bookings (duplicate_key, created_at DESC)
  WHERE duplicate_key IS NOT NULL;

DROP TRIGGER IF EXISTS update_emergency_bookings_updated_at ON emergency_bookings;
CREATE TRIGGER update_emergency_bookings_updated_at
  BEFORE UPDATE ON emergency_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. complaint_comments
--    Used by: support.ts (GET /tickets/:id thread, POST /tickets/:id/comments)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaint_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  author_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment      text NOT NULL,
  is_internal  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS complaint_comments_complaint_idx
  ON complaint_comments (complaint_id, created_at ASC);

DROP TRIGGER IF EXISTS update_complaint_comments_updated_at ON complaint_comments;
CREATE TRIGGER update_complaint_comments_updated_at
  BEFORE UPDATE ON complaint_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. review_reports
--    Used by: reviews.ts (POST /reviews/:id/report)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'reviewing', 'upheld', 'dismissed')),
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- one report per reporter per review; repeat clicks must not inflate counts
  UNIQUE (review_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS review_reports_open_idx
  ON review_reports (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. worker_verification_documents
--    Used by: workers.ts (POST /me/verification/submit,
--             GET /me/verification/status, POST /:workerId/verification/submit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker_verification_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id         uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  document_id       uuid NOT NULL REFERENCES worker_documents(id) ON DELETE CASCADE,
  verification_type text NOT NULL DEFAULT 'identity',
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  rejection_reason  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id)
);

CREATE INDEX IF NOT EXISTS worker_verification_documents_worker_idx
  ON worker_verification_documents (worker_id, status);

DROP TRIGGER IF EXISTS update_worker_verification_documents_updated_at ON worker_verification_documents;
CREATE TRIGGER update_worker_verification_documents_updated_at
  BEFORE UPDATE ON worker_verification_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. translations
--    i18n.ts served generated defaults and its admin PUT was a no-op.
--    This table stores per-language overrides layered over those defaults.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS translations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lang       text NOT NULL,
  key        text NOT NULL,
  value      text NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lang, key)
);

CREATE INDEX IF NOT EXISTS translations_lang_idx ON translations (lang);

DROP TRIGGER IF EXISTS update_translations_updated_at ON translations;
CREATE TRIGGER update_translations_updated_at
  BEFORE UPDATE ON translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
