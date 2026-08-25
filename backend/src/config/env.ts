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
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  AI_SERVICE_URL: z.string().default("http://localhost:8001"),
  USE_MOCK_DB: booleanFromEnv.default(false),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_CALLBACK_URL: z.string().default("http://localhost:4000/auth/google/callback"),

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

const splitTotal = env.PLATFORM_FEE_RATE + env.COOPERATIVE_SHARE_RATE + env.WELFARE_FUND_RATE;
if (splitTotal >= 1) {
  throw new Error(
    `Revenue split leaves nothing for the worker: platform ${env.PLATFORM_FEE_RATE} + ` +
      `cooperative ${env.COOPERATIVE_SHARE_RATE} + welfare ${env.WELFARE_FUND_RATE} = ${splitTotal}`
  );
}