import { describe, expect, it } from "@jest/globals";
import { toPaise } from "../src/services/razorpayClient.js";

/**
 * Razorpay takes paise. Passing rupees would undercharge by 100x and passing a
 * fraction is rejected outright, so the conversion happens in exactly one place
 * and is checked here.
 */
describe("toPaise", () => {
  it("converts rupees to paise", () => {
    expect(toPaise(1)).toBe(100);
    expect(toPaise(352.82)).toBe(35282);
    expect(toPaise(0.01)).toBe(1);
  });

  it("rounds binary floating-point drift to the nearest paisa", () => {
    // 8.115 * 100 is 811.4999999999999 in IEEE-754; truncating would lose a
    // paisa on every such amount.
    expect(toPaise(8.115)).toBe(812);
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });

  it("refuses amounts that cannot be charged", () => {
    expect(() => toPaise(0)).toThrow("INVALID_AMOUNT");
    expect(() => toPaise(-5)).toThrow("INVALID_AMOUNT");
    expect(() => toPaise(Number.NaN)).toThrow("INVALID_AMOUNT");
    expect(() => toPaise(Number.POSITIVE_INFINITY)).toThrow("INVALID_AMOUNT");

    // Rounds to zero paise — a charge that would succeed for nothing.
    expect(() => toPaise(0.004)).toThrow("INVALID_AMOUNT");
  });
});
