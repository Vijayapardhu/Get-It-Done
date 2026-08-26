import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../config/app_config.dart';

/// Google Sign-In.
///
/// Written against google_sign_in 7.x, whose API differs substantially from
/// 6.x: there is a single `GoogleSignIn.instance` that must be `initialize()`d
/// exactly once, and `authenticate()` replaces the old `signIn()`.
///
/// The token the backend needs is the ID TOKEN, and its audience is whichever
/// client id requested it. Passing `serverClientId` makes Android mint a token
/// audienced to the WEB client id, which is the one the server verifies — get
/// this wrong and every sign-in fails audience validation with a confusing
/// "Invalid Google token".
sealed class GoogleAuthResult {
  const GoogleAuthResult();
}

class GoogleAuthSuccess extends GoogleAuthResult {
  const GoogleAuthSuccess({required this.idToken, this.email, this.displayName});

  /// Sent to POST /auth/oauth/google as `credential`.
  final String idToken;
  final String? email;
  final String? displayName;
}

/// The user backed out of the account picker. Not an error — say nothing.
class GoogleAuthCancelled extends GoogleAuthResult {
  const GoogleAuthCancelled();
}

class GoogleAuthFailure extends GoogleAuthResult {
  const GoogleAuthFailure(this.message, {this.isConfiguration = false});

  final String message;

  /// A build/console misconfiguration rather than anything the user did:
  /// missing SHA-1, wrong client id, absent google-services.json.
  final bool isConfiguration;
}

class GoogleAuthService {
  bool _initialised = false;

  /// Whether Google sign-in can be offered at all.
  ///
  /// Without a server client id the resulting token would be audienced to the
  /// platform client and the backend would reject it, so the button is hidden
  /// rather than shown and guaranteed to fail.
  bool get isConfigured => AppConfig.googleServerClientId.isNotEmpty;

  Future<void> _ensureInitialised() async {
    if (_initialised) return;
    await GoogleSignIn.instance.initialize(
      // Android reads the client id from google-services.json; iOS needs it
      // explicitly. serverClientId is what makes the ID token audienced to the
      // backend's web client.
      serverClientId: AppConfig.googleServerClientId,
      clientId: AppConfig.googleClientId.isEmpty ? null : AppConfig.googleClientId,
    );
    _initialised = true;
  }

  /// Interactive sign-in. Must be called from a user gesture.
  Future<GoogleAuthResult> signIn() async {
    if (!isConfigured) {
      return const GoogleAuthFailure(
        'Google sign-in is not configured for this build.',
        isConfiguration: true,
      );
    }

    try {
      await _ensureInitialised();

      // Desktop and some web targets cannot show the native picker.
      if (!GoogleSignIn.instance.supportsAuthenticate()) {
        return const GoogleAuthFailure(
          'Google sign-in is not available on this device.',
          isConfiguration: true,
        );
      }

      final account = await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;

      if (idToken == null || idToken.isEmpty) {
        // Almost always a console misconfiguration: the SHA-1 of the signing
        // key is not registered, so Google returns an account but no ID token.
        return const GoogleAuthFailure(
          'Google did not return a sign-in token. Check the app is registered '
          'with the correct signing certificate.',
          isConfiguration: true,
        );
      }

      return GoogleAuthSuccess(
        idToken: idToken,
        email: account.email,
        displayName: account.displayName,
      );
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) {
        return const GoogleAuthCancelled();
      }
      if (kDebugMode) debugPrint('[google] ${e.code}: ${e.description}');

      return GoogleAuthFailure(
        switch (e.code) {
          GoogleSignInExceptionCode.providerConfigurationError =>
            'Google sign-in is not set up correctly for this build.',
          GoogleSignInExceptionCode.clientConfigurationError =>
            'Google sign-in configuration is invalid.',
          GoogleSignInExceptionCode.uiUnavailable =>
            'Google sign-in could not be shown. Try again.',
          _ => 'Google sign-in failed. Please try again or use your phone number.',
        },
        isConfiguration: e.code == GoogleSignInExceptionCode.providerConfigurationError ||
            e.code == GoogleSignInExceptionCode.clientConfigurationError,
      );
    } catch (e) {
      if (kDebugMode) debugPrint('[google] unexpected: $e');
      return const GoogleAuthFailure(
        'Google sign-in failed. Please try again or use your phone number.',
      );
    }
  }

  /// Clear the cached Google account so the next sign-in shows the picker.
  ///
  /// Without this, signing out of GET IT DONE and back in silently reuses the
  /// same Google account, which looks broken on a shared device.
  Future<void> signOut() async {
    if (!_initialised) return;
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Already signed out, or the platform has nothing cached.
    }
  }
}

final googleAuthServiceProvider = Provider<GoogleAuthService>((ref) => GoogleAuthService());
