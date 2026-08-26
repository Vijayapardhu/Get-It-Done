import { describe, expect, it } from "@jest/globals";
import { computeSplit } from "../src/services/revenueSplit.js";
import { env } from "../src/config/env.js";

/**
 * The split divides real money, so these assert the invariants rather than
 * a golden set of numbers: whatever the configured rates are, the parts must
 * reconcile against what the customer actually paid.
 *
 * Both bugs these cover were live:
 *   - tax was ADDED to an already tax-inclusive charge, so a customer who paid
 *     352.82 was invoiced 416.33;
 *   - the four shares were taken from the tax-inclusive amount, so the worker
 *     was credited a slice of the customer's GST.
 */
describe("computeSplit", () => {
  const rate = env.TAX_RATE;

  it("treats the charged amount as tax-inclusive", () => {
    const split = computeSplit(352.82, true);

    // What the customer paid is what the invoice totals. Never more.
    expect(split.total).toBeCloseTo(352.82, 2);
    expect(split.gross + split.tax).toBeCloseTo(split.total, 2);
  });

  it("extracts tax at the configured rate rather than adding it", () => {
    const total = 352.82;
    const split = computeSplit(total, true);

    expect(split.gross).toBeCloseTo(total / (1 + rate), 2);
    expect(split.tax).toBeCloseTo(total - total / (1 + rate), 2);
  });

  it("divides the net of tax, never the tax itself", () => {
    const split = computeSplit(1000, true);
    const parts = split.platformFee + split.cooperativeShare + split.welfareFund + split.workerShare;

    // The shares reconstitute the pre-tax subtotal exactly — no rounding
    // remainder is silently kept or lost.
    expect(parts).toBeCloseTo(split.gross, 2);
    expect(parts + split.tax).toBeCloseTo(split.total, 2);
  });

  it("gives the unassigned cooperative share to the worker", () => {
    const withCoop = computeSplit(1000, true);
    const without = computeSplit(1000, false);

    expect(without.cooperativeShare).toBe(0);
    expect(without.workerShare).toBeCloseTo(
      withCoop.workerShare + withCoop.cooperativeShare,
      2
    );

    // Both still reconcile.
    const parts =
      without.platformFee + without.cooperativeShare + without.welfareFund + without.workerShare;
    expect(parts).toBeCloseTo(without.gross, 2);
  });

  it("always funds worker welfare from a real payment", () => {
    const split = computeSplit(500, true);
    expect(split.welfareFund).toBeGreaterThan(0);
    expect(split.welfareFund).toBeCloseTo(split.gross * env.WELFARE_FUND_RATE, 2);
  });

  it("never returns a negative share, whatever the input", () => {
    for (const amount of [0, -100, 0.01, 1, 999999]) {
      const split = computeSplit(amount, true);
      expect(split.total).toBeGreaterThanOrEqual(0);
      expect(split.gross).toBeGreaterThanOrEqual(0);
      expect(split.tax).toBeGreaterThanOrEqual(0);
      expect(split.platformFee).toBeGreaterThanOrEqual(0);
      expect(split.cooperativeShare).toBeGreaterThanOrEqual(0);
      expect(split.welfareFund).toBeGreaterThanOrEqual(0);
      expect(split.workerShare).toBeGreaterThanOrEqual(0);
    }
  });

  it("rounds to whole paise", () => {
    // 333.33 does not divide cleanly by any of the rates.
    const split = computeSplit(333.33, true);
    for (const value of [
      split.total,
      split.gross,
      split.tax,
      split.platformFee,
      split.cooperativeShare,
      split.welfareFund,
      split.workerShare,
    ]) {
      expect(Math.round(value * 100)).toBeCloseTo(value * 100, 6);
    }
  });
});
