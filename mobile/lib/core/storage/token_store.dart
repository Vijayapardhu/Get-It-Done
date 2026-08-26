import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Session token storage.
///
/// Keychain on iOS, EncryptedSharedPreferences on Android — never
/// SharedPreferences, which is world-readable on a rooted device and survives
/// in plaintext backups.
///
/// The access token is also held in memory so the request interceptor does not
/// hit the platform channel on every call; secure storage reads are slow enough
/// to matter on a list screen firing several requests at once.
class TokenStore {
  TokenStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              // Android encryption is on by default in this plugin version;
              // the explicit EncryptedSharedPreferences flag is deprecated.
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;

  static const _accessKey = 'gid.access_token';
  static const _refreshKey = 'gid.refresh_token';

  String? _accessCache;
  String? _refreshCache;
  bool _loaded = false;

  /// Read both tokens once at startup so the first request does not pay for a
  /// platform-channel round trip.
  Future<void> load() async {
    if (_loaded) return;
    _accessCache = await _read(_accessKey);
    _refreshCache = await _read(_refreshKey);
    _loaded = true;
  }

  Future<String?> get accessToken async {
    if (!_loaded) await load();
    return _accessCache;
  }

  Future<String?> get refreshToken async {
    if (!_loaded) await load();
    return _refreshCache;
  }

  bool get hasSessionSync => _accessCache != null;

  Future<void> save({required String accessToken, required String refreshToken}) async {
    _accessCache = accessToken;
    _refreshCache = refreshToken;
    _loaded = true;
    await Future.wait([
      _write(_accessKey, accessToken),
      _write(_refreshKey, refreshToken),
    ]);
  }

  Future<void> clear() async {
    _accessCache = null;
    _refreshCache = null;
    _loaded = true;
    await Future.wait([
      _delete(_accessKey),
      _delete(_refreshKey),
    ]);
  }

  // Secure storage can throw on a device whose keystore was invalidated (a
  // restored backup, a changed lock screen). Treating that as "no session" and
  // asking the user to sign in again is far better than crashing on launch.
  Future<String?> _read(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (_) {
      return null;
    }
  }

  Future<void> _write(String key, String value) async {
    try {
      await _storage.write(key: key, value: value);
    } catch (_) {
      // In-memory cache still serves this session.
    }
  }

  Future<void> _delete(String key) async {
    try {
      await _storage.delete(key: key);
    } catch (_) {}
  }
}
