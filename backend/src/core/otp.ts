import crypto from "node:crypto";

/**
 * Booking handshake codes.
 *
 * Every path that creates a booking must issue these, otherwise the
 * verify-start / verify-complete handlers have nothing to check against and the
 * job can be marked done without the customer present.
 */

const OTP_DIGITS = 6;

/**
 * Six digits from a CSPRNG, rejection-sampled so every code is equally likely.
 * `Math.random()` (what bookingService used) is seeded predictably enough that
 * an attacker who sees a few codes can narrow the next ones.
 */
export function generateOtp(): string {
  const max = 10 ** OTP_DIGITS; // 1_000_000
  // 2^32 is not a multiple of 1e6, so values in the final partial bucket would
  // bias the low codes. Discard them.
  const limit = Math.floor(0xffffffff / max) * max;

  let value = crypto.randomInt(0, 0xffffffff);
  while (value >= limit) value = crypto.randomInt(0, 0xffffffff);

  return String(value % max).padStart(OTP_DIGITS, "0");
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Generate a start/completion pair together with the hashes to persist. */
export function generateBookingOtps(): {
  startOtp: string;
  completionOtp: string;
  startOtpHash: string;
  completionOtpHash: string;
} {
  const startOtp = generateOtp();
  const completionOtp = generateOtp();
  return {
    startOtp,
    completionOtp,
    startOtpHash: sha256Hex(startOtp),
    completionOtpHash: sha256Hex(completionOtp),
  };
}
