import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:gid_core/gid_core.dart';
import 'package:geolocator/geolocator.dart';

import '../worker_api.dart';

/// Where the worker is, batched and drained.
///
/// WORKER_APP_PLAN 4.7 and 7.2. Two problems this solves at once:
///
///  * A single `PUT /workers/me/location` per fix drops everything taken in a
///    lift, a basement or a 2G dead zone, and the customer's tracking map
///    freezes with no way to catch up. Fixes accumulate here and go out as an
///    ordered batch.
///  * A fix every few seconds all day flattens the battery of exactly the cheap
///    phone this app is built for. The cadence therefore follows what the
///    worker is doing, not a constant.
///
/// | State        | Interval | Why                                        |
/// |--------------|----------|--------------------------------------------|
/// | idle, online | 120s     | Matching needs a rough position, not a trail|
/// | en route     | 10s      | The customer is watching a map move        |
/// | on site      | 60s      | Enough to show presence; the worker is still|
/// | off duty     | never    | The app is not watching them off shift     |
///
/// The last row is a promise, not an optimisation. A worker must be able to
/// prove to themselves that going offline stops it completely.
enum PumpCadence {
  /// Off duty. Nothing is collected and nothing is sent.
  off(null, 0),

  /// On duty, between jobs.
  idle(Duration(seconds: 120), 100),

  /// Travelling to a job the customer is tracking.
  enRoute(Duration(seconds: 10), 25),

  /// At the address, working.
  onSite(Duration(seconds: 60), 50);

  const PumpCadence(this.interval, this.distanceFilterM);
  final Duration? interval;

  /// A stationary worker should not burn battery re-reporting the same corner.
  final int distanceFilterM;
}

class LocationPump {
  LocationPump({required WorkerApi api}) : _api = api;

  final WorkerApi _api;

  final List<Json> _buffer = [];
  Timer? _timer;
  PumpCadence _cadence = PumpCadence.off;
  String? _bookingId;
  Position? _lastSent;
  bool _sending = false;

  PumpCadence get cadence => _cadence;

  /// How many fixes are waiting to go out. Shown alongside the offline banner:
  /// a worker who can see the app is holding a trail understands why the
  /// customer's map lagged, and one who cannot assumes it is broken.
  int get bufferedFixes => _buffer.length;

  /// Change what the pump is doing.
  ///
  /// [bookingId] tags the trail so a dispute over one job can be read without
  /// reconstructing it from a day of fixes.
  void setCadence(PumpCadence cadence, {String? bookingId}) {
    if (_cadence == cadence && _bookingId == bookingId) return;
    _cadence = cadence;
    _bookingId = bookingId;
    _timer?.cancel();
    _timer = null;

    if (cadence == PumpCadence.off) {
      // Flush whatever is held, then stop. Discarding the tail of a job's trail
      // because the worker went off duty a minute later would lose exactly the
      // fixes an arrival dispute turns on.
      unawaited(flush());
      return;
    }

    _timer = Timer.periodic(cadence.interval!, (_) => unawaited(_tick()));
    unawaited(_tick());
  }

  /// Ask for permission, honestly.
  ///
  /// Foreground only. `ACCESS_BACKGROUND_LOCATION` is deliberately not
  /// requested: tracking a worker between jobs buys very little and makes the
  /// Play review materially harder, and it is not a thing this app should be
  /// able to do.
  Future<bool> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    return permission == LocationPermission.always || permission == LocationPermission.whileInUse;
  }

  Future<void> _tick() async {
    if (_cadence == PumpCadence.off) return;

    Position position;
    try {
      position = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          accuracy: _cadence == PumpCadence.enRoute ? LocationAccuracy.high : LocationAccuracy.medium,
          distanceFilter: _cadence.distanceFilterM,
        ),
      );
    } catch (error) {
      // No fix available — indoors, or the radio is busy. Not an error worth
      // surfacing; the next tick tries again.
      debugPrint('[location] no fix: $error');
      return;
    }

    // The distance filter is advisory on some platforms, so it is enforced here
    // too. A worker sitting in a van for an hour should produce one fix, not
    // sixty identical ones.
    if (_lastSent != null && _cadence != PumpCadence.enRoute) {
      final moved = Geolocator.distanceBetween(
        _lastSent!.latitude,
        _lastSent!.longitude,
        position.latitude,
        position.longitude,
      );
      if (moved < _cadence.distanceFilterM) return;
    }

    _buffer.add({
      'latitude': position.latitude,
      'longitude': position.longitude,
      'accuracy': position.accuracy,
      // Sent honestly. The server stores it, refuses to stamp an arrival on it,
      // and flags the worker for review -- see WORKER_APP_PLAN 4.9. Hiding it
      // client-side would only mean the fraud is invisible rather than absent.
      'isMocked': position.isMocked,
      'recordedAt': position.timestamp.toUtc().toIso8601String(),
    });
    _lastSent = position;

    // Send eagerly while connected; the buffer only grows when the network is
    // gone, which is exactly when it should.
    await flush();
  }

  /// Push everything held. Keeps the buffer on failure so nothing is lost.
  Future<void> flush() async {
    if (_sending || _buffer.isEmpty) return;
    _sending = true;
    final batch = List<Json>.from(_buffer);
    try {
      await _api.pushLocations(batch, bookingId: _bookingId);
      _buffer.removeRange(0, batch.length);
    } on ApiException catch (error) {
      debugPrint('[location] batch not delivered (${error.statusCode}); holding ${_buffer.length} fixes');
      // Bounded, so a phone that spends a day out of coverage does not
      // accumulate an unsendable megabyte. The oldest fixes go first: the
      // recent trail is what a customer's map and an arrival dispute need.
      const cap = 500;
      if (_buffer.length > cap) _buffer.removeRange(0, _buffer.length - cap);
    } finally {
      _sending = false;
    }
  }

  /// A single fix, right now, for stamping an arrival.
  ///
  /// Not taken from the buffer: arrival is the one position that gates the OTP
  /// and therefore the money, and it must be a reading taken at the moment the
  /// worker said they were there.
  Future<Position?> currentFix() async {
    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.best),
      );
    } catch (error) {
      debugPrint('[location] arrival fix failed: $error');
      return null;
    }
  }

  void dispose() {
    _timer?.cancel();
    _timer = null;
  }
}
