@Tags(['golden'])
library;

import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:getitdone_customer/core/models/models.dart';
import 'package:getitdone_customer/design/design_system.dart';
import 'package:getitdone_customer/features/booking/booking_otp_screen.dart';
import 'package:getitdone_customer/features/auth/otp_sign_in_screen.dart';
import 'package:getitdone_customer/features/auth/sign_in_screen.dart';
import 'package:getitdone_customer/features/booking/review_screen.dart';

/// Renders the system to PNGs under `test/golden/` so the visual design can be
/// reviewed without a device.
///
/// Run with:  flutter test --update-goldens test/golden/render_test.dart
///
/// They run by default locally. CI should pass `--exclude-tags golden`: font
/// rasterisation differs across operating systems, so the same widget tree
/// produces a slightly different PNG on Linux than on Windows.
/// Load the bundled families into the test binding.
///
/// `flutter test` renders with the Ahem placeholder font unless the real ones
/// are registered explicitly, which is why goldens come out as solid boxes
/// otherwise. Assets declared in pubspec.yaml are reachable through rootBundle.
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

  await _loadIconFont();
}

/// Load Phosphor's icon font from the package on disk.
///
/// Phosphor is an icon FONT, unlike the vector-path pack it replaced, so a
/// golden captured without it shows every icon as an empty box.
///
/// rootBundle cannot reach it: a test's asset bundle carries only what THIS
/// package declares, and these fonts belong to phosphor_flutter's pubspec. The
/// real app bundles them at build time and needs none of this.
///
/// The package's location comes from .dart_tool/package_config.json, which is
/// what `pub get` writes and what the analyzer itself reads. Isolate
/// .resolvePackageUri would be the obvious route and throws under flutter_test;
/// a hardcoded pub-cache path differs per machine and per version.
Future<void> _loadIconFont() async {
  final config = File('.dart_tool/package_config.json');
  if (!config.existsSync()) return;

  final packages = (jsonDecode(config.readAsStringSync())
      as Map<String, dynamic>)['packages'] as List<dynamic>;

  final entry = packages.cast<Map<String, dynamic>>().firstWhere(
        (package) => package['name'] == 'phosphor_flutter',
        orElse: () => const <String, dynamic>{},
      );
  if (entry.isEmpty) return;

  // The trailing slash matters: Uri.resolve REPLACES the last segment when the
  // base has none, so ".../phosphor_flutter-2.1.0" + "lib/" resolved to
  // ".../lib/" and quietly found nothing.
  final rootValue = entry['rootUri'] as String;
  final root = config.absolute.uri
      .resolve(rootValue.endsWith('/') ? rootValue : '$rootValue/');
  final lib = root.resolve('${entry['packageUri']}');

  // Registered under the PREFIXED family name. PhosphorIconData sets
  // fontPackage, so Flutter looks the family up as
  // "packages/phosphor_flutter/PhosphorRegular" -- registering plain
  // "Phosphor" loads a font nothing ever asks for, and every icon stays an
  // empty box while the loader reports success.
  for (final font in const {
    'PhosphorRegular': 'Phosphor.ttf',
    'PhosphorBold': 'Phosphor-Bold.ttf',
    'PhosphorFill': 'Phosphor-Fill.ttf',
  }.entries) {
    final file = File.fromUri(lib.resolve('fonts/${font.value}'));
    if (!file.existsSync()) continue;

    final bytes = file.readAsBytesSync();
    final loader = FontLoader('packages/phosphor_flutter/${font.key}')
      ..addFont(Future.value(ByteData.view(bytes.buffer)));
    await loader.load();
  }
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await _loadFonts();
  });

  // Note when reviewing these PNGs: flutter_test forces `debugDisableShadows`
  // and paints Material elevation as a hard black outline. The heavy ring
  // around the FAB and other elevated surfaces is that artifact, not the
  // design — it cannot be turned off, because the binding asserts the flag is
  // still set when each test ends.

  Future<void> shoot(
    WidgetTester tester,
    String name,
    Widget child, {
    Brightness brightness = Brightness.light,
    Size size = const Size(390, 844),
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: brightness == Brightness.light ? AppTheme.light(null) : AppTheme.dark(null),
        home: child,
      ),
    );
    await tester.pumpAndSettle();

    await expectLater(find.byType(MaterialApp), matchesGoldenFile('$name.png'));
  }

  testWidgets('home', (tester) async {
    await shoot(tester, 'home_light', const _HomePreview());
  });

  testWidgets('home dark', (tester) async {
    await shoot(tester, 'home_dark', const _HomePreview(), brightness: Brightness.dark);
  });

  testWidgets('components', (tester) async {
    await shoot(tester, 'components_light', const _ComponentPreview(), size: const Size(390, 1000));
  });

  testWidgets('components dark', (tester) async {
    await shoot(tester, 'components_dark', const _ComponentPreview(),
        brightness: Brightness.dark, size: const Size(390, 1000));
  });

  testWidgets('booking step', (tester) async {
    await shoot(tester, 'booking_step_light', const _BookingStepPreview());
  });

  // Real screens, not previews: these render the production widgets with
  // fixture data so the visual review matches what ships.
  testWidgets('otp handshake', (tester) async {
    await shoot(
      tester,
      'otp_handshake_light',
      const BookingOtpScreen(
        bookingId: 'b1',
        otps: BookingOtps(startOtp: '937980', completionOtp: '509337'),
        status: 'en_route',
      ),
    );
  });

  testWidgets('sign in', (tester) async {
    // The Google button only renders when the build carries
    // GOOGLE_SERVER_CLIENT_ID, so this golden shows the phone-only variant
    // unless the suite is run with that --dart-define.
    await shoot(tester, 'sign_in_light', const ProviderScope(child: SignInScreen()));
  });

  testWidgets('register', (tester) async {
    await shoot(tester, 'register_light', const ProviderScope(child: RegisterScreen()));
  });

  testWidgets('otp sign in', (tester) async {
    await shoot(tester, 'otp_sign_in_light', const ProviderScope(child: OtpSignInScreen()));
  });

  testWidgets('review', (tester) async {
    await shoot(
      tester,
      'review_light',
      ProviderScope(
        child: ReviewScreen(
          booking: Booking.fromJson(const {
            'id': 'b1',
            'status': 'completed',
            'service_name': 'Plumbing',
            'worker_name': 'Ravi Kumar',
          }),
        ),
      ),
    );
  });

  testWidgets('booking confirmed', (tester) async {
    await shoot(
      tester,
      'booking_confirmed_light',
      BookingConfirmedScreen(
        result: BookingCreated.fromJson(const {
          'booking': {'id': 'b1', 'status': 'assigned'},
          'recommendedWorker': {
            'workerId': 'w1',
            'name': 'Sita Devi',
            'distanceKm': 1.0097545262899998,
            'rating': 4.6,
          },
          'otps': {'startOtp': '937980', 'completionOtp': '509337'},
        }),
        onViewCodes: () {},
        onTrack: () {},
      ),
    );
  });
}

/// A realistic home screen assembled only from design-system parts — proof the
/// system composes into the intended editorial layout, not just that the
/// individual widgets render.
class _HomePreview extends StatelessWidget {
  const _HomePreview();

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Scaffold(
      bottomNavigationBar: AppBottomNav(
        currentIndex: 0,
        onTap: (_) {},
        items: const [
          AppNavItem(icon: AppIcons.home, label: 'Home'),
          AppNavItem(icon: AppIcons.bookings, label: 'Bookings'),
          AppNavItem(icon: AppIcons.notifications, label: 'Alerts', badgeCount: 3),
          AppNavItem(icon: AppIcons.profile, label: 'Profile'),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.only(top: Space.x4, bottom: Space.x10),
          children: [
            // Location + greeting. Plain text, no card — the page opens light.
            Padding(
              padding: Space.pageInsets,
              child: Row(
                children: [
                  AppIcon(AppIcons.locationPin, size: Sizes.iconSm, color: t.primary, bold: true),
                  const SizedBox(width: Space.x1),
                  Text('Benz Circle, Vijayawada', style: context.text.labelMedium),
                  AppIcon(AppIcons.chevronDown, size: Sizes.iconXs, color: t.textTertiary),
                ],
              ),
            ),
            const SizedBox(height: Space.x5),
            Padding(
              padding: Space.pageInsets,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Good morning, Pardhu', style: context.text.bodyMedium?.copyWith(color: t.textSecondary)),
                  const SizedBox(height: Space.x1),
                  Text('What do you need\nhelp with?', style: context.text.displayLarge),
                ],
              ),
            ),
            const SizedBox(height: Space.x5),
            const Padding(padding: Space.pageInsets, child: AppSearchField()),
            const SizedBox(height: Space.section),

            Section(
              title: 'Popular services',
              actionLabel: 'See all',
              onAction: () {},
              child: SizedBox(
                height: 108,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: Space.pageInsets,
                  children: const [
                    ServiceChip(name: 'Plumbing'),
                    SizedBox(width: Space.x3),
                    ServiceChip(name: 'Electrical'),
                    SizedBox(width: Space.x3),
                    ServiceChip(name: 'Cleaning'),
                    SizedBox(width: Space.x3),
                    ServiceChip(name: 'Painting'),
                  ],
                ),
              ),
            ),

            const SizedBox(height: Space.section),

            Section(
              title: 'Your active booking',
              child: Padding(
                padding: Space.pageInsets,
                child: AppCard(
                  padding: Space.cardInsetsLarge,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const WorkerAvatar(name: 'Ravi Kumar', verified: true),
                          const SizedBox(width: Space.x3),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Ravi is on the way', style: context.text.titleLarge),
                                Text('Arriving in 8 min',
                                    style: context.text.bodySmall?.copyWith(color: t.textSecondary)),
                              ],
                            ),
                          ),
                          const BookingStatusBadge('en_route', dense: true),
                        ],
                      ),
                      const SizedBox(height: Space.x4),
                      Row(
                        children: [
                          Expanded(
                            child: AppButton(
                              label: 'Track',
                              variant: AppButtonVariant.soft,
                              size: AppButtonSize.small,
                              icon: AppIcons.navigate,
                              onPressed: () {},
                            ),
                          ),
                          const SizedBox(width: Space.x2),
                          Expanded(
                            child: AppButton.secondary(
                              label: 'Call',
                              size: AppButtonSize.small,
                              icon: AppIcons.call,
                              onPressed: () {},
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),

            const SizedBox(height: Space.section),

            Section(
              title: 'Trusted workers near you',
              child: SizedBox(
                height: 190,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: Space.pageInsets,
                  children: const [
                    WorkerCardCompact(
                      name: 'Ravi Kumar',
                      verified: true,
                      cooperativeName: 'Vijayawada LCS',
                      rating: 4.9,
                    ),
                    SizedBox(width: Space.x3),
                    WorkerCardCompact(
                      name: 'Anitha Rao',
                      verified: true,
                      cooperativeName: 'Gannavaram LCS',
                      rating: 4.8,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ComponentPreview extends StatelessWidget {
  const _ComponentPreview();

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(Space.x5),
          children: [
            Text('Buttons', style: context.text.headlineSmall),
            const SizedBox(height: Space.x3),
            AppButton.primary(label: 'Confirm booking', onPressed: () {}, icon: AppIcons.success),
            const SizedBox(height: Space.x3),
            AppButton.secondary(label: 'Add another address', onPressed: () {}, icon: AppIcons.add),
            const SizedBox(height: Space.x3),
            AppButton(label: 'Cancel booking', variant: AppButtonVariant.danger, onPressed: () {}),
            const SizedBox(height: Space.x6),

            Text('Service tiles', style: context.text.headlineSmall),
            const SizedBox(height: Space.x3),
            ServiceGrid(
              children: [
                ServiceTile(name: 'Plumbing', description: 'Repairs & fixes', selected: true, onTap: () {}),
                ServiceTile(name: 'Electrical', description: 'Wiring & lights', onTap: () {}),
              ],
            ),
            const SizedBox(height: Space.x6),

            Text('Trust', style: context.text.headlineSmall),
            const SizedBox(height: Space.x3),
            const WorkerCard(
              name: 'Ravi Kumar',
              verified: true,
              cooperativeName: 'Vijayawada Labour Cooperative Society',
              rating: 4.9,
              reviewCount: 1240,
              completedJobs: 1240,
              distanceKm: 1.8,
              skills: ['Plumbing', 'Pipe Repair', 'Fitting'],
            ),
            const SizedBox(height: Space.x4),
            AppCard(
              padding: Space.cardInsetsLarge,
              child: Column(
                children: const [
                  TrustRow(label: 'Identity verified', verified: true, detail: 'Verified by society'),
                  TrustRow(label: 'Insured', verified: true, detail: 'Active until Mar 2027'),
                  TrustRow(label: 'Safety training', verified: false, detail: 'Scheduled'),
                ],
              ),
            ),
            const SizedBox(height: Space.x6),

            Text('Status', style: context.text.headlineSmall),
            const SizedBox(height: Space.x3),
            Wrap(
              spacing: Space.x2,
              runSpacing: Space.x2,
              children: const [
                BookingStatusBadge('matching'),
                BookingStatusBadge('en_route'),
                BookingStatusBadge('completed'),
                BookingStatusBadge('cancelled'),
                VerifiedBadge(),
                AppBadge('2% welfare fund', tone: BadgeTone.primary, icon: AppIcons.shield),
              ],
            ),
            const SizedBox(height: Space.x6),

            AppFeatureBand(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppIconBadge(AppIcons.cooperative, size: 56, iconSize: 28),
                  const SizedBox(height: Space.x4),
                  Text('Every booking funds\nworker welfare', style: context.text.headlineMedium),
                  const SizedBox(height: Space.x2),
                  Text(
                    '2% of every job goes to insurance and training for the '
                    'cooperative members who serve you.',
                    style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
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

class _BookingStepPreview extends StatelessWidget {
  const _BookingStepPreview();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Space.x5),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AppIconButton(icon: AppIcons.chevronLeft, onPressed: () {}),
                  const Spacer(),
                ],
              ),
              const SizedBox(height: Space.x4),
              const StepIndicator(step: 2, total: 6),
              const SizedBox(height: Space.x6),
              Text('Where should we send\nyour worker?', style: context.text.displayLarge),
              const SizedBox(height: Space.x8),
              AppSelectableRow(
                title: 'Home',
                subtitle: '12, Example Street, Benz Circle, Vijayawada 520010',
                icon: AppIcons.home_,
                selected: true,
                onTap: () {},
              ),
              const SizedBox(height: Space.x3),
              AppSelectableRow(
                title: 'Office',
                subtitle: 'Tower B, IT Park, Gannavaram',
                icon: AppIcons.work,
                selected: false,
                onTap: () {},
              ),
              const SizedBox(height: Space.x3),
              AppButton.secondary(label: 'Add another address', icon: AppIcons.add, onPressed: () {}),
              const Spacer(),
              AppButton.primary(label: 'Continue', trailingIcon: AppIcons.chevronRight, onPressed: () {}),
            ],
          ),
        ),
      ),
    );
  }
}
