-- ============================================================================
-- Phase 12: security_events must be able to record an anonymous failure.
--
-- `user_id` was NOT NULL, but the single most important event to record — a
-- failed sign-in — often has no known user, because the identifier typed does
-- not match an account.
--
-- The login route worked around this by passing the literal string "unknown",
-- which is not a uuid, so the INSERT threw. The thrown error escaped the
-- handler and Express returned 500 instead of 401 — which meant an unknown
-- account and a wrong password were trivially distinguishable, and anyone
-- could enumerate which emails and phone numbers are registered.
--
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE security_events ALTER COLUMN user_id DROP NOT NULL;

-- Failed logins with no user are exactly what an abuse investigation looks at,
-- and they are invisible to the per-user index.
CREATE INDEX IF NOT EXISTS security_events_anonymous_failures_idx
  ON security_events (event_type, created_at DESC)
  WHERE user_id IS NULL;

-- Rate-limiting and abuse review both start from "what has this IP been doing",
-- which had no index at all.
CREATE INDEX IF NOT EXISTS security_events_ip_idx
  ON security_events (ip, created_at DESC)
  WHERE ip IS NOT NULL;
