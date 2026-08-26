import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import logger from "./logger.js";

export enum ErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  IDEMPOTENCY_KEY_REUSED = "IDEMPOTENCY_KEY_REUSED",
  RATE_LIMITED = "RATE_LIMITED",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  FILE_TYPE_NOT_ALLOWED = "FILE_TYPE_NOT_ALLOWED",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",
  MALWARE_DETECTED = "MALWARE_DETECTED",
  PAYMENT_VERIFICATION_FAILED = "PAYMENT_VERIFICATION_FAILED",
  BOOKING_TRANSITION_INVALID = "BOOKING_TRANSITION_INVALID",
  WORKER_NOT_VERIFIED = "WORKER_NOT_VERIFIED",
  WORKER_NOT_AVAILABLE = "WORKER_NOT_AVAILABLE",
  SERVICE_NOT_AVAILABLE = "SERVICE_NOT_AVAILABLE",
  EMERGENCY_DUPLICATE = "EMERGENCY_DUPLICATE",
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: unknown, requestId?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.requestId = requestId;
    Error.captureStackTrace(this, this.constructor);
  }

  static validationError(message: string, details?: unknown, requestId?: string) {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details, requestId);
  }

  static unauthorized(message = "Authentication required", requestId?: string) {
    return new AppError(ErrorCode.UNAUTHORIZED, message, 401, undefined, requestId);
  }

  static forbidden(message = "Insufficient permissions", requestId?: string) {
    return new AppError(ErrorCode.FORBIDDEN, message, 403, undefined, requestId);
  }

  static notFound(resource: string, requestId?: string) {
    return new AppError(ErrorCode.NOT_FOUND, `${resource} not found`, 404, { resource }, requestId);
  }

  static conflict(message: string, details?: unknown, requestId?: string) {
    return new AppError(ErrorCode.CONFLICT, message, 409, details, requestId);
  }

  static idempotencyKeyReused(requestId?: string) {
    return new AppError(ErrorCode.IDEMPOTENCY_KEY_REUSED, "Idempotency key reused with different payload", 409, undefined, requestId);
  }

  static rateLimited(retryAfter?: number, requestId?: string) {
    return new AppError(ErrorCode.RATE_LIMITED, "Too many requests", 429, { retryAfter }, requestId);
  }

  static serviceUnavailable(service: string, requestId?: string) {
    return new AppError(ErrorCode.SERVICE_UNAVAILABLE, `${service} temporarily unavailable`, 503, { service }, requestId);
  }

  static internal(message = "Internal server error", requestId?: string) {
    return new AppError(ErrorCode.INTERNAL_ERROR, message, 500, undefined, requestId);
  }

  static fileTypeNotAllowed(contentType: string, allowed: string[], requestId?: string) {
    return new AppError(ErrorCode.FILE_TYPE_NOT_ALLOWED, "File type not allowed", 400, { contentType, allowed }, requestId);
  }

  static fileTooLarge(size: number, maxSize: number, requestId?: string) {
    return new AppError(ErrorCode.FILE_TOO_LARGE, "File exceeds maximum size", 400, { size, maxSize }, requestId);
  }

  /** The request body itself was rejected by the parser, before any route ran. */
  static payloadTooLarge(limit?: string, requestId?: string) {
    return new AppError(ErrorCode.FILE_TOO_LARGE, "Request body exceeds maximum size", 413, { limit }, requestId);
  }

  static malwareDetected(requestId?: string) {
    return new AppError(ErrorCode.MALWARE_DETECTED, "File failed malware scan", 400, undefined, requestId);
  }

  static paymentVerificationFailed(requestId?: string) {
    return new AppError(ErrorCode.PAYMENT_VERIFICATION_FAILED, "Payment verification failed", 400, undefined, requestId);
  }

  static bookingTransitionInvalid(from: string, to: string, requestId?: string) {
    return new AppError(ErrorCode.BOOKING_TRANSITION_INVALID, `Cannot transition booking from ${from} to ${to}`, 409, { from, to }, requestId);
  }

  static workerNotVerified(requestId?: string) {
    return new AppError(ErrorCode.WORKER_NOT_VERIFIED, "Worker is not verified", 403, undefined, requestId);
  }

  static workerNotAvailable(requestId?: string) {
    return new AppError(ErrorCode.WORKER_NOT_AVAILABLE, "Worker is not available", 409, undefined, requestId);
  }

  static serviceNotAvailable(requestId?: string) {
    return new AppError(ErrorCode.SERVICE_NOT_AVAILABLE, "Service does not support this operation", 400, undefined, requestId);
  }

  static emergencyDuplicate(requestId?: string) {
    return new AppError(ErrorCode.EMERGENCY_DUPLICATE, "Duplicate emergency request detected", 409, undefined, requestId);
  }

  toJSON() {
    const base = {
      type: `https://api.getitdone.in/errors/${this.code.toLowerCase()}`,
      title: this.code.replace(/_/g, " "),
      status: this.statusCode,
      detail: this.message,
      instance: this.requestId,
      code: this.code,
    };
    return this.details ? { ...base, details: this.details } : base;
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.header("x-request-id");

  if (err instanceof ZodError) {
    const appErr = AppError.validationError("Validation failed", err.flatten(), requestId);
    logger.warn({ err: appErr, path: req.path }, "Validation error");
    return res.status(appErr.statusCode).json(appErr.toJSON());
  }

  if (err instanceof AppError) {
    logger.warn({ err, path: req.path }, "Application error");
    return res.status(err.statusCode).json(err.toJSON());
  }

  // body-parser rejects an oversized or unparseable body before any route
  // runs, and tags the reason on `type`. Without this it falls through to the
  // catch-all and an upload that is simply too big is reported as a 500 — the
  // caller is told to retry something that can never succeed.
  const parserType = (err as { type?: string }).type;
  if (parserType === "entity.too.large") {
    const appErr = AppError.payloadTooLarge((err as { limit?: number }).limit?.toString(), requestId);
    logger.warn({ err, path: req.path }, "Request body too large");
    return res.status(appErr.statusCode).json(appErr.toJSON());
  }
  if (parserType === "entity.parse.failed" || parserType === "encoding.unsupported") {
    const appErr = AppError.validationError("Malformed request body", { type: parserType }, requestId);
    logger.warn({ err, path: req.path }, "Malformed request body");
    return res.status(appErr.statusCode).json(appErr.toJSON());
  }

  if (err.name === "UnauthorizedError" || err.message.includes("jwt")) {
    const appErr = AppError.unauthorized(err.message, requestId);
    logger.warn({ err, path: req.path }, "Unauthorized");
    return res.status(appErr.statusCode).json(appErr.toJSON());
  }

  logger.error({ err, path: req.path, requestId }, "Unhandled error");
  const appErr = env.NODE_ENV === "production" ? AppError.internal(undefined, requestId) : AppError.internal(err.message, requestId);
  return res.status(appErr.statusCode).json(appErr.toJSON());
}

export function notFoundHandler(req: Request, res: Response) {
  const requestId = req.header("x-request-id");
  const appErr = AppError.notFound(`Route ${req.method} ${req.path}`, requestId);
  res.status(404).json(appErr.toJSON());
}