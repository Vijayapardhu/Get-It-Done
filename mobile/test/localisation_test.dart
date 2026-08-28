import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:getitdone_customer/l10n/app_localizations.dart';

/// The app bundled Telugu and Devanagari fonts, swapped the typeface by locale,
/// stored the customer's choice on their account and advertised
/// `["en","te","hi"]` from /config/mobile -- and then rendered every word in
/// English, because there was no `flutter_localizations`, no .arb file and no
/// `AppLocalizations` anywhere in 82 Dart files. The fonts changed; the words
/// did not.
///
/// These assert the property that was missing: the same widget, in a different
/// locale, produces different words.
void main() {
  Widget harness(Locale locale, Widget Function(AppL10n) build) {
    return MaterialApp(
      locale: locale,
      localizationsDelegates: AppL10n.localizationsDelegates,
      supportedLocales: AppL10n.supportedLocales,
      home: Builder(builder: (context) => build(AppL10n.of(context))),
    );
  }

  group('supported locales', () {
    test('are exactly the three /config/mobile advertises', () {
      final codes = AppL10n.supportedLocales.map((locale) => locale.languageCode).toSet();
      expect(codes, {'en', 'te', 'hi'});
    });
  });

  group('navigation labels', () {
    testWidgets('render in English', (tester) async {
      await tester.pumpWidget(harness(const Locale('en'), (l10n) => Text(l10n.navBookings)));
      expect(find.text('Bookings'), findsOneWidget);
    });

    testWidgets('render in Telugu', (tester) async {
      await tester.pumpWidget(harness(const Locale('te'), (l10n) => Text(l10n.navBookings)));

      expect(find.text('Bookings'), findsNothing);
      expect(find.text('బుకింగ్‌లు'), findsOneWidget);
    });

    testWidgets('render in Hindi', (tester) async {
      await tester.pumpWidget(harness(const Locale('hi'), (l10n) => Text(l10n.navBookings)));

      expect(find.text('Bookings'), findsNothing);
      expect(find.text('बुकिंग'), findsOneWidget);
    });
  });

  group('placeholders', () {
    testWidgets('are interpolated, not concatenated, in every language', (tester) async {
      for (final locale in const [Locale('en'), Locale('te'), Locale('hi')]) {
        await tester.pumpWidget(harness(locale, (l10n) => Text(l10n.timeTodayAt('3:30 pm'))));
        await tester.pumpAndSettle();

        // Word order around a time differs by language, which is exactly why
        // this is one message with a placeholder rather than string addition.
        expect(
          find.textContaining('3:30 pm'),
          findsOneWidget,
          reason: 'the time is missing from the $locale message',
        );
      }
    });
  });

  group('an unsupported locale', () {
    testWidgets('falls back to English rather than failing', (tester) async {
      await tester.pumpWidget(harness(const Locale('fr'), (l10n) => Text(l10n.navHome)));
      expect(find.text('Home'), findsOneWidget);
    });
  });
}
