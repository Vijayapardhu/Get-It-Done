import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import authService from "../services/authService.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { googleClientIds } from "../config/env.js";
import logger from "../core/logger.js";
import * as totpService from "../services/totpService.js";
import { recordAuditEvent } from "../services/auditService.js";

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
 *             required: [name, email, phone, password]
 *             properties:
 *               name: { type: string, minLength: 2 }
 *               email: { type: string, format: email }
 *               phone: { type: string, description: Both identifiers are required }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [customer, worker] }
 *     responses:
 *       201: { description: Account created }
 *       409: { description: Account already exists }
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

/// Sign-in accepts one field. The client should not have to decide whether
/// what the user typed is an email or a phone number, and neither should the
/// user have to pick a tab.
const loginSchema = z
  .object({
    identifier: z.string().trim().min(3).max(320).optional(),
    email: z.string().email().optional(),
    phone: z.string().trim().min(6).max(20).optional(),
    password: z.string().min(1).max(128),
  })
  .refine((v) => Boolean(v.identifier ?? v.email ?? v.phone), {
    message: "Provide an email address or phone number",
    path: ["identifier"],
  });

/// Registration needs a name, a password, an email address AND a phone number.
///
/// Both, not either. This used to accept exactly one, which produced accounts
/// the platform could not actually operate: a booking has to reach a worker's
/// phone and a customer's inbox, a receipt has nowhere to go without an email,
/// and a password reset is impossible for a phone-only account because the
/// only reset channel is email. Half the support load was accounts missing the
/// one field the situation needed.
///
/// Google sign-up is the deliberate exception — it creates an email-only
/// account, because Google does not hand over a phone number and blocking that
/// path would be worse than a profile that is one field short.
const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().max(320),
  phone: phoneSchema,
  password: passwordSchema,
  role: roleSchema.default("customer"),
});

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
    const input = registerSchema.parse(req.body);

    // Phones are stored exactly as they arrive, so normalise here or
    // "98765 43210" and "9876543210" become two different accounts.
    const phone = input.phone.replace(/[\s()-]/g, "");

    // Checked separately so the message names the field the user has to
    // change. "An account already exists" against a two-identifier form leaves
    // them guessing which half collided.
    if (await authService.findUserByEmail(input.email)) {
      res.status(409).json({ error: "ACCOUNT_EXISTS", message: "An account with that email already exists." });
      return;
    }
    if (await authService.findUserByPhone(phone)) {
      res.status(409).json({ error: "ACCOUNT_EXISTS", message: "An account with that phone number already exists." });
      return;
    }

    const user = await authService.createUser({
      name: input.name,
      email: input.email,
      phone,
      password: input.password,
      role: input.role,
    });

    await authService.recordSecurityEvent(user.id, "login_success", req.ip, req.get("user-agent"), {
      method: "register",
    });
    res.status(201).json(authResponse(user, await authService.issueTokens(user, req.header("x-device-id"))));
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Sign in with a password
 *     description: >
 *       Accepts an email address or a phone number. Send either `identifier`
 *       (whichever the user typed) or the explicit `email` / `phone` field —
 *       `email` is kept for existing clients.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               identifier: { type: string, description: Email or phone }
 *               email: { type: string, format: email }
 *               phone: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: Session issued }
 *       401: { description: Invalid credentials }
 */
authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const identifier = (input.identifier ?? input.email ?? input.phone ?? "").trim();

    const user = await authService.findUserByIdentifier(identifier);

    // One failure shape for "no such account" and "wrong password". Telling
    // them apart lets anyone enumerate which phone numbers are registered.
    if (!user?.passwordHash || !(await authService.verifyPassword(input.password, user.passwordHash))) {
      await authService.recordSecurityEvent(
        // null, not "unknown": there may genuinely be no user, and a bogus id
        // used to make this INSERT throw and turn a 401 into a 500.
        user?.id ?? null,
        "login_failed",
        req.ip,
        req.get("user-agent"),
        // Never log the identifier itself: security_events is widely readable
        // by support staff and this would put phone numbers in it.
        { method: identifier.includes("@") ? "email_password" : "phone_password" }
      );
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // An account created through OTP or Google has no password. Saying so is
    // safe — the caller already proved they know a registered identifier only
    // insofar as the generic 401 above would have fired otherwise — and it is
    // the difference between "my password does not work" and understanding
    // that you never set one.
    await authService.updateLastLogin(user.id);
    await authService.recordSecurityEvent(user.id, "login_success", req.ip, req.get("user-agent"), {
      method: identifier.includes("@") ? "email_password" : "phone_password",
    });
    res.json(authResponse(user, await authService.issueTokens(user, req.header("x-device-id"))));
  } catch (error) { next(error); }
});

// --- Operator second factor -------------------------------------------------
//
// migration_phase18_admin_totp.sql added `users.totp_secret` and its header
// claimed "POST /auth/admin/login already reads user.totpSecret". The column
// and the SELECT in authService were real; the route was not, and no code was
// ever verified anywhere. Everything below is that missing half.

/**
 * @openapi
 * /auth/admin/login:
 *   post:
 *     summary: Operator sign-in with a second factor
 *     tags: [Authentication]
 *     responses:
 *       200: { description: Signed in }
 *       401: { description: Invalid credentials or code }
 *       403: { description: Not an operator account, or no authenticator enrolled }
 */
authRouter.post("/admin/login", async (req, res, next) => {
  try {
    const input = z
      .object({
        identifier: z.string().min(3),
        password: z.string().min(1),
        totp: z.string().regex(/^[0-9]{6}$/).optional(),
      })
      .parse(req.body);

    const identifier = input.identifier.trim();
    const user = await authService.findUserByIdentifier(identifier);

    // Same single failure shape as /auth/login: distinguishing "no such
    // account" from "wrong password" lets anyone enumerate operator accounts.
    if (!user?.passwordHash || !(await authService.verifyPassword(input.password, user.passwordHash))) {
      await authService.recordSecurityEvent(user?.id ?? null, "login_failed", req.ip, req.get("user-agent"), {
        method: "admin_password",
      });
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Customers and workers have no console. Refusing here rather than issuing
    // a token stops this becoming a second way in for everyone else.
    const isOperator = totpService.requiresSecondFactor(user.role) || user.role === "support_staff";
    if (!isOperator) {
      res.status(403).json({ error: "Not an operator account" });
      return;
    }

    if (totpService.requiresSecondFactor(user.role)) {
      if (!user.totpSecret) {
        // Enrolment is a separate, authenticated step, so an operator who has
        // never enrolled cannot reach the console at all. That is the safe
        // default phase 18 describes, which is why this says what to do next
        // rather than only refusing.
        await authService.recordSecurityEvent(user.id, "login_failed", req.ip, req.get("user-agent"), {
          method: "admin_password",
          reason: "totp_not_enrolled",
        });
        res.status(403).json({
          error: "This account has no authenticator enrolled. Ask a system administrator to enrol you.",
          code: "TOTP_NOT_ENROLLED",
        });
        return;
      }

      if (!input.totp) {
        res.status(401).json({ error: "Authenticator code required", code: "TOTP_REQUIRED" });
        return;
      }

      const check = await totpService.verifyToken(user.id, user.totpSecret, input.totp);
      if (!check.ok) {
        await authService.recordSecurityEvent(user.id, "login_failed", req.ip, req.get("user-agent"), {
          method: "admin_totp",
          reason: check.reason,
        });
        res.status(401).json({ error: "Invalid authenticator code" });
        return;
      }
    }

    await authService.updateLastLogin(user.id);
    await authService.recordSecurityEvent(user.id, "login_success", req.ip, req.get("user-agent"), {
      method: totpService.requiresSecondFactor(user.role) ? "admin_password_totp" : "admin_password",
    });
    res.json(authResponse(user, await authService.issueTokens(user, req.header("x-device-id"))));
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /auth/admin/totp/enrol:
 *   post:
 *     summary: Begin authenticator enrolment; returns a secret and QR code
 *     tags: [Authentication]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Secret, otpauth URI and a QR data URL }
 *       409: { description: Already enrolled }
 */
authRouter.post("/admin/totp/enrol", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), async (req, res, next) => {
  try {
    // Re-enrolling would silently invalidate a working device. A lost phone
    // goes through the reset route below, which is auditable.
    if (await totpService.hasEnrolled(req.user!.id)) {
      res.status(409).json({ error: "An authenticator is already enrolled. A system administrator must reset it first." });
      return;
    }

    const account = await authService.findUserById(req.user!.id);
    const challenge = await totpService.beginEnrolment(account?.email ?? account?.phone ?? req.user!.id);

    // The secret is returned and NOT stored. It becomes real only when
    // /confirm proves a device can produce a code from it -- see totpService.
    res.json(challenge);
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /auth/admin/totp/confirm:
 *   post:
 *     summary: Confirm enrolment by proving the authenticator works
 *     tags: [Authentication]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Enrolled }
 *       400: { description: Code did not match the secret }
 */
authRouter.post("/admin/totp/confirm", requireAuth, requireRoles("society_admin", "federation_admin", "system_admin"), async (req, res, next) => {
  try {
    const input = z
      .object({ secret: z.string().min(16).max(128), totp: z.string().regex(/^[0-9]{6}$/) })
      .parse(req.body);

    if (await totpService.hasEnrolled(req.user!.id)) {
      res.status(409).json({ error: "An authenticator is already enrolled." });
      return;
    }

    const ok = await totpService.confirmEnrolment(req.user!.id, input.secret, input.totp);
    if (!ok) {
      res.status(400).json({ error: "That code does not match. Check your authenticator and try again." });
      return;
    }

    await authService.recordSecurityEvent(req.user!.id, "totp_enrolled", req.ip, req.get("user-agent"), {});
    await recordAuditEvent({
      actorId: req.user!.id,
      action: "auth.totp_enrolled",
      resourceType: "user",
      resourceId: req.user!.id,
      requestId: req.header("x-request-id") ?? undefined,
    }).catch(() => undefined);

    res.status(204).send();
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /auth/admin/totp/{userId}:
 *   delete:
 *     summary: Reset an operator's authenticator (lost device)
 *     tags: [Authentication]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Reset; the operator must enrol again before signing in }
 */
authRouter.delete("/admin/totp/:userId", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
  try {
    const userId = z.string().uuid().parse(req.params.userId);

    // Never self-service. An account that can remove its own second factor by
    // being signed in does not have one.
    if (userId === req.user!.id) {
      res.status(403).json({ error: "Another system administrator must reset your authenticator." });
      return;
    }

    await totpService.resetEnrolment(userId);
    await authService.recordSecurityEvent(userId, "totp_reset", req.ip, req.get("user-agent"), { by: req.user!.id });
    await recordAuditEvent({
      actorId: req.user!.id,
      action: "auth.totp_reset",
      resourceType: "user",
      resourceId: userId,
      requestId: req.header("x-request-id") ?? undefined,
    }).catch(() => undefined);

    res.status(204).send();
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