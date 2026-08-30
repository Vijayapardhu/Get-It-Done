import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import logger from "./logger.js";
import { activeConnections } from "./metrics.js";

let io: Server | null = null;

export function initializeRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGINS.split(","), credentials: true },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  const pubClient = createClient({ url: env.REDIS_URL });
  const subClient = pubClient.duplicate();

  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io!.adapter(createAdapter(pubClient, subClient));
      logger.info("Socket.io Redis adapter connected");
    })
    .catch((err) => logger.error({ err }, "Socket.io Redis adapter failed"));

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
      if (!token) return next(new Error("Authentication required"));
      const decoded = jwt.verify(token, env.JWT_SECRET) as { sub: string; role: string };
      socket.data.user = { id: decoded.sub, role: decoded.role };
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const { id: userId, role } = socket.data.user;
    logger.debug({ userId, socketId: socket.id }, "WebSocket connected");

    socket.join(`user:${userId}`);
    if (role === "worker") socket.join(`worker:${userId}`);
    if (["society_admin", "federation_admin", "system_admin", "support_staff"].includes(role)) {
      socket.join("admin:operations");
    }

    activeConnections.inc();

    socket.on("join:booking", (bookingId: string) => {
      socket.join(`booking:${bookingId}`);
    });

    socket.on("leave:booking", (bookingId: string) => {
      socket.leave(`booking:${bookingId}`);
    });

    socket.on("disconnect", (reason) => {
      logger.debug({ userId, socketId: socket.id, reason }, "WebSocket disconnected");
      activeConnections.dec();
    });

    socket.on("error", (error) => {
      logger.error({ err: error, userId, socketId: socket.id }, "WebSocket error");
    });
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

export function emitBookingStatusChange(bookingId: string, data: unknown) {
  io?.to(`booking:${bookingId}`).emit("booking:status_changed", data);
}

export function emitWorkerAvailabilityUpdate(userId: string, data: unknown) {
  io?.to(`worker:${userId}`).emit("worker:availability:update", data);
}

export function emitWorkerLocationUpdate(userId: string, data: unknown) {
  io?.to(`worker:${userId}`).emit("worker:location:update", data);
}

/**
 * Push a worker's position to the customers currently being served by them.
 *
 * `emitWorkerLocationUpdate` targets `worker:{userId}` — the worker's OWN room,
 * which is of no use to anyone: the worker already knows where they are. The
 * customer tracking a booking sits in `booking:{id}`, so a live map needs the
 * fix delivered there instead. Scoping to the worker's active bookings means
 * only the people actually waiting on them receive it, rather than the whole
 * platform (which is what the previous unscoped `io.emit` did).
 */
export function emitWorkerLocationToBookings(bookingIds: string[], data: unknown) {
  if (!io || bookingIds.length === 0) return;
  for (const bookingId of bookingIds) {
    io.to(`booking:${bookingId}`).emit("worker:location:update", data);
  }
}

/**
 * A job is being offered to one worker, right now.
 *
 * Deliberately NOT routed through the outbox. The outbox polls every
 * JOB_POLL_INTERVAL_MS (5s) and exists to make the durable `notifications` row
 * reliable -- which is the right trade for "your payout was settled" and the
 * wrong one for a 45-second window. Five seconds of a 45-second offer is 11% of
 * the worker's time to decide, spent on a poll interval.
 *
 * The payload carries everything the offer screen renders, so the screen never
 * has to fetch before it can paint: a worker whose phone woke up on 2G must see
 * the money and the distance immediately, not a spinner. `expiresAt` is the
 * server's deadline; the client renders its countdown against that and its
 * measured clock skew, never against a locally started 45-second timer.
 *
 * Note what is absent: the exact address. A worker who has not accepted gets an
 * area name only.
 */
export function emitJobOffered(workerUserId: string, offer: unknown) {
  io?.to(`worker:${workerUserId}`).emit("job:offered", offer);
}

/**
 * The offer is off the table -- it lapsed, it was reassigned, or the customer
 * cancelled. The app dismisses the full-screen interrupt on this.
 *
 * Without it, a worker stares at a countdown for a job somebody else already
 * accepted, and finds out by tapping Accept.
 */
export function emitJobRevoked(workerUserId: string, data: unknown) {
  io?.to(`worker:${workerUserId}`).emit("job:revoked", data);
}

/** A worker-visible change to a booking they hold: arrival, extension, cancel. */
export function emitJobUpdated(workerUserId: string, data: unknown) {
  io?.to(`worker:${workerUserId}`).emit("job:updated", data);
}

export function emitNotification(userId: string, data: unknown) {
  io?.to(`user:${userId}`).emit("notification:new", data);
}

export function emitEmergencyEscalated(data: unknown) {
  io?.to("admin:operations").emit("emergency:escalated", data);
}

export function emitToUser(userId: string, event: string, data: unknown) {
  io?.to(`user:${userId}`).emit(event, data);
}

export function emitToRole(role: string, event: string, data: unknown) {
  io?.to(`role:${role}`).emit(event, data);
}