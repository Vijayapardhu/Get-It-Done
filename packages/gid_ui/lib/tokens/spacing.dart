import 'package:flutter/widgets.dart';

/// 4pt base, 8pt rhythm.
///
/// Every gap in the app comes from here. The editorial layout depends on
/// consistent vertical rhythm far more than on any individual component, and
/// ad-hoc `EdgeInsets.all(13)` is what quietly destroys it.
abstract final class Space {
  static const double x0 = 0;
  static const double x0_5 = 2;
  static const double x1 = 4;
  static const double x2 = 8;
  static const double x3 = 12;
  static const double x4 = 16;
  static const double x5 = 20;
  static const double x6 = 24;
  static const double x8 = 32;
  static const double x10 = 40;
  static const double x12 = 48;
  static const double x16 = 64;
  static const double x20 = 80;

  /// Horizontal page padding. One value, everywhere — content that starts at
  /// different x-positions on different screens is the most visible sign of an
  /// unsystematised app.
  static const double page = x5;

  /// Vertical gap between two editorial sections.
  static const double section = x8;

  /// Gap between a section header and its content.
  static const double sectionHeader = x4;

  static const pageInsets = EdgeInsets.symmetric(horizontal: page);
  static const cardInsets = EdgeInsets.all(x4);
  static const cardInsetsLarge = EdgeInsets.all(x5);
}

/// Corner radii. The brand reads soft and rounded, so the defaults sit high;
/// `md` is the smallest value that should appear on an interactive surface.
abstract final class Radii {
  static const double xs = 6;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;

  /// Default card radius.
  static const double xl = 20;

  /// Bottom sheets, hero surfaces.
  static const double xxl = 28;

  static const double pill = 999;

  static const rXs = BorderRadius.all(Radius.circular(xs));
  static const rSm = BorderRadius.all(Radius.circular(sm));
  static const rMd = BorderRadius.all(Radius.circular(md));
  static const rLg = BorderRadius.all(Radius.circular(lg));
  static const rXl = BorderRadius.all(Radius.circular(xl));
  static const rXxl = BorderRadius.all(Radius.circular(xxl));
  static const rPill = BorderRadius.all(Radius.circular(pill));

  /// Sheets round only at the top.
  static const rSheet = BorderRadius.vertical(top: Radius.circular(xxl));
}

/// Minimum interactive sizes.
///
/// 48dp is the floor, not the target. Users include elderly customers booking a
/// plumber and workers tapping with wet or gloved hands.
abstract final class Sizes {
  static const double tapTargetMin = 48;

  static const double buttonSm = 40;
  static const double buttonMd = 52;
  static const double buttonLg = 58;

  static const double inputHeight = 54;

  static const double iconXs = 16;
  static const double iconSm = 20;
  static const double iconMd = 24;
  static const double iconLg = 28;
  static const double iconXl = 32;

  static const double avatarSm = 36;
  static const double avatarMd = 48;
  static const double avatarLg = 64;
  static const double avatarXl = 96;

  static const double bottomNavHeight = 64;

  /// Icon stroke width. Hugeicons defaults to 1.5; 1.8 reads better at small
  /// sizes on a phone without looking heavy.
  static const double iconStroke = 1.8;
  static const double iconStrokeBold = 2.2;
}
