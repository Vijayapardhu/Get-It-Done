// MUST be first: Sentry patches http/pg at import time, so anything loaded
// before init() is never instrumented. See src/instrument.ts.
import "./instrument.js";
import http from "node:http";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { initializeRealtime, getIO } from "./core/realtime.js";
import { closeRedis } from "./core/redis.js";
import { startJobRunner, stopJobRunner } from "./core/jobQueue.js";
import { registerJobHandlers, seedRecurringJobs } from "./jobs/index.js";
import logger from "./core/logger.js";

const app = createApp();
const server = http.createServer(app);

if (env.WS_ENABLED) {
  initializeRealtime(server);
  const io = getIO();
  if (io) app.set("io", io);
}

// Background work (acceptance failover, escalation, recurring generation,
// settlement batching, outbox drain). Set JOBS_ENABLED=false here and run
// `npm run worker` separately to keep dispatch off the request path.
registerJobHandlers();
startJobRunner();
if (env.JOBS_ENABLED) {
  void seedRecurringJobs().catch((error) => logger.error({ error }, "Failed to seed recurring jobs"));
}

server.requestTimeout = 15000;

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down...");
  stopJobRunner();
  server.close(async () => {
    await closeRedis();
    logger.info("Shutdown complete");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "GET IT DONE API running");
});