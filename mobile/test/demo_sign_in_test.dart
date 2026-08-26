import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:getitdone_customer/core/config/remote_config.dart';
import 'package:getitdone_customer/core/providers.dart';
import 'package:getitdone_customer/design/design_system.dart';
import 'package:getitdone_customer/features/auth/sign_in_screen.dart';

/// Guards on the demo sign-in affordance.
///
/// `POST /auth/demo` issues a session with no credential at all. The one thing
/// that keeps that from being a backdoor in every build is that the button is
/// drawn from the SERVER's configuration rather than from a compile-time flag:
/// the same APK shows nothing against a deployment that has demo login off.
/// These pin that, because a refactor that "simplified" the condition to a
/// build constant would look harmless and would not fail anything else.
void main() {
  Future<void> pumpSignIn(WidgetTester tester, RemoteConfig config) async {
    // Tall enough for the whole screen to be laid out at once: the panel sits
    // at the bottom of a ListView, which builds lazily, so on a phone-sized
    // surface it would be absent because it was off-screen — and the "hidden"
    // case would pass whether the condition worked or not.
    //
    // Wider than a phone for a duller reason. These tests do not load the app's
    // fonts, so text is measured with the test fallback, which is wider than
    // Plus Jakarta Sans; at 390 the "New here? Create an account" row overflows
    // and the exception fails the test. It is not a layout bug — the golden at
    // that width, rendered with the real fonts, has room to spare.
    tester.view.physicalSize = const Size(560, 1800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          remoteConfigProvider.overrideWith((ref) async => config),
        ],
        child: MaterialApp(
          theme: AppTheme.light(null),
          home: const SignInScreen(),
        ),
      ),
    );
    // Let the config future resolve; the panel appears on the rebuild after.
    await tester.pump();
    await tester.pump();
  }

  final demoButton = find.text('Explore the demo');

  testWidgets('is hidden when the server does not offer a demo account',
      (tester) async {
    await pumpSignIn(tester, const RemoteConfig());
    expect(demoButton, findsNothing);
  });

  testWidgets('is shown when the server offers one', (tester) async {
    await pumpSignIn(tester, const RemoteConfig(demoSignInEnabled: true));
    expect(demoButton, findsOneWidget);
  });

  testWidgets('says the account is shared before anyone taps it',
      (tester) async {
    // A demo account is not private. Someone entering a real address or phone
    // number into it should have been told first, and told on the screen where
    // they choose it rather than afterwards.
    await pumpSignIn(tester, const RemoteConfig(demoSignInEnabled: true));
    expect(
      find.textContaining('visible to anyone', findRichText: true),
      findsOneWidget,
    );
  });

  test('a config with no demo field defaults to off', () {
    // Fail closed. An older backend that has never heard of this field must
    // not produce a build that offers the button and then 404s on it.
    expect(RemoteConfig.fromJson(const {'auth': {}}).demoSignInEnabled, isFalse);
    expect(RemoteConfig.fromJson(const {}).demoSignInEnabled, isFalse);
  });

  test('the field is read from the server payload when present', () {
    final config = RemoteConfig.fromJson(const {
      'auth': {'demoSignInEnabled': true},
    });
    expect(config.demoSignInEnabled, isTrue);
  });
}
