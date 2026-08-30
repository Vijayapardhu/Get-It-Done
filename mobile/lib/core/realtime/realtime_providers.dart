import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';

import '../config/server_config.dart';
import '../providers.dart';

/// Where the socket is wired into this app's composition root.
///
/// [RealtimeService] itself lives in `gid_core`: it knows about rooms, events
/// and reconnection, and nothing about who is signed in. Both apps hold one,
/// and each decides for itself when to connect -- which for the customer app is
/// "while signed in", and for the worker app is also "while on duty".

final realtimeServiceProvider = Provider<RealtimeService>((ref) {
  final service = RealtimeService(
    ref.watch(tokenStoreProvider),
    baseUrl: ref.watch(serverUrlProvider),
  );

  // Connect only while signed in, and rebuild the socket when the session
  // changes so it never carries a previous user's credential.
  ref.listen(authControllerProvider, (previous, next) {
    if (next.isAuthenticated && previous?.isAuthenticated != true) {
      service.connect();
    } else if (!next.isAuthenticated) {
      service.disconnect();
    }
  }, fireImmediately: true);

  ref.onDispose(service.dispose);
  return service;
});

/// Live status for one booking, seeded by nothing and updated by the socket.
final bookingStatusStreamProvider =
    StreamProvider.autoDispose.family<BookingStatusEvent, String>((ref, bookingId) {
  final service = ref.watch(realtimeServiceProvider);
  service.joinBooking(bookingId);
  ref.onDispose(() => service.leaveBooking(bookingId));

  return service.statusChanges.where((event) => event.bookingId == bookingId);
});

final workerLocationStreamProvider =
    StreamProvider.autoDispose.family<WorkerLocationEvent, String>((ref, bookingId) {
  final service = ref.watch(realtimeServiceProvider);
  service.joinBooking(bookingId);
  ref.onDispose(() => service.leaveBooking(bookingId));

  return service.workerLocations;
});

final realtimeConnectedProvider = StreamProvider<bool>((ref) {
  return ref.watch(realtimeServiceProvider).connectionState;
});
