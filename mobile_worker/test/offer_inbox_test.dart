import 'package:clock/clock.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gid_core/gid_core.dart';
import 'package:getitdone_worker/core/models/worker_models.dart';
import 'package:getitdone_worker/core/offers/offer_inbox.dart';
import 'package:getitdone_worker/core/offers/server_clock.dart';
import 'package:getitdone_worker/core/worker_api.dart';

/// The inbox has to be idempotent, because on a good day three delivery paths
/// fire for the same offer. These are the cases that cost a worker money when
/// they are wrong.
void main() {
  final now = DateTime.utc(2026, 3, 1, 12);

  Json offerJson({
    String id = 'offer-1',
    String bookingId = 'booking-1',
    int secondsLeft = 45,
    double payout = 412,
  }) =>
      {
        'offerId': id,
        'bookingId': bookingId,
        'orderId': null,
        'service': {'id': 'svc-1', 'name': 'Tap repair', 'category': 'plumbing'},
        'scheduledAt': null,
        'durationMinutes': 60,
        'isEmergency': false,
        'area': 'Kukatpally',
        'distanceKm': 3.4,
        'etaMinutes': 12,
        'payout': payout,
        'customerTotal': 500,
        'expiresAt': now.add(Duration(seconds: secondsLeft)).toIso8601String(),
        'serverNow': now.toIso8601String(),
        'attempt': 1,
      };

  OfferInbox build() => OfferInbox(
        api: WorkerApi(ApiClient(tokenStore: TokenStore(), baseUrl: 'http://localhost')),
        clock: ServerClock()..sync(now),
      );

  test('the same offer delivered twice is one offer, and notifies once', () {
    withClock(Clock.fixed(now), () {
      final inbox = build();
      var notifications = 0;
      inbox.addListener(() => notifications++);

      // Socket first, then the FCM data message carrying the same payload.
      inbox.add(JobOffer.fromJson(offerJson()));
      inbox.add(JobOffer.fromJson(offerJson()));

      expect(inbox.offers, hasLength(1));
      // The second delivery must not re-trigger the sound and the haptics.
      expect(notifications, 1);
    });
  });

  test('an offer that arrived too late to answer is dropped, not shown', () {
    withClock(Clock.fixed(now), () {
      final inbox = build();
      inbox.add(JobOffer.fromJson(offerJson(secondsLeft: -1)));
      expect(inbox.offers, isEmpty);
      expect(inbox.hasOffer, isFalse);
    });
  });

  test('the soonest deadline is the one on screen', () {
    withClock(Clock.fixed(now), () {
      final inbox = build();
      inbox.add(JobOffer.fromJson(offerJson(id: 'later', secondsLeft: 40)));
      inbox.add(JobOffer.fromJson(offerJson(id: 'sooner', bookingId: 'b2', secondsLeft: 12)));

      // Two live offers is rare but real; the one about to lapse is the one the
      // worker has to answer.
      expect(inbox.current!.offerId, 'sooner');
    });
  });

  test('a revocation clears the screen and says why', () async {
    await withClock(Clock.fixed(now), () async {
      final inbox = build();
      inbox.add(JobOffer.fromJson(offerJson()));

      final revoked = inbox.revocations.first;
      inbox.remove(const JobRevoked(
        offerId: 'offer-1',
        bookingId: 'booking-1',
        reason: RevokeReason.taken,
      ));

      expect(inbox.offers, isEmpty);
      expect((await revoked).reason, RevokeReason.taken);
    });
  });

  test('an offer whose window closed stops being live without any tick', () {
    final inbox = withClock(Clock.fixed(now), () {
      final built = build();
      built.add(JobOffer.fromJson(offerJson(secondsLeft: 45)));
      expect(built.offers, hasLength(1));
      return built;
    });

    // Fifty seconds later, the same object reports nothing live: the getter
    // filters on the server clock rather than trusting the sweep timer to have
    // run. A phone that was asleep does not get to show a dead offer.
    withClock(Clock.fixed(now.add(const Duration(seconds: 50))), () {
      expect(inbox.offers, isEmpty);
      expect(inbox.current, isNull);
    });
  });

  test('a push payload with no offer blob is ignored rather than crashing', () {
    withClock(Clock.fixed(now), () {
      final inbox = build();
      expect(inbox.addFromPushData({'type': 'job_offer'}), isNull);
      expect(inbox.addFromPushData({'type': 'job_offer', 'offer': 'not json'}), isNull);
      expect(inbox.offers, isEmpty);
    });
  });
}
