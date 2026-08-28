import { generateSecret, generateSync, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";

/**
 * Second factor for operator accounts.
 *
 * `users.totp_secret` was added by migration_phase18_admin_totp.sql, whose own
 * header states:
 *
 *   "POST /auth/admin/login already reads `user.totpSecret` and refuses any
 *    role above support_staff without one."
 *
 * Half of that was true. `authService.findUserByEmail` really does SELECT the
 * column and really does put it on `AuthenticatableUser` — but the route it
 * names was never written, no TOTP library was ever installed, and nothing
 * anywhere verified a code. So the accounts that approve worker verifications,
 * generate settlements and trigger payouts signed in through the ordinary
 * `/auth/login` with a password and nothing else. This is the missing half.
 *
 * Roles at or above `society_admin` are the ones this gates: they are the roles
 * that can move money or change a worker's ability to earn.
 */

/** Roles that must present a second factor. */
const SECOND_FACTOR_ROLES = new Set(["society_admin", "federation_admin", "system_admin"]);

export function requiresSecondFactor(role: string): boolean {
  return SECOND_FACTOR_ROLES.has(role);
}

/**
 * Accept a code from the adjacent 30-second steps as well as the current one.
 *
 * Phones drift and people finish typing late. `[30, 30]` is one step either
 * side — the usual compromise between a locked-out operator and a widened
 * guessing window, and the window is narrowed again by the replay check below.
 */
const EPOCH_TOLERANCE: [number, number] = [30, 30];

/**
 * Narrow the verify result to the TOTP shape.
 *
 * `verifySync` is strategy-generic and returns `TotpValid | HotpValid`, and
 * only the TOTP arm carries `timeStep` -- which is the field the replay check
 * below is built on. Everything here passes the default `totp` strategy, so the
 * guard always holds; it is written as a guard rather than a cast so that
 * switching strategy later fails at compile time instead of silently disabling
 * replay protection.
 */
function timeStepOf(result: { valid: true } & Record<string, unknown>): number | null {
  return typeof result.timeStep === "number" ? result.timeStep : null;
}

export interface EnrolmentChallenge {
  /** Base32 secret. NOT persisted until `confirmEnrolment` verifies a code. */
  secret: string;
  /** otpauth:// URI, for a manually-entered key. */
  uri: string;
  /** The same URI as a PNG data URL, for scanning. */
  qrDataUrl: string;
}

/**
 * Begin enrolment. Deliberately does not write anything.
 *
 * Persisting the secret here would lock an operator out of their own account
 * the moment they closed the tab before scanning: the account would demand a
 * code from an authenticator that had never been set up. The secret becomes
 * real only when `confirmEnrolment` proves a device can produce a code from it.
 */
export async function beginEnrolment(label: string): Promise<EnrolmentChallenge> {
  const secret = generateSecret();
  const uri = generateURI({ issuer: env.TOTP_ISSUER, label, secret });
  const qrDataUrl = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 240 });
  return { secret, uri, qrDataUrl };
}

/**
 * Finish enrolment: prove the device works, then store the secret.
 *
 * Returns false on a bad code and writes nothing, so a mistyped digit is
 * retryable rather than an account left half-enrolled.
 */
export async function confirmEnrolment(userId: string, secret: string, token: string): Promise<boolean> {
  const result = verifySync({ secret, token, epochTolerance: EPOCH_TOLERANCE });
  if (!result.valid) return false;

  await pool.query("update users set totp_secret = $1, totp_last_step = $2 where id = $3", [
    secret,
    timeStepOf(result),
    userId,
  ]);
  return true;
}

export type VerificationFailure = "no_secret" | "invalid" | "replayed";

/**
 * Verify a code at sign-in.
 *
 * A TOTP code stays valid for its whole 30-second step, so a code observed
 * once — shoulder-surfed, read off a shared screen, captured from a proxy —
 * can be replayed until the step ends. `totp_last_step` records the step the
 * account last authenticated with and refuses anything at or before it, which
 * makes every code single-use.
 *
 * The UPDATE is conditional on the stored value so two concurrent sign-ins with
 * the same code cannot both win: whichever commits first moves the step
 * forward, and the second matches zero rows and is rejected.
 */
export async function verifyToken(
  userId: string,
  secret: string | undefined,
  token: string
): Promise<{ ok: true } | { ok: false; reason: VerificationFailure }> {
  if (!secret) return { ok: false, reason: "no_secret" };

  const result = verifySync({ secret, token, epochTolerance: EPOCH_TOLERANCE });
  if (!result.valid) return { ok: false, reason: "invalid" };

  const timeStep = timeStepOf(result);
  // No time step means this was not a TOTP verification, which the guard above
  // says cannot happen. Fail closed rather than skipping the replay check.
  if (timeStep === null) return { ok: false, reason: "invalid" };

  const claimed = await pool.query(
    `update users set totp_last_step = $1
      where id = $2 and (totp_last_step is null or totp_last_step < $1)
      returning id`,
    [timeStep, userId]
  );
  if (claimed.rowCount === 0) return { ok: false, reason: "replayed" };

  return { ok: true };
}

/** True once an operator has a working authenticator on the account. */
export async function hasEnrolled(userId: string): Promise<boolean> {
  const result = await pool.query("select totp_secret from users where id = $1", [userId]);
  return Boolean(result.rows[0]?.totp_secret);
}

/**
 * Clear an operator's second factor — the lost-phone path.
 *
 * Never self-service: an account that can remove its own second factor by
 * being signed in does not have one. Only `system_admin` may call the route
 * that reaches this, and the caller is recorded in the audit log.
 */
export async function resetEnrolment(userId: string): Promise<void> {
  await pool.query("update users set totp_secret = null, totp_last_step = null where id = $1", [userId]);
}

/** Exported for tests: produce a valid code for a secret. */
export function currentToken(secret: string): string {
  return generateSync({ secret });
}
