import dotenv from "dotenv";
import { z } from "zod";
import path from "node:path";

dotenv.config({ path: "../.env" });
dotenv.config();

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "string") return value.toLowerCase() === "true";
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default("postgres://getitdone:getitdone@localhost:5432/getitdone"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16).default("development-secret-change-me"),
  JWT_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  STORAGE_DIR: z.string().default(path.resolve(process.cwd(), "storage")),
  DB_POOL_MAX: z.coerce.number().int().positive().max(100).default(20),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  // ── Session length ────────────────────────────────────────────────────────
  //
  // A phone app is a personal device, and signing in again is not a security
  // feature there — it is a wall between a customer with a burst pipe and the
  // plumber. Nobody re-authenticates their food delivery app every month, and
  // an app that asks gets deleted rather than obeyed.
  //
  // The two halves do different jobs and are tuned separately:
  //
  //   * The ACCESS token is the one presented on every request and is only a
  //     bearer string; short-lived so a leaked one expires on its own. The app
  //     refreshes it transparently on a 401, so its length is invisible.
  //   * The REFRESH token is stored in the platform keystore, is single-use,
  //     and ROTATES on every exchange (see rotateRefreshToken). A stolen one
  //     therefore either fails because it was already spent or reveals itself
  //     when the real device's next refresh is rejected — which is what makes
  //     a long life here reasonable rather than reckless.
  //
  // A year, then, on a rotating single-use token. Signing out, "sign out of
  // all devices", and a password reset all still revoke immediately, so the
  // controls that actually matter are unaffected.
  ACCESS_TOKEN_TTL: z.string().default("30m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(365),
  AI_SERVICE_URL: z.string().default("http://localhost:8001"),
  USE_MOCK_DB: booleanFromEnv.default(false),
  GOOGLE_CLIENT_ID: z.string().default(""),
  /** iOS needs its own OAuth client id; Android uses the web one above. Both
   *  are public identifiers, served to the app by GET /config/mobile. */
  GOOGLE_IOS_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),

  /**
   * Server-side Google Maps key, for geocoding, distance and static map
   * tiles.
   *
   * This was HARDCODED in googleMaps.ts and committed. Maps keys are billable
   * and an exposed one is charged to whoever owns it, so that key must be
   * treated as burned and rotated regardless of this change.
   *
   * It is a SERVER key: it is never returned to the app, and the static-map
   * URL that embeds it is never handed out — see the map proxy. A client that
   * needs to draw its own map needs a separate key restricted to the app's
   * package name and signing certificate.
   */
  GOOGLE_MAPS_API_KEY: z.string().default(""),
  GOOGLE_CALLBACK_URL: z.string().default("http://localhost:4000/auth/google/callback"),

  /// How many reverse proxies sit in front of this process.
  ///
  /// 0 means the process is reached directly and X-Forwarded-For must not be
  /// believed -- a client can send that header itself. 1 is the usual
  /// deployment: one nginx terminating TLS on the same host.
  ///
  /// Getting this wrong is not cosmetic. Left at 0 behind a proxy, every
  /// request arrives from the proxy's address, so req.ip is the same value for
  /// everyone: one IP-keyed rate limit bucket shared by the entire internet,
  /// and an audit trail that records 127.0.0.1 as the source of every security
  /// event. Set too high, a caller can prepend addresses to the header and
  /// choose which one is trusted.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  LOG_LEVEL: z.string().optional(),
  METRICS_ENABLED: booleanFromEnv.default(true),
  WS_ENABLED: booleanFromEnv.default(true),

  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_BUCKET: z.string().default("getitdone"),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_FORCE_PATH_STYLE: booleanFromEnv.default(true),
  STORAGE_PROVIDER: z.string().default("minio"),
  MALWARE_SCAN_API: z.string().optional(),

  SENTRY_DSN: z.string().optional(),

  // ── Payment gateway webhook secrets ───────────────────────────────────────
  // Used to verify the HMAC on inbound webhooks. An empty secret means the
  // provider is not configured; verifyWebhookSignature rejects rather than
  // trusting an unverifiable payload.
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  PHONEPE_SALT_KEY: z.string().default(""),
  PHONEPE_SALT_INDEX: z.string().default("1"),
  // Escape hatch for local development only. Refused in production below.
  ALLOW_UNSIGNED_WEBHOOKS: booleanFromEnv.default(false),

  // ── Revenue split (must sum to <= 1) ──────────────────────────────────────
  PLATFORM_FEE_RATE: z.coerce.number().min(0).max(1).default(0.05),
  COOPERATIVE_SHARE_RATE: z.coerce.number().min(0).max(1).default(0.10),
  WELFARE_FUND_RATE: z.coerce.number().min(0).max(1).default(0.02),
  TAX_RATE: z.coerce.number().min(0).max(1).default(0.18),

  // ── SMS delivery ──────────────────────────────────────────────────────────
  // Nothing sends an SMS today. Sign-in is email+password or Google, and the
  // booking handshake codes are shown in both apps rather than texted, so no
  // request path reaches a provider.
  //
  // The settings survive because the provider adapter does: notifying a worker
  // who has no data connection is the obvious next use, and re-deriving the
  // MSG91 DLT template plumbing from scratch would be the expensive part. They
  // are no longer checked at boot — a deployment cannot be misconfigured for a
  // feature it does not run.
  SMS_PROVIDER: z.enum(["msg91", "twilio", "console"]).default("console"),

  MSG91_AUTH_KEY: z.string().default(""),
  // DLT-approved template. Required by Indian telecom regulation — the message
  // body lives in the template, not in our code.
  MSG91_TEMPLATE_ID: z.string().default(""),
  MSG91_SENDER_ID: z.string().default(""),

  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_FROM_NUMBER: z.string().default(""),

  // ── Google Sign-In ────────────────────────────────────────────────────────
  // A Google ID token's audience is the client id that requested it, and
  // Android, iOS and web each have their own. All acceptable ids are listed
  // here, comma separated, or verification rejects legitimate tokens.
  GOOGLE_CLIENT_IDS: z.string().default(""),

  // ── Admin console ────────────────────────────────────────────────────────
  /// TOTP issuer name shown in authenticator apps.
  TOTP_ISSUER: z.string().default("GetItDone Admin"),
  /// Base32 TOTP secret for admin accounts. Generate with: node -e "console.log(require('otplib').generateSecret())"
  ADMIN_TOTP_SECRET: z.string().default(""),

  // ── Push notifications (Firebase Cloud Messaging) ─────────────────────────
  /// Path to the Firebase service account JSON, or the JSON itself.
  ///
  /// Two forms because deployments differ: a mounted file is the better secret
  /// hygiene (it never appears in `docker inspect` or a process listing), while
  /// the inline form suits platforms that only offer environment variables.
  /// FIREBASE_SERVICE_ACCOUNT_PATH wins when both are set.
  ///
  /// With neither set, push is disabled and says so once at boot rather than
  /// failing per-notification: socket delivery still works, and a device whose
  /// app is closed simply sees the update on next open.
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().default(""),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().default(""),
  /// Android notification channel the app registers. Must match
  /// LocalNotifications._channelId in the Flutter client, or Android drops the
  /// message's channel settings and the notification arrives silent.
  FCM_ANDROID_CHANNEL_ID: z.string().default("gid_bookings"),

  // ── Background jobs ───────────────────────────────────────────────────────
  JOBS_ENABLED: booleanFromEnv.default(true),
  JOB_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  JOB_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(10),
  // Blueprint 5.4: worker has this long to accept before auto-reassignment.
  WORKER_ACCEPT_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(45),
  MAX_ASSIGNMENT_ATTEMPTS: z.coerce.number().int().positive().default(5),
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === "production" && (env.JWT_SECRET === "development-secret-change-me" || env.JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must be a unique secret of at least 32 characters in production");
}

if (env.NODE_ENV === "production" && env.ALLOW_UNSIGNED_WEBHOOKS) {
  throw new Error("ALLOW_UNSIGNED_WEBHOOKS cannot be enabled in production");
}

// USE_MOCK_DB swaps bookings, services and worker matching for the in-memory
// demoStore fixtures. Useful for demos; catastrophic if it reaches production.
if (env.NODE_ENV === "production" && env.USE_MOCK_DB) {
  throw new Error("USE_MOCK_DB cannot be enabled in production");
}

// An admin account without TOTP is a single password between the internet and
// every booking, payout and customer address on the platform. Fail at boot
// rather than run one.
if (env.NODE_ENV === "production" && !env.ADMIN_TOTP_SECRET) {
  throw new Error("ADMIN_TOTP_SECRET must be set in production: admin accounts require TOTP");
}

/// Client ids accepted when verifying a Google ID token. Falls back to the
/// single GOOGLE_CLIENT_ID so existing deployments keep working.
export const googleClientIds: string[] = [
  ...env.GOOGLE_CLIENT_IDS.split(",").map((id) => id.trim()).filter(Boolean),
  env.GOOGLE_CLIENT_ID,
].filter((id, index, all) => id.length > 0 && all.indexOf(id) === index);

const splitTotal = env.PLATFORM_FEE_RATE + env.COOPERATIVE_SHARE_RATE + env.WELFARE_FUND_RATE;
if (splitTotal >= 1) {
  throw new Error(
    `Revenue split leaves nothing for the worker: platform ${env.PLATFORM_FEE_RATE} + ` +
      `cooperative ${env.COOPERATIVE_SHARE_RATE} + welfare ${env.WELFARE_FUND_RATE} = ${splitTotal}`
  );
}