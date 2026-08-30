import { readFileSync } from "node:fs";
// firebase-admin v13+ ships modular subpath exports; the old default `admin.*`
// namespace is not typed against them.
import { initializeApp, cert, type App, type ServiceAccount } from "firebase-admin/app";
import { getMessaging, type SendResponse } from "firebase-admin/messaging";
import { env } from "../config/env.js";
import logger from "./logger.js";

/**
 * Firebase Cloud Messaging: the half of "push" that reaches a device whose app
 * is not running.
 *
 * The socket in core/realtime.ts covers a live app. It cannot cover a phone
 * with the app swiped away, because there is no socket to deliver to — which is
 * precisely when a customer most needs to hear that a worker is at their door.
 * That gap is what this closes.
 *
 * Initialisation is lazy and failure is non-fatal by design. A missing or
 * malformed service account disables push and logs once; it must never take
 * down the API, because notifications are already durably written to the
 * `notifications` table and readable from the Alerts tab regardless.
 */

export type PushOutcome = {
  sent: number;
  failed: number;
  /** Tokens FCM rejected as permanently dead; the caller should delete these. */
  staleTokens: string[];
};

let app: App | null = null;
let initialised = false;
let available = false;

function loadServiceAccount(): ServiceAccount | null {
  // A mounted file is preferred: it stays out of `docker inspect` and process
  // listings, where an inline environment variable would be visible.
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    return JSON.parse(readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf-8"));
  }
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  return null;
}

/** Idempotent. Safe to call on every send; the work happens once. */
export function initPush(): boolean {
  if (initialised) return available;
  initialised = true;

  try {
    const credentials = loadServiceAccount();
    if (!credentials) {
      logger.warn(
        "FCM disabled: set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON. " +
          "Notifications are still written to the database and delivered over the socket."
      );
      return false;
    }

    app = initializeApp({ credential: cert(credentials) }, "push");
    available = true;
    logger.info({ projectId: (credentials as { projectId?: string }).projectId }, "FCM initialised");
  } catch (error) {
    // Bad JSON, an unreadable path, a revoked key. None of these justify a dead
    // API, so this degrades to socket-only delivery.
    logger.error({ err: error }, "FCM initialisation failed: push disabled");
    available = false;
  }

  return available;
}

export function isPushAvailable(): boolean {
  return initPush();
}

/**
 * A token FCM will never accept again — the app was uninstalled, or the token
 * was rotated. Anything else (a timeout, a 503) is transient and the token must
 * be kept, or a bad afternoon at Google would quietly unsubscribe every user.
 */
function isStale(code: string | undefined): boolean {
  return (
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token" ||
    code === "messaging/invalid-argument"
  );
}

/**
 * Deliver one notification to every device belonging to a user.
 *
 * `data` values must be strings — FCM rejects any other type, and a number
 * slipped in here would fail the whole multicast rather than one field.
 */
export async function sendPushToTokens(
  tokens: string[],
  message: { title: string; body: string; type: string; notificationId?: string }
): Promise<PushOutcome> {
  const empty: PushOutcome = { sent: 0, failed: 0, staleTokens: [] };
  if (tokens.length === 0 || !initPush() || !app) return empty;

  const data: Record<string, string> = {
    type: message.type,
    // The client routes on these, and Android delivers data-only keys as
    // strings regardless, so they are stringified here rather than at the edge.
    notificationId: message.notificationId ?? "",
    // Lets the Flutter app open the right screen from a cold start.
    click_action: "FLUTTER_NOTIFICATION_CLICK",
  };

  try {
    const response = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      data,
      android: {
        priority: "high",
        notification: {
          channelId: env.FCM_ANDROID_CHANNEL_ID,
          // The monochrome silhouette in the Flutter app's drawable folders.
          // Without it Android falls back to the full-colour launcher icon and
          // renders it as a featureless white square in the status bar.
          icon: "ic_stat_gid",
          color: "#2E5FD9", // AppColors.blue600, matching the client
        },
      },
      apns: {
        payload: { aps: { sound: "default", badge: 1 } },
      },
    });

    const staleTokens: string[] = [];
    response.responses.forEach((r: SendResponse, i: number) => {
      if (!r.success && isStale((r.error as { code?: string } | undefined)?.code)) {
        staleTokens.push(tokens[i]);
      }
    });

    return { sent: response.successCount, failed: response.failureCount, staleTokens };
  } catch (error) {
    logger.error({ err: error, tokenCount: tokens.length }, "FCM send failed");
    return { ...empty, failed: tokens.length };
  }
}

/**
 * A high-priority DATA message: the app renders it, not Android.
 *
 * `sendPushToTokens` above sends a *notification* message, which Android's own
 * tray draws. That is right for "your booking was confirmed" and wrong for a
 * job offer, which has to become a full-screen interrupt with a countdown ring,
 * a custom sound and two 64dp buttons. Only the app can draw that, and Android
 * only hands the payload to the app when the message carries no `notification`
 * block.
 *
 * Three details that are not optional here:
 *
 *   - `priority: "high"` and `contentAvailable`, or Doze defers delivery and a
 *     45-second offer arrives after it expired.
 *   - `ttl: 0` is wrong and a long TTL is worse. The TTL is the REMAINING offer
 *     window, so a message that could not be delivered in time is dropped by
 *     FCM rather than ringing a worker's pocket about a job that is gone.
 *   - Every value is a string. FCM rejects anything else, and a number slipped
 *     in here fails the whole multicast rather than one field.
 */
export async function sendDataPushToTokens(
  tokens: string[],
  data: Record<string, string>,
  options: { ttlSeconds: number; collapseKey?: string }
): Promise<PushOutcome> {
  const empty: PushOutcome = { sent: 0, failed: 0, staleTokens: [] };
  if (tokens.length === 0 || !initPush() || !app) return empty;

  // A window that already closed is not worth a network round trip.
  const ttl = Math.max(0, Math.floor(options.ttlSeconds));
  if (ttl === 0) return empty;

  try {
    const response = await getMessaging(app).sendEachForMulticast({
      tokens,
      data,
      android: {
        priority: "high",
        ttl: ttl * 1000,
        collapseKey: options.collapseKey,
        // No `notification` block: this is what makes it a data message.
      },
      apns: {
        headers: {
          "apns-priority": "10",
          "apns-push-type": "background",
          "apns-expiration": String(Math.floor(Date.now() / 1000) + ttl),
        },
        // content-available wakes the app; the app draws the local
        // notification. There is no alert here for the same reason as Android.
        payload: { aps: { "content-available": 1 } },
      },
    });

    const staleTokens: string[] = [];
    response.responses.forEach((r: SendResponse, i: number) => {
      if (!r.success && isStale((r.error as { code?: string } | undefined)?.code)) {
        staleTokens.push(tokens[i]);
      }
    });

    return { sent: response.successCount, failed: response.failureCount, staleTokens };
  } catch (error) {
    logger.error({ err: error, tokenCount: tokens.length }, "FCM data push failed");
    return { ...empty, failed: tokens.length };
  }
}
