import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/gid_api.dart';
import 'auth/google_auth_service.dart';
import 'models/models.dart';
import 'network/api_client.dart';
import 'network/api_exception.dart';
import 'storage/token_store.dart';

/// Composition root.
///
/// Every dependency is resolved here so screens never construct a client, and
/// tests can override any layer with one `overrideWithValue`.

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(tokenStore: ref.watch(tokenStoreProvider));

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
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }

    try {
      final user = await _api.me();
      state = AuthState(status: AuthStatus.authenticated, user: user);
    } on ApiException catch (e) {
      if (e.isNetwork) {
        state = const AuthState(
          status: AuthStatus.unauthenticated,
          error: "Couldn't reach GET IT DONE. Check your connection and try again.",
        );
        return;
      }
      await _tokens.clear();
      state = const AuthState(status: AuthStatus.unauthenticated);
    } catch (_) {
      await _tokens.clear();
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  /// Re-attempt session restoration after a connectivity failure.
  Future<void> retryRestore() async {
    state = const AuthState();
    await _restore();
  }

  /// Request a login code.
  ///
  /// Returns the code itself ONLY when the backend is running with
  /// OTP_ECHO_IN_RESPONSE (refused in production), so a development device
  /// with no SMS can still sign in. Null in every real build.
  Future<String?> requestOtp(String phone) async {
    state = state.copyWith(clearError: true);
    return _api.requestOtp(phone);
  }

  Future<void> verifyOtp({required String phone, required String otp, String? name}) async {
    state = state.copyWith(clearError: true);
    final session = await _api.verifyOtp(phone: phone, otp: otp, name: name);
    await _persist(session);
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

  Future<void> signInWithEmail({required String email, required String password}) async {
    state = state.copyWith(clearError: true);
    final session = await _api.login(email: email, password: password);
    await _persist(session);
  }

  Future<void> registerWithEmail({
    required String name,
    required String email,
    required String password,
  }) async {
    state = state.copyWith(clearError: true);
    final session = await _api.register(name: name, email: email, password: password);
    await _persist(session);
  }

  Future<void> _persist(AuthSession session) async {
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
    await _tokens.clear();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Called by the client when refresh fails mid-session.
  void forceSignOut() {
    _tokens.clear();
    state = const AuthState(
      status: AuthStatus.unauthenticated,
      error: 'Your session expired. Please sign in again.',
    );
  }

  Future<void> refreshUser() async {
    try {
      final user = await _api.me();
      state = state.copyWith(user: user);
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

/// Home screen payload — one request for active booking, recents and
/// favourites.
final dashboardProvider = FutureProvider.autoDispose<CustomerDashboard>((ref) async {
  // Held briefly after the screen leaves so tab switching does not refetch.
  final link = ref.keepAlive();
  Future<void>.delayed(const Duration(minutes: 2), link.close);
  return ref.watch(apiProvider).dashboard();
});

final addressesProvider = FutureProvider.autoDispose<List<SavedAddress>>((ref) async {
  return ref.watch(apiProvider).addresses();
});

final bookingsProvider = FutureProvider.autoDispose<List<Booking>>((ref) async {
  return ref.watch(apiProvider).bookings();
});

final bookingTrackingProvider =
    FutureProvider.autoDispose.family<BookingTracking, String>((ref, bookingId) async {
  return ref.watch(apiProvider).trackBooking(bookingId);
});

final trustGraphProvider =
    FutureProvider.autoDispose.family<TrustGraph, String>((ref, workerId) async {
  return ref.watch(apiProvider).trustGraph(workerId);
});

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>((ref) async {
  return ref.watch(apiProvider).notifications();
});

final unreadNotificationCountProvider = Provider.autoDispose<int>((ref) {
  return ref.watch(notificationsProvider).maybeWhen(
        data: (items) => items.where((n) => n.isUnread).length,
        orElse: () => 0,
      );
});
