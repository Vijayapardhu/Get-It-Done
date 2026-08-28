import { Router } from "express";
import { env } from "../config/env.js";
import { publishableKey, isConfigured as razorpayConfigured } from "../services/razorpayClient.js";

/**
 * Client-facing configuration.
 *
 * Everything the mobile app needs to know about this deployment, fetched at
 * launch instead of compiled in. Baking these into the binary meant a rotated
 * OAuth client or a new payment gateway key needed an app-store release, and
 * left copies of the values scattered across build scripts and CI config.
 *
 * NOTHING SECRET GOES HERE. This endpoint is unauthenticated by necessity —
 * the app calls it before anyone has signed in — so every value below must be
 * one that is already public by design:
 *
 *   - Google client ids are public identifiers; the OAuth flow's security
 *     comes from the redirect/package allow-list in the Google console, and
 *     the backend independently verifies the ID token's audience.
 *   - The Razorpay KEY ID is publishable and appears in the checkout sheet.
 *     RAZORPAY_KEY_SECRET signs webhooks and checkout responses and is never
 *     read in this file.
 *
 * If a value would be damaging to print on a billboard, it does not belong in
 * this response.
 */
export const configRouter = Router();

configRouter.get("/mobile", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");

  res.json({
    auth: {
      /**
       * The WEB client id. Android must mint an ID token audienced to the
       * backend rather than to the Android client, or verification fails —
       * which is why this is the web id and not the android one.
       */
      googleServerClientId: env.GOOGLE_CLIENT_ID || null,
      googleIosClientId: env.GOOGLE_IOS_CLIENT_ID || null,
      googleSignInEnabled: Boolean(env.GOOGLE_CLIENT_ID),
      passwordSignInEnabled: true,
      // There is no `otpSignInEnabled`, and no SMS provider is reported. SMS
      // sign-in is gone from the platform: the endpoints, the app screen and
      // the capability flag all went together, so there is nothing here for a
      // client to switch on. An old build asking for the flag gets `null`,
      // which its parser already reads as "off".
    },
    payments: {
      provider: "razorpay",
      /** Publishable. The secret never leaves this process. */
      razorpayKeyId: publishableKey(),
      /**
       * False when no gateway credentials are configured. The app shows a
       * clearly-labelled test flow rather than opening a checkout that cannot
       * succeed.
       */
      live: razorpayConfigured(),
      currency: "INR",
    },
    features: {
      emergencyBookings: true,
      chat: true,
      recurringBookings: true,
    },
    i18n: {
      supportedLanguages: ["en", "te", "hi"],
      defaultLanguage: "en",
    },
  });
});
