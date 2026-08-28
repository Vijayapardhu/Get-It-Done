-- Who to call at the door, recorded with the order rather than looked up.
--
-- Dispatch used to read the customer's account name and phone at the moment a
-- worker was assigned. That is the wrong record for three situations that are
-- all ordinary here:
--
--   * The booking is for somebody else -- a parent's house, a tenant, an
--     office -- and the account holder is not the person who will open the
--     door.
--   * The account phone changes later, and a completed booking's history then
--     shows a number that was never called.
--   * A worker needs a number to ring on the way; reading it live means a
--     profile edit mid-job silently redirects them.
--
-- Nullable, because every order placed before this column existed has neither,
-- and backfilling them from the account would invent a fact. Readers fall back
-- to the account when these are null, which is exactly what they did before.
alter table service_orders add column if not exists contact_name text;
alter table service_orders add column if not exists contact_phone text;
