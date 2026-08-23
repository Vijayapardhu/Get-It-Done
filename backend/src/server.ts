import http from "node:http";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { initializeRealtime, getIO } from "./core/realtime.js";
import { closeRedis } from "./core/redis.js";
import logger from "./core/logger.js";

const app = createApp();
const server = http.createServer(app);

if (env.WS_ENABLED) {
  initializeRealtime(server);
  const io = getIO();
  if (io) app.set("io", io);
}

server.requestTimeout = 15000;

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down...");
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
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "GET IT NOW API running");
});