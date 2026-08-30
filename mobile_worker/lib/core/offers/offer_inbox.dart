import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter/foundation.dart';
import 'package:gid_core/gid_core.dart';

import '../models/worker_models.dart';
import '../worker_api.dart';
import 'server_clock.dart';

/// Every path an offer can reach this app by, reconciled into one list.
///
/// WORKER_APP_PLAN 7.1. There are four, and on a good day three of them fire
/// for the same offer:
///
/// | App state       | Path                              |
/// |-----------------|-----------------------------------|
/// | Foreground      | socket `job:offered`              |
/// | Background      | FCM data message                  |
/// | Killed          | FCM data message, cold start      |
/// | After any gap   | `GET /workers/me/offers` on resume|
///
/// So the handler has to be idempotent, and it is: offers are keyed on
/// `offerId`, and [add] replaces rather than appends. The REST reconcile is
/// authoritative — it is the only path that can also tell us an offer we are
/// still showing is *gone*, which is what happens when a push arrives for an
/// offer another worker has already taken.
///
/// This class holds no UI. It is a list and a clock; the screen watches it.
class OfferInbox extends ChangeNotifier {
  OfferInbox({required WorkerApi api, required ServerClock clock})
      : _api = api,
        _clock = clock;

  final WorkerApi _api;
  final ServerClock _clock;

  final Map<String, JobOffer> _offers = {};
  StreamSubscription<void>? _socketSub;
  StreamSubscription<void>? _offerSub;
  StreamSubscription<void>? _revokeSub;
  Timer? _sweep;

  /// Offers still live, soonest deadline first — because that is the one the
  /// worker has to answer.
  List<JobOffer> get offers {
    final live = _offers.values.where((o) => !_clock.hasExpired(o.expiresAt)).toList()
      ..sort((a, b) => a.expiresAt.compareTo(b.expiresAt));
    return live;
  }

  /// The offer the full-screen interrupt is showing, or null.
  JobOffer? get current => offers.isEmpty ? null : offers.first;

  bool get hasOffer => current != null;

  /// Fires when an offer the worker was looking at is taken away, so the screen
  /// can say why rather than simply vanishing.
  final _revocations = StreamController<JobRevoked>.broadcast();
  Stream<JobRevoked> get revocations => _revocations.stream;

  /// Wire the socket. Called when the realtime connection is established, and
  /// again after every reconnect.
  void attachSocket(RealtimeService realtime) {
    _socketSub?.cancel();

    // A reconnect means there was a gap, and a gap means the socket may have
    // missed an offer entirely. Reconcile rather than assume.
    _socketSub = realtime.connectionState.listen((connected) {
      if (connected) unawaited(reconcile());
    });

    _offerSub?.cancel();
    _offerSub = realtime.jobOffers.listen((json) => add(JobOffer.fromJson(json)));

    _revokeSub?.cancel();
    _revokeSub = realtime.jobRevocations.listen((json) => remove(JobRevoked.fromJson(json)));
  }

  /// Take an offer from any path.
  ///
  /// Replaces rather than appends: the socket and the push carry the same
  /// payload, and the worker must see one countdown, not two.
  void add(JobOffer offer) {
    _clock.sync(offer.serverNow);
    if (_clock.hasExpired(offer.expiresAt)) return; // Arrived too late to answer.

    final existing = _offers[offer.offerId];
    _offers[offer.offerId] = offer;
    _startSweep();

    // Only notify on something genuinely new. A duplicate delivery must not
    // re-trigger the sound and the haptics.
    if (existing == null) notifyListeners();
  }

  /// Parse and add an offer that arrived inside an FCM data message.
  ///
  /// The whole payload is in the message precisely so a cold-started app on a
  /// bad connection can draw the offer without a network round trip it may not
  /// be able to make.
  JobOffer? addFromPushData(Map<String, dynamic> data) {
    final raw = data['offer'];
    if (raw is! String) return null;
    try {
      final json = decodeJsonObject(raw);
      if (json == null) return null;
      final offer = JobOffer.fromJson(json);
      add(offer);
      return offer;
    } catch (error, stack) {
      debugPrint('[offers] malformed push payload: $error\n$stack');
      return null;
    }
  }

  void remove(JobRevoked revoked) {
    final had = _offers.remove(revoked.offerId) != null;
    if (had) {
      _revocations.add(revoked);
      notifyListeners();
    }
  }

  /// Drop an offer this worker has answered. The server will also revoke it;
  /// removing it here means the screen closes on the tap rather than on the
  /// round trip.
  void resolveLocally(String offerId) {
    if (_offers.remove(offerId) != null) notifyListeners();
  }

  /// Ask the server what is actually live.
  ///
  /// The one authoritative path. Silently drops offers that expired while the
  /// app was asleep, and picks up any the socket missed. Failure is not fatal:
  /// a reconcile that cannot reach the server leaves the current list alone
  /// rather than clearing the screen, because an offer shown a moment too long
  /// is recoverable and an offer never shown is not.
  Future<void> reconcile() async {
    try {
      final result = await _api.liveOffers();
      _clock.sync(result.serverNow);

      final incoming = {for (final offer in result.offers) offer.offerId: offer};
      final vanished = _offers.keys.where((id) => !incoming.containsKey(id)).toList();

      _offers
        ..clear()
        ..addAll(incoming);

      for (final id in vanished) {
        _revocations.add(JobRevoked(offerId: id, bookingId: '', reason: RevokeReason.taken));
      }

      _startSweep();
      notifyListeners();
    } on ApiException catch (error) {
      debugPrint('[offers] reconcile failed (${error.statusCode}): ${error.message}');
    }
  }

  /// Answer an offer.
  ///
  /// Returns the outcome rather than throwing, because every one of these is a
  /// thing the screen has to say differently: accepted, gone, or "we could not
  /// reach the server — try again".
  Future<AcceptOutcome> accept(JobOffer offer) async {
    try {
      await _api.acceptOffer(offer.bookingId);
      resolveLocally(offer.offerId);
      return AcceptOutcome.accepted;
    } on ApiException catch (error) {
      if (error.code == 'OFFER_EXPIRED' || error.isConflict) {
        resolveLocally(offer.offerId);
        return AcceptOutcome.gone;
      }
      if (error.isNetwork) return AcceptOutcome.unreachable;
      return AcceptOutcome.failed;
    }
  }

  Future<void> decline(JobOffer offer, DeclineReason reason) async {
    // Removed first. The worker has decided, and the screen must not sit there
    // counting down while the request travels.
    resolveLocally(offer.offerId);
    try {
      await _api.declineOffer(offer.bookingId, reason);
    } on ApiException catch (error) {
      // A decline that fails to send is not worth interrupting anyone about:
      // the 45-second timer expires on the server and reassigns the job either
      // way. The only loss is the reason code, which is analytics.
      debugPrint('[offers] decline not delivered: ${error.message}');
    }
  }

  /// One timer for the whole inbox, ticking only while something is live.
  ///
  /// A per-offer timer would keep the radio and the CPU awake between jobs,
  /// which on the phones this app is built for is a battery problem the worker
  /// notices by four in the afternoon.
  void _startSweep() {
    if (_sweep != null || _offers.isEmpty) return;
    _sweep = Timer.periodic(const Duration(seconds: 1), (_) {
      final expired = _offers.values.where((o) => _clock.hasExpired(o.expiresAt)).toList();
      for (final offer in expired) {
        _offers.remove(offer.offerId);
        _revocations.add(
          JobRevoked(offerId: offer.offerId, bookingId: offer.bookingId, reason: RevokeReason.timeout),
        );
      }
      if (expired.isNotEmpty) notifyListeners();
      if (_offers.isEmpty) {
        _sweep?.cancel();
        _sweep = null;
      }
    });
  }

  @override
  void dispose() {
    _socketSub?.cancel();
    _offerSub?.cancel();
    _revokeSub?.cancel();
    _sweep?.cancel();
    _revocations.close();
    super.dispose();
  }
}

enum AcceptOutcome {
  accepted,

  /// The window closed, or another worker won the race. The screen says "this
  /// job went to someone else" — never a generic error, which reads as the app
  /// having lost the worker the job.
  gone,

  /// The request never reached the server. Worth a retry while time remains.
  unreachable,

  failed,
}

/// How urgent a countdown looks.
///
/// The ring turns `danger` under ten seconds and pulses. That is the only place
/// in either app where `danger` means "hurry" rather than "destructive", and it
/// is deliberate: at ten seconds the worker needs to be told with colour, not
/// with a number they have to read.
enum OfferUrgency { calm, hurry }

OfferUrgency urgencyFor(Duration remaining) =>
    remaining <= const Duration(seconds: 10) ? OfferUrgency.hurry : OfferUrgency.calm;

/// A tick source for the countdown ring, driven by [clock] so tests can wind it.
Stream<Duration> countdown(DateTime deadline, ServerClock serverClock) async* {
  while (true) {
    final left = serverClock.remaining(deadline);
    yield left;
    if (left == Duration.zero) return;
    // 100ms, not 1s: the ring sweeps continuously, and a one-second step reads
    // as a stutter on the one screen where the animation is the message.
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
}
