import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Remembers that somebody chose to look around without an account.
///
/// A skippable sign-in that reappears on every cold start is not skippable —
/// it is a sign-in wall with an extra tap. The choice has to survive a
/// restart, so it is written down.
///
/// Secure storage rather than SharedPreferences only because the token store
/// is already here and one storage mechanism is easier to reason about than
/// two; there is nothing secret about this flag.
class GuestStore {
  GuestStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _key = 'gid.guest';

  Future<bool> isGuest() async {
    try {
      return await _storage.read(key: _key) == 'true';
    } catch (_) {
      // A device whose keystore is unavailable gets the sign-in screen, which
      // is the safe end of this decision: it asks for something rather than
      // silently granting a mode the user did not pick.
      return false;
    }
  }

  Future<void> setGuest(bool value) async {
    try {
      if (value) {
        await _storage.write(key: _key, value: 'true');
      } else {
        await _storage.delete(key: _key);
      }
    } catch (_) {
      // The in-memory state is already set; losing the flag costs one extra
      // tap on the next launch, which is not worth failing a sign-in over.
    }
  }
}
