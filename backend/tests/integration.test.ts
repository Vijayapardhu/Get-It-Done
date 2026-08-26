import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import { createApp } from "../src/app.js";
import http from "node:http";

import { pool } from "../src/db/pool.js";
import { closeRedis } from "../src/core/redis.js";

let server: http.Server;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end().catch(() => {});
  await closeRedis().catch(() => {});
});

const baseUrl = () => {
  const addr = server.address();
  if (addr && typeof addr === "object") return `http://localhost:${addr.port}`;
  return "http://localhost:4000";
};

describe("Health Endpoints", () => {
  it("GET /health/live returns healthy", async () => {
    const res = await request(baseUrl()).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
  });

  it("GET /health/ready returns readiness status", async () => {
    const res = await request(baseUrl()).get("/health/ready");
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("checks");
  });

  it("GET /metrics returns Prometheus metrics", async () => {
    const res = await request(baseUrl()).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
  });

  it("GET /version returns version info", async () => {
    const res = await request(baseUrl()).get("/version");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("version");
  });
});

describe("Auth Endpoints", () => {
  it("POST /auth/register creates account", async () => {
    const res = await request(baseUrl())
      .post("/auth/register")
      .send({ name: "Test User", email: `test${Date.now()}@example.com`, password: "password123", role: "customer" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("refreshToken");
    expect(res.body.user).toHaveProperty("email");
  });

  it("POST /auth/login authenticates user", async () => {
    const email = `login${Date.now()}@example.com`;
    await request(baseUrl()).post("/auth/register").send({ name: "Login User", email, password: "password123", role: "customer" });
    const res = await request(baseUrl()).post("/auth/login").send({ email, password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
  });

  it("POST /auth/refresh rotates token", async () => {
    const email = `refresh${Date.now()}@example.com`;
    const reg = await request(baseUrl()).post("/auth/register").send({ name: "Refresh User", email, password: "password123", role: "customer" });
    const res = await request(baseUrl()).post("/auth/refresh").send({ refreshToken: reg.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("refreshToken");
  });
});

describe("Booking Endpoints", () => {
  let authToken: string;

  beforeAll(async () => {
    const email = `booking${Date.now()}@example.com`;
    await request(baseUrl()).post("/auth/register").send({ name: "Booking User", email, password: "password123", role: "customer" });
    const login = await request(baseUrl()).post("/auth/login").send({ email, password: "password123" });
    authToken = login.body.accessToken;
  });

  it("GET /services returns services", async () => {
    const res = await request(baseUrl()).get("/services");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("services");
  });

  it("POST /bookings requires auth", async () => {
    const res = await request(baseUrl())
      .post("/bookings")
      .send({ serviceId: "00000000-0000-0000-0000-000000000201", description: "Test", latitude: 16.5, longitude: 80.6, address: "Test Address" });
    expect(res.status).toBe(401);
  });

  it("POST /bookings requires idempotency key", async () => {
    const res = await request(baseUrl())
      .post("/bookings")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ serviceId: "00000000-0000-0000-0000-000000000201", description: "Test", latitude: 16.5, longitude: 80.6, address: "Test Address" });
    expect(res.status).toBe(400);
  });
});

describe("Worker Endpoints", () => {
  let authToken: string;

  beforeAll(async () => {
    const email = `workeruser${Date.now()}@example.com`;
    await request(baseUrl()).post("/auth/register").send({ name: "Worker User", email, password: "password123", role: "customer" });
    const login = await request(baseUrl()).post("/auth/login").send({ email, password: "password123" });
    authToken = login.body.accessToken;
  });

  it("GET /workers/nearby returns matches", async () => {
    const res = await request(baseUrl())
      .get("/workers/nearby")
      .set("Authorization", `Bearer ${authToken}`)
      .query({ serviceId: "00000000-0000-0000-0000-000000000201", latitude: 16.5, longitude: 80.6 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("matches");
  });
});

describe("Demo Login", () => {
  // The test environment does not set DEMO_LOGIN_ENABLED, so this is the
  // default posture: an endpoint that hands out sessions with no credential
  // must be shut unless someone deliberately opened it.
  it("POST /auth/demo is closed unless the server opted in", async () => {
    const res = await request(baseUrl()).post("/auth/demo").send({});
    expect(res.status).toBe(404);
  });

  it("does not advertise demo sign-in in the mobile config", async () => {
    const res = await request(baseUrl()).get("/config/mobile");
    expect(res.status).toBe(200);
    expect(res.body.auth.demoSignInEnabled).toBe(false);
  });

  // The app draws the demo button from the config flag alone, so a config that
  // said true against a server that answers 404 would put a dead button on the
  // sign-in screen. They have to move together.
  it("the config flag and the endpoint agree", async () => {
    const config = await request(baseUrl()).get("/config/mobile");
    const demo = await request(baseUrl()).post("/auth/demo").send({});
    expect(config.body.auth.demoSignInEnabled).toBe(demo.status === 200);
  });
});

describe("Error Handling", () => {
  it("Returns 404 for unknown routes", async () => {
    const res = await request(baseUrl()).get("/unknown-route");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("code", "NOT_FOUND");
  });

  // body-parser rejects the body before any route runs and tags the reason on
  // `err.type`. Without a branch for that it falls through to the catch-all
  // and an oversized upload is reported as a 500 — the caller is told to retry
  // something that can never succeed.
  it("Returns 413, not 500, when the body exceeds the parser limit", async () => {
    const res = await request(baseUrl())
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ padding: "x".repeat(400 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body).toHaveProperty("code", "FILE_TOO_LARGE");
  });

  it("Returns 400, not 500, for malformed JSON", async () => {
    const res = await request(baseUrl())
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("code", "VALIDATION_ERROR");
  });

  // The artwork routes carry a larger limit than the rest of the API, because
  // artwork travels as base64 and the route itself enforces 2MB image / 1MB
  // animation caps. A body under that limit must reach the route (and be
  // turned away by auth) rather than being killed by the parser.
  it("Accepts an artwork-sized body on the artwork route", async () => {
    const res = await request(baseUrl())
      .put("/services/categories/Home%20Repair/artwork")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ imageBase64: "x".repeat(600 * 1024) }));

    expect(res.status).not.toBe(413);
    expect(res.status).toBe(401);
  });
});