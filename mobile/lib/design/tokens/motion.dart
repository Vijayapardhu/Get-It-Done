import 'package:flutter/animation.dart';

/// Motion tokens.
///
/// The rule: animation communicates *change*, never decoration. Four durations,
/// three curves, and nothing loops unless the app is genuinely waiting on
/// something. A booking app that bounces is a booking app people uninstall.
abstract final class Motion {
  /// Colour and opacity changes on press. Below ~120ms reads as instant.
  static const fast = Duration(milliseconds: 150);

  /// The default: selection, expansion, list item entry.
  static const base = Duration(milliseconds: 220);

  /// Sheets, route transitions, anything crossing a large distance.
  static const slow = Duration(milliseconds: 320);

  /// Reserved for the two moments that earn a real beat: finding your worker,
  /// and the OTP reveal.
  static const emphasis = Duration(milliseconds: 480);

  /// Skeleton shimmer sweep.
  static const shimmer = Duration(milliseconds: 1400);

  /// Default easing. Decelerating — the object arrives calmly rather than
  /// snapping into place.
  static const curve = Curves.easeOutCubic;

  /// Elements leaving the screen; accelerate away.
  static const curveExit = Curves.easeInCubic;

  /// Sheets and anything with weight.
  static const curveEmphasis = Curves.easeOutQuart;

  /// Only for a deliberate pop: booking confirmed, payment succeeded. Never on
  /// routine interaction.
  static const curveSpring = Curves.easeOutBack;

  /// Per-item delay when a list staggers in. Kept short — anything longer and
  /// the last row feels broken.
  static const stagger = Duration(milliseconds: 40);
}
