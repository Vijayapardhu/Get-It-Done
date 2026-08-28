import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/models.dart';

/// The last user the server confirmed, kept on the device.
///
/// Exists for one situation: the app is launched with a perfectly good stored
/// token and cannot reach the server — a train, a lift, a village with two
/// bars. Without a cached user there is no [AppUser] to put in the auth state,
/// so the app has nothing to show but the sign-in screen, and the customer is
/// asked to sign in again over a problem that has nothing to do with their
/// account.
///
/// This is a CACHE, never an authority. It is only ever consulted when a
/// refresh token is present and the network failed; a 401 clears it along with
/// the tokens. Nothing here grants access — the token does that, and the
/// server checks it on the first request that gets through.
class UserStore {
  UserStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _key = 'gid.user';

  Future<AppUser?> read() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null || raw.isEmpty) return null;
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return null;
      return AppUser.fromJson(decoded);
    } catch (_) {
      // A malformed or unreadable cache is the same as no cache. It must never
      // be able to take the launch down.
      return null;
    }
  }

  Future<void> write(AppUser user) async {
    try {
      await _storage.write(key: _key, value: jsonEncode(user.toJson()));
    } catch (_) {}
  }

  Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } catch (_) {}
  }
}
