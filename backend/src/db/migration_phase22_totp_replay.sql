-- Replay protection for the operator second factor.
--
-- phase 18 added `users.totp_secret` for a route that was never written. Now
-- that POST /auth/admin/login exists and actually verifies a code, the code
-- needs to be single-use.
--
-- A TOTP code is valid for its entire 30-second step, so one observed once --
-- shoulder-surfed, read off a shared screen, captured by a proxy -- can be
-- replayed until that step ends. Recording the step the account last
-- authenticated with, and refusing anything at or before it, closes that
-- window. The UPDATE in totpService.verifyToken is conditional on this column,
-- so two concurrent sign-ins with the same code cannot both succeed.
--
-- bigint, not int: the step is unix seconds / 30, which is ~59.6 million today
-- and fits in an int -- but int overflows in 2038 and there is no reason to
-- inherit that.

alter table users add column if not exists totp_last_step bigint;

comment on column users.totp_last_step is
  'Highest TOTP time step this account has authenticated with. Makes each code
   single-use: verification refuses any step <= this value.';
