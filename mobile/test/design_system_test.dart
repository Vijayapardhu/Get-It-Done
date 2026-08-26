import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:getitdone_customer/design/design_system.dart';

/// Guards the invariants the design system exists to enforce. These are the
/// rules that decay silently otherwise — a status rendering as raw snake_case,
/// a category picking up a different colour on a different screen, a dark-mode
/// token left undefined.
void main() {
  Widget wrap(Widget child, {Brightness brightness = Brightness.light, Locale? locale}) {
    return MaterialApp(
      theme: brightness == Brightness.light ? AppTheme.light(locale) : AppTheme.dark(locale),
      locale: locale,
      home: Scaffold(body: child),
    );
  }

  group('theme tokens', () {
    testWidgets('are available in both brightnesses', (tester) async {
      for (final brightness in Brightness.values) {
        late AppTokens tokens;
        await tester.pumpWidget(wrap(
          Builder(builder: (context) {
            tokens = context.tokens;
            return const SizedBox();
          }),
          brightness: brightness,
        ));
        expect(tokens.primary, isNotNull, reason: 'primary missing for $brightness');
        expect(tokens.pageBackground, isNotNull);
      }
    });

    testWidgets('light and dark resolve to different surfaces', (tester) async {
      late Color lightBg;
      late Color darkBg;

      await tester.pumpWidget(wrap(
        Builder(builder: (c) {
          lightBg = c.tokens.pageBackground;
          return const SizedBox();
        }),
      ));
      await tester.pumpWidget(wrap(
        Builder(builder: (c) {
          darkBg = c.tokens.pageBackground;
          return const SizedBox();
        }),
        brightness: Brightness.dark,
      ));
      // The theme change animates; without settling the tokens are still
      // mid-lerp and read as the light value.
      await tester.pumpAndSettle();

      expect(lightBg, isNot(equals(darkBg)));
    });

    test('lerp produces a valid intermediate', () {
      final mid = AppTokens.light.lerp(AppTokens.dark, 0.5);
      expect(mid.primary, isNot(equals(AppTokens.light.primary)));
      expect(mid.primary, isNot(equals(AppTokens.dark.primary)));
    });
  });

  group('service visuals', () {
    test('map keywords to the right category', () {
      expect(ServiceVisuals.forName('Plumbing'), same(ServiceVisuals.plumbing));
      expect(ServiceVisuals.forName('Pipe Repair'), same(ServiceVisuals.plumbing));
      expect(ServiceVisuals.forName('Electrical Wiring'), same(ServiceVisuals.electrical));
      expect(ServiceVisuals.forName('Deep Cleaning'), same(ServiceVisuals.cleaning));
      expect(ServiceVisuals.forName('Interior Painting'), same(ServiceVisuals.painting));
      expect(ServiceVisuals.forName('Pest Control'), same(ServiceVisuals.pest));
    });

    test('are case and whitespace insensitive', () {
      expect(ServiceVisuals.forName('  PLUMBING  '), same(ServiceVisuals.plumbing));
    });

    test('fall back rather than returning null for unknown input', () {
      expect(ServiceVisuals.forName('Astrology'), same(ServiceVisuals.other));
      expect(ServiceVisuals.forName(null), same(ServiceVisuals.other));
      expect(ServiceVisuals.forName(''), same(ServiceVisuals.other));
    });

    test('give the same category the same accent every time', () {
      // The whole point of the table: one category, one colour, app-wide.
      expect(
        ServiceVisuals.forName('Plumbing').accent,
        equals(ServiceVisuals.forName('Water Tank Cleaning').accent),
      );
    });

    test('lift the accent in dark mode so it stays visible on navy', () {
      final visual = ServiceVisuals.plumbing;
      expect(
        visual.accentFor(Brightness.dark).computeLuminance(),
        greaterThan(visual.accentFor(Brightness.light).computeLuminance()),
      );
    });
  });

  group('booking status', () {
    test('every backend status has human-readable copy', () {
      // Mirrors bookingStatuses in backend/src/services/bookingService.ts.
      const statuses = [
        'requested', 'matching', 'assigned', 'accepted', 'en_route',
        'started', 'completed', 'cancelled', 'expired', 'disputed', 'refunded',
      ];
      for (final status in statuses) {
        final (label, _) = BookingStatusBadge.describe(status);
        expect(label, isNot(contains('_')), reason: '$status leaks snake_case into the UI');
        expect(label[0], equals(label[0].toUpperCase()), reason: '$status is not capitalised');
      }
    });

    test('terminal states carry the right tone', () {
      expect(BookingStatusBadge.describe('completed').$2, BadgeTone.success);
      expect(BookingStatusBadge.describe('cancelled').$2, BadgeTone.danger);
      expect(BookingStatusBadge.describe('disputed').$2, BadgeTone.danger);
    });

    test('an unknown status degrades instead of throwing', () {
      final (label, tone) = BookingStatusBadge.describe('some_new_status');
      expect(label, 'some_new_status');
      expect(tone, BadgeTone.neutral);
    });
  });

  group('components render', () {
    testWidgets('AppButton shows a spinner and blocks input while loading', (tester) async {
      var taps = 0;
      await tester.pumpWidget(wrap(
        AppButton.primary(label: 'Confirm', loading: true, onPressed: () => taps++),
      ));

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      await tester.tap(find.byType(AppButton));
      await tester.pump();
      expect(taps, 0, reason: 'a loading button must not fire its callback');
    });

    testWidgets('a disabled AppButton does not fire', (tester) async {
      await tester.pumpWidget(wrap(const AppButton.primary(label: 'Confirm', onPressed: null)));
      await tester.tap(find.byType(AppButton));
      await tester.pump();
      // No exception thrown is the assertion.
      expect(find.text('Confirm'), findsOneWidget);
    });

    testWidgets('WorkerAvatar falls back to initials without a photo', (tester) async {
      await tester.pumpWidget(wrap(const WorkerAvatar(name: 'Ravi Kumar')));
      expect(find.text('RK'), findsOneWidget);
    });

    testWidgets('WorkerAvatar handles a single-word name', (tester) async {
      await tester.pumpWidget(wrap(const WorkerAvatar(name: 'Ravi')));
      expect(find.text('R'), findsOneWidget);
    });

    testWidgets('WorkerCard surfaces the cooperative inline', (tester) async {
      await tester.pumpWidget(wrap(const SingleChildScrollView(
        child: WorkerCard(
          name: 'Ravi Kumar',
          verified: true,
          cooperativeName: 'Vijayawada Labour Cooperative Society',
          rating: 4.9,
        ),
      )));

      // Trust must be on the card, not one tap away.
      expect(find.text('Vijayawada Labour Cooperative Society'), findsOneWidget);
      expect(find.text('4.9'), findsOneWidget);
    });

    testWidgets('WorkerCard collapses an overflowing skill list', (tester) async {
      await tester.pumpWidget(wrap(const SingleChildScrollView(
        child: WorkerCard(
          name: 'Ravi Kumar',
          skills: ['A', 'B', 'C', 'D', 'E', 'F'],
        ),
      )));
      expect(find.text('+2'), findsOneWidget);
    });

    testWidgets('StepIndicator renders the count', (tester) async {
      await tester.pumpWidget(wrap(const StepIndicator(step: 2, total: 6)));
      expect(find.text('2 OF 6'), findsOneWidget);
    });

    testWidgets('Section renders its action only when a handler is supplied', (tester) async {
      await tester.pumpWidget(wrap(const Section(title: 'Nearby', child: SizedBox())));
      expect(find.text('See all'), findsNothing);

      await tester.pumpWidget(wrap(Section(
        title: 'Nearby',
        actionLabel: 'See all',
        onAction: () {},
        child: const SizedBox(),
      )));
      expect(find.text('See all'), findsOneWidget);
    });

    testWidgets('AppStateView.offline uses reassuring default copy', (tester) async {
      await tester.pumpWidget(wrap(const AppStateView.offline()));
      expect(find.text("You're offline"), findsOneWidget);
      expect(find.textContaining('reconnect'), findsOneWidget);
    });

    testWidgets('bottom nav reports the tapped index', (tester) async {
      int? tapped;
      await tester.pumpWidget(wrap(AppBottomNav(
        currentIndex: 0,
        onTap: (i) => tapped = i,
        items: const [
          AppNavItem(icon: AppIcons.home, label: 'Home'),
          AppNavItem(icon: AppIcons.bookings, label: 'Bookings'),
        ],
      )));

      await tester.tap(find.text('Bookings'));
      await tester.pump();
      expect(tapped, 1);
    });

    testWidgets('every destination is named, active or not', (tester) async {
      await tester.pumpWidget(wrap(AppBottomNav(
        currentIndex: 0,
        onTap: (_) {},
        items: const [
          AppNavItem(icon: AppIcons.home, label: 'Home'),
          AppNavItem(icon: AppIcons.bookings, label: 'Bookings'),
        ],
      )));

      // Four icons alone are a rebus: a bell and a clipboard could each be two
      // different things. Both the visible label and the semantic one.
      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Bookings'), findsOneWidget);
      expect(find.bySemanticsLabel('Bookings'), findsOneWidget);
    });

    testWidgets('a badge count rides on its destination', (tester) async {
      await tester.pumpWidget(wrap(AppBottomNav(
        currentIndex: 0,
        onTap: (_) {},
        items: const [
          AppNavItem(icon: AppIcons.home, label: 'Home'),
          AppNavItem(icon: AppIcons.notifications, label: 'Alerts', badgeCount: 3),
        ],
      )));

      expect(find.text('3'), findsOneWidget);
    });

    testWidgets('tapping the active nav tab does not re-fire', (tester) async {
      var calls = 0;
      await tester.pumpWidget(wrap(AppBottomNav(
        currentIndex: 0,
        onTap: (_) => calls++,
        items: const [
          AppNavItem(icon: AppIcons.home, label: 'Home'),
          AppNavItem(icon: AppIcons.bookings, label: 'Bookings'),
        ],
      )));

      await tester.tap(find.text('Home'));
      await tester.pump();
      expect(calls, 0, reason: 'reselecting the current tab should be inert');
    });
  });

  group('accessibility', () {
    testWidgets('buttons expose a semantic label', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(wrap(AppButton.primary(label: 'Confirm booking', onPressed: () {})));

      expect(find.bySemanticsLabel('Confirm booking'), findsOneWidget);
      handle.dispose();
    });

    testWidgets('the emergency FAB describes its consequence', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(wrap(EmergencyFab(onPressed: () {})));

      expect(find.bySemanticsLabel(RegExp('urgent help')), findsOneWidget);
      handle.dispose();
    });
  });
}
