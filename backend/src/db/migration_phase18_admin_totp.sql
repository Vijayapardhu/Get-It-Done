-- Second factor for operator accounts.
--
-- POST /auth/admin/login already reads `user.totpSecret` and refuses any role
-- above support_staff without one. The column it reads was never created, so
-- the route did not compile and the backend could not be built at all. This
-- adds the column the code has always assumed.
--
-- The secret is stored in plain text on purpose: TOTP verification needs the
-- original shared secret, so unlike a password it cannot be hashed. That makes
-- this column as sensitive as the password hashes beside it -- it belongs in a
-- KMS or an encrypted column in any deployment that handles real money.

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret text;

-- Enrolment is a separate step from having the column: an admin scans a QR
-- code and confirms one code before this is set. Until then the account exists
-- but cannot sign in to the console, which is the safe default.
COMMENT ON COLUMN users.totp_secret IS
  'Base32 TOTP shared secret. Null until the operator has enrolled a device.';
