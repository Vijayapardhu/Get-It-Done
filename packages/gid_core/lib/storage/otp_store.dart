import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/models.dart';

/// The handshake codes for bookings this device placed.
///
/// The server issues each pair EXACTLY once and keeps only SHA-256 hashes, so
/// if the app does not keep them they cannot be recovered — only replaced. That
/// is the bug this exists to fix: "Show my code" arrived with nothing, the only
/// way forward was to reissue, and reissuing mints a NEW pair and invalidates
/// the old one. Every visit produced different codes, and a customer who had
/// written the first pair down found it rejected at the door.
///
/// Stored encrypted, beside the session tokens. These codes gate payment for
/// work — a worker who has them can claim a job was started and finished — so
/// they belong in the keychain rather than in shared preferences.
class OtpStore {
  OtpStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;

  static const _key = 'gid.booking_otps';

  /// In-memory mirror, so a booking list rendering several rows does not pay
  /// for a platform-channel read each time.
  Map<String, BookingOtps>? _cache;

  Future<Map<String, BookingOtps>> _load() async {
    final cached = _cache;
    if (cached != null) return cached;

    try {
      final raw = await _storage.read(key: _key);
      if (raw == null || raw.isEmpty) return _cache = {};

      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      return _cache = {
        for (final entry in decoded.entries)
          entry.key: BookingOtps(
            startOtp: (entry.value as Map<String, dynamic>)['start'] as String? ?? '',
            completionOtp: (entry.value)['completion'] as String? ?? '',
          ),
      };
    } catch (_) {
      // Corrupt or unreadable: start clean rather than taking the screen down.
      // Losing the codes degrades to the reissue path, which still works.
      return _cache = {};
    }
  }

  Future<void> _flush() async {
    final cache = _cache ?? {};
    await _storage.write(
      key: _key,
      value: jsonEncode({
        for (final entry in cache.entries)
          entry.key: {
            'start': entry.value.startOtp,
            'completion': entry.value.completionOtp,
          },
      }),
    );
  }

  Future<BookingOtps?> read(String bookingId) async => (await _load())[bookingId];

  Future<void> save(String bookingId, BookingOtps otps) async {
    final cache = await _load();
    cache[bookingId] = otps;
    await _flush();
  }

  /// Save every pair an order returned, in one write.
  Future<void> saveAll(Map<String, BookingOtps> byBookingId) async {
    if (byBookingId.isEmpty) return;
    final cache = await _load();
    cache.addAll(byBookingId);
    await _flush();
  }

  /// Forget one booking's codes once the job is closed.
  Future<void> forget(String bookingId) async {
    final cache = await _load();
    if (cache.remove(bookingId) == null) return;
    await _flush();
  }

  /// Signing out clears them: they belong to the account, not the handset.
  Future<void> clear() async {
    _cache = {};
    await _storage.delete(key: _key);
  }
}
