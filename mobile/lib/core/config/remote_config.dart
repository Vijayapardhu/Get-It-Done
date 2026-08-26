import '../network/json.dart';

/// Configuration served by the backend at `GET /config/mobile`.
///
/// The app used to carry its OAuth client ids and gateway keys as
/// `--dart-define` values baked into the binary. That meant rotating a key
/// needed an app-store release, and the values were duplicated across build
/// scripts, CI config and every developer's shell history.
///
/// Now the server owns them. The compiled-in values survive only as an offline
/// fallback for development, and a release build carries none at all.
class RemoteConfig {
  const RemoteConfig({
    this.googleServerClientId,
    this.googleIosClientId,
    this.googleSignInEnabled = false,
    this.passwordSignInEnabled = true,
    this.otpSignInEnabled = true,
    this.demoSignInEnabled = false,
    this.razorpayKeyId,
    this.paymentsLive = false,
    this.currency = 'INR',
    this.emergencyBookings = true,
    this.chat = true,
    this.recurringBookings = true,
    this.supportedLanguages = const ['en'],
    this.defaultLanguage = 'en',
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  /// The WEB OAuth client id. Android must mint an ID token audienced to the
  /// backend rather than to the Android client, or verification fails.
  final String? googleServerClientId;
  final String? googleIosClientId;
  final bool googleSignInEnabled;
  final bool passwordSignInEnabled;
  final bool otpSignInEnabled;

  /// Whether POST /auth/demo will issue a session on THIS server.
  ///
  /// Defaults to false and is never inferred from the build: a demo build
  /// pointed at a real deployment shows no demo button, because the server
  /// says it has none.
  final bool demoSignInEnabled;

  // ── Payments ──────────────────────────────────────────────────────────────

  /// Publishable key id. The gateway SECRET is never sent to a client and has
  /// no field here — if one ever appears, that is a bug, not a feature.
  final String? razorpayKeyId;

  /// False when the backend has no gateway credentials. The payment screen
  /// then shows a labelled test flow instead of a checkout that cannot work.
  final bool paymentsLive;
  final String currency;

  // ── Features ──────────────────────────────────────────────────────────────

  final bool emergencyBookings;
  final bool chat;
  final bool recurringBookings;

  final List<String> supportedLanguages;
  final String defaultLanguage;

  factory RemoteConfig.fromJson(Json json) {
    final auth = asJson(pick(json, 'auth')) ?? const {};
    final payments = asJson(pick(json, 'payments')) ?? const {};
    final features = asJson(pick(json, 'features')) ?? const {};
    final i18n = asJson(pick(json, 'i18n')) ?? const {};

    final languages = asStringList(pick(i18n, 'supportedLanguages'));

    return RemoteConfig(
      googleServerClientId: asStringOrNull(pick(auth, 'googleServerClientId')),
      googleIosClientId: asStringOrNull(pick(auth, 'googleIosClientId')),
      googleSignInEnabled: asBool(pick(auth, 'googleSignInEnabled')),
      passwordSignInEnabled: asBool(pick(auth, 'passwordSignInEnabled'), fallback: true),
      otpSignInEnabled: asBool(pick(auth, 'otpSignInEnabled'), fallback: true),
      demoSignInEnabled: asBool(pick(auth, 'demoSignInEnabled')),
      razorpayKeyId: asStringOrNull(pick(payments, 'razorpayKeyId')),
      paymentsLive: asBool(pick(payments, 'live')),
      currency: asString(pick(payments, 'currency'), fallback: 'INR'),
      emergencyBookings: asBool(pick(features, 'emergencyBookings'), fallback: true),
      chat: asBool(pick(features, 'chat'), fallback: true),
      recurringBookings: asBool(pick(features, 'recurringBookings'), fallback: true),
      supportedLanguages: languages.isEmpty ? const ['en'] : languages,
      defaultLanguage: asString(pick(i18n, 'defaultLanguage'), fallback: 'en'),
    );
  }
}
