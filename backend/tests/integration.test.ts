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
describe("Multi-service checkout", () => {
  let authToken: string;
  let serviceIds: string[] = [];

  beforeAll(async () => {
    const email = `orderuser${Date.now()}@example.com`;
    await request(baseUrl()).post("/auth/register").send({ name: "Order User", email, password: "password123", role: "customer" });
    const login = await request(baseUrl()).post("/auth/login").send({ email, password: "password123" });
    authToken = login.body.accessToken;

    const services = await request(baseUrl()).get("/services");
    serviceIds = (services.body.services as Array<{ id: string }>).map((s) => s.id);
  });

  const key = () => `order-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const place = (body: unknown, idempotencyKey = key()) =>
    request(baseUrl())
      .post("/orders")
      .set("Authorization", `Bearer ${authToken}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(body);

  const validOrder = (lines: Array<{ serviceId: string; minutes: number }>) => ({
    lines,
    mode: "instant",
    latitude: 16.5062,
    longitude: 80.648,
    address: "Flat 402, Sai Enclave, Benz Circle"
  });

  it("turns a cart of two services into two bookings under one order", async () => {
    // A booking is assigned to ONE worker, and two trades cannot share one.
    // The whole point of the order is that it fans out.
    const res = await place(validOrder([
      { serviceId: serviceIds[0], minutes: 60 },
      { serviceId: serviceIds[1], minutes: 60 }
    ]));

    expect(res.status).toBe(201);
    expect(res.body.order.bookingCount).toBe(2);
    expect(res.body.bookings).toHaveLength(2);

    const orderIds = new Set(res.body.bookings.map((b: { id: string }) => b.id));
    expect(orderIds.size).toBe(2);
  });

  it("books one visit per service, however long it is", async () => {
    // Two hours of cleaning is ONE worker for two hours, not two workers for an
    // hour each. That was what a quantity meant, and it is a different job.
    const res = await place(validOrder([{ serviceId: serviceIds[0], minutes: 120 }]));

    expect(res.status).toBe(201);
    expect(res.body.bookings).toHaveLength(1);
  });

  it("refuses the same service twice", async () => {
    // Asking for a service again is asking for longer, and two bookings for one
    // address at one time would send two workers to do one job.
    const res = await place(validOrder([
      { serviceId: serviceIds[0], minutes: 60 },
      { serviceId: serviceIds[0], minutes: 30 }
    ]));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ORDER_DUPLICATE_SERVICE");
  });

  it("prices the time bought, not the service", async () => {
    const hour = await place(validOrder([{ serviceId: serviceIds[0], minutes: 60 }]));
    const two = await place(validOrder([{ serviceId: serviceIds[0], minutes: 120 }]));

    expect(hour.status).toBe(201);
    expect(two.status).toBe(201);
    expect(Number(two.body.order.total)).toBeCloseTo(Number(hour.body.order.total) * 2, 1);
  });

  it("clamps a duration beyond the service's ceiling", async () => {
    // This number becomes money, so it is never taken on trust: the schema
    // allows up to 720 minutes and the SERVICE decides its own ceiling.
    const capped = await place(validOrder([{ serviceId: serviceIds[0], minutes: 720 }]));
    const atMax = await place(validOrder([{ serviceId: serviceIds[0], minutes: 240 }]));

    expect(capped.status).toBe(201);
    expect(Number(capped.body.order.total)).toBeCloseTo(Number(atMax.body.order.total), 1);
  });

  it("prices come from the server, one per booking", async () => {
    const res = await place(validOrder([{ serviceId: serviceIds[0], minutes: 60 }]));

    expect(res.status).toBe(201);
    const price = Number(res.body.bookings[0].price);
    expect(price).toBeGreaterThan(0);
    // The order total is the sum of what the server froze, not anything the
    // client sent.
    expect(Number(res.body.order.total)).toBeCloseTo(price, 2);
  });

  it("issues one OTP pair per booking", async () => {
    // Two services, so two workers, so two pairs -- and reading the wrong pair
    // to the wrong worker has to fail, which is why they carry a booking id.
    const res = await place(validOrder([
      { serviceId: serviceIds[0], minutes: 60 },
      { serviceId: serviceIds[1], minutes: 60 }
    ]));

    expect(res.body.otps).toHaveLength(2);
    expect(new Set(res.body.otps.map((o: { bookingId: string }) => o.bookingId)).size).toBe(2);
    for (const otp of res.body.otps) {
      expect(otp.startOtp).toMatch(/^\d{6}$/);
      expect(otp.completionOtp).toMatch(/^\d{6}$/);
      expect(otp.startOtp).not.toBe(otp.completionOtp);
    }
  });

  it("rolls the whole order back when one line is bad", async () => {
    // Half an order is worse than a clear failure: the customer believes both
    // are coming and finds out only when one does not arrive.
    const before = await request(baseUrl()).get("/bookings").set("Authorization", `Bearer ${authToken}`);
    const countBefore = before.body.bookings.length;

    const res = await place(validOrder([
      { serviceId: serviceIds[0], minutes: 60 },
      { serviceId: "00000000-0000-0000-0000-0000000000ff", minutes: 60 }
    ]));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("SERVICE_NOT_FOUND");

    const after = await request(baseUrl()).get("/bookings").set("Authorization", `Bearer ${authToken}`);
    expect(after.body.bookings.length).toBe(countBefore);
  });

  it("replays rather than re-booking when the same key is sent twice", async () => {
    // The one request in the app where a retry after a timeout would cost real
    // money and real workers' time.
    const reused = key();
    const body = validOrder([{ serviceId: serviceIds[0], minutes: 60 }]);

    const first = await place(body, reused);
    const second = await place(body, reused);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.order.id).toBe(first.body.order.id);
  });

  it("rejects the same key with different contents", async () => {
    const reused = key();
    await place(validOrder([{ serviceId: serviceIds[0], minutes: 60 }]), reused);
    const res = await place(validOrder([{ serviceId: serviceIds[0], minutes: 120 }]), reused);

    expect(res.status).toBe(409);
  });

  it("requires a time for a scheduled order", async () => {
    const res = await place({
      ...validOrder([{ serviceId: serviceIds[0], minutes: 60 }]),
      mode: "scheduled"
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ORDER_SCHEDULE_REQUIRED");
  });

  it("rejects an empty cart", async () => {
    const res = await place(validOrder([]));
    expect(res.status).toBe(400);
  });

  it("requires an idempotency key", async () => {
    const res = await request(baseUrl())
      .post("/orders")
      .set("Authorization", `Bearer ${authToken}`)
      .send(validOrder([{ serviceId: serviceIds[0], minutes: 60 }]));

    expect(res.status).toBe(400);
  });

  it("refuses an unauthenticated caller", async () => {
    const res = await request(baseUrl())
      .post("/orders")
      .set("Idempotency-Key", key())
      .send(validOrder([{ serviceId: serviceIds[0], minutes: 60 }]));

    expect(res.status).toBe(401);
  });

  it("does not hand one customer another customer's order", async () => {
    const placed = await place(validOrder([{ serviceId: serviceIds[0], minutes: 60 }]));

    const email = `nosy${Date.now()}@example.com`;
    await request(baseUrl()).post("/auth/register").send({ name: "Nosy", email, password: "password123", role: "customer" });
    const other = await request(baseUrl()).post("/auth/login").send({ email, password: "password123" });

    const res = await request(baseUrl())
      .get(`/orders/${placed.body.order.id}`)
      .set("Authorization", `Bearer ${other.body.accessToken}`);

    expect(res.status).toBe(404);
  });
});
