import { env } from "./config/env.js";
import { registerJobHandlers, seedRecurringJobs } from "./jobs/index.js";
import { startJobRunner, stopJobRunner } from "./core/jobQueue.js";
import { closeRedis } from "./core/redis.js";
import { pool } from "./db/pool.js";
import logger from "./core/logger.js";

/**
 * Standalone background worker (`npm run worker`).
 *
 * The API server runs the same runner in-process by default, which is fine for
 * a single instance. Run this separately — with JOBS_ENABLED=false on the API
 * instances — when you want dispatch work isolated from request latency.
 */

registerJobHandlers();
startJobRunner();

void seedRecurringJobs().catch((error) => logger.error({ error }, "Failed to seed recurring jobs"));

logger.info({ env: env.NODE_ENV }, "GET IT DONE job worker running");

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down worker...");
  stopJobRunner();
  await closeRedis().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Without this the process exits immediately: the runner's interval is unref'd
// so it does not by itself hold the event loop open.
setInterval(() => undefined, 1 << 30);
