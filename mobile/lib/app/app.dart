import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/models.dart';
import '../core/providers.dart';
import '../design/design_system.dart';
import '../core/ui/service_artwork.dart';
import '../features/account/profile_tab.dart';
import '../features/auth/sign_in_screen.dart';
import '../features/booking/booking_otp_screen.dart';
import '../features/booking/review_screen.dart';
import '../features/booking/track_booking_screen.dart';
import '../features/emergency/emergency_screen.dart';
import '../features/cart/cart_bar.dart';
import '../features/catalogue/service_detail_screen.dart';
import '../features/cart/cart_screen.dart';
import '../features/orders/order_confirmed_screen.dart';
import '../features/orders/order_detail_screen.dart';
import '../features/home/home_screen.dart';
import 'search_screen.dart';
import '../features/bookings/bookings_tab.dart';
import '../features/notifications/notifications_tab.dart';
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

    // Start the config fetch here so the OAuth client id and payment key are
    // in hand by the time anything needs them. Its result is never awaited —
    // a slow or failed config must not hold the app on a splash screen, and
    // effectiveConfigProvider falls back to the build-time values meanwhile.
    ref.watch(remoteConfigProvider);

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
  final _navigatorKeys = List.generate(3, (_) => GlobalKey<NavigatorState>());

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

  /// Open a booking at the right screen for its state.
  ///
  /// A live booking goes to tracking; a finished one that has not been rated
  /// goes straight to the review, because that is the only action left.
  void _openBooking(Booking booking) {
    if (booking.status == 'completed') {
      _push(ReviewScreen(booking: booking));
      return;
    }
    _push(TrackBookingScreen(
      bookingId: booking.id,
      onOpenCodes: () => _push(BookingOtpScreen(
        bookingId: booking.id,
        otps: null,
        status: booking.status,
      )),
      onOpenWorker: (workerId) => _push(TrustScreen(workerId: workerId)),
      onReview: (completed) => _push(ReviewScreen(booking: completed)),
      onOpenOrder: _openOrder,
    ));
  }

  /// Emergency takes its own screen and its own backend path — see
  /// [EmergencyScreen]. It is not the booking flow with a red button.
  void _openEmergency(Service service) {
    _push(EmergencyScreen(
      service: service,
      onDispatched: (result) {
        _navigatorKeys[_tab].currentState?.pushReplacement(
              MaterialPageRoute<void>(
                builder: (_) => BookingConfirmedScreen(
                  result: result,
                  onViewCodes: () => _push(BookingOtpScreen(
                    bookingId: result.booking.id,
                    otps: result.otps,
                    status: result.booking.status,
                  )),
                  onTrack: () => _openBooking(result.booking),
                ),
              ),
            );
      },
    ));
  }

  /// Tapping a service opens its page, not the booking form.
  ///
  /// The form asks when and where before the customer has decided whether they
  /// want the thing at all. The detail page answers that first, and adds to the
  /// cart; scheduling happens once at checkout for everything in it.
  void _openService(Service service) {
    _push(ServiceDetailScreen(service: service));
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
                onOpenBooking: _openBooking,
                onOpenWorker: (workerId) => _push(TrustScreen(workerId: workerId)),
                // "Get it done now" opens the same emergency picker as the FAB,
                // rather than a second instant path that would diverge from it.
                onStartEmergency: () => _showEmergencySheet(context),
                onOpenProfile: _openProfile,
              ),
            ),
            _TabNavigator(
              navigatorKey: _navigatorKeys[1],
              child: BookingsTab(onOpenBooking: _openBooking),
            ),
            _TabNavigator(
              navigatorKey: _navigatorKeys[2],
              child: const NotificationsTab(),
            ),
          ],
        ),
        // No emergency FAB. It floated over the catalogue grid, covering the
        // third card in the first row, and it duplicated a path that already
        // has a home: "Get it done now" in the header opens the same picker.
        // The feature is unchanged — only the second, overlapping doorway to
        // it is gone.
        //
        // The cart bar sits above the navigation rather than on the home
        // screen, so someone who added two services and then wandered into
        // Bookings can still see what they were in the middle of. It collapses
        // to nothing when the cart is empty.
        bottomNavigationBar: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CartBar(onOpenCart: _openCart),
            AppBottomNav(
          currentIndex: _tab,
          onTap: (i) => setState(() => _tab = i),
          items: [
            const AppNavItem(icon: AppIcons.home, label: 'Home'),
            const AppNavItem(icon: AppIcons.bookings, label: 'Bookings'),
            AppNavItem(icon: AppIcons.notifications, label: 'Alerts', badgeCount: unread),
          ],
        ),
          ],
        ),
      ),
    );
  }

  /// The cart is app-level state, so it opens over the current tab rather than
  /// sending the user back to Home to find it.
  void _openCart() {
    _push(CartScreen(onPlaced: _onOrderPlaced));
  }

  /// An order is several bookings, so there is no single booking to open.
  ///
  /// It goes to the confirmation page rather than a snackbar, because that page
  /// carries the handshake codes and the server issues those exactly once.
  /// Pushed with a replacement so "back" cannot return to the emptied cart.
  void _onOrderPlaced(PlacedOrder order) {
    _navigatorKeys[_tab].currentState?.pushReplacement(
          MaterialPageRoute<void>(
            builder: (_) => OrderConfirmedScreen(
              order: order,
              onTrack: (booking) => _openBooking(booking),
              onDone: () {
                _navigatorKeys[_tab].currentState?.popUntil((route) => route.isFirst);
                setState(() => _tab = 1);
              },
            ),
          ),
        );
  }

  /// Everything booked together, and how the whole order is going.
  void _openOrder(String orderId) {
    _push(OrderDetailScreen(orderId: orderId, onOpenBooking: _openBooking));
  }

  /// Profile is reached from the avatar in the home header rather than a tab.
  ///
  /// It is a place you visit occasionally to change something, not one of the
  /// three things this app is for; a permanent tab spent a quarter of the bar
  /// on settings. Pushed as a route, so the back gesture returns you to what
  /// you were doing.
  void _openProfile() {
    _push(ProfileTab(onToggleTheme: widget.onToggleTheme));
  }

  void _showEmergencySheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => _EmergencySheet(
        onPick: (service) {
          Navigator.of(sheetContext).pop();
          _openEmergency(service);
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
                      icon: ServiceVisuals.forNames([service.name, service.category]).icon,
                      leading: ServiceArtwork(service: service, size: 40),
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
