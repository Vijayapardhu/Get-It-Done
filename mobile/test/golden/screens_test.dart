@Tags(['golden'])
library;

import 'dart:io';

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// `Override` is not exported from the main flutter_riverpod entrypoint in
// Riverpod 3 — it lives in misc.dart.
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:getitdone_customer/features/bookings/bookings_tab.dart';
import 'package:getitdone_customer/core/api/gid_api.dart';
import 'package:getitdone_customer/core/models/account_models.dart';
import 'package:getitdone_customer/core/models/models.dart';
import 'package:getitdone_customer/core/providers.dart';
import 'package:getitdone_customer/design/design_system.dart';
import 'package:getitdone_customer/features/account/invoices_screen.dart';
import 'package:getitdone_customer/features/account/recurring_plans_screen.dart';
import 'package:getitdone_customer/features/account/profile_tab.dart';
import 'package:getitdone_customer/features/account/language_screen.dart';
import 'package:getitdone_customer/features/account/notification_settings_screen.dart';
import 'package:getitdone_customer/features/chat/chat_screens.dart';
import 'package:getitdone_customer/core/models/payment_models.dart';
import 'package:getitdone_customer/core/cart/cart.dart';
import 'package:getitdone_customer/core/cart/checkout.dart';
import 'package:getitdone_customer/features/cart/cart_screen.dart';
import 'package:getitdone_customer/features/orders/order_confirmed_screen.dart';
import 'package:getitdone_customer/features/catalogue/service_detail_screen.dart';
import 'package:getitdone_customer/features/emergency/emergency_screen.dart';
import 'package:getitdone_customer/features/home/home_screen.dart';
import 'package:getitdone_customer/features/payment/payment_screen.dart';
import 'package:getitdone_customer/features/support/support_screens.dart';

/// Golden renders of the account, chat, plans, payments, support and emergency
/// screens.
///
/// These render the PRODUCTION widgets with provider overrides rather than
/// preview copies, so what the PNG shows is what ships. Every provider the
/// screen reads is overridden with fixture data — otherwise the golden is a
/// picture of a skeleton loader, which reviews nothing.
///
/// Run with:  flutter test --update-goldens test/golden/screens_test.dart
Future<void> _loadFonts() async {
  const families = {
    'PlusJakartaSans': ['400', '500', '600', '700'],
    'NotoSansTelugu': ['400', '500', '600', '700'],
    'NotoSansDevanagari': ['400', '500', '600', '700'],
  };

  for (final entry in families.entries) {
    final loader = FontLoader(entry.key);
    for (final weight in entry.value) {
      loader.addFont(rootBundle.load('assets/fonts/${entry.key}-$weight.ttf'));
    }
    await loader.load();
  }
}

/// Fixed clock for the fixtures.
///
/// Screens render relative labels — "Today at 14:08", "in 2 days", "11:47" —
/// so a golden captured at one moment and verified at another disagrees on the
/// text. Offsets from the real `DateTime.now()` do not fix that; they just
/// move the drift. The screens read `clock.now()` instead, and every golden
/// runs inside `withClock`, which pins both capture and verification to the
/// same instant.
final _now = DateTime(2026, 8, 26, 14, 8);

const _user = AppUser(
  id: 'u1',
  name: 'Anitha Reddy',
  role: 'customer',
  phone: '+919876543210',
  email: 'anitha@example.com',
);

/// The catalogue as the backend actually serves it, artwork URLs included.
///
/// Nothing fetches those URLs here — a widget test has no network — and that is
/// deliberate: the golden then shows the strip in its WORST case, every tile
/// fallen back to the glyph. If the layout holds there it holds when the
/// artwork arrives, because the artwork box is a fixed size either way.
final _services = <Service>[
  Service.fromJson({
    'id': 's1',
    'name': 'Plumbing',
    'category': 'Home Repair',
    'basePrice': 299,
    // Rated, and on promotion: exercises both conditional bits of the card.
    'ratingAverage': 4.7,
    'ratingCount': 7,
    'listPrice': 399,
    'imageUrl': '/media/artwork/plumbing.png',
    'animationUrl': '/media/artwork/plumbing.json',
    'categoryAccentColor': '#2FA0A0',
  }),
  Service.fromJson({
    'id': 's2',
    'name': 'Electrical',
    'category': 'Home Repair',
    'basePrice': 349,
    // Rated but not discounted.
    'ratingAverage': 4.9,
    'ratingCount': 42,
    'imageUrl': '/media/artwork/electrical.png',
    'animationUrl': '/media/artwork/electrical.json',
    'categoryAccentColor': '#2FA0A0',
  }),
  // No artwork of its own: it inherits the category's, exactly as Cleaning
  // does against the real database.
  Service.fromJson({
    'id': 's3',
    'name': 'Cleaning',
    'category': 'Household',
    'basePrice': 499,
    'categoryImageUrl': '/media/artwork/household.png',
    'categoryAccentColor': '#E8A317',
  }),
];

final _detail = ServiceDetail(
  service: _services.first,
  includes: const [
    'Diagnosing the fault and explaining what is wrong',
    'Tap, mixer and shower fitting repair or replacement',
    'Clearing blocked sinks, basins and floor drains',
  ],
  excludes: const [
    'Replacement parts and fittings, which are billed separately at cost',
    'Concealed pipe work requiring wall or floor breaking',
  ],
  steps: const [
    ServiceStep(title: 'Find the fault', description: 'The worker traces the leak rather than guessing.'),
    ServiceStep(title: 'Agree the fix', description: 'You are told what any parts cost before work starts.'),
    ServiceStep(title: 'Test and clean up', description: 'Run under pressure to confirm it holds.'),
  ],
  faqs: const [
    ServiceFaq(
      question: 'Are parts included in the price?',
      answer: 'No. The booking covers the visit and the labour; parts are billed at cost on the invoice.',
    ),
    ServiceFaq(
      question: 'What if the leak comes back?',
      answer: 'Report it from the same booking within 30 days and the return visit is free.',
    ),
  ],
);

const _address = SavedAddress(
  id: 'addr-1',
  name: 'Home',
  address: 'Flat 402, Sai Enclave, Benz Circle, Vijayawada 520010',
  latitude: 16.5062,
  longitude: 80.6480,
  isDefault: true,
);

/// Notifier overrides so a golden can pin cart and checkout state without
/// driving the UI to build it up tap by tap.
class _StubCart extends CartController {
  _StubCart(this._lines);
  final List<CartLine> _lines;
  @override
  Cart build() => Cart(lines: _lines);
}

class _StubCheckout extends CheckoutController {
  _StubCheckout(this._state);
  final CheckoutState _state;
  @override
  CheckoutState build() => _state;
}

final _placedOrder = PlacedOrder.fromJson({
  'order': {
    'id': 'o1',
    'mode': 'scheduled',
    'total': 764.64,
    'scheduledAt': '2026-08-28T10:30:00.000Z',
    'address': 'Flat 402, Sai Enclave, Benz Circle, Vijayawada 520010',
  },
  'bookings': [
    {'id': 'b1', 'status': 'assigned', 'serviceName': 'Plumbing', 'price': 352.82},
    {'id': 'b2', 'status': 'requested', 'serviceName': 'Electrical', 'price': 411.82},
  ],
  'otps': [
    {'bookingId': 'b1', 'startOtp': '482915', 'completionOtp': '730164'},
    {'bookingId': 'b2', 'startOtp': '215907', 'completionOtp': '648302'},
  ],
});

final _bookings = <Booking>[
  Booking.fromJson({
    'id': 'b1',
    'status': 'en_route',
    'service_name': 'Plumbing repair',
    'service_category': 'plumbing',
    'address': 'Flat 402, Sai Enclave, Benz Circle',
    'price': 850,
    'scheduled_at': _now.add(const Duration(hours: 2)).toIso8601String(),
  }),
  Booking.fromJson({
    'id': 'b2',
    'status': 'matching',
    'service_name': 'Deep cleaning',
    'service_category': 'cleaning',
    'address': 'Flat 402, Sai Enclave, Benz Circle',
    'price': 1600,
    'scheduled_at': _now.add(const Duration(days: 3)).toIso8601String(),
  }),
];

final _invoices = <Invoice>[
  Invoice.fromJson({
    'id': 'i1',
    'invoiceNumber': 'GID-2026-000418',
    'bookingId': 'b0',
    'subtotal': 850.0,
    'tax': 153.0,
    'total': 1003.0,
    'platformFee': 100.3,
    'cooperativeShare': 50.15,
    'welfareFund': 20.06,
    'workerShare': 832.49,
    'paymentStatus': 'paid',
    'issuedAt': _now.subtract(const Duration(days: 6)).toIso8601String(),
  }),
  Invoice.fromJson({
    'id': 'i2',
    'invoiceNumber': 'GID-2026-000377',
    'bookingId': 'b-1',
    'subtotal': 1600.0,
    'tax': 288.0,
    'total': 1888.0,
    'platformFee': 188.8,
    'cooperativeShare': 94.4,
    'welfareFund': 37.76,
    'workerShare': 1567.04,
    'paymentStatus': 'paid',
    'issuedAt': _now.subtract(const Duration(days: 34)).toIso8601String(),
  }),
];

final _plans = <RecurringPlan>[
  RecurringPlan.fromJson({
    'id': 'r1',
    'serviceName': 'Home cleaning',
    'frequency': 'weekly',
    'daysOfWeek': [1, 4],
    'status': 'active',
    'nextGenerationAt': _now.add(const Duration(days: 2)).toIso8601String(),
  }),
  RecurringPlan.fromJson({
    'id': 'r2',
    'serviceName': 'Water tank cleaning',
    'frequency': 'monthly',
    'status': 'paused',
  }),
];

final _tickets = <SupportTicket>[
  SupportTicket.fromJson({
    'id': 't1',
    'description': 'Worker arrived late\nThe plumber was ninety minutes past the slot.',
    'category': 'service_quality',
    'status': 'open',
    'createdAt': _now.subtract(const Duration(days: 1)).toIso8601String(),
  }),
  SupportTicket.fromJson({
    'id': 't2',
    'description': 'Refund not received\nCancelled on the 3rd, still not credited.',
    'category': 'payment',
    'status': 'resolved',
    'createdAt': _now.subtract(const Duration(days: 12)).toIso8601String(),
  }),
];

final _chat = ChatThread.fromJson({
  'id': 'c1',
  'bookingId': 'b1',
  'title': 'Ravi Kumar',
  'lastMessage': 'On my way, about 10 minutes.',
  'lastMessageAt': _now.subtract(const Duration(minutes: 4)).toIso8601String(),
});

final _messages = <ChatMessage>[
  ChatMessage.fromJson({
    'id': 'm1',
    'body': 'Hello, the kitchen tap is leaking under the sink.',
    'senderId': 'u1',
    'createdAt': _now.subtract(const Duration(minutes: 22)).toIso8601String(),
  }),
  ChatMessage.fromJson({
    'id': 'm2',
    'body': 'Understood. Do you have a shut-off valve below the basin?',
    'senderId': 'w1',
    'senderName': 'Ravi Kumar',
    'createdAt': _now.subtract(const Duration(minutes: 18)).toIso8601String(),
  }),
  ChatMessage.fromJson({
    'id': 'm3',
    'body': 'Yes, I have closed it. Gate code is 4021, second floor.',
    'senderId': 'u1',
    'createdAt': _now.subtract(const Duration(minutes: 12)).toIso8601String(),
  }),
  ChatMessage.fromJson({
    'id': 'm4',
    'body': 'On my way, about 10 minutes.',
    'senderId': 'w1',
    'senderName': 'Ravi Kumar',
    'createdAt': _now.subtract(const Duration(minutes: 4)).toIso8601String(),
  }),
];

final _completedBooking = Booking.fromJson({
  'id': 'b9',
  'status': 'completed',
  'service_name': 'Plumbing repair',
  'service_category': 'plumbing',
  'address': 'Flat 402, Sai Enclave, Benz Circle',
  'price': 352.82,
});

final _emergencyService = Service.fromJson(const {
  'id': 's1',
  'name': 'Gas leak',
  'category': 'plumbing',
  'description': 'Immediate response for gas and water emergencies',
  'emergency_supported': true,
});

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await _loadFonts();

    // A tile with an image URL sends cached_network_image looking for the
    // platform's cache directory, and a widget test has no platform: the
    // channel call throws and takes the whole render down. Answering it with a
    // temp directory keeps the artwork URLs in the fixtures, which is the
    // point — the golden should exercise the path the app really takes, then
    // show the glyph because the fetch itself fails.
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => Directory.systemTemp.createTempSync('gid_golden').path,
    );
  });

  // Note when reviewing these PNGs: flutter_test forces `debugDisableShadows`
  // and paints Material elevation as a hard black outline. The heavy ring
  // around the FAB and other elevated surfaces is that artifact, not the
  // design — it cannot be turned off, because the binding asserts the flag is
  // still set when each test ends.

  Future<void> render(
    WidgetTester tester,
    String name,
    Widget child,
    List<Override> overrides,
    Brightness brightness,
    bool settle,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWithValue(_user),
          ...overrides,
        ],
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: brightness == Brightness.light ? AppTheme.light(null) : AppTheme.dark(null),
          home: child,
        ),
      ),
    );
    if (settle) {
      await tester.pumpAndSettle();
    } else {
      // Screens with an indefinite progress indicator never settle. Pump a
      // fixed number of frames instead of waiting for quiescence.
      await tester.pump(const Duration(milliseconds: 400));
    }

    await expectLater(find.byType(MaterialApp), matchesGoldenFile('$name.png'));
  }

  Future<void> shoot(
    WidgetTester tester,
    String name,
    Widget child, {
    List<Override> overrides = const [],
    Brightness brightness = Brightness.light,
    Size size = const Size(390, 844),
    bool settle = true,
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    // Everything renders at one pinned instant, so a golden captured now and
    // verified in ten minutes agrees on every relative label.
    await withClock(
      Clock.fixed(_now),
      () => render(tester, name, child, overrides, brightness, settle),
    );
  }

  testWidgets('home', (tester) async {
    await shoot(
      tester,
      'home_screen_light',
      // HomeScreen is a tab body, not a route: the Scaffold belongs to the
      // shell that hosts it, so the golden has to supply one.
      Scaffold(
        body: HomeScreen(
          onOpenService: (_) {},
          onOpenBooking: (_) {},
          onOpenSearch: () {},
          onOpenWorker: (_) {},
          onStartEmergency: () {},
          onOpenProfile: () {},
        ),
      ),
      overrides: [
        servicesProvider.overrideWith((ref) async => _services),
        dashboardProvider.overrideWith((ref) async => CustomerDashboard(upcoming: _bookings)),
        addressesProvider.overrideWith((ref) async => const <SavedAddress>[]),
      ],
    );
  });

  // A tall render of the whole page, for reviewing the catalogue below the
  // fold. 844 shows the hero and the first row of cards and nothing else.
  testWidgets('home full', (tester) async {
    await shoot(
      tester,
      'home_screen_full_light',
      Scaffold(
        body: HomeScreen(
          onOpenService: (_) {},
          onOpenBooking: (_) {},
          onOpenSearch: () {},
          onOpenWorker: (_) {},
          onStartEmergency: () {},
          onOpenProfile: () {},
        ),
      ),
      size: const Size(390, 1700),
      overrides: [
        servicesProvider.overrideWith((ref) async => _services),
        dashboardProvider.overrideWith((ref) async => CustomerDashboard(upcoming: _bookings)),
        addressesProvider.overrideWith((ref) async => const <SavedAddress>[]),
      ],
    );
  });

  testWidgets('service detail', (tester) async {
    await shoot(
      tester,
      'service_detail_light',
      ServiceDetailScreen(service: _services.first),
      size: const Size(390, 1900),
      overrides: [
        serviceDetailProvider(_services.first.id).overrideWith((ref) async => _detail),
      ],
    );
  });

  testWidgets('cart scheduled', (tester) async {
    await shoot(
      tester,
      'cart_scheduled_light',
      CartScreen(onPlaced: (_) {}),
      size: const Size(390, 1200),
      overrides: [
        addressesProvider.overrideWith((ref) async => [_address]),
        cartProvider.overrideWith(() => _StubCart([
              CartLine(service: _services[0]),
              CartLine(service: _services[2], quantity: 2),
            ])),
        checkoutProvider.overrideWith(() => _StubCheckout(
              CheckoutState(
                mode: CheckoutMode.scheduled,
                addressId: _address.id,
                scheduledAt: _now.add(const Duration(days: 1, hours: 4)),
              ),
            )),
      ],
    );
  });

  testWidgets('cart recurring', (tester) async {
    await shoot(
      tester,
      'cart_recurring_light',
      CartScreen(onPlaced: (_) {}),
      size: const Size(390, 1200),
      overrides: [
        addressesProvider.overrideWith((ref) async => [_address]),
        cartProvider.overrideWith(() => _StubCart([CartLine(service: _services[0])])),
        checkoutProvider.overrideWith(() => _StubCheckout(
              CheckoutState(
                mode: CheckoutMode.recurring,
                addressId: _address.id,
                scheduledAt: _now.add(const Duration(days: 1, hours: 4)),
                days: const {1, 4},
              ),
            )),
      ],
    );
  });

  testWidgets('order confirmed', (tester) async {
    await shoot(
      tester,
      'order_confirmed_light',
      OrderConfirmedScreen(order: _placedOrder, onTrack: (_) {}, onDone: () {}),
      size: const Size(390, 1400),
    );
  });

  testWidgets('profile', (tester) async {
    await shoot(tester, 'profile_light', ProfileTab(onToggleTheme: () {}));
  });

  testWidgets('profile dark', (tester) async {
    await shoot(
      tester,
      'profile_dark',
      ProfileTab(onToggleTheme: () {}),
      brightness: Brightness.dark,
    );
  });

  testWidgets('bookings', (tester) async {
    await shoot(
      tester,
      'bookings_light',
      BookingsTab(onOpenBooking: (_) {}),
      overrides: [bookingsProvider.overrideWith((ref) async => _bookings)],
    );
  });

  testWidgets('bookings empty', (tester) async {
    await shoot(
      tester,
      'bookings_empty_light',
      BookingsTab(onOpenBooking: (_) {}),
      overrides: [bookingsProvider.overrideWith((ref) async => <Booking>[])],
    );
  });

  testWidgets('payments', (tester) async {
    await shoot(
      tester,
      'payments_light',
      const InvoicesScreen(),
      overrides: [invoicesProvider.overrideWith((ref) async => _invoices)],
    );
  });

  testWidgets('repeat services', (tester) async {
    await shoot(
      tester,
      'repeat_services_light',
      const RecurringPlansScreen(),
      overrides: [recurringPlansProvider.overrideWith((ref) async => _plans)],
    );
  });

  testWidgets('support', (tester) async {
    await shoot(
      tester,
      'support_light',
      const SupportScreen(),
      overrides: [supportTicketsProvider.overrideWith((ref) async => _tickets)],
    );
  });

  testWidgets('chat', (tester) async {
    await shoot(
      tester,
      'chat_light',
      ChatScreen(chat: _chat),
      overrides: [
        chatMessagesProvider(_chat.id).overrideWith((ref) async => _messages),
      ],
    );
  });

  testWidgets('chat dark', (tester) async {
    await shoot(
      tester,
      'chat_dark',
      ChatScreen(chat: _chat),
      brightness: Brightness.dark,
      overrides: [
        chatMessagesProvider(_chat.id).overrideWith((ref) async => _messages),
      ],
    );
  });

  testWidgets('notification settings', (tester) async {
    await shoot(
      tester,
      'notification_settings_light',
      const NotificationSettingsScreen(),
      overrides: [
        notificationPreferencesProvider.overrideWith(
          (ref) async => const NotificationPreferences(
            push: true,
            sms: true,
            email: false,
            inApp: true,
          ),
        ),
      ],
    );
  });

  testWidgets('language', (tester) async {
    await shoot(
      tester,
      'language_light',
      const LanguageScreen(),
      overrides: [
        languagesProvider.overrideWith((ref) async => const [
              AppLanguage(code: 'en', name: 'English', nativeName: 'English'),
              AppLanguage(code: 'te', name: 'Telugu', nativeName: 'తెలుగు'),
              AppLanguage(code: 'hi', name: 'Hindi', nativeName: 'हिन्दी'),
            ]),
      ],
    );
  });

  // The payment screen creates its order on open, so the golden needs the API
  // stubbed. Without an override it renders the failed state, which is a real
  // branch but not the one worth reviewing.
  testWidgets('payment', (tester) async {
    await shoot(
      tester,
      'payment_light',
      PaymentScreen(booking: _completedBooking),
      settle: false,
      overrides: [
        apiProvider.overrideWithValue(_StubApi(
          PaymentIntent(
            order: PaymentOrder.fromJson(const {
              'id': 'po1',
              'bookingId': 'b9',
              'amount': 352.82,
              'status': 'created',
              'providerOrderId': 'order_test_1',
            }),
            checkout: CheckoutSession.fromJson(const {
              'paymentOrderId': 'po1',
              'amountInPaise': 35282,
              'amount': 352.82,
              'keyId': 'rzp_test_key',
              'providerOrderId': 'order_test_1',
              'live': true,
            }),
          ),
        )),
      ],
    );
  });

  testWidgets('payment test mode', (tester) async {
    await shoot(
      tester,
      'payment_testmode_light',
      PaymentScreen(booking: _completedBooking),
      settle: false,
      overrides: [
        apiProvider.overrideWithValue(_StubApi(
          PaymentIntent(
            order: PaymentOrder.fromJson(const {
              'id': 'po2',
              'bookingId': 'b9',
              'amount': 352.82,
              'status': 'created',
              'providerOrderId': 'order_sim_1',
            }),
            checkout: CheckoutSession.fromJson(const {
              'paymentOrderId': 'po2',
              'amountInPaise': 35282,
              'amount': 352.82,
              'providerOrderId': 'order_sim_1',
              'live': false,
            }),
          ),
        )),
      ],
    );
  });

  // Location is unavailable in the test binding, so this renders the fallback
  // path — which is exactly the branch worth reviewing, because it is the one
  // that has to still work when GPS is refused mid-emergency.
  testWidgets('emergency', (tester) async {
    await shoot(
      tester,
      'emergency_light',
      EmergencyScreen(service: _emergencyService, onDispatched: (_) {}),
      settle: false,
      overrides: [
        addressesProvider.overrideWith((ref) async => [
              SavedAddress.fromJson(const {
                'id': 'a1',
                'name': 'Home',
                'address': 'Flat 402, Sai Enclave, Benz Circle, Vijayawada',
                'latitude': 16.5062,
                'longitude': 80.6480,
                'is_default': true,
              }),
            ]),
      ],
    );
  });
}

/// Minimal stand-in for the API so the payment golden renders a real order
/// instead of the "could not prepare" branch.
class _StubApi implements GidApi {
  _StubApi(this.intent);

  final PaymentIntent intent;

  @override
  Future<PaymentIntent> createPaymentOrder({
    required String bookingId,
    required String idempotencyKey,
    String provider = 'razorpay',
  }) async =>
      intent;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
