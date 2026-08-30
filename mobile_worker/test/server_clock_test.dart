import 'package:clock/clock.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:getitdone_worker/core/offers/offer_inbox.dart';
import 'package:getitdone_worker/core/offers/server_clock.dart';

/// The countdown is the one place in this app where being wrong costs a worker
/// a job, so it is tested against an injected clock rather than by waiting.
void main() {
  group('ServerClock', () {
    test('a phone that is behind still sees the right time left', () {
      // The device believes it is 12:00:00. The server says 12:00:30 — this
      // phone's clock is half a minute slow.
      final deviceNow = DateTime.utc(2026, 3, 1, 12);
      final serverNow = deviceNow.add(const Duration(seconds: 30));
      final deadline = serverNow.add(const Duration(seconds: 45));

      withClock(Clock.fixed(deviceNow), () {
        final serverClock = ServerClock()..sync(serverNow);

        // Naively, `deadline - deviceNow` is 75 seconds. The worker has 45.
        expect(serverClock.remaining(deadline), const Duration(seconds: 45));
        expect(serverClock.skew, const Duration(seconds: 30));
      });
    });

    test('a phone that is ahead does not show an offer as already dead', () {
      // The failure this prevents: a device 30s fast reports a fresh 45-second
      // offer as having 15 seconds left, and the worker loses a third of their
      // window to somebody else's clock.
      final deviceNow = DateTime.utc(2026, 3, 1, 12, 0, 30);
      final serverNow = DateTime.utc(2026, 3, 1, 12);
      final deadline = serverNow.add(const Duration(seconds: 45));

      withClock(Clock.fixed(deviceNow), () {
        final serverClock = ServerClock()..sync(serverNow);
        expect(serverClock.remaining(deadline), const Duration(seconds: 45));
        expect(serverClock.hasExpired(deadline), isFalse);
      });
    });

    test('half the round trip is credited back', () {
      // The timestamp was generated roughly half a round trip before it was
      // read here, so the naive difference over-reports how far behind we are.
      final deviceNow = DateTime.utc(2026, 3, 1, 12);
      final serverNow = deviceNow.add(const Duration(seconds: 10));

      withClock(Clock.fixed(deviceNow), () {
        final serverClock = ServerClock()
          ..sync(serverNow, roundTrip: const Duration(seconds: 4));
        // 10s apparent + 2s of one-way latency the payload spent in flight.
        expect(serverClock.skew, const Duration(seconds: 12));
      });
    });

    test('one slow response does not yank every live countdown', () {
      final deviceNow = DateTime.utc(2026, 3, 1, 12);

      withClock(Clock.fixed(deviceNow), () {
        final serverClock = ServerClock()..sync(deviceNow);
        expect(serverClock.skew, Duration.zero);

        // A single reading that sat behind a stalled radio for ten seconds.
        // Smoothed at 0.3, so it moves the estimate by three seconds, not ten.
        serverClock.sync(deviceNow.add(const Duration(seconds: 10)));
        expect(serverClock.skew, const Duration(seconds: 3));
      });
    });

    test('remaining never goes negative', () {
      final now = DateTime.utc(2026, 3, 1, 12);
      withClock(Clock.fixed(now), () {
        final serverClock = ServerClock()..sync(now);
        expect(serverClock.remaining(now.subtract(const Duration(minutes: 5))), Duration.zero);
        expect(serverClock.hasExpired(now.subtract(const Duration(seconds: 1))), isTrue);
      });
    });
  });

  group('urgency', () {
    test('turns to hurry at ten seconds, not before', () {
      expect(urgencyFor(const Duration(seconds: 11)), OfferUrgency.calm);
      expect(urgencyFor(const Duration(seconds: 10)), OfferUrgency.hurry);
      expect(urgencyFor(Duration.zero), OfferUrgency.hurry);
    });
  });
}
