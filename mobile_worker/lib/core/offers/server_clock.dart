import 'package:clock/clock.dart';
import 'package:flutter/foundation.dart';

/// The difference between this phone's clock and the server's.
///
/// The 45-second acceptance window is the highest-stakes moment on the
/// platform, and it is rendered from a server timestamp. Two ways to get that
/// wrong, both of which cost the worker a job:
///
///  1. Start a local `Duration(seconds: 45)` when the offer arrives. That
///     silently discards the network latency — on the 2G and 3G connections
///     this audience actually has, a second or two, sometimes more — and the
///     worker runs out of time before the ring says they have.
///  2. Compare `expiresAt` against `DateTime.now()` directly. Phone clocks
///     drift, and a device that is thirty seconds fast shows an offer as
///     already expired the instant it arrives.
///
/// So: every payload carrying `serverNow` feeds [sync], and the countdown asks
/// [remaining] rather than doing its own arithmetic.
///
/// Time comes from `package:clock` throughout, so a test can wind a 45-second
/// window forward without waiting 45 seconds.
class ServerClock extends ChangeNotifier {
  Duration _skew = Duration.zero;
  DateTime? _lastSyncedAt;

  /// Server time minus device time. Positive when this phone is behind.
  Duration get skew => _skew;

  DateTime? get lastSyncedAt => _lastSyncedAt;

  /// Feed the server's clock, taken from any payload that carries it.
  ///
  /// [roundTrip], where known, halves out the one-way latency: the timestamp
  /// was generated roughly half a round trip before it was read here, so the
  /// naive difference systematically over-reports how far behind the phone is.
  void sync(DateTime serverNow, {Duration? roundTrip}) {
    final deviceNow = clock.now();
    var measured = serverNow.difference(deviceNow);
    if (roundTrip != null) {
      measured += Duration(microseconds: roundTrip.inMicroseconds ~/ 2);
    }

    // A first reading is taken as-is. After that the estimate is smoothed, so
    // one request that sat behind a stalled radio for four seconds does not
    // yank every live countdown.
    if (_lastSyncedAt == null) {
      _skew = measured;
    } else {
      const weight = 0.3;
      _skew = Duration(
        microseconds:
            (_skew.inMicroseconds * (1 - weight) + measured.inMicroseconds * weight).round(),
      );
    }

    _lastSyncedAt = deviceNow;
    notifyListeners();
  }

  /// The server's clock, as best this device can tell.
  DateTime now() => clock.now().add(_skew);

  /// How long is left on a server deadline. Never negative.
  Duration remaining(DateTime serverDeadline) {
    final left = serverDeadline.difference(now());
    return left.isNegative ? Duration.zero : left;
  }

  /// Has this deadline passed?
  bool hasExpired(DateTime serverDeadline) => remaining(serverDeadline) == Duration.zero;

  /// A skew this large means the phone's clock is wrong in a way the worker
  /// should probably know about, and it is worth showing on the developer
  /// screen rather than hiding.
  bool get isSuspicious => _skew.abs() > const Duration(minutes: 2);
}
