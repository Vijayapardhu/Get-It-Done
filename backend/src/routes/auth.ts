import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import authService from "../services/authService.js";
import { requireAuth } from "../middleware/auth.js";
import { recordAuditEvent } from "../services/auditService.js";
import { env, googleClientIds } from "../config/env.js";
import { sendOtpSms, isSmsConfigured, toE164 } from "../services/smsService.js";
import logger from "../core/logger.js";

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register an account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, minLength: 2 }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [customer, worker] }
 *     responses:
 *       201: { description: Account created }
 *       409: { description: Account already exists }
 * /auth/request-otp:
 *   post:
 *     summary: Request a phone OTP
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [phone], properties: { phone: { type: string } } }
 *     responses:
 *       200: { description: OTP requested }
 * /auth/verify-otp:
 *   post:
 *     summary: Verify a phone OTP
 *     tags: [Authentication]
 *     responses:
 *       200: { description: Authenticated session }
 *       401: { description: Invalid or expired OTP }
 * /auth/login:
 *   post:
 *     summary: Sign in with email and password
 *     tags: [Authentication]
 *     responses:
 *       200: { description: Authenticated session }
 *       401: { description: Invalid credentials }
 * /auth/refresh:
 *   post:
 *     summary: Rotate a refresh token
 *     tags: [Authentication]
 *     responses:
 *       200: { description: Rotated authenticated session }
 *       401: { description: Invalid or expired refresh token }
 * /auth/logout:
 *   post:
 *     summary: Revoke a refresh token
 *     tags: [Authentication]
 *     responses:
 *       204: { description: Session revoked }
 * /auth/logout-all:
 *   post:
 *     summary: Revoke all sessions
 *     tags: [Authentication]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: All sessions revoked }
 * /auth/me:
 *   get:
 *     summary: Get the current user
 *     tags: [Authentication]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Current user }
 *       401: { description: Authentication required }
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset
 *     tags: [Authentication]
 *     responses:
 *       200: { description: Generic reset response }
 * /auth/reset-password:
 *   post:
 *     summary: Reset a password
 *     tags: [Authentication]
 *     responses:
 *       200: { description: Password reset }
 *       400: { description: Invalid or expired reset token }
 * /auth/password/set:
 *   post:
 *     summary: Set initial password
 *     tags: [Authentication]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Password set }
 * /auth/password/change:
 *   post:
 *     summary: Change password
 *     tags: [Authentication]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Password changed }
 *       400: { description: Current password incorrect }
 * /auth/sessions:
 *   get:
 *     summary: List active sessions
 *     tags: [Authentication]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of sessions }
 * /auth/sessions/{id}:
 *   delete:
 *     summary: Revoke a specific session
 *     tags: [Authentication]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Session revoked }
 * /auth/security-events:
 *   get:
 *     summary: Get security event history
 *     tags: [Authentication]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Security events }
 * /auth/oauth/google:
 *   post:
 *     summary: Google OAuth login
 *     tags: [Authentication]
 *     responses:
 *       200: { description: Authenticated session }
 */

const phoneSchema = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, "Invalid phone number");
const passwordSchema = z.string().min(8).max(128);
const roleSchema = z.enum(["customer", "worker"]);

const publicUser = (user: NonNullable<Awaited<ReturnType<typeof authService.findUserById>>>) => ({
  id: user.id,
  name: user.name,
  phone: user.phone,
  email: user.email,
  role: user.role,
  language: user.language,
  status: user.status,
  displayName: user.displayName,
  dateOfBirth: user.dateOfBirth,
  gender: user.gender,
  preferredLanguage: user.preferredLanguage,
  timezone: user.timezone,
  lastLoginAt: user.lastLoginAt,
  avatarUrl: user.avatarUrl,
});

const authResponse = (user: NonNullable<Awaited<ReturnType<typeof authService.findUserById>>>, tokens: { accessToken: string; refreshToken: string; expiresIn: string }) => ({
  accessToken: tokens.accessToken,
  refreshToken: tokens.refreshToken,
  expiresIn: tokens.expiresIn,
  user: publicUser(user),
});

export const authRouter = Router();

authRouter.post("/register", async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(320), password: passwordSchema, role: roleSchema.default("customer") }).parse(req.body);
    if (await authService.findUserByEmail(input.email)) { res.status(409).json({ error: "Account already exists" }); return; }
    const user = await authService.createUserFromEmail(input.name, input.email, input.password, input.role);
    await authService.recordSecurityEvent(user.id, "login_success", req.ip, req.get("user-agent"), { method: "register" });
    res.status(201).json(authResponse(user, await authService.issueTokens(user, req.header("x-device-id"))));
  } catch (error) { next(error); }
});

authRouter.post("/request-otp", async (req, res, next) => {
  try {
    const { phone } = z.object({ phone: phoneSchema }).parse(req.body);

    if (!isSmsConfigured()) {
      logger.error({ provider: env.SMS_PROVIDER }, "SMS provider is not configured; cannot deliver OTP");
      res.status(503).json({
        error: "SMS_UNAVAILABLE",
        message: "We cannot send verification codes right now. Please try again shortly.",
      });
      return;
    }

    const code = await authService.createOtpChallenge(phone, "login");
    const delivery = await sendOtpSms(phone, code);

    if (!delivery.delivered) {
      // The challenge row is already written and this code is now the only
      // valid one — createOtpChallenge consumes any outstanding challenge. A
      // resend therefore issues a fresh code rather than retrying this one.
      logger.error({ phone: toE164(phone), provider: delivery.provider, error: delivery.error }, "OTP delivery failed");
      res.status(502).json({
        error: "SMS_DELIVERY_FAILED",
        message: "We could not send the code to that number. Check it and try again.",
      });
      return;
    }

    void recordAuditEvent({
      action: "auth.otp.requested",
      resourceType: "otp_challenge",
      resourceId: toE164(phone),
      requestId: req.header("x-request-id") ?? undefined,
      metadata: { provider: delivery.provider },
    }).catch(() => undefined);

    res.json({
      message: "OTP sent",
      phone,
      // Development only: env.ts refuses this flag in production.
      ...(env.OTP_ECHO_IN_RESPONSE ? { devOtp: code } : {}),
    });
  } catch (error) { next(error); }
});

authRouter.post("/verify-otp", async (req, res, next) => {
  try {
    const input = z.object({ phone: phoneSchema, otp: z.string().regex(/^\d{6}$/), name: z.string().trim().min(2).max(100).optional(), role: roleSchema.default("customer") }).parse(req.body);
    if (!(await authService.consumeOtp(input.phone, input.otp, "login"))) { res.status(401).json({ error: "Invalid or expired OTP" }); return; }
    let user = await authService.findUserByPhone(input.phone);
    if (!user) user = await authService.createUserFromPhone(input.phone, input.name ?? `User ${input.phone.slice(-4)}`, input.role);
    await authService.recordSecurityEvent(user.id, "login_success", req.ip, req.get("user-agent"), { method: "otp" });
    res.json(authResponse(user, await authService.issueTokens(user, req.header("x-device-id"))));
  } catch (error) { next(error); }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = await authService.findUserByEmail(input.email);
    if (!user?.passwordHash || !(await authService.verifyPassword(input.password, user.passwordHash))) {
      await authService.recordSecurityEvent(user?.id ?? "unknown", "login_failed", req.ip, req.get("user-agent"), { email: input.email });
      res.status(401).json({ error: "Invalid credentials" }); return;
    }
    await authService.updateLastLogin(user.id);
    await authService.recordSecurityEvent(user.id, "login_success", req.ip, req.get("user-agent"), { method: "password" });
    res.json(authResponse(user, await authService.issueTokens(user, req.header("x-device-id"))));
  } catch (error) { next(error); }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const input = z.object({ refreshToken: z.string().min(32) }).parse(req.body);
    const result = await authService.rotateRefreshToken(input.refreshToken);
    if (!result) { res.status(401).json({ error: "Invalid or expired refresh token" }); return; }
    res.json(authResponse(result.user, result.tokens));
  } catch (error) { next(error); }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const input = z.object({ refreshToken: z.string().min(32) }).parse(req.body);
    await authService.revokeRefreshToken(input.refreshToken);
    res.status(204).send();
  } catch (error) { next(error); }
});

authRouter.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    await authService.revokeAllRefreshTokens(req.user!.id);
    await authService.recordSecurityEvent(req.user!.id, "device_revoked", req.ip, req.get("user-agent"), { all_devices: true });
    res.status(204).send();
  } catch (error) { next(error); }
});

authRouter.get("/me", requireAuth, (req, res) => { res.json({ user: req.user }); });

authRouter.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    await authService.requestPasswordReset(email);
    res.json({ message: "If the email exists, you will receive a reset link" });
  } catch (error) { next(error); }
});

authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const input = z.object({ token: z.string().min(32), password: passwordSchema }).parse(req.body);
    if (!(await authService.resetPassword(input.token, input.password))) { res.status(400).json({ error: "Invalid or expired reset token" }); return; }
    res.json({ message: "Password has been reset" });
  } catch (error) { next(error); }
});

authRouter.post("/password/set", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({ password: passwordSchema }).parse(req.body);
    await authService.setPassword(req.user!.id, input.password);
    await authService.recordSecurityEvent(req.user!.id, "password_changed", req.ip, req.get("user-agent"), { initial: true });
    res.json({ message: "Password has been set" });
  } catch (error) { next(error); }
});

authRouter.post("/password/change", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({ currentPassword: z.string().min(8), newPassword: passwordSchema }).parse(req.body);
    const success = await authService.changePassword(req.user!.id, input.currentPassword, input.newPassword);
    if (!success) { res.status(400).json({ error: "Current password is incorrect" }); return; }
    await authService.recordSecurityEvent(req.user!.id, "password_changed", req.ip, req.get("user-agent"), { initial: false });
    res.json({ message: "Password has been changed" });
  } catch (error) { next(error); }
});

authRouter.get("/sessions", requireAuth, async (req, res, next) => {
  try {
    const sessions = await authService.getSessions(req.user!.id);
    res.json({ sessions });
  } catch (error) { next(error); }
});

authRouter.delete("/sessions/:id", requireAuth, async (req, res, next) => {
  try {
    const token = z.string().min(32).parse(req.params.id);
    const success = await authService.revokeSession(token, req.user!.id);
    if (!success) { res.status(404).json({ error: "Session not found" }); return; }
    await authService.recordSecurityEvent(req.user!.id, "device_revoked", req.ip, req.get("user-agent"), { single_device: true });
    res.status(204).send();
  } catch (error) { next(error); }
});

authRouter.get("/security-events", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? 50)), 100);
    const offset = parseInt(String(req.query.offset ?? 0));
    const events = await authService.getSecurityEvents(req.user!.id, limit, offset);
    res.json({ events });
  } catch (error) { next(error); }
});

authRouter.post("/oauth/google", async (req, res, next) => {
  try {
    const input = z.object({ credential: z.string().min(10) }).parse(req.body);
    const { OAuth2Client } = await import("google-auth-library");
    if (googleClientIds.length === 0) {
      res.status(503).json({ error: "GOOGLE_SIGNIN_UNAVAILABLE", message: "Google sign-in is not configured." });
      return;
    }
    const client = new OAuth2Client(googleClientIds[0]);
    // A Google ID token's audience is whichever client id requested it, and
    // Android, iOS and web each have their own. Verifying against a single id
    // rejects legitimate tokens from the other two platforms.
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: input.credential, audience: googleClientIds });
      payload = ticket.getPayload();
    } catch (verifyError) {
      // Malformed, expired, wrong audience or forged — all are the caller's
      // problem. Log the detail; return a flat 401 rather than surfacing the
      // library's message, which describes our token internals.
      logger.warn(
        { err: verifyError, ip: req.ip },
        "Google ID token verification failed"
      );
      res.status(401).json({ error: "INVALID_GOOGLE_TOKEN", message: "That Google sign-in could not be verified." });
      return;
    }

    if (!payload?.sub || !payload?.email) {
      res.status(401).json({ error: "INVALID_GOOGLE_TOKEN", message: "That Google sign-in could not be verified." });
      return;
    }

    // Google says whether it has confirmed the address. An unverified one must
    // not be trusted to match an existing account by email — that is an
    // account-takeover route.
    if (payload.email_verified === false) {
      res.status(403).json({
        error: "GOOGLE_EMAIL_UNVERIFIED",
        message: "Verify your email address with Google before signing in.",
      });
      return;
    }
    let user = await authService.findUserByGoogleId(payload.sub);
    if (!user) user = await authService.findUserByEmail(payload.email);
    if (user) {
      if (!user.oauthProvider) await authService.linkGoogleAccount(user.id, payload.sub, payload.sub);
    } else {
      user = await authService.createUserFromEmail(payload.name ?? payload.email.split("@")[0], payload.email, crypto.randomBytes(32).toString("base64"), "customer");
      await authService.linkGoogleAccount(user.id, payload.sub, payload.sub);
    }
    await authService.updateLastLogin(user.id);
    await authService.recordSecurityEvent(user.id, "login_success", req.ip, req.get("user-agent"), { method: "google_oauth" });
    res.json(authResponse(user, await authService.issueTokens(user, req.header("x-device-id"))));
  } catch (error) { next(error); }
});

export default authRouter;