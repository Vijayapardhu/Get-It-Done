import { describe, expect, it, jest, beforeAll, beforeEach } from "@jest/globals";

/**
 * The operator second factor.
 *
 * The interesting property is not "a correct code passes" -- otplib is
 * responsible for that -- but that a correct code passes exactly ONCE. A TOTP
 * code stays valid for its whole 30-second step, so one that has been observed
 * (shoulder-surfed, read off a shared screen, captured by a proxy) is replayable
 * until the step ends unless something records that it has been spent.
 *
 * These tests drive a fake `users` row through the service so the replay rule
 * is asserted against the real conditional UPDATE rather than against a mock
 * that always says yes.
 */

/** Stands in for the single `users` row the service reads and writes. */
const row: { id: string; totp_secret: string | null; totp_last_step: number | null } = {
  id: "11111111-1111-1111-1111-111111111111",
  totp_secret: null,
  totp_last_step: null,
};

/**
 * Minimal fake of the pg pool that understands only the three statements
 * totpService issues. Anything else throws, so a query added later cannot pass
 * these tests by silently returning an empty result.
 */
const query = jest.fn(async (text: string, values: unknown[] = []) => {
  const sql = text.replace(/\s+/g, " ").trim().toLowerCase();

  if (sql.startsWith("select totp_secret from users")) {
    return { rows: [{ totp_secret: row.totp_secret }], rowCount: 1 };
  }

  if (sql.startsWith("update users set totp_secret = $1")) {
    row.totp_secret = values[0] as string;
    row.totp_last_step = values[1] as number;
    return { rows: [{ id: row.id }], rowCount: 1 };
  }

  // The conditional claim. This is the rule under test: the step only moves
  // forward, so a code already spent matches zero rows.
  if (sql.startsWith("update users set totp_last_step = $1")) {
    const step = values[0] as number;
    if (row.totp_last_step !== null && row.totp_last_step >= step) {
      return { rows: [], rowCount: 0 };
    }
    row.totp_last_step = step;
    return { rows: [{ id: row.id }], rowCount: 1 };
  }

  if (sql.startsWith("update users set totp_secret = null")) {
    row.totp_secret = null;
    row.totp_last_step = null;
    return { rows: [], rowCount: 1 };
  }

  throw new Error(`unexpected query: ${sql}`);
});

jest.unstable_mockModule("../src/db/pool.js", () => ({ pool: { query } }));

// Imported in beforeAll rather than at top level: ts-jest compiles this suite
// under a module setting that rejects top-level await, and the mock above has
// to be registered before the service resolves its pool import either way.
let totp: typeof import("../src/services/totpService.js");

beforeAll(async () => {
  totp = await import("../src/services/totpService.js");
});

beforeEach(() => {
  row.totp_secret = null;
  row.totp_last_step = null;
  query.mockClear();
});

describe("requiresSecondFactor", () => {
  it("gates the roles that can move money or a worker's ability to earn", () => {
    expect(totp.requiresSecondFactor("society_admin")).toBe(true);
    expect(totp.requiresSecondFactor("federation_admin")).toBe(true);
    expect(totp.requiresSecondFactor("system_admin")).toBe(true);
  });

  it("does not gate customers, workers or support staff", () => {
    expect(totp.requiresSecondFactor("customer")).toBe(false);
    expect(totp.requiresSecondFactor("worker")).toBe(false);
    expect(totp.requiresSecondFactor("support_staff")).toBe(false);
  });
});

describe("enrolment", () => {
  it("does not persist the secret until a code proves the device works", async () => {
    const challenge = await totp.beginEnrolment("admin@example.test");

    // Nothing written. An operator who closes the tab before scanning must not
    // be left with an account demanding codes from an authenticator that was
    // never set up.
    expect(query).not.toHaveBeenCalled();
    expect(row.totp_secret).toBeNull();

    expect(challenge.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(challenge.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("stores the secret once the code matches", async () => {
    const { secret } = await totp.beginEnrolment("admin@example.test");
    const ok = await totp.confirmEnrolment(row.id, secret, totp.currentToken(secret));

    expect(ok).toBe(true);
    expect(row.totp_secret).toBe(secret);
  });

  it("writes nothing when the code is wrong, so a mistype is retryable", async () => {
    const { secret } = await totp.beginEnrolment("admin@example.test");
    const ok = await totp.confirmEnrolment(row.id, secret, "000000");

    expect(ok).toBe(false);
    expect(row.totp_secret).toBeNull();
  });
});

describe("verifyToken", () => {
  it("refuses an account with no authenticator enrolled", async () => {
    const result = await totp.verifyToken(row.id, undefined, "123456");
    expect(result).toEqual({ ok: false, reason: "no_secret" });
  });

  it("refuses a wrong code", async () => {
    const { secret } = await totp.beginEnrolment("admin@example.test");
    await totp.confirmEnrolment(row.id, secret, totp.currentToken(secret));

    const result = await totp.verifyToken(row.id, secret, "000000");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("accepts a correct code exactly once, then rejects the replay", async () => {
    const { secret } = await totp.beginEnrolment("admin@example.test");

    // Enrol at a step in the past so the first live verification is not itself
    // treated as a replay of the enrolment code.
    await totp.confirmEnrolment(row.id, secret, totp.currentToken(secret));
    row.totp_last_step = (row.totp_last_step as number) - 1;

    const code = totp.currentToken(secret);

    const first = await totp.verifyToken(row.id, secret, code);
    expect(first).toEqual({ ok: true });

    // Same code, same 30-second window. This is the attack the column exists
    // to stop, and before totp_last_step it would have succeeded.
    const second = await totp.verifyToken(row.id, secret, code);
    expect(second).toEqual({ ok: false, reason: "replayed" });
  });
});

describe("resetEnrolment", () => {
  it("clears both the secret and the spent-step marker", async () => {
    const { secret } = await totp.beginEnrolment("admin@example.test");
    await totp.confirmEnrolment(row.id, secret, totp.currentToken(secret));

    await totp.resetEnrolment(row.id);

    expect(row.totp_secret).toBeNull();
    // Leaving the old step behind would make the re-enrolled device's first
    // codes look like replays until the clock caught up.
    expect(row.totp_last_step).toBeNull();
  });
});
