import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'page_transitions.dart';
import '../tokens/colors.dart';
import '../tokens/spacing.dart';
import '../tokens/typography.dart';

/// Semantic surface and content tokens.
///
/// Components resolve colours through this, never from [AppColors] directly.
/// That is what makes dark mode a single definition change instead of a hunt
/// for every hardcoded hex, and it keeps "which blue?" from being a decision
/// each screen re-litigates.
@immutable
class AppTokens extends ThemeExtension<AppTokens> {
  const AppTokens({
    required this.pageBackground,
    required this.surface,
    required this.surfaceAlt,
    required this.surfaceBlue,
    required this.surfaceBlueStrong,
    required this.border,
    required this.borderStrong,
    required this.textPrimary,
    required this.textSecondary,
    required this.textTertiary,
    required this.textOnPrimary,
    required this.primary,
    required this.primaryPressed,
    required this.primarySoft,
    required this.success,
    required this.successSoft,
    required this.danger,
    required this.dangerSoft,
    required this.warning,
    required this.warningSoft,
    required this.cardShadow,
    required this.raisedShadow,
    required this.skeletonBase,
    required this.skeletonHighlight,
  });

  /// The page itself. Slightly off-white in light mode so white cards read as
  /// raised without needing a heavy shadow.
  final Color pageBackground;

  /// Cards, sheets, inputs.
  final Color surface;

  /// A second surface for nesting — a tile inside a card.
  final Color surfaceAlt;

  /// Large "very light blue" feature sections.
  final Color surfaceBlue;

  /// Selected cards, icon containers, soft-filled active nav state.
  final Color surfaceBlueStrong;

  final Color border;
  final Color borderStrong;

  final Color textPrimary;
  final Color textSecondary;

  /// Timestamps, helper text — the quietest readable level.
  final Color textTertiary;
  final Color textOnPrimary;

  final Color primary;
  final Color primaryPressed;
  final Color primarySoft;

  final Color success;
  final Color successSoft;
  final Color danger;
  final Color dangerSoft;
  final Color warning;
  final Color warningSoft;

  /// Resting card shadow. Blue-tinted and very soft.
  final List<BoxShadow> cardShadow;

  /// Floating elements: the emergency FAB, bottom nav, sticky CTAs.
  final List<BoxShadow> raisedShadow;

  final Color skeletonBase;
  final Color skeletonHighlight;

  static const _lightCardShadow = [
    BoxShadow(color: Color(0x0A1B3A85), blurRadius: 12, offset: Offset(0, 4)),
    BoxShadow(color: Color(0x0D1B3A85), blurRadius: 2, offset: Offset(0, 1)),
  ];

  static const _lightRaisedShadow = [
    BoxShadow(color: Color(0x141B3A85), blurRadius: 24, offset: Offset(0, 8)),
    BoxShadow(color: Color(0x0F1B3A85), blurRadius: 6, offset: Offset(0, 2)),
  ];

  // Dark surfaces get almost no shadow — depth there comes from surface
  // lightness, not from a shadow nobody can see against navy.
  static const _darkCardShadow = [
    BoxShadow(color: Color(0x33000000), blurRadius: 12, offset: Offset(0, 4)),
  ];

  static const _darkRaisedShadow = [
    BoxShadow(color: Color(0x4D000000), blurRadius: 24, offset: Offset(0, 8)),
  ];

  static const light = AppTokens(
    pageBackground: AppColors.n50,
    surface: AppColors.n0,
    surfaceAlt: AppColors.n100,
    surfaceBlue: AppColors.blue50,
    surfaceBlueStrong: AppColors.blue100,
    border: AppColors.n200,
    borderStrong: AppColors.n300,
    textPrimary: AppColors.blue900,
    textSecondary: AppColors.n600,
    textTertiary: AppColors.n400,
    textOnPrimary: AppColors.n0,
    primary: AppColors.blue500,
    primaryPressed: AppColors.blue600,
    primarySoft: AppColors.blue100,
    success: AppColors.success,
    successSoft: AppColors.successSoft,
    danger: AppColors.danger,
    dangerSoft: AppColors.dangerSoft,
    warning: AppColors.warning,
    warningSoft: AppColors.warningSoft,
    cardShadow: _lightCardShadow,
    raisedShadow: _lightRaisedShadow,
    skeletonBase: AppColors.n200,
    skeletonHighlight: AppColors.n100,
  );

  static const dark = AppTokens(
    pageBackground: AppColors.darkBg,
    surface: AppColors.darkSurface,
    surfaceAlt: AppColors.darkSurfaceAlt,
    surfaceBlue: AppColors.darkSurfaceAlt,
    surfaceBlueStrong: AppColors.darkPrimarySoft,
    border: AppColors.darkBorder,
    borderStrong: Color(0xFF34456A),
    textPrimary: AppColors.darkTextPrimary,
    textSecondary: AppColors.darkTextSecondary,
    textTertiary: Color(0xFF6B7A94),
    textOnPrimary: AppColors.darkBg,
    primary: AppColors.darkPrimary,
    primaryPressed: Color(0xFF8FB2FF),
    primarySoft: AppColors.darkPrimarySoft,
    success: AppColors.successDark,
    successSoft: Color(0xFF12301F),
    danger: AppColors.dangerDark,
    dangerSoft: Color(0xFF3A1717),
    warning: AppColors.warningDark,
    warningSoft: Color(0xFF3A2A0E),
    cardShadow: _darkCardShadow,
    raisedShadow: _darkRaisedShadow,
    skeletonBase: AppColors.darkSurfaceAlt,
    skeletonHighlight: Color(0xFF243352),
  );

  @override
  AppTokens copyWith({
    Color? pageBackground,
    Color? surface,
    Color? surfaceAlt,
    Color? surfaceBlue,
    Color? surfaceBlueStrong,
    Color? border,
    Color? borderStrong,
    Color? textPrimary,
    Color? textSecondary,
    Color? textTertiary,
    Color? textOnPrimary,
    Color? primary,
    Color? primaryPressed,
    Color? primarySoft,
    Color? success,
    Color? successSoft,
    Color? danger,
    Color? dangerSoft,
    Color? warning,
    Color? warningSoft,
    List<BoxShadow>? cardShadow,
    List<BoxShadow>? raisedShadow,
    Color? skeletonBase,
    Color? skeletonHighlight,
  }) {
    return AppTokens(
      pageBackground: pageBackground ?? this.pageBackground,
      surface: surface ?? this.surface,
      surfaceAlt: surfaceAlt ?? this.surfaceAlt,
      surfaceBlue: surfaceBlue ?? this.surfaceBlue,
      surfaceBlueStrong: surfaceBlueStrong ?? this.surfaceBlueStrong,
      border: border ?? this.border,
      borderStrong: borderStrong ?? this.borderStrong,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textTertiary: textTertiary ?? this.textTertiary,
      textOnPrimary: textOnPrimary ?? this.textOnPrimary,
      primary: primary ?? this.primary,
      primaryPressed: primaryPressed ?? this.primaryPressed,
      primarySoft: primarySoft ?? this.primarySoft,
      success: success ?? this.success,
      successSoft: successSoft ?? this.successSoft,
      danger: danger ?? this.danger,
      dangerSoft: dangerSoft ?? this.dangerSoft,
      warning: warning ?? this.warning,
      warningSoft: warningSoft ?? this.warningSoft,
      cardShadow: cardShadow ?? this.cardShadow,
      raisedShadow: raisedShadow ?? this.raisedShadow,
      skeletonBase: skeletonBase ?? this.skeletonBase,
      skeletonHighlight: skeletonHighlight ?? this.skeletonHighlight,
    );
  }

  @override
  AppTokens lerp(ThemeExtension<AppTokens>? other, double t) {
    if (other is! AppTokens) return this;
    Color c(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppTokens(
      pageBackground: c(pageBackground, other.pageBackground),
      surface: c(surface, other.surface),
      surfaceAlt: c(surfaceAlt, other.surfaceAlt),
      surfaceBlue: c(surfaceBlue, other.surfaceBlue),
      surfaceBlueStrong: c(surfaceBlueStrong, other.surfaceBlueStrong),
      border: c(border, other.border),
      borderStrong: c(borderStrong, other.borderStrong),
      textPrimary: c(textPrimary, other.textPrimary),
      textSecondary: c(textSecondary, other.textSecondary),
      textTertiary: c(textTertiary, other.textTertiary),
      textOnPrimary: c(textOnPrimary, other.textOnPrimary),
      primary: c(primary, other.primary),
      primaryPressed: c(primaryPressed, other.primaryPressed),
      primarySoft: c(primarySoft, other.primarySoft),
      success: c(success, other.success),
      successSoft: c(successSoft, other.successSoft),
      danger: c(danger, other.danger),
      dangerSoft: c(dangerSoft, other.dangerSoft),
      warning: c(warning, other.warning),
      warningSoft: c(warningSoft, other.warningSoft),
      cardShadow: t < 0.5 ? cardShadow : other.cardShadow,
      raisedShadow: t < 0.5 ? raisedShadow : other.raisedShadow,
      skeletonBase: c(skeletonBase, other.skeletonBase),
      skeletonHighlight: c(skeletonHighlight, other.skeletonHighlight),
    );
  }
}

/// `context.tokens` instead of `Theme.of(context).extension<AppTokens>()!`.
extension AppThemeContext on BuildContext {
  AppTokens get tokens => Theme.of(this).extension<AppTokens>() ?? AppTokens.light;
  TextTheme get text => Theme.of(this).textTheme;
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
}

abstract final class AppTheme {
  static ThemeData light(Locale? locale) => _build(AppTokens.light, Brightness.light, locale);
  static ThemeData dark(Locale? locale) => _build(AppTokens.dark, Brightness.dark, locale);

  static ThemeData _build(AppTokens t, Brightness brightness, Locale? locale) {
    final scheme = ColorScheme(
      brightness: brightness,
      primary: t.primary,
      onPrimary: t.textOnPrimary,
      primaryContainer: t.primarySoft,
      onPrimaryContainer: t.primary,
      secondary: t.primary,
      onSecondary: t.textOnPrimary,
      secondaryContainer: t.surfaceBlueStrong,
      onSecondaryContainer: t.textPrimary,
      error: t.danger,
      onError: t.textOnPrimary,
      errorContainer: t.dangerSoft,
      onErrorContainer: t.danger,
      surface: t.surface,
      onSurface: t.textPrimary,
      surfaceContainerHighest: t.surfaceAlt,
      onSurfaceVariant: t.textSecondary,
      outline: t.border,
      outlineVariant: t.borderStrong,
      shadow: AppColors.shadowTint,
    );

    final textTheme = AppTypography.textTheme(locale, t.textPrimary, t.textSecondary);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: t.pageBackground,
      textTheme: textTheme,
      extensions: [t],

      // Ripples are turned off app-wide. The components implement their own
      // press feedback (scale + colour), which is more controllable and reads
      // as more considered than Material's default splash.
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
      splashColor: Colors.transparent,

      appBarTheme: AppBarTheme(
        backgroundColor: t.pageBackground,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge,
        iconTheme: IconThemeData(color: t.textPrimary, size: Sizes.iconMd),
        systemOverlayStyle: brightness == Brightness.light
            ? SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent)
            : SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
      ),

      dividerTheme: DividerThemeData(color: t.border, thickness: 1, space: 1),

      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: t.surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: Radii.rSheet),
        showDragHandle: true,
        dragHandleColor: t.borderStrong,
        dragHandleSize: const Size(40, 4),
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: t.surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: Radii.rXl),
        titleTextStyle: textTheme.titleLarge,
        contentTextStyle: textTheme.bodyMedium,
      ),

      snackBarTheme: SnackBarThemeData(
        backgroundColor: t.textPrimary,
        contentTextStyle: textTheme.bodyMedium?.copyWith(color: t.pageBackground),
        shape: const RoundedRectangleBorder(borderRadius: Radii.rMd),
        behavior: SnackBarBehavior.floating,
        insetPadding: const EdgeInsets.all(Space.x4),
      ),

      // Inputs are borderless-by-default with a filled surface; the focus ring
      // is the only strong stroke, so the form reads calm until you touch it.
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: t.surfaceAlt,
        contentPadding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x4),
        border: OutlineInputBorder(borderRadius: Radii.rLg, borderSide: BorderSide(color: t.border)),
        enabledBorder: OutlineInputBorder(borderRadius: Radii.rLg, borderSide: BorderSide(color: t.border)),
        focusedBorder: OutlineInputBorder(borderRadius: Radii.rLg, borderSide: BorderSide(color: t.primary, width: 1.6)),
        errorBorder: OutlineInputBorder(borderRadius: Radii.rLg, borderSide: BorderSide(color: t.danger)),
        focusedErrorBorder: OutlineInputBorder(borderRadius: Radii.rLg, borderSide: BorderSide(color: t.danger, width: 1.6)),
        hintStyle: textTheme.bodyMedium?.copyWith(color: t.textTertiary),
        errorStyle: textTheme.bodySmall?.copyWith(color: t.danger),
      ),

      // One route animation everywhere. Cupertino's full-width slide carried a
      // back-swipe affordance this app does not use, and it left the desktop
      // targets on Android's heavy zoom — so the same tap felt different
      // depending on the platform. See SmoothPageTransitions.
      pageTransitionsTheme: smoothPageTransitionsTheme,
    );
  }
}
