/// The confirm-password rule on the create-account form.
///
/// A password typed once is a password nobody has proof-read. The mistake does
/// not surface here — it surfaces days later at a sign-in screen that cannot
/// tell a typo from a forgotten password, which is an account nobody can get
/// back into over a keystroke nobody remembers making.
///
/// These pump the real screen rather than calling a validator, because the rule
/// is only worth anything if it actually blocks the button. Validation runs
/// before any network call, so only the one test that gets past it needs a
/// stand-in controller.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:getitdone_customer/core/providers.dart';
import 'package:getitdone_customer/design/design_system.dart';
import 'package:getitdone_customer/features/auth/sign_in_screen.dart';

/// Stands in for the real controller so a valid submission stops at the edge
/// of the network instead of trying to cross it.
class _RecordingAuthController extends AuthController {
  static bool attempted = false;

  @override
  AuthState build() => const AuthState(status: AuthStatus.unauthenticated);

  @override
  Future<void> registerWithPassword({
    required String name,
    required String email,
    required String phone,
    required String password,
  }) async {
    attempted = true;
  }
}

void main() {
  setUp(() => _RecordingAuthController.attempted = false);

  Future<void> pumpRegister(WidgetTester tester) async {
    // A phone-shaped surface, not the 800x600 default. The form is a ListView,
    // so on a short viewport the lower fields are never built and the test
    // fails looking for a widget the screen simply has not reached yet.
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authControllerProvider.overrideWith(_RecordingAuthController.new),
        ],
        child: const MaterialApp(home: RegisterScreen()),
      ),
    );
    await tester.pump();
  }

  /// Fills everything except the two password fields, so each test only has to
  /// say the thing it is about.
  Future<void> fillValidDetails(WidgetTester tester) async {
    await tester.enterText(find.widgetWithText(AppTextField, 'Your name'), 'Pardhu');
    await tester.enterText(
      find.widgetWithText(AppTextField, 'Email address'),
      'pardhu@example.com',
    );
    await tester.enterText(
      find.widgetWithText(AppTextField, 'Mobile number'),
      '9876543210',
    );
  }

  Finder passwordField() => find.widgetWithText(AppTextField, 'Password').first;
  Finder confirmField() => find.widgetWithText(AppTextField, 'Confirm password');

  testWidgets('the form asks for the password twice', (tester) async {
    await pumpRegister(tester);
    expect(confirmField(), findsOneWidget);
  });

  testWidgets('two different passwords are refused', (tester) async {
    await pumpRegister(tester);
    await fillValidDetails(tester);

    await tester.enterText(passwordField(), 'correct-horse');
    await tester.enterText(confirmField(), 'correct-hosre');
    await tester.pump();

    await tester.tap(find.widgetWithText(AppButton, 'Create account'));
    await tester.pump();

    expect(find.text('Both passwords must match.'), findsOneWidget);
  });

  testWidgets('a short password is refused before the mismatch rule', (tester) async {
    // Order matters for the message: telling someone their passwords do not
    // match, when the real problem is that both are too short, sends them to
    // fix the wrong thing.
    await pumpRegister(tester);
    await fillValidDetails(tester);

    await tester.enterText(passwordField(), 'short');
    await tester.enterText(confirmField(), 'different');
    await tester.pump();

    await tester.tap(find.widgetWithText(AppButton, 'Create account'));
    await tester.pump();

    expect(find.text('Use at least 8 characters for your password.'), findsOneWidget);
    expect(find.text('Both passwords must match.'), findsNothing);
  });

  testWidgets('a matching pair clears the way past validation', (tester) async {
    await pumpRegister(tester);
    await fillValidDetails(tester);

    await tester.enterText(passwordField(), 'correct-horse');
    await tester.enterText(confirmField(), 'correct-horse');
    await tester.pump();

    await tester.tap(find.widgetWithText(AppButton, 'Create account'));
    await tester.pump();

    // The point is not the absence of a message -- it is that the form got out
    // of the way and actually tried to create the account.
    expect(_RecordingAuthController.attempted, isTrue);
    expect(find.text('Both passwords must match.'), findsNothing);
  });

  testWidgets('the match is confirmed as it is typed, not on submit', (tester) async {
    await pumpRegister(tester);

    await tester.enterText(passwordField(), 'correct-horse');
    await tester.enterText(confirmField(), 'correct-h');
    await tester.pump();

    final tick = find.descendant(
      of: confirmField(),
      matching: find.byType(AppIcon),
    );
    // Only the padlock prefix so far.
    expect(tick, findsOneWidget);

    await tester.enterText(confirmField(), 'correct-horse');
    await tester.pump();

    // Prefix padlock plus the tick.
    expect(tick, findsNWidgets(2));
  });
}
