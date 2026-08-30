import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:gid_core/gid_core.dart';

/// Which server this build talks to, and how the app looks while it does.

/// The API host.
///
/// Same escape hatch as the customer app: a build handed to a cooperative for
/// a pilot points at their instance, and the developer screen can repoint it
/// without a rebuild. Overridable at build time with
/// `--dart-define=API_BASE_URL=…`.
class ServerStore {
  static const _key = 'gid.worker.server';
  static const _storage = FlutterSecureStorage();

  static String? normalise(String? raw) {
    final value = raw?.trim();
    if (value == null || value.isEmpty) return null;
    final withScheme = value.startsWith('http') ? value : 'https://$value';
    return withScheme.endsWith('/') ? withScheme.substring(0, withScheme.length - 1) : withScheme;
  }

  Future<String?> read() async => normalise(await _storage.read(key: _key));

  Future<void> write(String? url) async {
    final value = normalise(url);
    if (value == null) {
      await _storage.delete(key: _key);
    } else {
      await _storage.write(key: _key, value: value);
    }
  }
}

final serverStoreProvider = Provider<ServerStore>((ref) => ServerStore());

/// The host in force, resolved once at launch.
final serverUrlProvider = StateProvider<String>((ref) => AppConfig.apiBaseUrl);

// ─────────────────────────────────────────────────────────────── theme ──
//
// There is no theme setting.
//
// The worker app used to offer four (light, dark, daylight, follow-the-phone),
// which meant four palettes to keep legible, a page that could repaint itself
// mid-job because a cloud moved, and a "bright sunlight" mode nobody discovered
// because it lived three taps into Settings. The app is used outdoors, on cheap
// screens, at maximum brightness: light is the only one of the four that is
// right in those conditions, so it is the only one that ships. See
// `WorkerApp.build` in app/app.dart.

/// The language, asked BEFORE sign-in rather than buried in settings.
///
/// The audience is Telangana cooperative workers. An app that opens in English
/// and hides Telugu three taps deep is an English app with a Telugu setting.
class LocaleController extends Notifier<Locale?> {
  static const _key = 'gid.worker.locale';
  static const _storage = FlutterSecureStorage();

  /// Whether the language question has been answered at least once. Null locale
  /// alone cannot distinguish "not asked" from "chose the system default".
  bool _asked = false;
  bool get hasChosen => _asked;

  @override
  Locale? build() {
    unawaited(_restore());
    return null;
  }

  Future<void> _restore() async {
    final stored = await _storage.read(key: _key);
    if (stored != null && stored.isNotEmpty) {
      _asked = true;
      state = Locale(stored);
    }
  }

  Future<void> set(String languageCode) async {
    _asked = true;
    state = Locale(languageCode);
    await _storage.write(key: _key, value: languageCode);
  }
}

final localeProvider = NotifierProvider<LocaleController, Locale?>(LocaleController.new);

/// The three the backend actually serves, in the order this audience needs them.
const supportedWorkerLocales = [Locale('te'), Locale('en'), Locale('hi')];

const workerLanguageNames = {
  'te': 'తెలుగు',
  'en': 'English',
  'hi': 'हिन्दी',
};

