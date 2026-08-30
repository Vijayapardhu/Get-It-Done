import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:gid_core/gid_core.dart';
import 'auth/google_auth_service.dart';
import 'config/server_config.dart';

/// Composition root.
///
/// Every dependency is resolved here so screens never construct a client, and
/// tests can override any layer with one `overrideWithValue`.

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

/// Handshake codes for bookings placed on this device. See [OtpStore] for why
/// the app has to keep them rather than asking for them again.
final otpStoreProvider = Provider<OtpStore>((ref) => OtpStore());

/// Whether the user chose to look around without an account. See [GuestStore].
final guestStoreProvider = Provider<GuestStore>((ref) => GuestStore());

/// The last confirmed user, so a launch with no network still opens the app.
/// See [UserStore] — a cache, never an authority.
final userStoreProvider = Provider<UserStore>((ref) => UserStore());

/// The stored codes for one booking, or null if this device never had them.
final bookingOtpsProvider =
    FutureProvider.autoDispose.family<BookingOtps?, String>((ref, bookingId) async {
  return ref.watch(otpStoreProvider).read(bookingId);
});

final apiClientProvider = Provider<ApiClient>((ref) {
  // Watched, not read: changing the server in developer settings disposes this
  // client and builds another against the new host, so every provider holding
  // one picks the change up without a restart.
  final client = ApiClient(
    tokenStore: ref.watch(tokenStoreProvider),
    baseUrl: ref.watch(serverUrlProvider),
  );

  // A refresh that fails is unrecoverable: drop the session so the router
  // redirects to sign-in rather than leaving the user on a screen that 401s.
  client.onSessionExpired = () => ref.read(authControllerProvider.notifier).forceSignOut();

  ref.onDispose(client.close);
  return client;
});

final apiProvider = Provider<GidApi>((ref) => GidApi(ref.watch(apiClientProvider)));

// ─────────────────────────────────────────────────────────────────── auth ──

enum AuthStatus {
  /// Reading stored tokens; the splash screen holds here.
  unknown,
  authenticated,

  /// Browsing without an account.
  ///
  /// Chosen, not inferred: it is what "Browse without signing in" sets, and it
  /// survives a restart so the choice is not re-asked every launch. A guest
  /// sees the catalogue and nothing that belongs to a person — see
  /// [AuthState.needsAccount].
  guest,

  unauthenticated,
}

@immutable
class AuthState {
  const AuthState({this.status = AuthStatus.unknown, this.user, this.error});

  final AuthStatus status;
  final AppUser? user;
  final String? error;

  bool get isAuthenticated => status == AuthStatus.authenticated && user != null;
  bool get isResolving => status == AuthStatus.unknown;
  bool get isGuest => status == AuthStatus.guest;

  /// Whether the app should be showing its own screens at all.
  ///
  /// True for a signed-in customer AND for a guest: both get the shell, and
  /// the difference between them is expressed inside it rather than by a
  /// different root.
  bool get isBrowsing => isAuthenticated || isGuest;

  /// Whether an action the user just reached for needs an account first.
  ///
  /// The single question every guarded control asks. Phrased as a property of
  /// the state rather than as `!isAuthenticated`, because the two are not the
  /// same during launch: while the stored session is still resolving nothing
  /// should be prompting for sign-in.
  bool get needsAccount => isGuest;

  AuthState copyWith({AuthStatus? status, AppUser? user, String? error, bool clearError = false}) =>
      AuthState(
        status: status ?? this.status,
        user: user ?? this.user,
        error: clearError ? null : (error ?? this.error),
      );
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    // Kick off session restoration; the router holds on AuthStatus.unknown
    // until this resolves.
    Future.microtask(_restore);
    return const AuthState();
  }

  GidApi get _api => ref.read(apiProvider);
  TokenStore get _tokens => ref.read(tokenStoreProvider);
  GuestStore get _guest => ref.read(guestStoreProvider);
  UserStore get _cachedUser => ref.read(userStoreProvider);

  /// Resolve the stored session on launch.
  ///
  /// A stored token is not trusted blindly — it is validated against
  /// `/auth/me`, since it may have been revoked from another device.
  ///
  /// The two failure modes are deliberately different:
  ///
  ///  * The server REJECTED the token (401): the session is genuinely dead,
  ///    so clear it.
  ///  * The request never reached the server: the token may be perfectly
  ///    valid. Keep it on disk so the next launch retries, and surface a
  ///    connectivity message instead of silently signing the user out.
  Future<void> _restore() async {
    await _tokens.load();

    final token = await _tokens.accessToken;
    if (token == null) {
      // No session, but possibly a standing decision not to have one.
      state = AuthState(
        status: await _guest.isGuest() ? AuthStatus.guest : AuthStatus.unauthenticated,
      );
      return;
    }

    try {
      final user = await _api.me();
      state = AuthState(status: AuthStatus.authenticated, user: user);
      await _cachedUser.write(user);
    } on ApiException catch (e) {
      if (e.isNetwork) {
        // The token is probably fine — we simply could not ask. Open the app
        // on the cached user rather than throwing the customer back to sign-in
        // over a tunnel or a dead Wi-Fi router; the first request that does
        // get through will 401 and sign them out properly if it really is
        // dead. Only if there is no cache is there nothing to show.
        final cached = await _cachedUser.read();
        if (cached != null) {
          state = AuthState(status: AuthStatus.authenticated, user: cached);
          return;
        }
        state = const AuthState(
          status: AuthStatus.unauthenticated,
          error: "Couldn't reach GET IT DONE. Check your connection and try again.",
        );
        return;
      }
      await _forget();
      state = const AuthState(status: AuthStatus.unauthenticated);
    } catch (_) {
      await _forget();
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  /// Drop everything that says who this device belongs to.
  Future<void> _forget() async {
    await _tokens.clear();
    await _cachedUser.clear();
  }

  /// Look around without an account.
  ///
  /// Nothing is created server-side and no anonymous session is issued — this
  /// is purely a client-side decision to show the catalogue and withhold
  /// everything that belongs to a person. Signing in later is a first sign-in,
  /// not an upgrade, so there is no anonymous state to migrate.
  Future<void> continueAsGuest() async {
    state = const AuthState(status: AuthStatus.guest);
    await _guest.setGuest(true);
  }

  /// Leave guest mode for the sign-in screen.
  ///
  /// Clears the stored flag first: a guest who taps "Sign in" and then kills
  /// the app should get the sign-in screen next launch, not be dropped back
  /// into the mode they were trying to leave.
  Future<void> exitGuest() async {
    await _guest.setGuest(false);
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Re-attempt session restoration after a connectivity failure.
  Future<void> retryRestore() async {
    state = const AuthState();
    await _restore();
  }

  /// Google sign-in.
  ///
  /// Returns false when the user backed out of the account picker — that is a
  /// choice, not a failure, and should not raise an error banner.
  /// Anything genuinely wrong throws so the screen can explain it.
  Future<bool> signInWithGoogle() async {
    state = state.copyWith(clearError: true);

    final result = await ref.read(googleAuthServiceProvider).signIn();

    switch (result) {
      case GoogleAuthCancelled():
        return false;

      case GoogleAuthFailure(:final message):
        throw GoogleSignInFailure(message);

      case GoogleAuthSuccess(:final idToken):
        final session = await _api.signInWithGoogle(idToken);
        await _persist(session);
        return true;
    }
  }

  /// Password sign-in with an email address or a phone number.
  Future<void> signInWithPassword({required String identifier, required String password}) async {
    state = state.copyWith(clearError: true);
    final session = await _api.login(identifier: identifier, password: password);
    await _persist(session);
  }

  /// Create an account. Both identifiers are required; see [GidApi.register].
  Future<void> registerWithPassword({
    required String name,
    required String email,
    required String phone,
    required String password,
  }) async {
    state = state.copyWith(clearError: true);
    final session = await _api.register(
      name: name,
      email: email,
      phone: phone,
      password: password,
    );
    await _persist(session);
  }

  Future<void> _persist(AuthSession session) async {
    // An account beats the standing "no account" decision, or signing out
    // later would land back in guest mode rather than at sign-in.
    await _guest.setGuest(false);
    await _cachedUser.write(session.user);
    await _tokens.save(
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    );
    state = AuthState(status: AuthStatus.authenticated, user: session.user);
  }

  Future<void> signOut() async {
    final refresh = await _tokens.refreshToken;
    if (refresh != null) {
      // Best effort: revoke server-side, but never block sign-out on it. A user
      // tapping "sign out" on a dead connection must still be signed out.
      try {
        await _api.logout(refresh);
      } catch (_) {}
    }
    await ref.read(googleAuthServiceProvider).signOut();
    await ref.read(otpStoreProvider).clear();
    await _forget();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Called by the client when refresh fails mid-session.
  void forceSignOut() {
    // Fire and forget, as before: this is called from the client's 401 path
    // and must not be awaited there.
    unawaited(_forget());
    state = const AuthState(
      status: AuthStatus.unauthenticated,
      error: 'Your session expired. Please sign in again.',
    );
  }

  Future<void> refreshUser() async {
    try {
      final user = await _api.me();
      state = state.copyWith(user: user);
      await _cachedUser.write(user);
    } catch (_) {
      // Keep the cached user; this is a background refresh.
    }
  }
}

/// Raised when Google sign-in fails for a reason worth showing the user.
class GoogleSignInFailure implements Exception {
  const GoogleSignInFailure(this.message);

  final String message;

  @override
  String toString() => message;
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);

final currentUserProvider = Provider<AppUser?>((ref) => ref.watch(authControllerProvider).user);

// ────────────────────────────────────────────────────────────────── data ──

/// Catalogue. Long-lived: the service list changes rarely and every booking
/// screen needs it.
final servicesProvider = FutureProvider<List<Service>>((ref) async {
  return ref.watch(apiProvider).services();
});

final serviceCategoriesProvider = FutureProvider<List<ServiceCategory>>((ref) async {
  return ref.watch(apiProvider).serviceCategories();
});

/// Whether there is a session to make an authenticated request with.
///
/// Every provider below that hits an endpoint behind `requireAuth` watches
/// this and returns empty rather than calling. A guest browsing the catalogue
/// would otherwise fire a handful of requests guaranteed to 401, and each 401
/// surfaces as "Could not load…" on a screen where nothing is actually wrong.
///
/// Watched, not read: signing in flips it, which invalidates these providers
/// and fetches the real data without anything having to remember to refresh.
final _hasSession = Provider<bool>(
  (ref) => ref.watch(authControllerProvider).isAuthenticated,
);

/// Home screen payload — one request for active booking, recents and
/// favourites.
final dashboardProvider = FutureProvider.autoDispose<CustomerDashboard>((ref) async {
  if (!ref.watch(_hasSession)) return const CustomerDashboard();

  // Held briefly after the screen leaves so tab switching does not refetch.
  final link = ref.keepAlive();
  Future<void>.delayed(const Duration(minutes: 2), link.close);
  return ref.watch(apiProvider).dashboard();
});

final addressesProvider = FutureProvider.autoDispose<List<SavedAddress>>((ref) async {
  if (!ref.watch(_hasSession)) return const [];
  return ref.watch(apiProvider).addresses();
});

final bookingsProvider = FutureProvider.autoDispose<List<Booking>>((ref) async {
  if (!ref.watch(_hasSession)) return const [];
  return ref.watch(apiProvider).bookings();
});

final bookingTrackingProvider =
    FutureProvider.autoDispose.family<BookingTracking, String>((ref, bookingId) async {
  return ref.watch(apiProvider).trackBooking(bookingId);
});

/// The booking's map image, or null when there is nothing to draw.
///
/// Null rather than an error for the two ways this legitimately comes back
/// empty: 503 when the deployment has no Maps key configured, 502 when the
/// tile fetch itself failed. Neither is worth an error state on a screen whose
/// address and ETA already carry the answer -- the panel just collapses.
final bookingMapProvider =
    FutureProvider.autoDispose.family<Uint8List?, String>((ref, bookingId) async {
  try {
    return Uint8List.fromList(await ref.watch(apiProvider).bookingMapBytes(bookingId));
  } on ApiException {
    return null;
  }
});

final trustGraphProvider =
    FutureProvider.autoDispose.family<TrustGraph, String>((ref, workerId) async {
  return ref.watch(apiProvider).trustGraph(workerId);
});

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>((ref) async {
  if (!ref.watch(_hasSession)) return const [];
  return ref.watch(apiProvider).notifications();
});

// ─────────────────────────────────────────────────── account & settings ──

final notificationPreferencesProvider =
    FutureProvider.autoDispose<NotificationPreferences>((ref) async {
  return ref.watch(apiProvider).notificationPreferences();
});

/// Long-lived: the language list is three rows that never change during a
/// session, and the profile screen reopens often.
final languagesProvider = FutureProvider<List<AppLanguage>>((ref) async {
  return ref.watch(apiProvider).languages();
});

final supportTicketsProvider = FutureProvider.autoDispose<List<SupportTicket>>((ref) async {
  return ref.watch(apiProvider).supportTickets();
});

final supportTicketProvider =
    FutureProvider.autoDispose.family<SupportTicket, String>((ref, id) async {
  return ref.watch(apiProvider).supportTicket(id);
});

final chatsProvider = FutureProvider.autoDispose<List<ChatThread>>((ref) async {
  return ref.watch(apiProvider).chats();
});

final chatMessagesProvider =
    FutureProvider.autoDispose.family<List<ChatMessage>, String>((ref, chatId) async {
  return ref.watch(apiProvider).chatMessages(chatId);
});

final recurringPlansProvider = FutureProvider.autoDispose<List<RecurringPlan>>((ref) async {
  return ref.watch(apiProvider).recurringPlans();
});

final invoicesProvider = FutureProvider.autoDispose<List<Invoice>>((ref) async {
  return ref.watch(apiProvider).invoices();
});

final unreadNotificationCountProvider = Provider.autoDispose<int>((ref) {
  return ref.watch(notificationsProvider).maybeWhen(
        data: (items) => items.where((n) => n.isUnread).length,
        orElse: () => 0,
      );
});

/// The payment order for a booking, or null if the customer has not started
/// paying yet. Autodisposed so returning to a booking re-checks rather than
/// showing a stale "unpaid".
final bookingPaymentProvider =
    FutureProvider.autoDispose.family<PaymentOrder?, String>((ref, bookingId) async {
  return ref.watch(apiProvider).paymentOrderForBooking(bookingId);
});

/// Deployment configuration, fetched once at launch.
///
/// Kept alive for the session: the OAuth client id and the payment key are
/// needed at unpredictable moments, and re-fetching them on every screen that
/// reads a flag would be pointless traffic.
///
/// A failure here is NOT fatal. [AppConfig] still carries build-time values as
/// a development fallback, so a dev machine with the backend down keeps
/// working — see `effectiveConfigProvider`.
/// One order and its bookings, keyed by order id.
final orderProvider =
    FutureProvider.autoDispose.family<PlacedOrder, String>((ref, id) async {
  return ref.watch(apiProvider).order(id);
});

/// One service's detail page content, keyed by id.
///
/// autoDispose so browsing a dozen services does not keep a dozen payloads
/// alive for a page the user has left.
final serviceDetailProvider =
    FutureProvider.autoDispose.family<ServiceDetail, String>((ref, id) async {
  return ref.watch(apiProvider).serviceDetail(id);
});

final remoteConfigProvider = FutureProvider<RemoteConfig>((ref) async {
  return ref.watch(apiProvider).mobileConfig();
});

/// The configuration the app should actually act on.
///
/// Server values win. Where the server has not answered yet — or could not —
/// the compiled-in defaults stand in, which is what keeps sign-in working on a
/// developer's machine before the backend is up.
final effectiveConfigProvider = Provider<RemoteConfig>((ref) {
  final remote = ref.watch(remoteConfigProvider);
  return remote.maybeWhen(
    data: (config) => config,
    orElse: () => RemoteConfig(
      googleServerClientId:
          AppConfig.googleServerClientId.isEmpty ? null : AppConfig.googleServerClientId,
      googleIosClientId: AppConfig.googleClientId.isEmpty ? null : AppConfig.googleClientId,
      googleSignInEnabled: AppConfig.googleSignInEnabled,
      supportedLanguages: AppConfig.supportedLanguages,
    ),
  );
});
