import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import 'package:gid_core/gid_core.dart';
import '../core/config/theme_config.dart';
import '../core/notifications/local_notifications.dart';
import '../core/notifications/push_messaging.dart';
import '../core/providers.dart';
import '../design/design_system.dart';
import '../core/ui/service_artwork.dart';
import '../features/account/profile_tab.dart';
import '../features/auth/account_gate.dart';
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
import '../features/instant/instant_service_screen.dart';
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
  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    // Drives the script-aware font swap; the backend stores the preference on
    // the user, so it follows them across devices.
    final locale = Locale(user?.language ?? 'en');

    // Light unless the customer said otherwise, and never ThemeMode.system —
    // see AppThemeChoice for why following the OS is the wrong accommodation
    // for this app.
    final theme = ref.watch(themeProvider);

    return MaterialApp(
      title: 'GET IT DONE',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(locale),
      darkTheme: AppTheme.dark(locale),
      themeMode: theme.mode,
      locale: locale,
      // Without these the app rendered every word in English regardless of the
      // language the customer picked -- the typeface swapped and nothing else
      // did. `supportedLocales` comes from the .arb files, so en/te/hi here
      // stays in step with what /config/mobile advertises.
      localizationsDelegates: AppL10n.localizationsDelegates,
      supportedLocales: AppL10n.supportedLocales,
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
        themeMode: theme.mode,
        onToggleTheme: ref.read(themeProvider.notifier).toggle,
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

    // The three root states cross-fade into each other rather than cutting.
    //
    // Launch used to be a sequence of hard swaps -- splash, then sign-in or the
    // shell, each appearing instantly where the last one was. Each swap is a
    // moment the eye has to re-find the screen. A fade of one beat costs
    // nothing and turns three states into one movement.
    //
    // Keyed by which state it is, not by widget type: without a key the
    // switcher sees a Stack replaced by a Stack and does not animate at all.
    return AnimatedSwitcher(
      duration: Motion.base,
      switchInCurve: Motion.curve,
      switchOutCurve: Motion.curveExit,
      child: _rootFor(context, ref, auth),
    );
  }

  Widget _rootFor(BuildContext context, WidgetRef ref, AuthState auth) {
    // Hold on the splash while the stored session is validated, so an
    // authenticated user never sees sign-in flash past on launch.
    if (auth.isResolving) return const _SplashScreen(key: ValueKey('splash'));

    // A guest gets the shell, same as a signed-in customer. The difference is
    // expressed inside it — see AccountGate — rather than by a second root,
    // because "browse without an account" that leads to a cut-down second app
    // is worse than a sign-in wall, not better.
    if (!auth.isBrowsing) {
      return Stack(
        key: const ValueKey('sign-in'),
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

    return AppShell(
      key: const ValueKey('shell'),
      themeMode: themeMode,
      onToggleTheme: onToggleTheme,
    );
  }
}

/// The first screen, and the one nobody should notice.
///
/// It continues the native launch window rather than replacing it: Android has
/// already painted this white ground with this mark centred on it (see
/// launch_background.xml), so at the handover from the native window to Flutter
/// the picture does not change at all. What the user sees is a still mark that
/// then breathes — not an app starting twice.
///
/// The animation is short and does not loop. A splash that keeps moving is
/// telling you it is stuck; this one settles, and by the time it has, the
/// stored session has usually resolved and the screen is gone.
class _SplashScreen extends StatefulWidget {
  const _SplashScreen({super.key});

  @override
  State<_SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<_SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: Motion.emphasis,
  )..forward();

  /// The mark settles from very slightly large, which reads as the icon the
  /// user just tapped coming to rest. Starting small and growing would read as
  /// the app loading, which is the thing we are trying not to say.
  late final Animation<double> _scale = Tween(begin: 1.06, end: 1.0).animate(
    CurvedAnimation(parent: _controller, curve: Motion.curveEmphasis),
  );

  /// The words arrive after the mark, not with it.
  late final Animation<double> _wordsFade = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0.45, 1, curve: Motion.curve),
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // The same badge that sits on their home screen and on the native
            // launch window. Recognising it is the whole point.
            ScaleTransition(
              scale: _scale,
              child: Image.asset(
                'assets/brand/mark.png',
                width: 88,
                height: 88,
                filterQuality: FilterQuality.medium,
              ),
            ),
            const SizedBox(height: Space.x5),
            FadeTransition(
              opacity: _wordsFade,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('GET IT DONE', style: context.text.headlineSmall),
                  const SizedBox(height: Space.x2),
                  Text(
                    'Cooperative services',
                    style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                  ),
                ],
              ),
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

  @override
  void initState() {
    super.initState();

    // Ask once the user is actually signed in, rather than on first launch.
    //
    // Android 13 puts the permission behind a system dialog, and a dialog that
    // appears before anyone has seen what the app does gets denied out of
    // reflex -- after which it cannot be asked again from inside the app. By
    // here the user has a reason to say yes.
    //
    // "Signed in" now has to be checked rather than assumed: the shell also
    // opens for a guest, who has no session, no socket and therefore nothing
    // that could ever produce a notification. Asking them spends the one
    // prompt Android grants on a permission that cannot be used yet.
    WidgetsBinding.instance.addPostFrameCallback((_) => _askForNotifications());
  }

  /// True once the system prompt has been raised, so a guest who signs in
  /// mid-session is asked exactly once and not again on every rebuild.
  bool _askedForNotifications = false;

  void _askForNotifications() {
    if (!mounted || _askedForNotifications) return;
    if (!ref.read(authControllerProvider).isAuthenticated) return;
    _askedForNotifications = true;
    ref.read(localNotificationsProvider).requestPermission();
  }

  /// Each tab keeps its own navigator, so switching tabs does not discard a
  /// half-finished booking flow.
  final _navigatorKeys = List.generate(4, (_) => GlobalKey<NavigatorState>());

  /// How deep each tab's own navigator is stacked.
  ///
  /// Zero means the tab is showing its root screen -- Home, Bookings, Alerts,
  /// Profile -- and the user is browsing. Anything above zero means they have
  /// pushed into a focused task: a service page, a slot picker, checkout,
  /// tracking a worker. Navigation is hidden there, because the job is to
  /// finish the task or go back, and a tab bar offers a third thing that
  /// abandons it.
  ///
  /// Driven by an observer rather than by each screen declaring itself, so a
  /// screen added later cannot forget to.
  final _stackDepth = List.filled(4, 0);

  late final _depthObservers = [
    for (var tab = 0; tab < 4; tab++)
      _DepthObserver((depth) {
        if (!mounted) return;
        setState(() => _stackDepth[tab] = depth);
      }),
  ];

  bool get _isBrowsing => _stackDepth[_tab] == 0;

  /// FCM is wired up once per session, not once per rebuild.
  bool _pushStarted = false;

  /// Socket notifications become system notifications for as long as this shell
  /// is mounted -- which is the whole signed-in session. Watched here rather
  /// than on the Alerts tab, which is exactly the screen the user is NOT on
  /// when a notification needs to reach them.
  void _listenForNotifications() {
    // Nothing to listen to without a session: the socket authenticates with
    // the access token, and a guest has none.
    if (ref.watch(authControllerProvider).isAuthenticated) {
      ref.watch(notificationBridgeProvider);

      // Remote push, for when this shell is NOT mounted -- the app closed, the
      // socket gone. Started after sign-in rather than at launch because
      // registering a device token requires a user to attach it to, and asking
      // a stranger for notification permission on first launch is how that
      // permission gets denied for good.
      //
      // Guarded and fired off the build: start() is async and hits the network,
      // and PushMessaging.start is itself idempotent.
      if (!_pushStarted) {
        _pushStarted = true;
        Future.microtask(() => ref.read(pushMessagingProvider).start());
      }
    }
  }

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
        // Null: read back from this device's OtpStore by the screen itself.
        // Passing them here would mean the codes only work on the path that
        // happens to have them in hand.
        otps: null,
        status: booking.status,
        workerName: booking.workerName,
        serviceName: booking.serviceName,
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
                    workerName: result.booking.workerName,
                    serviceName: result.booking.serviceName,
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
    final l10n = AppL10n.of(context);
    final unread = ref.watch(unreadNotificationCountProvider);
    _listenForNotifications();

    // A guest who signs in stays in THIS shell — the root's key does not
    // change, so initState will not run again. Catch the transition here
    // instead, or someone who browsed first would never be asked.
    ref.listen(authControllerProvider, (_, __) => _askForNotifications());

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
              observers: [_depthObservers[0]],
              child: HomeScreen(
                onOpenService: _openService,
                onOpenSearch: () => _push(SearchScreen(onOpenService: _openService)),
                onOpenBooking: _openBooking,
                onOpenWorker: (workerId) => _push(TrustScreen(workerId: workerId)),
                // Instant is its own path: pick a trade, then confirm. It is
                // NOT the emergency flow, which has its own screen, endpoint
                // and surcharge — routing here through that would quietly
                // charge emergency rates for a dripping tap.
                onStartEmergency: _startInstant,
                onOpenProfile: _openProfile,
                onOpenAlerts: () => setState(() => _tab = 2),
              ),
            ),
            _TabNavigator(
              navigatorKey: _navigatorKeys[1],
              observers: [_depthObservers[1]],
              // Guarded rather than hidden. Losing a tab would rearrange the
              // bar under a guest who signs in mid-session, and "your
              // bookings" is exactly the promise worth showing somebody who
              // has not made an account yet.
              child: AccountGate(
                action: 'see your bookings',
                icon: AppIcons.bookings,
                animation: 'assets/lottie/empty.json',
                child: BookingsTab(onOpenBooking: _openBooking),
              ),
            ),
            _TabNavigator(
              navigatorKey: _navigatorKeys[2],
              observers: [_depthObservers[2]],
              child: const AccountGate(
                action: 'get updates about your bookings',
                icon: AppIcons.notifications,
                child: NotificationsTab(),
              ),
            ),
            _TabNavigator(
              navigatorKey: _navigatorKeys[3],
              observers: [_depthObservers[3]],
              child: ProfileTab(onToggleTheme: widget.onToggleTheme),
            ),
          ],
        ),
        // Navigation and the cart strip are hidden together once a tab has
        // pushed into a focused task. They are hidden by DEPTH, not by scroll
        // position: furniture that vanishes because you flicked a list is the
        // thing people complain about without being able to name.
        //
        // The cart strip is its own bar above the navigation rather than part
        // of it. Navigation is where you can go; the strip is what you are
        // carrying.
        bottomNavigationBar: _isBrowsing
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CartBar(onOpenCart: _openCart),
                  AppBottomNav(
                    currentIndex: _tab,
                    onTap: (i) => setState(() => _tab = i),
                    items: [
                      AppNavItem(icon: AppIcons.home, label: l10n.navHome),
                      AppNavItem(icon: AppIcons.bookings, label: l10n.navBookings),
                      AppNavItem(
                        icon: AppIcons.notifications,
                        label: l10n.navAlerts,
                        badgeCount: unread,
                      ),
                      // No Profile destination. It is somewhere you go
                      // occasionally to change something, not one of the three
                      // things this app is for, and it was spending a quarter
                      // of the bar on settings. The header avatar still selects
                      // it -- it is a tab without a button, so the back gesture
                      // and its own navigation stack keep working.
                    ],
                  ),
                ],
              )
            : null,
      ),
    );
  }

  /// The cart is app-level state, so it opens over the current tab rather than
  /// sending the user back to Home to find it.
  /// "Get Instant Service": ask which trade, then straight to confirming.
  void _startInstant() {
    _push(InstantServiceScreen(
      onEmergency: () => _showEmergencySheet(context),
      onContinue: () {
        // Replace, not push. Going "back" from confirming into the picker that
        // filled the cart would offer to fill it again.
        _navigatorKeys[_tab].currentState?.pushReplacement(
              MaterialPageRoute<void>(
                builder: (_) => CartScreen(onPlaced: _onOrderPlaced),
              ),
            );
      },
    ));
  }

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

  /// The avatar in the home header selects the Profile TAB rather than
  /// pushing a second copy of it onto Home. Two routes to the same screen that
  /// behave differently under back is how an app starts feeling unreliable.
  void _openProfile() => setState(() => _tab = 3);

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
  const _TabNavigator({
    required this.navigatorKey,
    required this.child,
    this.observers = const [],
  });

  final GlobalKey<NavigatorState> navigatorKey;
  final Widget child;
  final List<NavigatorObserver> observers;

  @override
  Widget build(BuildContext context) {
    return Navigator(
      key: navigatorKey,
      observers: observers,
      onGenerateRoute: (settings) => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) => child,
      ),
    );
  }
}

/// Reports how deep a tab's navigator is stacked.
///
/// The shell hides its navigation when a tab pushes a focused screen, and this
/// is what tells it. An observer rather than a per-screen flag: screens get
/// added, and one that forgot to declare itself would show a tab bar over a
/// checkout without anybody noticing until it shipped.
class _DepthObserver extends NavigatorObserver {
  _DepthObserver(this.onChanged);

  /// Called with the number of routes ABOVE the tab's root.
  final ValueChanged<int> onChanged;

  int _depth = 0;

  void _emit(int next) {
    if (next == _depth) return;
    _depth = next;
    onChanged(next);
  }

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    // The tab's own root arrives as a push with nothing beneath it, and that
    // is depth zero rather than one.
    if (previousRoute != null) _emit(_depth + 1);
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (previousRoute != null) _emit(_depth - 1);
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (previousRoute != null) _emit(_depth - 1);
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    // Depth is unchanged by a replacement, but the shell may have popped back
    // to the root by another path, so re-assert rather than assume.
    _emit(_depth);
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
