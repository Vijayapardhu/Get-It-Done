import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/app_config.dart';
import '../network/json.dart';
import '../storage/token_store.dart';

/// Socket.IO client.
///
/// The backend authenticates the handshake with the JWT in `auth.token` and
/// places every socket in `user:{id}`. A booking room must be joined
/// explicitly by emitting `join:booking` — that is where status changes and the
/// assigned worker's position are delivered.
///
/// Rooms and events, from backend/src/core/realtime.ts:
///   user:{id}      -> notification:new
///   booking:{id}   -> booking:status_changed, worker:location:update
class RealtimeService {
  RealtimeService(this._tokenStore, {String? baseUrl})
      : _baseUrl = baseUrl ?? AppConfig.realtimeUrl;

  final TokenStore _tokenStore;

  /// The host this socket connects to. Passed in rather than read from
  /// AppConfig at connect time so that changing the server in developer
  /// settings rebuilds the service against the new one, exactly as it rebuilds
  /// the HTTP client.
  final String _baseUrl;

  io.Socket? _socket;

  /// Rooms we want to be in. Re-joined after every reconnect, because the
  /// server has no memory of a socket that dropped.
  final Set<String> _bookingRooms = {};

  final _statusChanges = StreamController<BookingStatusEvent>.broadcast();
  final _workerLocations = StreamController<WorkerLocationEvent>.broadcast();
  final _notifications = StreamController<Map<String, dynamic>>.broadcast();
  final _connection = StreamController<bool>.broadcast();

  /// Worker-only rooms. A customer socket is never sent these, so both apps can
  /// hold the same service and only one of them ever sees traffic on them.
  final _jobOffers = StreamController<Map<String, dynamic>>.broadcast();
  final _jobRevocations = StreamController<Map<String, dynamic>>.broadcast();
  final _jobUpdates = StreamController<Map<String, dynamic>>.broadcast();

  Stream<BookingStatusEvent> get statusChanges => _statusChanges.stream;
  Stream<WorkerLocationEvent> get workerLocations => _workerLocations.stream;
  Stream<Map<String, dynamic>> get notifications => _notifications.stream;
  Stream<bool> get connectionState => _connection.stream;

  /// `job:offered` — a job is being offered to this worker right now, with a
  /// server deadline on it. The single highest-stakes event on the platform:
  /// see WORKER_APP_PLAN 4.1 and the worker app's OfferInbox.
  Stream<Map<String, dynamic>> get jobOffers => _jobOffers.stream;

  /// `job:revoked` — that offer is off the table. Without it a worker counts
  /// down on a job somebody else already accepted.
  Stream<Map<String, dynamic>> get jobRevocations => _jobRevocations.stream;

  /// `job:updated` — a change to a booking this worker holds: an extension
  /// approved, a cancellation, a customer note.
  Stream<Map<String, dynamic>> get jobUpdates => _jobUpdates.stream;

  bool get isConnected => _socket?.connected ?? false;

  Future<void> connect() async {
    if (_socket != null) return;

    final token = await _tokenStore.accessToken;
    if (token == null) return;

    final socket = io.io(
      _baseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          // Manual: the token has to be attached first, and a 15-minute access
          // token means the handshake credential must be refreshed on reconnect.
          .disableAutoConnect()
          .setAuth({'token': token})
          .setReconnectionAttempts(999)
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(10000)
          .build(),
    );

    socket.onConnect((_) {
      _connection.add(true);
      // Rejoin every room: a reconnected socket is a NEW socket server-side and
      // is a member of nothing but its user room.
      for (final bookingId in _bookingRooms) {
        socket.emit('join:booking', bookingId);
      }
    });

    socket.onDisconnect((_) => _connection.add(false));

    socket.onConnectError((error) {
      _connection.add(false);
      if (kDebugMode) debugPrint('[socket] connect error: $error');
    });

    socket.on('booking:status_changed', (data) {
      final json = asJson(data);
      if (json == null) return;
      _statusChanges.add(BookingStatusEvent.fromJson(json));
    });

    socket.on('worker:location:update', (data) {
      final json = asJson(data);
      if (json == null) return;
      _workerLocations.add(WorkerLocationEvent.fromJson(json));
    });

    socket.on('notification:new', (data) {
      final json = asJson(data);
      if (json != null) _notifications.add(json);
    });

    socket.on('job:offered', (data) {
      final json = asJson(data);
      if (json != null) _jobOffers.add(json);
    });

    socket.on('job:revoked', (data) {
      final json = asJson(data);
      if (json != null) _jobRevocations.add(json);
    });

    socket.on('job:updated', (data) {
      final json = asJson(data);
      if (json != null) _jobUpdates.add(json);
    });

    _socket = socket;
    socket.connect();
  }

  /// Subscribe to one booking's room.
  void joinBooking(String bookingId) {
    _bookingRooms.add(bookingId);
    _socket?.emit('join:booking', bookingId);
  }

  void leaveBooking(String bookingId) {
    _bookingRooms.remove(bookingId);
    _socket?.emit('leave:booking', bookingId);
  }

  /// Reconnect with a fresh credential.
  ///
  /// Called after a token refresh: the handshake auth is evaluated once at
  /// connect time, so a socket established with an expired token stays
  /// authenticated until it drops and then fails to come back.
  Future<void> reauthenticate() async {
    disconnect();
    await connect();
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _connection.add(false);
  }

  void dispose() {
    disconnect();
    _statusChanges.close();
    _workerLocations.close();
    _notifications.close();
    _connection.close();
    _jobOffers.close();
    _jobRevocations.close();
    _jobUpdates.close();
  }
}

@immutable
class BookingStatusEvent {
  const BookingStatusEvent({
    required this.bookingId,
    required this.status,
    this.startOtp,
    this.completionOtp,
  });

  final String bookingId;
  final String status;

  /// Present only on the 'arrived' event, and only in the copy pushed to the
  /// customer's own private room -- see workerApp.ts POST /bookings/:id/arrived.
  /// The handshake codes are minted fresh at arrival, which is what makes this
  /// the one reliable way to have them: whatever this device cached from
  /// booking creation may be long gone, wrong, or never existed here at all.
  final String? startOtp;
  final String? completionOtp;

  factory BookingStatusEvent.fromJson(Json json) => BookingStatusEvent(
        bookingId: asString(pick(json, 'id', aliases: ['bookingId', 'booking_id'])),
        status: asString(pick(json, 'status')),
        startOtp: asStringOrNull(pick(json, 'startOtp')),
        completionOtp: asStringOrNull(pick(json, 'completionOtp')),
      );
}

@immutable
class WorkerLocationEvent {
  const WorkerLocationEvent({
    required this.workerId,
    required this.latitude,
    required this.longitude,
    this.at,
  });

  final String workerId;
  final double latitude;
  final double longitude;
  final DateTime? at;

  factory WorkerLocationEvent.fromJson(Json json) => WorkerLocationEvent(
        workerId: asString(pick(json, 'workerId', aliases: ['userId'])),
        latitude: asDouble(pick(json, 'latitude', aliases: ['lat'])),
        longitude: asDouble(pick(json, 'longitude', aliases: ['lng'])),
        at: asDateOrNull(pick(json, 'at')),
      );
}
