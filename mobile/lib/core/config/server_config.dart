import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'app_config.dart';

/// Which server this build talks to, and the developer's ability to change it.
///
/// The base URL is compiled in with `--dart-define=API_BASE_URL`, which is
/// right for a shipped app and painful for a demo one: the machine serving the
/// backend changes address every time the laptop joins a different network, and
/// each change meant a four-minute rebuild. This lets the URL be repointed from
/// inside the app.
///
/// Deliberately NOT a normal setting. Repointing an app at an arbitrary server
/// is a phishing primitive — "paste this URL and sign in again" sends the next
/// password to whoever asked. So it lives behind the same hidden gesture
/// Android itself uses for developer options, and switching servers signs the
/// current session out rather than carrying a token to a host that did not
/// issue it.
class ServerStore {
  ServerStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _urlKey = 'gid.server_url';
  static const _unlockedKey = 'gid.developer_unlocked';

  /// Read once in `main()` before the first request can be made, so no call is
  /// ever sent to the build default and then re-sent somewhere else.
  static String? cachedUrl;
  static bool cachedUnlocked = false;

  static Future<void> load() async {
    final store = ServerStore();
    cachedUrl = await store.readUrl();
    cachedUnlocked = await store.readUnlocked();
  }

  Future<String?> readUrl() async {
    try {
      return normalise(await _storage.read(key: _urlKey) ?? '');
    } catch (_) {
      // A device whose keystore is unavailable still has a working app; it just
      // uses the URL it was built with.
      return null;
    }
  }

  Future<void> writeUrl(String url) async {
    cachedUrl = normalise(url);
    await _storage.write(key: _urlKey, value: cachedUrl);
  }

  Future<void> clearUrl() async {
    cachedUrl = null;
    await _storage.delete(key: _urlKey);
  }

  Future<bool> readUnlocked() async {
    try {
      return await _storage.read(key: _unlockedKey) == 'true';
    } catch (_) {
      return false;
    }
  }

  Future<void> setUnlocked(bool value) async {
    cachedUnlocked = value;
    if (value) {
      await _storage.write(key: _unlockedKey, value: 'true');
    } else {
      await _storage.delete(key: _unlockedKey);
    }
  }

  /// Tidy a typed URL, or null if it is not one we can talk to.
  ///
  /// Trailing slashes are stripped because every path in [GidApi] starts with
  /// one, and `http://host:4000//services` is a 404 on a router that would have
  /// answered `/services`.
  static String? normalise(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;

    final uri = Uri.tryParse(trimmed);
    if (uri == null) return null;
    if (uri.scheme != 'http' && uri.scheme != 'https') return null;
    if (uri.host.isEmpty) return null;

    final port = uri.hasPort ? ':${uri.port}' : '';
    final path = uri.path.replaceAll(RegExp(r'/+$'), '');
    return '${uri.scheme}://${uri.host}$port$path';
  }

}

/// The base URL every request and socket connection uses.
class ServerController extends Notifier<String> {
  @override
  String build() => ServerStore.cachedUrl ?? AppConfig.apiBaseUrl;

  /// Whether this is a developer override rather than what the app was built
  /// with. Shown in the UI so nobody debugs a demo pointed at their laptop.
  bool get isOverridden => ServerStore.cachedUrl != null;

  String get buildDefault => AppConfig.apiBaseUrl;

  Future<void> use(String url) async {
    final normalised = ServerStore.normalise(url);
    if (normalised == null || normalised == state) return;
    await ServerStore().writeUrl(normalised);
    state = normalised;
  }

  Future<void> reset() async {
    await ServerStore().clearUrl();
    state = AppConfig.apiBaseUrl;
  }
}

final serverUrlProvider =
    NotifierProvider<ServerController, String>(ServerController.new);

/// The result of one tap on the version line.
class UnlockTap {
  const UnlockTap.ignored() : remaining = null, justUnlocked = false;
  const UnlockTap.unlocked() : remaining = null, justUnlocked = true;
  const UnlockTap.counting(int this.remaining) : justUnlocked = false;

  /// Taps still needed, or null when there is nothing left to count.
  final int? remaining;

  /// True for exactly one tap in the sequence — the one that turned it on.
  final bool justUnlocked;
}

/// Whether the developer section is visible.
///
/// Unlocked by tapping the version seven times, the gesture Android trained
/// everyone on. Persisted, so it does not have to be rediscovered every launch.
class DeveloperModeController extends Notifier<bool> {
  @override
  bool build() => ServerStore.cachedUnlocked || kDebugMode;

  /// Taps counted since the last one; reset by leaving the screen.
  int _taps = 0;

  static const _tapsToUnlock = 7;

  /// What a tap on the version line did.
  ///
  /// [ignored] and [unlocked] both mean "developer mode is on now", and
  /// collapsing them into one answer is what made the confirmation toast fire
  /// on EVERY subsequent tap: the caller could not tell the moment it turned on
  /// from the hundred taps after it.
  UnlockTap registerTap() {
    if (state) return const UnlockTap.ignored();

    _taps++;
    final remaining = _tapsToUnlock - _taps;

    if (remaining > 0) return UnlockTap.counting(remaining);

    _taps = 0;
    unawaited(ServerStore().setUnlocked(true));
    state = true;
    return const UnlockTap.unlocked();
  }

  Future<void> lock() async {
    _taps = 0;
    await ServerStore().setUnlocked(false);
    state = kDebugMode;
  }
}

final developerModeProvider =
    NotifierProvider<DeveloperModeController, bool>(DeveloperModeController.new);
