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
  DATABASE_URL: z.string().default("postgres://getitnow:getitnow@localhost:5432/getitnow"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16).default("development-secret-change-me"),
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
  S3_BUCKET: z.string().default("getitnow"),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_FORCE_PATH_STYLE: booleanFromEnv.default(true),
  STORAGE_PROVIDER: z.string().default("minio"),
  MALWARE_SCAN_API: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === "production" && (env.JWT_SECRET === "development-secret-change-me" || env.JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must be a unique secret of at least 32 characters in production");
}