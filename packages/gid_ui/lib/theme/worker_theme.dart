import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_theme.dart';
import '../tokens/colors.dart';
import '../tokens/duty.dart';
import '../tokens/typography.dart';

/// The worker app's chrome: a sibling of the customer theme, not a clone.
///
/// Same family — the whole token scale, the type ramp, the 4pt rhythm, the
/// blue-tinted shadows. Three deliberate departures, each with a reason:
///
///  1. **Navy header over a white body.** A worker's phone very often has both
///     apps installed. They must not be confusable at a glance, and the chrome
///     is the cheapest way to tell them apart from across a room.
///  2. **A 13pt floor.** The customer app runs 11pt nav labels. This one is
///     read in bright sun, by older workers, on cracked screens, between jobs.
///     Nothing goes below 13.
///  3. **A wider text-scale clamp** (0.9–1.5 against 0.9–1.3). Worker layouts
///     are single-column and can absorb it.
///
/// **One theme, and it is light.** There used to be four — light, dark, a
/// high-contrast "daylight", and follow-the-phone — which bought four palettes
/// to keep legible and a page that could repaint itself mid-job because the
/// system flipped. The app is used outdoors at maximum brightness on cheap
/// screens; dark is the wrong answer in those conditions and the extra
/// high-contrast variant was a setting buried three taps deep that nobody found.
/// What survives is the readable parts of the old daylight palette folded into
/// the one theme that ships: strong borders, no reliance on soft shadows for
/// depth, and secondary text dark enough to read in glare.
abstract final class WorkerTheme {
  /// The only theme. White body, navy chrome.
  static ThemeData light(Locale? locale) => _apply(AppTheme.light(locale), _light, locale);

  /// The header colour. Not a token on [AppTokens] because it is chrome rather
  /// than content: nothing inside a screen should ever paint with it.
  static const headerLight = AppColors.blue900;

  /// The customer light tokens with the page turned white and the contrast
  /// pushed up.
  ///
  /// `n50` is right for an editorial catalogue where white cards must read as
  /// raised. Here the content is one column of dense rows and huge actions, and
  /// an off-white page under white cards just looks grubby outdoors.
  ///
  /// Secondary text is `n700` rather than `n500`: the "quiet" level still has to
  /// be readable at arm's length in glare, and a hierarchy nobody can read is
  /// not a hierarchy. Borders carry the depth cue, because a soft shadow is
  /// invisible in direct sun — the shadows below are kept, but nothing depends
  /// on them alone.
  static const _light = AppTokens(
    pageBackground: AppColors.n0,
    surface: AppColors.n0,
    surfaceAlt: Color(0xFFF1F4F9),
    surfaceBlue: Color(0xFFE8EFFF),
    surfaceBlueStrong: AppColors.blue100,
    border: AppColors.n300,
    borderStrong: AppColors.n500,
    textPrimary: Color(0xFF07101F),
    textSecondary: AppColors.n700,
    textTertiary: AppColors.n600,
    textOnPrimary: AppColors.n0,
    // A step darker than the customer app's blue500: the lighter primary loses
    // its edge against white in glare, and the primary is what a worker is
    // looking for.
    primary: AppColors.blue700,
    primaryPressed: AppColors.blue800,
    primarySoft: Color(0xFFD3E0FF),
    success: Duty.online,
    successSoft: Duty.onlineSoft,
    danger: Color(0xFFB91C1C),
    dangerSoft: Color(0xFFFFE1E1),
    warning: Color(0xFFA85B04),
    warningSoft: Color(0xFFFFEFD1),
    cardShadow: [BoxShadow(color: Color(0x0A1B3A85), blurRadius: 12, offset: Offset(0, 4))],
    raisedShadow: [BoxShadow(color: Color(0x141B3A85), blurRadius: 24, offset: Offset(0, 8))],
    skeletonBase: AppColors.n200,
    skeletonHighlight: AppColors.n100,
  );

  /// The worker overrides on top of the customer theme: the type floor, the
  /// larger default button, and the navy chrome.
  static ThemeData _apply(ThemeData base, AppTokens t, Locale? locale) {
    final text = _raiseFloor(AppTypography.textTheme(locale, t.textPrimary, t.textSecondary));

    return base.copyWith(
      scaffoldBackgroundColor: t.pageBackground,
      textTheme: text,
      extensions: [t],
      colorScheme: base.colorScheme.copyWith(
        primary: t.primary,
        onPrimary: t.textOnPrimary,
        surface: t.surface,
        onSurface: t.textPrimary,
        error: t.danger,
        outline: t.border,
      ),
      appBarTheme: base.appBarTheme.copyWith(
        backgroundColor: headerLight,
        foregroundColor: AppColors.n0,
        titleTextStyle: text.titleLarge?.copyWith(color: AppColors.n0),
        iconTheme: const IconThemeData(color: AppColors.n0),
        // Light icons in the status bar: the header behind them is navy.
        systemOverlayStyle: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light,
          statusBarBrightness: Brightness.dark,
        ),
      ),
      dividerTheme: base.dividerTheme.copyWith(color: t.border),
      inputDecorationTheme: base.inputDecorationTheme.copyWith(
        fillColor: t.surfaceAlt,
        hintStyle: text.bodyMedium?.copyWith(color: t.textTertiary),
      ),
    );
  }

  /// Raise every slot to at least [WorkerSizes.minFontSize].
  ///
  /// Applied to the theme rather than left to each screen, because a floor that
  /// has to be remembered is a floor that gets forgotten on the one screen
  /// somebody reads outdoors.
  static TextTheme _raiseFloor(TextTheme base) {
    TextStyle? up(TextStyle? style) {
      if (style == null) return null;
      final size = style.fontSize ?? WorkerSizes.minFontSize;
      if (size >= WorkerSizes.minFontSize) return style;
      // The line height is expressed as a multiplier, so raising the size
      // keeps the ratio and the row does not go tight.
      return style.copyWith(fontSize: WorkerSizes.minFontSize);
    }

    return base.copyWith(
      bodySmall: up(base.bodySmall),
      labelSmall: up(base.labelSmall),
      labelMedium: up(base.labelMedium),
      titleSmall: up(base.titleSmall),
      displaySmall: up(base.displaySmall),
    );
  }
}
