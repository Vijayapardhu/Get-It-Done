import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/models.dart';
import '../core/providers.dart';
import '../design/design_system.dart';
import '../features/auth/sign_in_screen.dart';
import '../features/booking/book_service_screen.dart';
import '../features/booking/booking_otp_screen.dart';
import '../features/home/home_screen.dart';
import 'search_screen.dart';
import 'trust_screen.dart';

/// Root widget.
class GetItDoneApp extends ConsumerStatefulWidget {
  const GetItDoneApp({super.key});

  @override
  ConsumerState<GetItDoneApp> createState() => _GetItDoneAppState();
}

class _GetItDoneAppState extends ConsumerState<GetItDoneApp> {
  ThemeMode _themeMode = ThemeMode.system;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    // Drives the script-aware font swap; the backend stores the preference on
    // the user, so it follows them across devices.
    final locale = Locale(user?.language ?? 'en');

    return MaterialApp(
      title: 'GET IT DONE',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(locale),
      darkTheme: AppTheme.dark(locale),
      themeMode: _themeMode,
      locale: locale,
      builder: (context, child) {
        // Users can scale text up for readability, but past 1.3 the booking
        // cards break. The app should bend, not shatter.
        final scaler = MediaQuery.textScalerOf(context)
            .clamp(minScaleFactor: 0.9, maxScaleFactor: 1.3);
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: scaler),
          child: child!,
        );
      },
      home: _RootGate(
        themeMode: _themeMode,
        onToggleTheme: () => setState(() {
          _themeMode = _themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
        }),
      ),
    );
  }
}

/// Decides between splash, sign-in and the app shell.
class _RootGate extends ConsumerWidget {
  const _RootGate({required this.themeMode, required this.onToggleTheme});

  final ThemeMode themeMode;
  final VoidCallback onToggleTheme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);

    // Hold on the splash while the stored session is validated, so an
    // authenticated user never sees sign-in flash past on launch.
    if (auth.isResolving) return const _SplashScreen();

    if (!auth.isAuthenticated) {
      return Stack(
        children: [
          const SignInScreen(),
          if (auth.error != null)
            Positioned(
              left: Space.x5,
              right: Space.x5,
              bottom: Space.x20,
              child: AppBanner(
                message: auth.error!,
                tone: StateTone.warning,
                actionLabel: 'Retry',
                onAction: () => ref.read(authControllerProvider.notifier).retryRestore(),
              ),
            ),
        ],
      );
    }

    return AppShell(themeMode: themeMode, onToggleTheme: onToggleTheme);
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppIconBadge(AppIcons.cooperative, size: 72, iconSize: 34),
            const SizedBox(height: Space.x5),
            Text('GET IT DONE', style: context.text.headlineSmall),
            const SizedBox(height: Space.x2),
            Text(
              'Cooperative services',
              style: context.text.bodySmall?.copyWith(color: t.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

/// Signed-in shell: bottom navigation plus the floating emergency CTA.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key, required this.themeMode, required this.onToggleTheme});

  final ThemeMode themeMode;
  final VoidCallback onToggleTheme;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  int _tab = 0;

  /// Each tab keeps its own navigator, so switching tabs does not discard a
  /// half-finished booking flow.
  final _navigatorKeys = List.generate(4, (_) => GlobalKey<NavigatorState>());

  Future<bool> _onWillPop() async {
    final navigator = _navigatorKeys[_tab].currentState;
    if (navigator != null && navigator.canPop()) {
      navigator.pop();
      return false;
    }
    // Leaving a non-home tab returns to Home rather than exiting the app.
    if (_tab != 0) {
      setState(() => _tab = 0);
      return false;
    }
    return true;
  }

  void _push(Widget screen) {
    _navigatorKeys[_tab].currentState?.push(
          MaterialPageRoute<void>(builder: (_) => screen),
        );
  }

  void _openService(Service service) {
    _push(BookServiceScreen(
      service: service,
      onBooked: (result) {
        // Replace rather than push: there is no sensible "back" into a
        // half-completed booking form once the booking exists.
        _navigatorKeys[_tab].currentState?.pushReplacement(
              MaterialPageRoute<void>(
                builder: (_) => BookingConfirmedScreen(
                  result: result,
                  onViewCodes: () => _push(BookingOtpScreen(
                    bookingId: result.booking.id,
                    otps: result.otps,
                    status: result.booking.status,
                  )),
                  onTrack: () => setState(() => _tab = 1),
                ),
              ),
            );
      },
    ));
  }

  @override
  Widget build(BuildContext context) {
    final unread = ref.watch(unreadNotificationCountProvider);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        // Capture the navigator before the await: `context` must not be used
        // across the async gap.
        final navigator = Navigator.of(context);
        if (await _onWillPop()) navigator.pop();
      },
      child: Scaffold(
        body: IndexedStack(
          index: _tab,
          children: [
            _TabNavigator(
              navigatorKey: _navigatorKeys[0],
              child: HomeScreen(
                onOpenService: _openService,
                onOpenSearch: () => _push(SearchScreen(onOpenService: _openService)),
                onOpenBooking: (booking) => _push(BookingOtpScreen(
                  bookingId: booking.id,
                  otps: null,
                  status: booking.status,
                )),
                onOpenWorker: (workerId) => _push(TrustScreen(workerId: workerId)),
              ),
            ),
            _TabNavigator(
              navigatorKey: _navigatorKeys[1],
              child: _BookingsTab(
                onOpenWorker: (id) => _push(TrustScreen(workerId: id)),
                onOpenCodes: (booking) => _push(BookingOtpScreen(
                  bookingId: booking.id,
                  otps: null,
                  status: booking.status,
                )),
              ),
            ),
            _TabNavigator(
              navigatorKey: _navigatorKeys[2],
              child: const _NotificationsTab(),
            ),
            _TabNavigator(
              navigatorKey: _navigatorKeys[3],
              child: _ProfileTab(onToggleTheme: widget.onToggleTheme),
            ),
          ],
        ),
        floatingActionButton: _tab == 0
            ? EmergencyFab(onPressed: () => _showEmergencySheet(context))
            : null,
        bottomNavigationBar: AppBottomNav(
          currentIndex: _tab,
          onTap: (i) => setState(() => _tab = i),
          items: [
            const AppNavItem(icon: AppIcons.home, label: 'Home'),
            const AppNavItem(icon: AppIcons.bookings, label: 'Bookings'),
            AppNavItem(icon: AppIcons.notifications, label: 'Alerts', badgeCount: unread),
            const AppNavItem(icon: AppIcons.profile, label: 'Profile'),
          ],
        ),
      ),
    );
  }

  void _showEmergencySheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => _EmergencySheet(
        onPick: (service) {
          Navigator.of(sheetContext).pop();
          _openService(service);
        },
      ),
    );
  }
}

/// Wraps a tab in its own Navigator so back navigation is per-tab.
class _TabNavigator extends StatelessWidget {
  const _TabNavigator({required this.navigatorKey, required this.child});

  final GlobalKey<NavigatorState> navigatorKey;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Navigator(
      key: navigatorKey,
      onGenerateRoute: (settings) => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) => child,
      ),
    );
  }
}

class _EmergencySheet extends ConsumerWidget {
  const _EmergencySheet({required this.onPick});

  final ValueChanged<Service> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final services = ref.watch(servicesProvider);

    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.x5, Space.x2, Space.x5, Space.x8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppIconBadge(
                AppIcons.emergency,
                size: 44,
                background: t.dangerSoft,
                foreground: t.danger,
              ),
              const SizedBox(width: Space.x3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Emergency', style: context.text.headlineSmall),
                    Text(
                      'We prioritise and dispatch immediately.',
                      style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: Space.x6),
          Text('What happened?', style: context.text.titleLarge),
          const SizedBox(height: Space.x3),
          services.when(
            loading: () => const SkeletonCard(lines: 1, hasAvatar: false),
            error: (_, __) => const AppBanner(
              message: 'Could not load emergency services.',
              tone: StateTone.error,
            ),
            data: (list) {
              // Only services the backend flags as emergency-capable: offering
              // one that will be rejected server-side wastes critical minutes.
              final emergency = list.where((s) => s.emergencySupported).toList();
              if (emergency.isEmpty) {
                return const AppBanner(
                  message: 'No emergency services are available in your area right now.',
                  tone: StateTone.warning,
                );
              }
              return Column(
                children: [
                  for (final service in emergency.take(5)) ...[
                    AppSelectableRow(
                      title: service.name,
                      subtitle: service.description,
                      icon: ServiceVisuals.forName(service.category).icon,
                      selected: false,
                      onTap: () => onPick(service),
                    ),
                    const SizedBox(height: Space.x2),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

// ── Placeholder tabs, replaced as each feature lands ──────────────────────

class _BookingsTab extends ConsumerWidget {
  const _BookingsTab({required this.onOpenWorker, required this.onOpenCodes});

  final ValueChanged<String> onOpenWorker;
  final ValueChanged<Booking> onOpenCodes;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bookings = ref.watch(bookingsProvider);
    final t = context.tokens;

    return Scaffold(
      appBar: AppBar(title: const Text('Your bookings')),
      body: bookings.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: Column(children: [SkeletonCard(), SizedBox(height: Space.x3), SkeletonCard()]),
        ),
        error: (error, _) => AppStateView.error(
          message: 'We could not load your bookings.',
          onAction: () => ref.invalidate(bookingsProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const AppStateView.empty(
              title: 'Nothing here yet',
              message: 'Your bookings will appear here once you book a service.',
              icon: AppIcons.bookings,
            );
          }
          return RefreshIndicator(
            color: t.primary,
            onRefresh: () async {
              ref.invalidate(bookingsProvider);
              await ref.read(bookingsProvider.future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.all(Space.x5),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: Space.x3),
              itemBuilder: (context, i) {
                final booking = list[i];
                return AppCard(
                  onTap: () => onOpenCodes(booking),
                  padding: Space.cardInsetsLarge,
                  child: Row(
                    children: [
                      AppIconBadge(
                        ServiceVisuals.forName(booking.serviceCategory ?? booking.serviceName).icon,
                        size: 44,
                      ),
                      const SizedBox(width: Space.x3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              booking.serviceName ?? 'Service',
                              style: context.text.titleMedium,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              booking.address ?? '',
                              style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: Space.x2),
                      BookingStatusBadge(booking.status, dense: true),
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _NotificationsTab extends ConsumerWidget {
  const _NotificationsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsProvider);
    final t = context.tokens;

    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: notifications.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: SkeletonCard(hasAvatar: false),
        ),
        error: (_, __) => AppStateView.error(
          message: 'We could not load your notifications.',
          onAction: () => ref.invalidate(notificationsProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const AppStateView.empty(
              title: 'All caught up',
              message: 'Updates about your bookings will appear here.',
              icon: AppIcons.notifications,
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(Space.x5),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: Space.x3),
            itemBuilder: (context, i) {
              final item = list[i];
              return AppCard(
                elevated: false,
                background: item.isUnread ? t.primarySoft : null,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppIconBadge(AppIcons.notifications, size: 40),
                    const SizedBox(width: Space.x3),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.title, style: context.text.titleMedium),
                          if (item.body != null)
                            Text(
                              item.body!,
                              style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _ProfileTab extends ConsumerWidget {
  const _ProfileTab({required this.onToggleTheme});

  final VoidCallback onToggleTheme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final user = ref.watch(currentUserProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(Space.x5),
        children: [
          Row(
            children: [
              WorkerAvatar(name: user?.name ?? 'You', size: Sizes.avatarLg),
              const SizedBox(width: Space.x4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user?.name ?? 'You', style: context.text.headlineSmall),
                    Text(
                      user?.phone ?? user?.email ?? '',
                      style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: Space.x8),
          AppSelectableRow(
            title: context.isDark ? 'Light theme' : 'Dark theme',
            icon: context.isDark ? AppIcons.lightMode : AppIcons.darkMode,
            selected: false,
            onTap: onToggleTheme,
            trailing: const SizedBox.shrink(),
          ),
          const SizedBox(height: Space.x3),
          AppSelectableRow(
            title: 'Saved addresses',
            icon: AppIcons.location,
            selected: false,
            onTap: () {},
            trailing: const SizedBox.shrink(),
          ),
          const SizedBox(height: Space.x3),
          AppSelectableRow(
            title: 'Language',
            subtitle: switch (user?.language) { 'te' => 'తెలుగు', 'hi' => 'हिन्दी', _ => 'English' },
            icon: AppIcons.language,
            selected: false,
            onTap: () {},
            trailing: const SizedBox.shrink(),
          ),
          const SizedBox(height: Space.x8),
          AppButton(
            label: 'Sign out',
            variant: AppButtonVariant.danger,
            icon: AppIcons.logout,
            onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
          ),
        ],
      ),
    );
  }
}
