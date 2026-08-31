import 'package:flutter/foundation.dart';

/// Build-time configuration.
///
/// Pass overrides with --dart-define to point a build somewhere else:
///
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000
///   flutter build apk --dart-define=API_BASE_URL=http://getitdone.vijayapardhu.tech
abstract final class AppConfig {
  static const _apiBaseUrlOverride = String.fromEnvironment('API_BASE_URL');

  /// The deployed backend. Used by every build that does not say otherwise.
  ///
  /// This is a real host rather than a loopback default on purpose. The old
  /// default was `localhost:4000`, which means the DEVICE, not the developer's
  /// machine — so a phone with no backend on it showed a connection error on
  /// first launch, and a release build threw outright unless someone remembered
  /// the --dart-define. Anyone who does want their own machine has two ways to
  /// say so: --dart-define at build time, or the developer screen at runtime.
  static const deployedApiBaseUrl = 'https://getitdone.vijayapardhu.tech';

  /// Resolved API host.
  static String get apiBaseUrl =>
      _apiBaseUrlOverride.isNotEmpty ? _apiBaseUrlOverride : deployedApiBaseUrl;

  /// Socket.IO endpoint. Same host as the API — the backend attaches Socket.IO
  /// to the same HTTP server.
  static String get realtimeUrl => apiBaseUrl;

  /// Reported to the backend when registering a device for push, so a crash
  /// report or a stale-token sweep can tell which build a device is on.
  /// Kept in step with `version:` in pubspec.yaml by hand — a mismatch is
  /// cosmetic, not functional.
  static const appVersion = '1.0.0';

  static const connectTimeout = Duration(seconds: 12);
  static const receiveTimeout = Duration(seconds: 20);
  static const sendTimeout = Duration(seconds: 20);

  /// Booking OTPs are 6 digits (see backend core/otp.ts).
  static const otpLength = 6;

  /// The backend allows 5 wrong codes before locking the handshake.
  static const maxOtpAttempts = 5;

  /// Blueprint 5.4 — the worker's acceptance window. Mirrored here only to
  /// render a countdown; the backend is the authority and its value arrives on
  /// the booking as `assignmentExpiresAt`.
  static const workerAcceptWindow = Duration(seconds: 45);

  // ── Google Sign-In ────────────────────────────────────────────────────────
  // Passed at build time:
  //   --dart-define=GOOGLE_SERVER_CLIENT_ID=...apps.googleusercontent.com
  //
  // serverClientId is the WEB client id from the Google console. It is what
  // makes Android mint an ID token audienced to the backend rather than to the
  // Android client — verification fails otherwise. iOS additionally needs its
  // own client id via GOOGLE_CLIENT_ID.
  static const googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');
  static const googleClientId = String.fromEnvironment('GOOGLE_CLIENT_ID');

  /// Google sign-in is only offered when it can actually work.
  static bool get googleSignInEnabled => googleServerClientId.isNotEmpty;

  /// Supported languages, matching GET /i18n/languages.
  static const supportedLanguages = ['en', 'te', 'hi'];

  static bool get isDebug => kDebugMode;
}
