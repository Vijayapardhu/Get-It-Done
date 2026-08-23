import crypto from "node:crypto";
import { Pool, type PoolClient } from "pg";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";

const pool = new Pool({ connectionString: env.DATABASE_URL });
const publicUserColumns = "id, name, phone, email, role, language, status, display_name, date_of_birth, gender, preferred_language, timezone, last_login_at, avatar_url, oauth_provider, oauth_subject";

export interface User {
  id: string;
  name: string;
  phone: string | null;
  email?: string | null;
  role: string;
  language?: string;
  status?: string;
  displayName?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  preferredLanguage?: string;
  timezone?: string;
  lastLoginAt?: string | null;
  avatarUrl?: string | null;
  oauthProvider?: string | null;
  oauthSubject?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export class AuthService {
  private toUser(row: Record<string, unknown>): User {
    return {
      id: String(row.id),
      name: String(row.name),
      phone: row.phone ? String(row.phone) : null,
      email: row.email ? String(row.email) : null,
      role: String(row.role),
      language: row.language ? String(row.language) : "en",
      status: row.status ? String(row.status) : "active",
      displayName: row.display_name ? String(row.display_name) : null,
      dateOfBirth: row.date_of_birth ? String(row.date_of_birth) : null,
      gender: row.gender ? String(row.gender) : null,
      preferredLanguage: row.preferred_language ? String(row.preferred_language) : "en",
      timezone: row.timezone ? String(row.timezone) : "IST",
      lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      oauthProvider: row.oauth_provider ? String(row.oauth_provider) : null,
      oauthSubject: row.oauth_subject ? String(row.oauth_subject) : null,
    };
  }

  private generateAccessToken(user: User): string {
    return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"] });
  }

  async hashPassword(password: string): Promise<string> { return bcrypt.hash(password, 12); }
  async verifyPassword(password: string, passwordHash: string): Promise<boolean> { return bcrypt.compare(password, passwordHash); }

  async findUserById(id: string, client: Pool | PoolClient = pool): Promise<User | null> {
    const result = await client.query(`SELECT ${publicUserColumns} FROM users WHERE id = $1 AND status = 'active'`, [id]);
    return result.rows[0] ? this.toUser(result.rows[0]) : null;
  }

  async findUserByPhone(phone: string): Promise<User | null> {
    const result = await pool.query(`SELECT ${publicUserColumns} FROM users WHERE phone = $1`, [phone]);
    return result.rows[0] ? this.toUser(result.rows[0]) : null;
  }

  async findUserByEmail(email: string): Promise<(User & { passwordHash?: string }) | null> {
    const result = await pool.query(`SELECT ${publicUserColumns}, password_hash FROM users WHERE lower(email) = lower($1)`, [email]);
    if (!result.rows[0]) return null;
    return { ...this.toUser(result.rows[0]), passwordHash: result.rows[0].password_hash ?? undefined };
  }

  async createUserFromPhone(phone: string, name: string, role = "customer"): Promise<User> {
    const result = await pool.query(`INSERT INTO users (id, name, phone, role) VALUES ($1, $2, $3, $4) RETURNING ${publicUserColumns}`, [uuidv4(), name, phone, role]);
    return this.toUser(result.rows[0]);
  }

  async createUserFromEmail(name: string, email: string, password: string, role = "customer"): Promise<User> {
    const passwordHash = await this.hashPassword(password);
    const result = await pool.query(`INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, lower($3), $4, $5) RETURNING ${publicUserColumns}`, [uuidv4(), name, email, passwordHash, role]);
    return this.toUser(result.rows[0]);
  }

  async issueTokens(user: User, deviceId?: string): Promise<AuthTokens> {
    const refreshToken = crypto.randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000);
    await pool.query(`INSERT INTO refresh_tokens (id, user_id, token_hash, device_id, expires_at) VALUES ($1, $2, $3, $4, $5)`, [uuidv4(), user.id, hashToken(refreshToken), deviceId ?? null, expiresAt]);
    return { accessToken: this.generateAccessToken(user), refreshToken, expiresIn: env.ACCESS_TOKEN_TTL };
  }

  async verifyAccessToken(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      return typeof decoded.sub === "string" ? this.findUserById(decoded.sub) : null;
    } catch { return null; }
  }

  async rotateRefreshToken(token: string): Promise<{ user: User; tokens: AuthTokens } | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(`SELECT id, user_id, device_id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() FOR UPDATE`, [hashToken(token)]);
      if (!result.rows[0]) { await client.query("ROLLBACK"); return null; }
      const user = await this.findUserById(result.rows[0].user_id, client);
      if (!user) { await client.query("ROLLBACK"); return null; }
      await client.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [result.rows[0].id]);
      const nextToken = crypto.randomBytes(48).toString("base64url");
      await client.query(`INSERT INTO refresh_tokens (id, user_id, token_hash, device_id, expires_at) VALUES ($1, $2, $3, $4, $5)`, [uuidv4(), user.id, hashToken(nextToken), result.rows[0].device_id, new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000)]);
      await client.query("COMMIT");
      return { user, tokens: { accessToken: this.generateAccessToken(user), refreshToken: nextToken, expiresIn: env.ACCESS_TOKEN_TTL } };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [hashToken(token)]);
  }

  async createOtpChallenge(phone: string, purpose: string): Promise<string> {
    const code = env.NODE_ENV === "development" ? "123456" : String(crypto.randomInt(100000, 1000000));
    await pool.query(`UPDATE otp_challenges SET consumed_at = now() WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL`, [phone, purpose]);
    await pool.query(`INSERT INTO otp_challenges (id, phone, purpose, code_hash, expires_at) VALUES ($1, $2, $3, $4, now() + interval '5 minutes')`, [uuidv4(), phone, purpose, hashToken(code)]);
    return code;
  }

  async consumeOtp(phone: string, code: string, purpose: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const challenge = await client.query(`SELECT id, code_hash FROM otp_challenges WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now() AND attempts < 5 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [phone, purpose]);
      if (!challenge.rows[0]) { await client.query("ROLLBACK"); return false; }
      const valid = challenge.rows[0].code_hash === hashToken(code);
      await client.query(`UPDATE otp_challenges SET attempts = attempts + 1, consumed_at = CASE WHEN $2 THEN now() ELSE consumed_at END WHERE id = $1`, [challenge.rows[0].id, valid]);
      await client.query("COMMIT");
      return valid;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.findUserByEmail(email);
    if (!user) return;
    const token = crypto.randomBytes(32).toString("base64url");
    await pool.query("UPDATE users SET reset_token = $1, reset_token_expires = now() + interval '1 hour' WHERE id = $2", [hashToken(token), user.id]);
    if (env.NODE_ENV === "development") console.info(`Development password reset token for ${email}: ${token}`);
  }

  async resetPassword(token: string, password: string): Promise<boolean> {
    const passwordHash = await this.hashPassword(password);
    const result = await pool.query("UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE reset_token = $2 AND reset_token_expires > now()", [passwordHash, hashToken(token)]);
    return result.rowCount === 1;
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
  }

  async getSessions(userId: string) {
    const result = await pool.query(`SELECT id, device_id, device_fingerprint, ip, user_agent, created_at, last_used_at, expires_at FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_used_at DESC NULLS LAST`, [userId]);
    return result.rows;
  }

  async revokeSession(token: string, userId: string): Promise<boolean> {
    const result = await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL", [hashToken(token), userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const passwordHash = await this.hashPassword(password);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.findUserById(userId);
    if (!user) return false;
    const userWithHash = await this.findUserByEmail(user.email!);
    if (!userWithHash?.passwordHash || !(await this.verifyPassword(currentPassword, userWithHash.passwordHash))) return false;
    await this.setPassword(userId, newPassword);
    await this.revokeAllRefreshTokens(userId);
    return true;
  }

  async recordSecurityEvent(userId: string, eventType: string, ip?: string, userAgent?: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await pool.query(`INSERT INTO security_events (user_id, event_type, ip, user_agent, metadata) VALUES ($1, $2, $3, $4, $5)`, [userId, eventType, ip ?? null, userAgent ?? null, metadata]);
  }

  async getSecurityEvents(userId: string, limit = 50, offset = 0) {
    const result = await pool.query(`SELECT id, event_type, ip, user_agent, metadata, created_at FROM security_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]);
    return result.rows;
  }

  async linkGoogleAccount(userId: string, googleId: string, googleSubject: string): Promise<void> {
    await pool.query("UPDATE users SET google_id = $1, oauth_provider = 'google', oauth_subject = $2 WHERE id = $3", [googleId, googleSubject, userId]);
  }

  async unlinkGoogleAccount(userId: string): Promise<void> {
    await pool.query("UPDATE users SET google_id = NULL, oauth_provider = NULL, oauth_subject = NULL WHERE id = $1", [userId]);
  }

  async findUserByGoogleId(googleId: string): Promise<User | null> {
    const result = await pool.query(`SELECT ${publicUserColumns} FROM users WHERE google_id = $1`, [googleId]);
    return result.rows[0] ? this.toUser(result.rows[0]) : null;
  }

  async updateLastLogin(userId: string): Promise<void> {
    await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [userId]);
  }
}

export default new AuthService();
