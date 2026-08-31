import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';

import '../core/config/worker_config.dart';
import '../core/models/worker_models.dart';
import '../core/providers.dart';
import '../features/alerts/alerts_screen.dart';
import '../features/auth/language_gate.dart';
import '../features/auth/sign_in_screen.dart';
import '../features/earnings/earnings_screen.dart';
import '../features/earnings/payout_breakdown_screen.dart';
import '../features/job/active_job_screen.dart';
import '../features/job/job_detail_screen.dart';
import '../features/jobs/jobs_screen.dart';
import '../features/offer/offer_screen.dart';
import '../features/onboarding/onboarding_wizard.dart';
import '../features/onboarding/verification_screen.dart';
import '../features/profile/documents_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/profile/reviews_screen.dart';
import '../features/profile/safety_screen.dart';
import '../features/profile/schedule_screen.dart';
import '../features/profile/service_areas_screen.dart';
import '../features/profile/settings_screen.dart';
import '../features/profile/skills_screen.dart';
import '../features/profile/welfare_screen.dart';
import '../features/profile/blocked_customers_screen.dart';
import '../features/profile/edit_profile_screen.dart';
import '../features/profile/payout_account_screen.dart';
import '../features/earnings/payouts_screen.dart';
import '../features/earnings/statements_screen.dart';
import '../features/chat/chat_list_screen.dart';
import '../features/chat/chat_thread_screen.dart';
import '../features/support/support_screen.dart';
import '../features/support/ticket_detail_screen.dart';
import '../features/training/training_list_screen.dart';
import '../features/training/training_quiz_screen.dart';
import '../features/today/today_screen.dart';

/// The shell.
///
/// Three destinations, and no more. "Today" and "Jobs" are already close enough
/// to be confusable; adding Profile as a fourth would spend a third of the bar
/// on settings, which is the exact mistake the customer app documents having
/// already fixed. Profile lives behind the header avatar, alerts behind the
/// bell.
class WorkerApp extends ConsumerWidget {
  const WorkerApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'GET IT DONE',
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      locale: locale,
      supportedLocales: supportedWorkerLocales,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // One theme, always light.
      //
      // This app is read outdoors, in sunlight, on cheap screens with the
      // brightness already at maximum. A dark theme is the wrong answer to every
      // one of those conditions, and a theme that can change underneath a worker
      // mid-job is worse than any single choice — so there is no dark theme, no
      // daylight variant and no "follow the phone". `darkTheme` is deliberately
      // absent rather than set to the same value: nothing can select it.
      theme: WorkerTheme.light(locale),
      themeMode: ThemeMode.light,
      builder: (context, child) {
        final media = MediaQuery.of(context);
        return MediaQuery(
          // 0.9–1.5, wider than the customer app's 0.9–1.3. Worker layouts are
          // single-column and can absorb it, and this audience includes people
          // who set their phone to its largest text for a reason.
          data: media.copyWith(
            textScaler: media.textScaler.clamp(
              minScaleFactor: WorkerSizes.textScaleMin,
              maxScaleFactor: WorkerSizes.textScaleMax,
            ),
          ),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}

/// The routes.
///
/// Everything except the offer, which is pushed imperatively over whatever is
/// on screen. An offer is an interrupt, not a destination — it has to be able
/// to appear over onboarding, over a job in progress, over settings, and leave
/// the stack underneath exactly as it found it.
final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authProvider);
  final locale = ref.watch(localeProvider);
  final hasChosenLanguage = ref.read(localeProvider.notifier).hasChosen || locale != null;
  final profile = ref.watch(workerProfileProvider);

  return GoRouter(
    initialLocation: '/today',
    refreshListenable: _Refresh(ref),
    redirect: (context, state) {
      final path = state.matchedLocation;

      // Language BEFORE sign-in. An app that opens in English and hides Telugu
      // three taps deep is an English app with a Telugu setting.
      if (path == '/language') return null;
      if (!hasChosenLanguage) return '/language';
      if (!auth.isResolved) return null; // Splash holds.

      final signingIn = path == '/sign-in' || path == '/register';
      if (!auth.isAuthenticated) return signingIn ? null : '/sign-in';

      // The account must be a WORKER account, and this gate has to come before
      // anything that reads the worker profile.
      //
      // Google sign-in and a cross-app login can both hand this app a
      // customer-role account. Every worker route then answers 403 with
      // "Insufficient permissions", which is the backend's role guard talking
      // to somebody who has no idea what a role is. `/wrong-account` is the one
      // place that explains it, and it offers the way out.
      final user = auth.user;
      final wrongAccount = user != null && !user.isWorker;
      if (path == '/wrong-account') return wrongAccount ? null : '/today';
      if (wrongAccount) return '/wrong-account';

      if (signingIn) return '/today';

      // Signed in, but is there a worker profile behind the account? An
      // unverified worker must be shown WHAT IS LEFT, never an empty job feed:
      // that is the difference between someone who finishes onboarding and
      // someone who deletes the app.
      final worker = profile.value;
      final onboarding = path.startsWith('/onboarding') || path == '/verification';
      if (profile.hasValue && worker == null && !onboarding) return '/onboarding';
      if (worker != null && !worker.isVerified && !onboarding) return '/verification';
      if (worker != null && worker.isVerified && onboarding) return '/today';

      return null;
    },
    routes: [
      GoRoute(path: '/language', builder: (_, __) => const LanguageGate()),
      GoRoute(path: '/wrong-account', builder: (_, __) => const _WrongAccountScreen()),
      GoRoute(path: '/sign-in', builder: (_, __) => const SignInScreen()),
      GoRoute(path: '/register', builder: (_, __) => const SignInScreen(startOnRegister: true)),
      GoRoute(path: '/onboarding', builder: (_, __) => const OnboardingWizard()),
      GoRoute(path: '/verification', builder: (_, __) => const VerificationScreen()),

      ShellRoute(
        builder: (context, state, child) => WorkerShell(child: child),
        routes: [
          GoRoute(path: '/today', builder: (_, __) => const TodayScreen()),
          GoRoute(path: '/jobs', builder: (_, __) => const JobsScreen()),
          GoRoute(path: '/earnings', builder: (_, __) => const EarningsScreen()),
        ],
      ),

      GoRoute(path: '/job/:id', builder: (_, state) => ActiveJobScreen(bookingId: state.pathParameters['id']!)),
      GoRoute(path: '/job/:id/detail', builder: (_, state) => JobDetailScreen(bookingId: state.pathParameters['id']!)),
      GoRoute(
        path: '/job/:id/payout',
        builder: (_, state) => PayoutBreakdownScreen(bookingId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/alerts', builder: (_, __) => const AlertsScreen()),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
      GoRoute(path: '/profile/settings', builder: (_, __) => const SettingsScreen()),
      GoRoute(path: '/profile/skills', builder: (_, __) => const SkillsScreen()),
      GoRoute(path: '/profile/areas', builder: (_, __) => const ServiceAreasScreen()),
      GoRoute(path: '/profile/documents', builder: (_, __) => const DocumentsScreen()),
      GoRoute(path: '/profile/schedule', builder: (_, __) => const ScheduleScreen()),
      GoRoute(path: '/profile/safety', builder: (_, __) => const SafetyScreen()),
      GoRoute(path: '/profile/welfare', builder: (_, __) => const WelfareScreen()),
      GoRoute(path: '/profile/reviews', builder: (_, __) => const ReviewsScreen()),
      GoRoute(path: '/profile/blocked', builder: (_, __) => const BlockedCustomersScreen()),
      GoRoute(path: '/profile/edit', builder: (_, __) => const EditProfileScreen()),
      GoRoute(path: '/profile/payout-account', builder: (_, __) => const PayoutAccountScreen()),
      GoRoute(path: '/earnings/payouts', builder: (_, __) => const PayoutsScreen()),
      GoRoute(path: '/earnings/statements', builder: (_, __) => const StatementsScreen()),
      GoRoute(path: '/chats', builder: (_, __) => const ChatListScreen()),
      GoRoute(path: '/chat/:id', builder: (_, state) => ChatThreadScreen(chatId: state.pathParameters['id']!)),
      GoRoute(path: '/support', builder: (_, __) => const SupportScreen()),
      GoRoute(path: '/support/:id', builder: (_, state) => TicketDetailScreen(ticketId: state.pathParameters['id']!)),
      GoRoute(path: '/training', builder: (_, __) => const TrainingListScreen()),
      GoRoute(path: '/training/:id', builder: (_, state) => TrainingQuizScreen(moduleId: state.pathParameters['id']!)),
    ],
  );
});

/// Rebuilds the router when the session or the profile changes.
class _Refresh extends ChangeNotifier {
  _Refresh(Ref ref) {
    ref.listen(authProvider, (_, __) => notifyListeners());
    ref.listen(workerProfileProvider, (_, __) => notifyListeners());
    ref.listen(localeProvider, (_, __) => notifyListeners());
  }
}

/// The navy header, the three destinations, and the offer watcher.
class WorkerShell extends ConsumerStatefulWidget {
  const WorkerShell({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<WorkerShell> createState() => _WorkerShellState();
}

class _WorkerShellState extends ConsumerState<WorkerShell> with WidgetsBindingObserver {
  bool _showingOffer = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Coming back from the background is the one moment the app is certain it
    // may have missed something. Reconcile rather than trust the socket to have
    // survived a doze.
    if (state == AppLifecycleState.resumed) {
      unawaited(ref.read(offerInboxProvider).reconcile());
      unawaited(ref.read(actionQueueProvider).drain());
    }
  }

  @override
  Widget build(BuildContext context) {
    // The offer watcher. Mounted in the shell rather than on a screen so it
    // survives navigation between the three destinations.
    ref.listen(offerInboxProvider, (_, inbox) {
      final offer = inbox.current;
      if (offer == null || _showingOffer) return;
      _showingOffer = true;
      unawaited(
        showOffer(context, ref, offer).whenComplete(() => _showingOffer = false),
      );
    });

    final index = switch (GoRouterState.of(context).matchedLocation) {
      final path when path.startsWith('/jobs') => 1,
      final path when path.startsWith('/earnings') => 2,
      _ => 0,
    };

    return Scaffold(
      appBar: const WorkerHeader(),
      body: widget.child,
      bottomNavigationBar: _BottomBar(index: index),
    );
  }
}

/// Navy, with the two things a worker needs from any screen: their duty status,
/// and whether anything is waiting for them.
class WorkerHeader extends ConsumerWidget implements PreferredSizeWidget {
  const WorkerHeader({super.key});

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final duty = ref.watch(dutyProvider);
    final profile = ref.watch(workerProfileProvider).value;
    final unread = ref.watch(notificationsProvider).value?.where((n) => n.isUnread).length ?? 0;
    final queued = ref.watch(actionQueueProvider).pendingCount;

    return AppBar(
      leadingWidth: 60,
      leading: Padding(
        padding: const EdgeInsets.only(left: Space.x4),
        child: GestureDetector(
          onTap: () => context.push('/profile'),
          child: CircleAvatar(
            radius: 18,
            backgroundColor: AppColors.blue700,
            backgroundImage: profile?.photoUrl == null ? null : NetworkImage(profile!.photoUrl!),
            child: profile?.photoUrl != null
                ? null
                : Text(
                    _initials(profile?.name ?? ''),
                    style: const TextStyle(color: AppColors.n0, fontWeight: FontWeight.w700),
                  ),
          ),
        ),
      ),
      title: _DutyPill(status: duty),
      actions: [
        // The queue depth, when there is one. A worker must be able to see the
        // app is holding something for them, or the optimistic UI is
        // indistinguishable from a lie.
        ValueListenableBuilder<int>(
          valueListenable: queued,
          builder: (context, count, _) => count == 0
              ? const SizedBox.shrink()
              : Padding(
                  padding: const EdgeInsets.only(right: Space.x2),
                  child: Chip(
                    visualDensity: VisualDensity.compact,
                    backgroundColor: AppColors.blue700,
                    side: BorderSide.none,
                    label: Text('$count queued', style: const TextStyle(color: AppColors.n0, fontSize: 13)),
                  ),
                ),
        ),
        IconButton(
          onPressed: () => context.push('/alerts'),
          icon: Badge(
            isLabelVisible: unread > 0,
            label: Text('$unread'),
            child: AppIcon(AppIcons.notifications, size: 24),
          ),
        ),
        const SizedBox(width: Space.x2),
      ],
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return parts.take(2).map((p) => p[0].toUpperCase()).join();
  }
}

/// Duty status gets its own colour and never shares it. It is the most-read
/// fact in the app.
class _DutyPill extends StatelessWidget {
  const _DutyPill({required this.status});
  final DutyStatus status;

  @override
  Widget build(BuildContext context) {
    final (colour, label) = switch (status) {
      DutyStatus.available => (Duty.online, 'Online'),
      DutyStatus.busy => (Duty.busy, 'On a job'),
      DutyStatus.offline => (Duty.offline, 'Offline'),
    };

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: colour, shape: BoxShape.circle)),
        const SizedBox(width: Space.x2),
        Text(label, style: context.text.titleMedium?.copyWith(color: AppColors.n0)),
      ],
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({required this.index});
  final int index;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return NavigationBar(
      selectedIndex: index,
      height: 68,
      backgroundColor: tokens.surface,
      indicatorColor: tokens.primarySoft,
      // Labels on every destination, always. An icon-only bar asks a worker to
      // remember what a glyph means while they are holding a drill.
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      onDestinationSelected: (i) => context.go(switch (i) {
        1 => '/jobs',
        2 => '/earnings',
        _ => '/today',
      }),
      destinations: [
        NavigationDestination(
          icon: AppIcon(AppIcons.calendar, size: 24),
          selectedIcon: AppIcon(AppIcons.calendar, size: 24, bold: true),
          label: 'Today',
        ),
        NavigationDestination(
          icon: AppIcon(AppIcons.work, size: 24),
          selectedIcon: AppIcon(AppIcons.work, size: 24, bold: true),
          label: 'Jobs',
        ),
        // Money is the SECOND screen, not the fifth. A worker checks earnings
        // several times a day; it earns a destination.
        NavigationDestination(
          icon: AppIcon(AppIcons.wallet, size: 24),
          selectedIcon: AppIcon(AppIcons.wallet, size: 24, bold: true),
          label: 'Earnings',
        ),
      ],
    );
  }
}

/// Shown when a user signs into the worker app with a customer account.
///
/// This screen exists because the alternative is the backend's role guard
/// talking directly to a worker: every worker route answers a customer-role
/// account with 403 "Insufficient permissions", which explains nothing and
/// offers nothing. Here the situation is named, and the fix is one button —
/// the same account becomes a worker account, in place, keeping the email and
/// the password the person already has.
///
/// The server refuses the conversion for an account that has already booked
/// work. That is a real answer and it is shown as one, rather than being turned
/// into a spinner that never resolves.
class _WrongAccountScreen extends ConsumerStatefulWidget {
  const _WrongAccountScreen();

  @override
  ConsumerState<_WrongAccountScreen> createState() => _WrongAccountScreenState();
}

class _WrongAccountScreenState extends ConsumerState<_WrongAccountScreen> {
  bool _busy = false;
  String? _failure;

  Future<void> _becomeWorker() async {
    setState(() {
      _busy = true;
      _failure = null;
    });
    try {
      await ref.read(authProvider.notifier).becomeWorker();
      // The router's gate re-evaluates on the auth change and sends this
      // account on to onboarding by itself.
      if (mounted) context.go('/today');
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _failure = error.isNetwork
              ? 'No connection. Check your network and try again.'
              : error.message;
        });
      }
    }
  }

  Future<void> _signOut() async {
    setState(() => _busy = true);
    await ref.read(authProvider.notifier).signOut();
    if (mounted) context.go('/sign-in');
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final email = ref.watch(authProvider).user?.email;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Space.page),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(Space.x5),
                  decoration: BoxDecoration(color: tokens.warningSoft, shape: BoxShape.circle),
                  child: AppIcon(AppIcons.info, size: 40, color: tokens.warning),
                ),
                const SizedBox(height: Space.x5),
                Text(
                  'This is a customer account',
                  style: context.text.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: Space.x3),
                Text(
                  email == null
                      ? 'It was set up to book work, not to do it. You can turn it into a '
                          'worker account now — same sign-in, nothing to re-enter.'
                      : '$email was set up to book work, not to do it. You can turn it into a '
                          'worker account now — same sign-in, nothing to re-enter.',
                  style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
                  textAlign: TextAlign.center,
                ),
                if (_failure != null) ...[
                  const SizedBox(height: Space.x5),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(Space.x4),
                    decoration: BoxDecoration(color: tokens.dangerSoft, borderRadius: Radii.rMd),
                    child: Text(
                      _failure!,
                      style: context.text.bodyMedium?.copyWith(color: tokens.danger),
                    ),
                  ),
                ],
                const SizedBox(height: Space.x6),
                SizedBox(
                  width: double.infinity,
                  height: WorkerSizes.button,
                  child: FilledButton.icon(
                    onPressed: _busy ? null : _becomeWorker,
                    icon: _busy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.n0),
                          )
                        : AppIcon(AppIcons.work, size: 20, color: AppColors.n0),
                    label: const Text('Continue as a worker'),
                  ),
                ),
                const SizedBox(height: Space.x3),
                SizedBox(
                  width: double.infinity,
                  height: WorkerSizes.button,
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : _signOut,
                    icon: AppIcon(AppIcons.logout, size: 20),
                    label: const Text('Use a different account'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
