import { createClient, RedisClientType } from "redis";
import { env } from "../config/env.js";
import logger from "./logger.js";

const redis = createClient({ url: env.REDIS_URL }) as RedisClientType;

redis.on("connect", () => logger.info({ component: "redis" }, "Redis connected"));
redis.on("error", (err: Error) => logger.error({ err, component: "redis" }, "Redis error"));
redis.on("end", () => logger.warn({ component: "redis" }, "Redis connection closed"));

await redis.connect();

export async function getRedis() {
  return redis;
}

export async function closeRedis() {
  await redis.quit();
}

export default redis;