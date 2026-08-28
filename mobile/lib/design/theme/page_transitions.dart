import 'package:flutter/material.dart';

import '../tokens/motion.dart';

/// One motion for every pushed route in the app.
///
/// Android's default is a zoom that reads as heavy at this app's pace, and iOS's
/// horizontal slide carries a "back" affordance the app does not use. Left
/// alone, the two platforms also disagree, so the same tap felt different
/// depending on the phone.
///
/// This is a shared-axis move: the arriving screen slides a short distance from
/// the right while fading in, and the leaving screen slides the same distance
/// the other way while fading out. Short distance, not a full screen width —
/// the point is to say "forward" without making the user wait for travel.
class SmoothPageTransitions extends PageTransitionsBuilder {
  const SmoothPageTransitions();

  /// A fraction of the screen, not a fixed number of pixels, so the gesture
  /// feels the same on a small phone and a tablet.
  static const _shift = 0.055;

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    // Respect the system setting rather than overriding it: for someone who
    // has asked for reduced motion, sliding panels are the problem, and a
    // plain cross-fade still communicates the change.
    if (MediaQuery.disableAnimationsOf(context)) {
      return FadeTransition(opacity: animation, child: child);
    }

    final incoming = CurvedAnimation(parent: animation, curve: Motion.curve);
    final outgoing = CurvedAnimation(parent: secondaryAnimation, curve: Motion.curveExit);

    return SlideTransition(
      // The screen being covered drifts left as the new one arrives, which is
      // what makes the two read as one movement rather than a stack of cards.
      position: Tween(begin: Offset.zero, end: const Offset(-_shift, 0)).animate(outgoing),
      child: FadeTransition(
        // Fading the covered screen as well stops a bright screen showing
        // through the arriving one's shadow on the first few frames.
        opacity: Tween(begin: 1.0, end: 0.0).animate(outgoing),
        child: SlideTransition(
          position: Tween(begin: const Offset(_shift, 0), end: Offset.zero).animate(incoming),
          child: FadeTransition(opacity: incoming, child: child),
        ),
      ),
    );
  }
}

/// The same builder on every platform, so a tap feels identical everywhere.
const smoothPageTransitionsTheme = PageTransitionsTheme(
  builders: <TargetPlatform, PageTransitionsBuilder>{
    TargetPlatform.android: SmoothPageTransitions(),
    TargetPlatform.iOS: SmoothPageTransitions(),
    TargetPlatform.macOS: SmoothPageTransitions(),
    TargetPlatform.windows: SmoothPageTransitions(),
    TargetPlatform.linux: SmoothPageTransitions(),
    TargetPlatform.fuchsia: SmoothPageTransitions(),
  },
);
