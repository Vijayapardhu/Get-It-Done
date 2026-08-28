import { pool } from "../db/pool.js";
import { emitNotification } from "../core/realtime.js";
import logger from "../core/logger.js";

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  push: boolean;
  sms: boolean;
  email: boolean;
  inApp: boolean;
}

export interface DeviceToken {
  id: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  appVersion: string;
  lastUsedAt: string;
}

export async function listNotifications(
  userId: string,
  options: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
): Promise<{ notifications: Notification[]; total: number }> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const unreadOnly = options.unreadOnly ?? false;

  let whereClause = `where user_id = $1`;
  const params: any[] = [userId];
  let paramIndex = 2;

  if (unreadOnly) {
    whereClause += ` and read_at is null`;
  }

  const countResult = await pool.query(
    `select count(*)::int as total from notifications ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0].total);

  const result = await pool.query(
    `select id, type, title, body, read_at as "readAt", created_at as "createdAt"
     from notifications
     ${whereClause}
     order by created_at desc
     limit $${paramIndex} offset $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { notifications: result.rows, total };
}

export async function markNotificationRead(userId: string, id: string): Promise<Notification | null> {
  const result = await pool.query(
    `update notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2 returning id, type, title, body, read_at as "readAt", created_at as "createdAt"`,
    [id, userId]
  );
  return result.rows[0] ?? null;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await pool.query(
    `update notifications set read_at = now() where user_id = $1 and read_at is null`,
    [userId]
  );
  return result.rowCount ?? 0;
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const result = await pool.query(
    `select notifications, ui, privacy from user_preferences where user_id = $1`,
    [userId]
  );
  if (!result.rows[0]) {
    return {
      userId,
      push: true,
      sms: true,
      email: true,
      inApp: true
    };
  }
  const prefs = result.rows[0].notifications ?? {};
  return {
    userId,
    push: prefs.push ?? true,
    sms: prefs.sms ?? true,
    email: prefs.email ?? true,
    inApp: prefs.inApp ?? true
  };
}

export async function updateNotificationPreferences(
  userId: string,
  preferences: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const current = await getNotificationPreferences(userId);
  const updated = { ...current, ...preferences };
  
  await pool.query(
    `insert into user_preferences (user_id, notifications, ui, privacy)
     values ($1, $2, '{}'::jsonb, '{}'::jsonb)
     on conflict (user_id) do update set notifications = $2, updated_at = now()`,
    [userId, JSON.stringify({
      push: updated.push,
      sms: updated.sms,
      email: updated.email,
      inApp: updated.inApp
    })]
  );
  return updated;
}

export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: 'ios' | 'android' | 'web',
  appVersion: string
): Promise<DeviceToken> {
  const result = await pool.query(
    `insert into device_tokens (user_id, token, platform, app_version, last_used_at)
     values ($1, $2, $3, $4, now())
     on conflict (user_id, token) do update set
       platform = EXCLUDED.platform,
       app_version = EXCLUDED.app_version,
       last_used_at = now()
     returning id, user_id as "userId", token, platform, app_version as "appVersion", last_used_at as "lastUsedAt"`,
    [userId, token, platform, appVersion]
  );
  return result.rows[0];
}

export async function removeDeviceToken(userId: string, token: string): Promise<void> {
  await pool.query(`delete from device_tokens where user_id = $1 and token = $2`, [userId, token]);
}

export async function getDeviceTokens(userId: string): Promise<DeviceToken[]> {
  const result = await pool.query(
    `select id, user_id as "userId", token, platform, app_version as "appVersion", last_used_at as "lastUsedAt"
     from device_tokens where user_id = $1 order by last_used_at desc`,
    [userId]
  );
  return result.rows;
}

export async function writeNotification(
  client: { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> },
  input: { userId: string; type: string; title: string; body: string; aggregateType: string; aggregateId: string }
) {
  const notification = await client.query(
    `insert into notifications (user_id, type, title, body) values ($1, $2, $3, $4) returning id, user_id as "userId", type, title, body, created_at as "createdAt"`,
    [input.userId, input.type, input.title, input.body]
  );
  await client.query(
    `insert into outbox_events (event_type, aggregate_type, aggregate_id, payload) values ($1, $2, $3, $4)`,
    ["notification.created", input.aggregateType, input.aggregateId, notification.rows[0]]
  );
  return notification.rows[0];
}

export async function processOutboxEvents(): Promise<number> {
  const client = await pool.connect();
  let processed = 0;
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `select id, event_type, aggregate_type, aggregate_id, payload from outbox_events
       where processed_at is null
       order by created_at asc
       limit 100 for update skip locked`
    );
    
    for (const event of result.rows) {
      try {
        if (event.event_type === "notification.created") {
          const payload = event.payload;

          // Deliver over the socket the app is already holding open.
          //
          // This is the step that was missing: every booking notification was
          // written to the table, queued here, logged, and marked processed --
          // so it only ever reached a customer if they happened to pull the
          // notifications tab to refresh. `emitNotification` was written for
          // exactly this and called from nowhere but chat.
          //
          // Delivery is best-effort by design. A customer with no socket open
          // is not an outbox failure; the row is in `notifications` either way
          // and the tab shows it on next load.
          emitNotification(payload.userId, payload);

          // The other half -- reaching a device whose app is not running --
          // needs FCM, which needs a Firebase project and a service account
          // this deployment does not have. Left explicit rather than silent:
          // registered tokens are counted so the log says what would be sent.
          const tokens = await pool.query(
            `select token, platform from device_tokens where user_id = $1`,
            [payload.userId]
          );
          if (tokens.rows.length > 0) {
            logger.debug(
              { userId: payload.userId, devices: tokens.rows.length },
              "FCM not configured: notification delivered over socket only"
            );
          }
        }
        
        await client.query(
          `update outbox_events set processed_at = now() where id = $1`,
          [event.id]
        );
        processed++;
      } catch (error) {
        console.error(`Failed to process outbox event ${event.id}:`, error);
        await client.query(
          `update outbox_events set attempts = attempts + 1, last_error = $1 where id = $2`,
          [String(error), event.id]
        );
      }
    }
    
    await client.query("COMMIT");
    return processed;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}