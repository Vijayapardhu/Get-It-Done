import { env } from "../config/env.js";
import logger from "../core/logger.js";

/**
 * SMS delivery.
 *
 * OTP login is the only onboarding this product has, so until this works nobody
 * can sign in. Previously `createOtpChallenge` returned the code and the route
 * console.logged it — fine for a developer, useless for a real user.
 *
 * Provider-agnostic on purpose: MSG91 is the sensible default for India (DLT
 * registered templates, better delivery on Indian carriers), Twilio is the
 * fallback, and `console` keeps local development working with no credentials.
 */

export type SmsProvider = "msg91" | "twilio" | "console";

export interface SmsResult {
  delivered: boolean;
  provider: SmsProvider;
  messageId?: string;
  error?: string;
}

/**
 * Normalise to E.164 for the gateway.
 *
 * Users type "98765 43210"; MSG91 wants "919876543210" and Twilio wants
 * "+919876543210". Ten digits are assumed Indian, which matches the audience.
 */
export function toE164(phone: string, defaultCountryCode = "91"): string {
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+${defaultCountryCode}${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return `+${defaultCountryCode}${digits}`;
}

/** MSG91 wants the number without a leading '+'. */
function toMsg91(phone: string): string {
  return toE164(phone).replace(/^\+/, "");
}

async function sendViaMsg91(phone: string, otp: string): Promise<SmsResult> {
  // MSG91's OTP endpoint takes the code and a DLT-approved template id; the
  // message body itself lives in the template, which is a regulatory
  // requirement in India rather than a design choice.
  const url = new URL("https://control.msg91.com/api/v5/otp");
  url.searchParams.set("template_id", env.MSG91_TEMPLATE_ID);
  url.searchParams.set("mobile", toMsg91(phone));
  url.searchParams.set("otp", otp);
  if (env.MSG91_SENDER_ID) url.searchParams.set("sender", env.MSG91_SENDER_ID);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { authkey: env.MSG91_AUTH_KEY, "content-type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    const body = (await response.json().catch(() => ({}))) as { type?: string; message?: string; request_id?: string };

    // MSG91 answers 200 with `{type: "error"}` on a rejected send, so the HTTP
    // status alone is not enough to call it delivered.
    if (!response.ok || body.type === "error") {
      return { delivered: false, provider: "msg91", error: body.message ?? `HTTP ${response.status}` };
    }
    return { delivered: true, provider: "msg91", messageId: body.request_id };
  } catch (error) {
    return {
      delivered: false,
      provider: "msg91",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function sendViaTwilio(phone: string, otp: string): Promise<SmsResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");

  const form = new URLSearchParams({
    To: toE164(phone),
    From: env.TWILIO_FROM_NUMBER,
    Body: `${otp} is your GET IT DONE verification code. It expires in 5 minutes. Do not share it with anyone.`,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });

    const body = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!response.ok) {
      return { delivered: false, provider: "twilio", error: body.message ?? `HTTP ${response.status}` };
    }
    return { delivered: true, provider: "twilio", messageId: body.sid };
  } catch (error) {
    return {
      delivered: false,
      provider: "twilio",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Development sink. Prints the code to the server log instead of sending it.
 *
 * env.ts refuses to start with this provider selected in production, so a
 * misconfigured deploy fails loudly at boot rather than silently never
 * delivering an OTP.
 */
function sendViaConsole(phone: string, otp: string): SmsResult {
  logger.warn(
    { phone: toE164(phone), otp },
    "SMS_PROVIDER=console — printing the OTP instead of sending it. Development only."
  );
  return { delivered: true, provider: "console" };
}

/**
 * Send a login OTP.
 *
 * Never throws: a delivery failure is returned so the caller can decide. The
 * challenge row is already written by then, and a transient gateway outage
 * should not lose it — the user can request a resend against the same code.
 */
export async function sendOtpSms(phone: string, otp: string): Promise<SmsResult> {
  switch (env.SMS_PROVIDER) {
    case "msg91":
      return sendViaMsg91(phone, otp);
    case "twilio":
      return sendViaTwilio(phone, otp);
    case "console":
      return sendViaConsole(phone, otp);
    default:
      return { delivered: false, provider: "console", error: `Unknown SMS_PROVIDER '${env.SMS_PROVIDER}'` };
  }
}

/** Whether the selected provider actually has credentials to work with. */
export function isSmsConfigured(): boolean {
  switch (env.SMS_PROVIDER) {
    case "msg91":
      return Boolean(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID);
    case "twilio":
      return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
    case "console":
      return true;
    default:
      return false;
  }
}
