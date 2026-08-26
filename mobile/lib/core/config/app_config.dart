import 'dart:io';

import 'package:flutter/foundation.dart';

/// Build-time configuration.
///
/// Pass overrides with --dart-define so a release build never carries a
/// development host:
///
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.5:4000
///   flutter build apk --dart-define=API_BASE_URL=https://api.getitdone.in
abstract final class AppConfig {
  static const _apiBaseUrlOverride = String.fromEnvironment('API_BASE_URL');

  /// Resolved API host.
  ///
  /// The default only helps in debug. `localhost` means the DEVICE, not the
  /// developer's machine, so the Android emulator needs 10.0.2.2 and a physical
  /// phone needs the machine's LAN address passed via --dart-define.
  static String get apiBaseUrl {
    if (_apiBaseUrlOverride.isNotEmpty) return _apiBaseUrlOverride;

    if (kReleaseMode) {
      throw StateError(
        'API_BASE_URL must be provided in release builds: '
        'flutter build apk --dart-define=API_BASE_URL=https://api.example.in',
      );
    }

    // Android emulator maps the host loopback to 10.0.2.2; iOS simulator shares
    // the host's network stack, so localhost is correct there.
    if (!kIsWeb && Platform.isAndroid) return 'http://10.0.2.2:4000';
    return 'http://localhost:4000';
  }

  /// Socket.IO endpoint. Same host as the API — the backend attaches Socket.IO
  /// to the same HTTP server.
  static String get realtimeUrl => apiBaseUrl;

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

  /// Supported languages, matching GET /i18n/languages.
  static const supportedLanguages = ['en', 'te', 'hi'];

  static bool get isDebug => kDebugMode;
}
