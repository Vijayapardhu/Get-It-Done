import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import { createApp } from "../src/app.js";
import http from "node:http";

let server: http.Server;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(resolve));
});

const baseUrl = () => `http://localhost:${server.address().port}`;

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
  it("GET /workers/nearby returns matches", async () => {
    const res = await request(baseUrl())
      .get("/workers/nearby")
      .query({ serviceId: "00000000-0000-0000-0000-000000000201", latitude: 16.5, longitude: 80.6 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("matches");
  });
});

describe("Error Handling", () => {
  it("Returns 404 for unknown routes", async () => {
    const res = await request(baseUrl()).get("/unknown-route");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("code", "NOT_FOUND");
  });
});