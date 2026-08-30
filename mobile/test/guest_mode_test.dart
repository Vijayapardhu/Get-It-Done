import 'package:flutter_test/flutter_test.dart';
import 'package:gid_core/gid_core.dart';
import 'package:getitdone_customer/core/providers.dart';

/// Guest mode's rules, stated once.
///
/// The whole feature turns on which of four states the app is in, and every
/// gated control in the app asks these same two questions. Getting either
/// backwards is the difference between a sign-in wall and an app that leaks
/// somebody else's bookings, so they are pinned down here rather than left to
/// be inferred from a screen test.
void main() {
  group('AuthState', () {
    test('a signed-in customer browses and is never asked for an account', () {
      const state = AuthState(
        status: AuthStatus.authenticated,
        user: AppUser(id: 'u1', name: 'Pardhu', role: 'customer'),
      );

      expect(state.isAuthenticated, isTrue);
      expect(state.isBrowsing, isTrue);
      expect(state.needsAccount, isFalse);
      expect(state.isGuest, isFalse);
    });

    test('a guest browses, and IS asked when an action needs an account', () {
      const state = AuthState(status: AuthStatus.guest);

      expect(state.isGuest, isTrue);
      expect(state.isBrowsing, isTrue);
      expect(state.needsAccount, isTrue);
      // No user object, so nothing personal can be rendered by accident.
      expect(state.isAuthenticated, isFalse);
      expect(state.user, isNull);
    });

    test('while the stored session resolves, nothing prompts for sign-in', () {
      // The important one. `needsAccount` is deliberately not `!isAuthenticated`
      // — during launch that would be true, and a guarded screen would flash a
      // sign-in invitation at a customer who has a perfectly good session about
      // to come back from /auth/me.
      const state = AuthState();

      expect(state.isResolving, isTrue);
      expect(state.needsAccount, isFalse);
      expect(state.isBrowsing, isFalse);
    });

    test('signed out is not browsing: the root shows sign-in, not the shell', () {
      const state = AuthState(status: AuthStatus.unauthenticated);

      expect(state.isBrowsing, isFalse);
      // Nor does it prompt: it IS the prompt.
      expect(state.needsAccount, isFalse);
    });

    test('an authenticated status with no user is not authenticated', () {
      // Defends the `&& user != null` in isAuthenticated. A half-built state
      // must not open the shell with a null user behind every `user!`.
      const state = AuthState(status: AuthStatus.authenticated);

      expect(state.isAuthenticated, isFalse);
      expect(state.isBrowsing, isFalse);
    });
  });
}
