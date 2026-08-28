import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../design/design_system.dart';

/// Everything the app does about "you need an account for that".
///
/// Sign-in is skippable, so the app has two kinds of user in the same shell:
/// a customer with a session, and a guest looking around. That could easily
/// become a hundred scattered `if (user == null)` branches, each inventing its
/// own way of saying no. Instead there are exactly two things here:
///
///   * [requireAccount] — for an ACTION. Returns true if it may proceed, and
///     otherwise shows the sheet and returns false. The caller writes one
///     line and does not care which case it is in.
///   * [AccountGate] — for a SCREEN whose entire content belongs to a person.
///     Renders the real screen for a customer and an invitation for a guest.
///
/// The tone matters as much as the mechanism. A guest is not doing anything
/// wrong; they are a customer who has not decided yet. So every message here
/// says what the account is FOR, and none of them scolds.

/// May this action proceed?
///
/// Returns true for a signed-in customer. For a guest, shows the sign-in sheet
/// and returns false — the caller simply stops. Also returns false while the
/// session is still resolving, which cannot normally be reached from a tap but
/// keeps the answer honest.
Future<bool> requireAccount(
  BuildContext context,
  WidgetRef ref, {
  required String action,
}) async {
  final auth = ref.read(authControllerProvider);
  if (auth.isAuthenticated) return true;
  if (!auth.needsAccount) return false;

  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Space.x5, 0, Space.x5, Space.x6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Sign in to continue', style: Theme.of(sheetContext).textTheme.headlineSmall),
            const SizedBox(height: Space.x3),
            _SignInInvitation(action: action),
          ],
        ),
      ),
    ),
  );
  return false;
}

/// The body of the sheet, and of the empty state on a guarded screen.
class _SignInInvitation extends ConsumerWidget {
  const _SignInInvitation({required this.action});

  /// Completes "Sign in to …". A verb phrase, lower case: "book this service",
  /// "see your bookings". Naming the specific thing they just reached for is
  /// the difference between an explanation and a demand.
  final String action;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'You need an account to $action. It takes a minute, and it is how '
          'the worker reaches you and how your bookings stay yours.',
          style: context.text.bodyMedium?.copyWith(color: t.textSecondary, height: 1.5),
        ),
        const SizedBox(height: Space.x6),
        AppButton.primary(
          label: 'Sign in or create an account',
          onPressed: () {
            // Pop the sheet FIRST. Leaving guest mode swaps the whole root,
            // and a sheet still mounted over a screen that no longer exists is
            // how a stray barrier ends up covering the sign-in form.
            Navigator.of(context).maybePop();
            ref.read(authControllerProvider.notifier).exitGuest();
          },
        ),
        const SizedBox(height: Space.x3),
        Center(
          child: AppButton.tertiary(
            label: 'Keep looking around',
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ),
      ],
    );
  }
}

/// Wraps a screen whose whole content belongs to a signed-in person.
///
/// For a customer it is transparent — [child] is built and nothing is added.
/// For a guest it replaces the screen with an invitation, because there is
/// nothing honest to render: an empty bookings list would be a lie, and a
/// spinner that never resolves is worse.
class AccountGate extends ConsumerWidget {
  const AccountGate({
    super.key,
    required this.action,
    required this.icon,
    this.animation = 'assets/lottie/secure.json',
    required this.child,
  });

  /// Completes "Sign in to …" — see [_SignInInvitation.action].
  final String action;

  /// Fallback only, for a device that cannot decode the animation.
  final AppIconData icon;

  /// The artwork above the invitation. A drawn shield rather than a glyph in a
  /// circle, for the same reason every other state in the app now animates:
  /// this screen is the app explaining itself, not labelling an error.
  final String animation;

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (!auth.needsAccount) return child;

    final t = context.tokens;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(Space.x6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppIllustration(
              assetAnimation: animation,
              fallbackIcon: icon,
              height: 150,
            ),
            const SizedBox(height: Space.x4),
            Text(
              'Sign in to $action',
              textAlign: TextAlign.center,
              style: context.text.headlineSmall,
            ),
            const SizedBox(height: Space.x2),
            Text(
              'You are browsing without an account. Everything in the '
              'catalogue is yours to look at — this part needs to know who '
              'you are.',
              textAlign: TextAlign.center,
              style: context.text.bodyMedium?.copyWith(
                color: t.textSecondary,
                height: 1.5,
              ),
            ),
            const SizedBox(height: Space.x6),
            AppButton.primary(
              label: 'Sign in or create an account',
              onPressed: () => ref.read(authControllerProvider.notifier).exitGuest(),
            ),
          ],
        ),
      ),
    );
  }
}
