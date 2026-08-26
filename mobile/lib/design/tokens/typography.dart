import 'package:flutter/material.dart';

/// Type scale.
///
/// Latin is Plus Jakarta Sans — geometric enough to feel modern, with a tall
/// x-height that survives small sizes on a phone.
///
/// Telugu and Hindi are NOT an afterthought here. The backend serves en/te/hi
/// and Telugu conjuncts render badly through a Latin fallback: glyphs collide,
/// line height collapses, and diacritics clip. [AppTypography.forLocale] swaps
/// the whole family per locale so the script is always drawn by a font designed
/// for it.
abstract final class AppTypography {
  /// Language codes that need a script-specific family.
  static const _telugu = 'te';
  static const _hindi = 'hi';

  /// Bundled families (see pubspec.yaml). Deliberately NOT google_fonts: that
  /// package downloads the typeface on first launch, so a cold start on a poor
  /// connection renders the whole app in a fallback font — and in tests it
  /// renders as tofu boxes.
  static const _latinFamily = 'PlusJakartaSans';
  static const _teluguFamily = 'NotoSansTelugu';
  static const _devanagariFamily = 'NotoSansDevanagari';

  /// Falls back across scripts so a Telugu string inside an English UI (a
  /// worker's name, an address) still renders rather than showing tofu.
  static const _fallbacks = [_latinFamily, _teluguFamily, _devanagariFamily];

  static String familyFor(Locale? locale) => switch (locale?.languageCode) {
        _telugu => _teluguFamily,
        _hindi => _devanagariFamily,
        _ => _latinFamily,
      };

  static TextStyle Function(TextStyle) _familyFor(Locale? locale) {
    final family = familyFor(locale);
    return (TextStyle base) => base.copyWith(
          fontFamily: family,
          fontFamilyFallback: _fallbacks.where((f) => f != family).toList(),
        );
  }

  // ── Raw scale ─────────────────────────────────────────────────────────────
  // Negative letter-spacing on the large sizes; at display sizes the default
  // tracking looks loose. Positive tracking only on `overline`.

  static const _display = TextStyle(fontSize: 32, height: 38 / 32, fontWeight: FontWeight.w700, letterSpacing: -0.5);
  static const _h1 = TextStyle(fontSize: 26, height: 32 / 26, fontWeight: FontWeight.w700, letterSpacing: -0.4);
  static const _h2 = TextStyle(fontSize: 22, height: 28 / 22, fontWeight: FontWeight.w600, letterSpacing: -0.3);
  static const _h3 = TextStyle(fontSize: 18, height: 24 / 18, fontWeight: FontWeight.w600, letterSpacing: -0.2);
  static const _bodyLg = TextStyle(fontSize: 16, height: 24 / 16, fontWeight: FontWeight.w400);
  static const _body = TextStyle(fontSize: 15, height: 22 / 15, fontWeight: FontWeight.w400);
  static const _bodySm = TextStyle(fontSize: 13, height: 18 / 13, fontWeight: FontWeight.w400);
  static const _label = TextStyle(fontSize: 14, height: 20 / 14, fontWeight: FontWeight.w600);
  static const _labelSm = TextStyle(fontSize: 12, height: 16 / 12, fontWeight: FontWeight.w600);
  static const _caption = TextStyle(fontSize: 12, height: 16 / 12, fontWeight: FontWeight.w500);

  /// The "2 OF 6" step indicator and section eyebrows.
  static const _overline = TextStyle(fontSize: 11, height: 14 / 11, fontWeight: FontWeight.w700, letterSpacing: 0.9);

  /// Tabular figures for money and counters, so digits do not jitter as a
  /// countdown ticks or a price updates.
  static const _numeric = TextStyle(fontSize: 22, height: 28 / 22, fontWeight: FontWeight.w700, letterSpacing: -0.3, fontFeatures: [FontFeature.tabularFigures()]);

  static TextStyle display(Locale? l) => _familyFor(l)(_display);
  static TextStyle h1(Locale? l) => _familyFor(l)(_h1);
  static TextStyle h2(Locale? l) => _familyFor(l)(_h2);
  static TextStyle h3(Locale? l) => _familyFor(l)(_h3);
  static TextStyle bodyLg(Locale? l) => _familyFor(l)(_bodyLg);
  static TextStyle body(Locale? l) => _familyFor(l)(_body);
  static TextStyle bodySm(Locale? l) => _familyFor(l)(_bodySm);
  static TextStyle label(Locale? l) => _familyFor(l)(_label);
  static TextStyle labelSm(Locale? l) => _familyFor(l)(_labelSm);
  static TextStyle caption(Locale? l) => _familyFor(l)(_caption);
  static TextStyle overline(Locale? l) => _familyFor(l)(_overline);
  static TextStyle numeric(Locale? l) => _familyFor(l)(_numeric);

  /// Maps the scale onto Material's slots so stock widgets inherit it too.
  static TextTheme textTheme(Locale? locale, Color primary, Color secondary) {
    return TextTheme(
      displayLarge: display(locale).copyWith(color: primary),
      displayMedium: h1(locale).copyWith(color: primary),
      displaySmall: h2(locale).copyWith(color: primary),
      headlineLarge: h1(locale).copyWith(color: primary),
      headlineMedium: h2(locale).copyWith(color: primary),
      headlineSmall: h3(locale).copyWith(color: primary),
      titleLarge: h3(locale).copyWith(color: primary),
      titleMedium: label(locale).copyWith(color: primary),
      titleSmall: labelSm(locale).copyWith(color: secondary),
      bodyLarge: bodyLg(locale).copyWith(color: primary),
      bodyMedium: body(locale).copyWith(color: primary),
      bodySmall: bodySm(locale).copyWith(color: secondary),
      labelLarge: label(locale).copyWith(color: primary),
      labelMedium: labelSm(locale).copyWith(color: secondary),
      labelSmall: overline(locale).copyWith(color: secondary),
    );
  }
}
