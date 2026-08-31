-- Phase 35: Customer cooperative assignment
--
-- A customer's bookings are already routed to the cooperative whose territory
-- contains the booking's location (see migration_phase30_territories and
-- territoryService.resolveAndAssignBooking). That happens at booking time.
--
-- But the customer app needs to know their cooperative BEFORE the first booking
-- so it can show "Your cooperative" everywhere, restrict the catalogue to what
-- that cooperative actually offers, and avoid asking the user to set a location
-- on the first screen.
--
-- This migration adds the fields the user needs:
--   * cooperative_id      -- the resolved cooperative, set once at onboarding
--   * home_address        -- the formatted address the user confirmed
--   * home_latitude/longitude -- the pin the cooperative was resolved against
--   * location_resolution_method -- gps | pincode | manual
--   * location_resolved_at       -- when the resolution last ran
--   * profile_photo_url   -- avatar the user can upload; also used by the worker
--                            app where it currently lives only on auth/me
--   * avatar_url already exists on users (see auth_service.toUser)
--
-- cooperative_id is nullable: an account can exist without one, and a
-- location-less user is shown the onboarding flow until they resolve.

ALTER TABLE users ADD COLUMN IF NOT EXISTS cooperative_id uuid REFERENCES cooperatives(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS home_address text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS home_latitude double precision;
ALTER TABLE users ADD COLUMN IF NOT EXISTS home_longitude double precision;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_resolution_method text
  CHECK (location_resolution_method IN ('gps', 'pincode', 'manual'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_resolved_at timestamptz;

-- Used by the app to filter bookings to the user's cooperative. The booking's
-- own cooperative_id is the source of truth, but indexing the user side speeds
-- up "show me my cooperative's workers" queries.
CREATE INDEX IF NOT EXISTS users_cooperative_id_idx ON users (cooperative_id)
  WHERE cooperative_id IS NOT NULL;

-- Reuse the existing logo_key on cooperatives (see migration_phase32) for the
-- cooperative badge shown on the home screen and the trust card. No new column
-- is needed; we just expose it.
