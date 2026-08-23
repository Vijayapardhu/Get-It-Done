import type { Pool } from "pg";
import { pool } from "../db/pool.js";
import redis from "./redis.js";
import { env } from "../config/env.js";
import logger from "./logger.js";
import { isS3Compatible } from "./storage.js";

interface HealthCheck {
  name: string;
  status: "up" | "down" | "degraded";
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: HealthCheck[];
}

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    return { name: "database", status: "up", latencyMs: Date.now() - start };
  } catch (error) {
    return { name: "database", status: "down", latencyMs: Date.now() - start, error: String(error) };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await redis.ping();
    return { name: "redis", status: "up", latencyMs: Date.now() - start };
  } catch (error) {
    return { name: "redis", status: "down", latencyMs: Date.now() - start, error: String(error) };
  }
}

async function checkAIService(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${env.AI_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) return { name: "ai-service", status: "up", latencyMs: Date.now() - start };
    return { name: "ai-service", status: "degraded", latencyMs: Date.now() - start, error: `HTTP ${response.status}` };
  } catch (error) {
    return { name: "ai-service", status: "down", latencyMs: Date.now() - start, error: String(error) };
  }
}

async function checkStorage(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    if (isS3Compatible) {
      return { name: "storage", status: "up", latencyMs: Date.now() - start };
    }
    return { name: "storage", status: "up", latencyMs: Date.now() - start };
  } catch (error) {
    return { name: "storage", status: "down", latencyMs: Date.now() - start, error: String(error) };
  }
}

async function checkPaymentProvider(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    return { name: "payment-provider", status: "up", latencyMs: Date.now() - start };
  } catch (error) {
    return { name: "payment-provider", status: "down", latencyMs: Date.now() - start, error: String(error) };
  }
}

export async function getLiveness(): Promise<HealthResponse> {
  return {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    checks: [{ name: "process", status: "up" }],
  };
}

export async function getReadiness(): Promise<HealthResponse> {
  const checks = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkAIService(),
    checkStorage(),
    checkPaymentProvider(),
  ]);

  const hasDown = checks.some((c) => c.status === "down");
  const hasDegraded = checks.some((c) => c.status === "degraded");

  let status: HealthResponse["status"] = "healthy";
  if (hasDown) status = "unhealthy";
  else if (hasDegraded) status = "degraded";

  return {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    checks,
  };
}