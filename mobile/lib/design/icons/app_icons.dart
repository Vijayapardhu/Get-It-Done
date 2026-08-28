import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../theme/app_theme.dart';
import '../tokens/spacing.dart';

/// An icon, as this app stores one.
///
/// Phosphor exposes each glyph as a function taking a weight rather than as a
/// single constant, so what is held here is that function. It is what lets
/// [AppIcon]'s `bold` flag resolve to Phosphor's REAL bold weight instead of
/// thickening a regular glyph and getting a slightly blurred one.
typedef AppIconData = PhosphorIconData Function([PhosphorIconsStyle]);

/// The app's icon vocabulary.
///
/// Every icon in the product is named here by ROLE, not by picture. Screens
/// write `AppIcons.bookings`, never a package constant. When a glyph needs to
/// change, it changes once — which is what made moving the whole app from
/// Hugeicons to Phosphor a single-file job.
///
/// ONE family, everywhere. An app that mixes two icon packs looks unfinished in
/// a way people notice without being able to say why: the stroke weights differ
/// by a fraction, the optical sizes disagree, and corners are rounded to
/// different radii. Phosphor is large enough that nothing here needs a
/// borrowed glyph.
abstract final class AppIcons {
  // ── Navigation ────────────────────────────────────────────────────────────
  static const AppIconData home = PhosphorIcons.house;
  static const AppIconData bookings = PhosphorIcons.clipboardText;
  static const AppIconData notifications = PhosphorIcons.bell;
  static const AppIconData profile = PhosphorIcons.userCircle;
  static const AppIconData menu = PhosphorIcons.list;

  // ── Actions ───────────────────────────────────────────────────────────────
  static const AppIconData search = PhosphorIcons.magnifyingGlass;
  static const AppIconData filter = PhosphorIcons.funnel;
  static const AppIconData sort = PhosphorIcons.sortAscending;
  static const AppIconData add = PhosphorIcons.plus;
  static const AppIconData remove = PhosphorIcons.minus;
  static const AppIconData close = PhosphorIcons.x;
  static const AppIconData edit = PhosphorIcons.pencilSimple;
  static const AppIconData delete = PhosphorIcons.trash;
  static const AppIconData share = PhosphorIcons.shareNetwork;
  static const AppIconData copy = PhosphorIcons.copy;
  static const AppIconData refresh = PhosphorIcons.arrowsClockwise;
  static const AppIconData download = PhosphorIcons.downloadSimple;
  static const AppIconData more = PhosphorIcons.dotsThreeVertical;
  static const AppIconData chevronRight = PhosphorIcons.caretRight;
  static const AppIconData chevronLeft = PhosphorIcons.arrowLeft;
  static const AppIconData chevronDown = PhosphorIcons.caretDown;
  static const AppIconData repeat = PhosphorIcons.repeat;

  // ── Trust (the product's differentiator — used deliberately) ─────────────
  static const AppIconData verified = PhosphorIcons.sealCheck;
  static const AppIconData secure = PhosphorIcons.shieldCheck;
  static const AppIconData showPassword = PhosphorIcons.eye;
  static const AppIconData hidePassword = PhosphorIcons.eyeSlash;
  static const AppIconData certificate = PhosphorIcons.certificate;
  static const AppIconData cooperative = PhosphorIcons.usersThree;
  static const AppIconData rating = PhosphorIcons.star;
  static const AppIconData shield = PhosphorIcons.shield;

  // ── Booking lifecycle ─────────────────────────────────────────────────────
  static const AppIconData time = PhosphorIcons.clock;
  static const AppIconData calendar = PhosphorIcons.calendarBlank;

  /// The three parts of a working day.
  ///
  /// Scheduling is the one flow where a customer is reading a wall of numbers,
  /// and 7:30 against 19:30 is a mental conversion every single time. A sun on
  /// the horizon, a sun overhead and a moon say it before the digits are read
  /// at all — which is what lets the times themselves be grouped rather than
  /// listed.
  static const AppIconData morning = PhosphorIcons.sunHorizon;
  static const AppIconData afternoon = PhosphorIcons.sun;
  static const AppIconData evening = PhosphorIcons.moonStars;
  static const AppIconData location = PhosphorIcons.mapPin;
  static const AppIconData locationPin = PhosphorIcons.mapPinLine;
  static const AppIconData navigate = PhosphorIcons.navigationArrow;
  static const AppIconData call = PhosphorIcons.phone;
  static const AppIconData message = PhosphorIcons.chatCircle;

  /// An email ADDRESS, not a conversation. [message] is a speech bubble and
  /// was standing in for this on the account form, where it read as "chat to
  /// us" rather than "type your address here".
  static const AppIconData email = PhosphorIcons.envelopeSimple;

  /// A padlock, for password fields. [secure] is a shield-with-tick and means
  /// "we protect this"; a field the user types a secret into wants the lock.
  static const AppIconData password = PhosphorIcons.lockSimple;
  static const AppIconData chat = PhosphorIcons.chatsCircle;
  static const AppIconData send = PhosphorIcons.paperPlaneTilt;
  static const AppIconData camera = PhosphorIcons.camera;
  static const AppIconData photo = PhosphorIcons.image;
  static const AppIconData home_ = PhosphorIcons.houseLine;
  static const AppIconData building = PhosphorIcons.buildings;
  static const AppIconData work = PhosphorIcons.briefcase;

  // ── Money ─────────────────────────────────────────────────────────────────
  static const AppIconData wallet = PhosphorIcons.wallet;
  static const AppIconData invoice = PhosphorIcons.receipt;
  static const AppIconData card = PhosphorIcons.creditCard;
  static const AppIconData money = PhosphorIcons.currencyInr;
  static const AppIconData document = PhosphorIcons.fileText;

  // ── Emergency ─────────────────────────────────────────────────────────────
  static const AppIconData emergency = PhosphorIcons.warning;
  static const AppIconData alertCircle = PhosphorIcons.warningCircle;
  static const AppIconData flash = PhosphorIcons.lightning;

  // ── Feedback / state ──────────────────────────────────────────────────────
  static const AppIconData success = PhosphorIcons.checkCircle;
  static const AppIconData tick = PhosphorIcons.check;
  static const AppIconData info = PhosphorIcons.info;
  static const AppIconData favourite = PhosphorIcons.heart;
  static const AppIconData bookmark = PhosphorIcons.bookmarkSimple;
  static const AppIconData thumbsUp = PhosphorIcons.thumbsUp;
  static const AppIconData idea = PhosphorIcons.lightbulb;
  static const AppIconData analytics = PhosphorIcons.chartLineUp;
  static const AppIconData support = PhosphorIcons.headset;
  static const AppIconData loading = PhosphorIcons.circleNotch;

  // ── Settings ──────────────────────────────────────────────────────────────
  static const AppIconData settings = PhosphorIcons.gear;
  static const AppIconData language = PhosphorIcons.globe;
  static const AppIconData logout = PhosphorIcons.signOut;
  static const AppIconData lightMode = PhosphorIcons.sun;
  static const AppIconData darkMode = PhosphorIcons.moon;
  static const AppIconData user = PhosphorIcons.user;

  // ── Trades ────────────────────────────────────────────────────────────────
  // The catalogue's fallback glyphs. See ServiceVisuals, which pairs each with
  // a tint.
  static const AppIconData electrical = PhosphorIcons.lightning;
  static const AppIconData plumbing = PhosphorIcons.wrench;
  static const AppIconData cleaning = PhosphorIcons.broom;
  static const AppIconData painting = PhosphorIcons.paintBrushHousehold;
  static const AppIconData carpentry = PhosphorIcons.hammer;
  static const AppIconData appliance = PhosphorIcons.washingMachine;
  static const AppIconData climate = PhosphorIcons.fan;
  static const AppIconData pest = PhosphorIcons.bug;
  static const AppIconData gardening = PhosphorIcons.plant;
  static const AppIconData tools = PhosphorIcons.toolbox;
}

/// Renders an [AppIcons] entry at a theme-aware default colour.
///
/// Prefer this over a raw `PhosphorIcon` so weight and default colour stay
/// consistent — a mix of weights across screens is subtle enough to survive
/// review and obvious enough to make the app feel unfinished.
class AppIcon extends StatelessWidget {
  const AppIcon(
    this.icon, {
    super.key,
    this.size = Sizes.iconMd,
    this.color,
    this.bold = false,
    this.semanticLabel,
  });

  final AppIconData icon;
  final double size;
  final Color? color;

  /// Phosphor's real bold cut, not a thickened regular one.
  final bool bold;

  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final resolved = color ?? context.tokens.textSecondary;
    final glyph = Icon(
      icon(bold ? PhosphorIconsStyle.bold : PhosphorIconsStyle.regular),
      size: size,
      color: resolved,
    );

    if (semanticLabel == null) {
      // Decorative: hide from screen readers so they do not announce a glyph
      // whose meaning is already carried by adjacent text.
      return ExcludeSemantics(child: glyph);
    }
    return Semantics(label: semanticLabel, child: glyph);
  }
}

/// An icon inside a soft rounded container.
///
/// This is the app's signature icon treatment: the service tiles, the trust
/// rows and the active nav state are all this shape at different sizes. Having
/// it as one widget is what keeps the visual language recognisable.
class AppIconBadge extends StatelessWidget {
  const AppIconBadge(
    this.icon, {
    super.key,
    this.background,
    this.foreground,
    this.size = 48,
    this.iconSize,
    this.radius,
    this.bold = false,
  });

  final AppIconData icon;
  final Color? background;
  final Color? foreground;
  final double size;
  final double? iconSize;
  final double? radius;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: background ?? tokens.surfaceBlueStrong,
        // Radius scales with the container so a 32dp badge is not as round as
        // a 64dp one — a fixed radius looks wrong at both extremes.
        borderRadius: BorderRadius.circular(radius ?? size * 0.34),
      ),
      alignment: Alignment.center,
      child: AppIcon(
        icon,
        size: iconSize ?? size * 0.46,
        color: foreground ?? tokens.primary,
        bold: bold,
      ),
    );
  }
}
