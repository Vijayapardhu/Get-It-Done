import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:gid_core/gid_core.dart';

import 'config/worker_config.dart';
import 'location/location_pump.dart';
import 'location/location_service.dart';
import 'models/worker_models.dart';
import 'notifications/offer_notifications.dart';
import 'offers/offer_inbox.dart';
import 'offers/server_clock.dart';
import 'queue/action_queue.dart';
import 'worker_api.dart';

/// Composition root.
///
/// Nothing constructs a client, a socket or a queue for itself; every layer is
/// resolved here so a test can replace any one of them with a single
/// `overrideWithValue`.
///
/// The shape mirrors the customer app deliberately. What differs is what the
/// lifetimes are tied to: the customer's socket connects on sign-in, and this
/// one connects on sign-in *and stays connected while on duty*, because an
/// offer arriving to a disconnected socket is income lost.

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());
final userStoreProvider = Provider<UserStore>((ref) => UserStore());

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(
    tokenStore: ref.watch(tokenStoreProvider),
    baseUrl: ref.watch(serverUrlProvider),
  );
  client.onSessionExpired = () => ref.read(authProvider.notifier).forceSignOut();
  ref.onDispose(client.close);
  return client;
});

/// The shared surface: auth, notifications, chat, support, languages, maps.
final sharedApiProvider = Provider<GidApi>((ref) => GidApi(ref.watch(apiClientProvider)));

/// The worker-only surface, on the same client and therefore the same refresh
/// queue.
final workerApiProvider = Provider<WorkerApi>((ref) => WorkerApi(ref.watch(apiClientProvider)));

// ─────────────────────────────────────────────────────────────── auth ──

enum AuthStatus { unknown, authenticated, unauthenticated }

@immutable
class AuthState {
  const AuthState({required this.status, this.user});
  final AuthStatus status;
  final AppUser? user;

  bool get isAuthenticated => status == AuthStatus.authenticated;
  bool get isResolved => status != AuthStatus.unknown;

  /// The account exists but the worker profile behind it may not. Onboarding is
  /// six steps on a 2G connection and nobody finishes it in one sitting, so
  /// "signed in" and "ready to work" are separate questions — see
  /// [workerProfileProvider] and the root gate in app.dart.
  AuthState copyWith({AuthStatus? status, AppUser? user}) =>
      AuthState(status: status ?? this.status, user: user ?? this.user);
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    unawaited(_restore());
    return const AuthState(status: AuthStatus.unknown);
  }

  Future<void> _restore() async {
    final tokens = ref.read(tokenStoreProvider);
    final token = await tokens.accessToken;
    if (token == null) {
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }

    // Open on the cached user rather than on a spinner. A worker starting a
    // shift on a train should see Today immediately; `me()` corrects it a
    // moment later if anything changed.
    final cached = await ref.read(userStoreProvider).read();
    if (cached != null) state = AuthState(status: AuthStatus.authenticated, user: cached);

    try {
      final user = await ref.read(sharedApiProvider).me();
      await ref.read(userStoreProvider).write(user);
      state = AuthState(status: AuthStatus.authenticated, user: user);
    } on ApiException catch (error) {
      if (error.isUnauthorized) {
        await forceSignOut();
      } else if (cached == null) {
        // Network failure with nothing cached: there is nothing honest to show
        // but the sign-in screen.
        state = const AuthState(status: AuthStatus.unauthenticated);
      }
    }
  }

  Future<void> signIn({required String identifier, required String password}) async {
    final session = await ref.read(sharedApiProvider).login(identifier: identifier, password: password);
    await _adopt(session);
  }

  Future<void> register({
    required String name,
    required String email,
    required String phone,
    required String password,
  }) async {
    final session = await ref.read(sharedApiProvider).register(
          name: name,
          email: email,
          phone: phone,
          password: password,
          // The one field that makes this a worker account rather than a
          // customer one. Everything downstream -- which routes answer, which
          // rooms the socket joins -- follows from it.
          role: 'worker',
        );
    await _adopt(session);
  }

  Future<void> signInWithGoogle(String idToken) async {
    // `worker`, not the default. Google cannot ask which side of the platform
    // the person is on, so the app that owns the button has to say — and an
    // account created as a customer cannot reach one worker route, which is
    // exactly the "Insufficient permissions" wall this used to produce.
    final session = await ref.read(sharedApiProvider).signInWithGoogle(idToken, role: 'worker');
    await _adopt(session);
  }

  /// Convert a customer-role account into a worker account.
  ///
  /// The way out of the dead end an account created on the customer side lands
  /// in. The server refuses an account that has already booked work, so the
  /// failure is worth showing rather than swallowing.
  Future<void> becomeWorker() async {
    final user = await ref.read(sharedApiProvider).becomeWorker();
    await ref.read(userStoreProvider).write(user);
    state = AuthState(status: AuthStatus.authenticated, user: user);
    // The gates downstream key off the worker profile, which is 403 → null
    // while the account is not a worker. Re-ask now that it is.
    ref.invalidate(workerProfileProvider);
    ref.invalidate(verificationStatusProvider);
  }

  Future<void> _adopt(AuthSession session) async {
    await ref.read(tokenStoreProvider).save(
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
        );
    await ref.read(userStoreProvider).write(session.user);
    state = AuthState(status: AuthStatus.authenticated, user: session.user);
  }

  Future<void> signOut() async {
    // Go off duty first, and wait for it. Signing out while `available` would
    // leave a worker matchable by a server that has no way to reach them, and
    // the customer finds out by nobody arriving.
    try {
      await ref.read(workerApiProvider).setDuty(DutyStatus.offline);
    } on ApiException catch (error) {
      debugPrint('[auth] could not go offline before sign-out: ${error.message}');
    }

    final refresh = await ref.read(tokenStoreProvider).refreshToken;
    if (refresh != null) {
      try {
        await ref.read(sharedApiProvider).logout(refresh);
      } on ApiException {
        // A revoke that could not be delivered still clears the device.
      }
    }
    await forceSignOut();
  }

  Future<void> forceSignOut() async {
    await ref.read(tokenStoreProvider).clear();
    await ref.read(userStoreProvider).clear();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}

final authProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

// ─────────────────────────────────────────────────────────── realtime ──

final serverClockProvider = Provider<ServerClock>((ref) {
  final clock = ServerClock();
  ref.onDispose(clock.dispose);
  return clock;
});

final realtimeProvider = Provider<RealtimeService>((ref) {
  final service = RealtimeService(ref.watch(tokenStoreProvider), baseUrl: ref.watch(serverUrlProvider));

  // Only connect the socket for authenticated workers with a profile.
  // Customer accounts and onboarding users shouldn't join worker socket rooms.
  ref.listen(workerProfileProvider, (previous, next) {
    final profile = next.value;
    if (profile != null) {
      unawaited(service.connect());
    } else {
      service.disconnect();
    }
  }, fireImmediately: true);

  ref.onDispose(service.dispose);
  return service;
});

/// The offer inbox: the one object this whole app is arranged around.
final offerInboxProvider = ChangeNotifierProvider<OfferInbox>((ref) {
  final inbox = OfferInbox(
    api: ref.watch(workerApiProvider),
    clock: ref.watch(serverClockProvider),
  );
  inbox.attachSocket(ref.watch(realtimeProvider));

  // Reconcile on sign-in: a worker who reinstalled, or signed in on a second
  // device, may have a live offer already waiting.
  // But ONLY if they have a worker profile — customer accounts get 403 on
  // /workers/me/offers, and onboarding hasn't created one yet.
  ref.listen(workerProfileProvider, (previous, next) {
    final profile = next.value;
    if (profile != null) unawaited(inbox.reconcile());
  }, fireImmediately: true);

  return inbox;
});

// ────────────────────────────────────────────────── queue and location ──

final actionQueueProvider = Provider<ActionQueue>((ref) {
  final queue = ActionQueue(client: ref.watch(apiClientProvider));
  unawaited(queue.start());
  ref.onDispose(() => unawaited(queue.dispose()));
  return queue;
});

final locationPumpProvider = Provider<LocationPump>((ref) {
  final pump = LocationPump(api: ref.watch(workerApiProvider));
  ref.onDispose(pump.dispose);
  return pump;
});

/// The foreground service that keeps the location pump alive when the app is
/// backgrounded on Android. Started when the worker goes on duty, stopped when
/// they go off.
final locationForegroundServiceProvider = Provider<LocationForegroundService>(
  (ref) => LocationForegroundService(),
);

// ─────────────────────────────────────────────────────── notifications ──

final localNotificationsProvider = Provider<FlutterLocalNotificationsPlugin>(
  (ref) => FlutterLocalNotificationsPlugin(),
);

final offerNotificationsProvider = Provider<OfferNotifications>(
  (ref) => OfferNotifications(ref.watch(localNotificationsProvider)),
);

// ───────────────────────────────────────────────────────────── the self ──

/// The worker profile behind the account.
///
/// Nullable on purpose: an account can exist without one, which is exactly the
/// state a half-finished onboarding leaves behind, and the root gate routes on
/// it rather than on the auth state alone.
///
/// A 403 is folded into the same null. `/workers/me` is guarded by role, so a
/// customer-role account gets "Insufficient permissions" here — and letting that
/// escape put the backend's guard message on the worker's screen with nothing
/// they could do about it. The account-type gate in app.dart is the one place
/// that explains it, and it needs this to resolve rather than throw.
final workerProfileProvider = FutureProvider<WorkerProfile?>((ref) async {
  final auth = ref.watch(authProvider);
  if (!auth.isAuthenticated) return null;
  if (auth.user != null && !auth.user!.isWorker) return null;
  try {
    return await ref.watch(workerApiProvider).profile();
  } on ApiException catch (error) {
    if (error.isNotFound || error.isForbidden) return null;
    rethrow;
  }
});

final verificationStatusProvider = FutureProvider<VerificationStatus?>((ref) async {
  final auth = ref.watch(authProvider);
  if (!auth.isAuthenticated) return null;
  if (auth.user != null && !auth.user!.isWorker) return null;
  try {
    return await ref.watch(workerApiProvider).verificationStatus();
  } on ApiException catch (error) {
    if (error.isNotFound || error.isForbidden) return null;
    rethrow;
  }
});

/// Duty status, and the location cadence that follows from it.
///
/// The two are one control deliberately. Going off duty that left the pump
/// running would be the app breaking the promise the toggle makes.
class DutyController extends Notifier<DutyStatus> {
  @override
  DutyStatus build() {
    ref.listen(workerProfileProvider, (previous, next) {
      final profile = next.value;
      if (profile != null) state = profile.currentStatus;
    });
    return DutyStatus.offline;
  }

  Future<void> set(DutyStatus next) async {
    final previous = state;
    state = next; // Optimistic: the toggle must move under the thumb.
    try {
      final confirmed = await ref.read(workerApiProvider).setDuty(next);
      state = confirmed;
      _applyCadence(confirmed);
    } on ApiException {
      state = previous;
      rethrow;
    }
  }

  void _applyCadence(DutyStatus status) {
    final pump = ref.read(locationPumpProvider);
    final fgService = ref.read(locationForegroundServiceProvider);
    final cadence = status.isOnDuty ? PumpCadence.idle : PumpCadence.off;
    pump.setCadence(cadence);

    // Start the foreground service when going on duty (keeps the pump alive
    // when backgrounded on Android), stop when going off.
    if (status.isOnDuty) {
      unawaited(fgService.start());
    } else {
      unawaited(fgService.stop());
    }
  }
}

final dutyProvider = NotifierProvider<DutyController, DutyStatus>(DutyController.new);

// ────────────────────────────────────────────────────────────── the work ──

final upcomingJobsProvider = FutureProvider<List<WorkerJob>>(
  (ref) => ref.watch(workerApiProvider).upcomingJobs(),
);

final jobHistoryProvider = FutureProvider<List<WorkerJob>>(
  (ref) => ref.watch(workerApiProvider).jobHistory(),
);

/// The job the worker is on right now, or null between jobs.
///
/// Derived rather than stored: the server is the authority on which booking is
/// live, and a second copy of that fact is a second thing to get wrong.
final activeJobProvider = FutureProvider<WorkerJob?>((ref) async {
  final jobs = await ref.watch(upcomingJobsProvider.future);
  const live = {'accepted', 'en_route', 'arrived', 'started'};
  for (final job in jobs) {
    if (live.contains(job.status)) return job;
  }
  return null;
});

final earningsSummaryProvider = FutureProvider<EarningsSummary>(
  (ref) => ref.watch(workerApiProvider).earningsSummary(),
);

final ledgerProvider = FutureProvider<List<LedgerEntry>>(
  (ref) => ref.watch(workerApiProvider).ledger(),
);

final statisticsProvider = FutureProvider<WorkerStatistics>(
  (ref) => ref.watch(workerApiProvider).statistics(),
);

final reviewsProvider = FutureProvider<List<ReviewReceived>>(
  (ref) => ref.watch(workerApiProvider).reviews(),
);

final scheduleProvider = FutureProvider<({List<ScheduleEntry> schedule, bool onShift})>(
  (ref) => ref.watch(workerApiProvider).schedule(),
);

final timeOffProvider = FutureProvider<List<TimeOff>>(
  (ref) => ref.watch(workerApiProvider).timeOff(),
);

final offerPreferencesProvider = FutureProvider<OfferPreferences>(
  (ref) => ref.watch(workerApiProvider).preferences(),
);

final notificationsProvider = FutureProvider<List<AppNotification>>(
  (ref) => ref.watch(sharedApiProvider).notifications(),
);

final payoutPreviewProvider = FutureProvider.family<PayoutPreview, String>(
  (ref, bookingId) => ref.watch(workerApiProvider).payoutPreview(bookingId),
);

final welfareProvider = FutureProvider<WelfarePassport?>((ref) async {
  if (!ref.watch(authProvider).isAuthenticated) return null;
  try {
    return await ref.watch(workerApiProvider).welfare();
  } on ApiException {
    return null;
  }
});

final blockedCustomersProvider = FutureProvider<List<BlockedCustomer>>(
  (ref) => ref.watch(workerApiProvider).blockedCustomers(),
);

final orderContextProvider =
    FutureProvider.family<({List<OrderSibling> siblings, String? contactName, String? contactPhone}), String>(
  (ref, bookingId) => ref.watch(workerApiProvider).orderContext(bookingId),
);

// ──────────────────────────────────────────────── chat, support, payouts ──

final chatsProvider = FutureProvider<List<Json>>(
  (ref) => ref.watch(workerApiProvider).chats(),
);

final supportTicketsProvider = FutureProvider<List<Json>>(
  (ref) => ref.watch(workerApiProvider).supportTickets(),
);

final payoutsProvider = FutureProvider<List<Json>>(
  (ref) => ref.watch(workerApiProvider).payouts(),
);

final statementsProvider = FutureProvider<List<Json>>(
  (ref) => ref.watch(workerApiProvider).statements(),
);

