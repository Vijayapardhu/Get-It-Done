import client, { Registry, Counter, Histogram, Gauge } from "prom-client";
import { env } from "../config/env.js";

const register = new Registry();

if (env.METRICS_ENABLED !== false) {
  client.collectDefaultMetrics({ register, prefix: "getitdone_" });
}

export const httpRequestDuration = new Histogram({
  name: "getitdone_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: "getitdone_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const activeConnections = new Gauge({
  name: "getitdone_active_connections",
  help: "Number of active WebSocket connections",
  registers: [register],
});

export const dbQueryDuration = new Histogram({
  name: "getitdone_db_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["query_type", "table"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

export const businessMetrics = {
  bookingsCreated: new Counter({ name: "getitdone_bookings_created_total", help: "Total bookings created", labelNames: ["type", "service"], registers: [register] }),
  bookingsCompleted: new Counter({ name: "getitdone_bookings_completed_total", help: "Total bookings completed", labelNames: ["service"], registers: [register] }),
  bookingsCancelled: new Counter({ name: "getitdone_bookings_cancelled_total", help: "Total bookings cancelled", labelNames: ["reason", "actor"], registers: [register] }),
  paymentsProcessed: new Counter({ name: "getitdone_payments_processed_total", help: "Total payments processed", labelNames: ["provider", "status"], registers: [register] }),
  workersMatched: new Counter({ name: "getitdone_workers_matched_total", help: "Total workers matched", labelNames: ["service", "urgency"], registers: [register] }),
  matchingScore: new Histogram({ name: "getitdone_matching_score", help: "Matching engine scores", labelNames: ["service"], buckets: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], registers: [register] }),
  aiForecastRequests: new Counter({ name: "getitdone_ai_forecast_requests_total", help: "AI forecast requests", labelNames: ["type", "status"], registers: [register] }),
  authLogins: new Counter({ name: "getitdone_auth_logins_total", help: "Total logins", labelNames: ["method", "status"], registers: [register] }),
};

export function getMetrics() {
  return register.metrics();
}

export function getMetricsContentType() {
  return register.contentType;
}

export default register;