import pino from "pino";
import { env } from "../config/env.js";

const isDevelopment = env.NODE_ENV === "development";

const logger = pino({
  level: env.LOG_LEVEL ?? (isDevelopment ? "debug" : "info"),
  transport: isDevelopment ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss Z", ignore: "pid,hostname" } } : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: "getitdone-backend" },
});

export function createRequestLogger(requestId: string) {
  return logger.child({ requestId });
}

export default logger;