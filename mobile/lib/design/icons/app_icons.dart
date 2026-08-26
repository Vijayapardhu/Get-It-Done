import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';

import '../theme/app_theme.dart';
import '../tokens/spacing.dart';

/// The app's icon vocabulary.
///
/// Every icon in the product is named here by ROLE, not by picture. Screens
/// write `AppIcons.bookings`, never `HugeIcons.strokeRoundedCalendar03`. When a
/// glyph needs to change, it changes once.
///
/// One style throughout: stroke-rounded. The free Hugeicons package ships only
/// that weight, and mixing weights for active states causes visible thickness
/// jitter in the nav bar anyway. Active state is expressed through colour and a
/// soft-filled container — see [AppIcon] and the bottom nav.
abstract final class AppIcons {
  // ── Navigation ────────────────────────────────────────────────────────────
  static const home = HugeIcons.strokeRoundedHome01;
  static const bookings = HugeIcons.strokeRoundedCalendar03;
  static const notifications = HugeIcons.strokeRoundedNotification03;
  static const profile = HugeIcons.strokeRoundedUserCircle;
  static const menu = HugeIcons.strokeRoundedMenu01;

  // ── Actions ───────────────────────────────────────────────────────────────
  static const search = HugeIcons.strokeRoundedSearch01;
  static const filter = HugeIcons.strokeRoundedFilter;
  static const sort = HugeIcons.strokeRoundedSortByDown01;
  static const add = HugeIcons.strokeRoundedAdd01;
  static const remove = HugeIcons.strokeRoundedMinusSign;
  static const close = HugeIcons.strokeRoundedCancel01;
  static const edit = HugeIcons.strokeRoundedEdit02;
  static const delete = HugeIcons.strokeRoundedDelete02;
  static const share = HugeIcons.strokeRoundedShare08;
  static const copy = HugeIcons.strokeRoundedCopy01;
  static const refresh = HugeIcons.strokeRoundedRefresh;
  static const download = HugeIcons.strokeRoundedDownload01;
  static const more = HugeIcons.strokeRoundedMoreVertical;
  static const chevronRight = HugeIcons.strokeRoundedArrowRight01;
  static const chevronLeft = HugeIcons.strokeRoundedArrowLeft01;
  static const chevronDown = HugeIcons.strokeRoundedArrowDown01;
  static const repeat = HugeIcons.strokeRoundedRepeat;

  // ── Trust (the product's differentiator — used deliberately) ─────────────
  static const verified = HugeIcons.strokeRoundedCheckmarkBadge01;
  static const secure = HugeIcons.strokeRoundedSecurityCheck;
  static const showPassword = HugeIcons.strokeRoundedView;
  static const hidePassword = HugeIcons.strokeRoundedViewOff;
  static const certificate = HugeIcons.strokeRoundedCertificate01;
  static const cooperative = HugeIcons.strokeRoundedUserGroup;
  static const rating = HugeIcons.strokeRoundedStar;
  static const shield = HugeIcons.strokeRoundedShield01;

  // ── Booking lifecycle ─────────────────────────────────────────────────────
  static const time = HugeIcons.strokeRoundedTime04;
  static const location = HugeIcons.strokeRoundedLocation01;
  static const locationPin = HugeIcons.strokeRoundedLocation04;
  static const navigate = HugeIcons.strokeRoundedNavigation03;
  static const call = HugeIcons.strokeRoundedCall02;
  static const message = HugeIcons.strokeRoundedMessage01;
  static const chat = HugeIcons.strokeRoundedChatting01;
  static const send = HugeIcons.strokeRoundedSent;
  static const camera = HugeIcons.strokeRoundedCamera01;
  static const photo = HugeIcons.strokeRoundedImage01;
  static const home_ = HugeIcons.strokeRoundedHome03;
  static const building = HugeIcons.strokeRoundedBuilding03;
  static const work = HugeIcons.strokeRoundedBriefcase01;

  // ── Money ─────────────────────────────────────────────────────────────────
  static const wallet = HugeIcons.strokeRoundedWallet01;
  static const invoice = HugeIcons.strokeRoundedInvoice01;
  static const card = HugeIcons.strokeRoundedCreditCard;
  static const money = HugeIcons.strokeRoundedMoney01;
  static const document = HugeIcons.strokeRoundedFile01;

  // ── Emergency ─────────────────────────────────────────────────────────────
  static const emergency = HugeIcons.strokeRoundedAlert01;
  static const alertCircle = HugeIcons.strokeRoundedAlertCircle;
  static const flash = HugeIcons.strokeRoundedFlash;

  // ── Feedback / state ──────────────────────────────────────────────────────
  static const success = HugeIcons.strokeRoundedCheckmarkCircle02;
  static const tick = HugeIcons.strokeRoundedTick02;
  static const info = HugeIcons.strokeRoundedInformationCircle;
  static const favourite = HugeIcons.strokeRoundedFavouriteCircle;
  static const bookmark = HugeIcons.strokeRoundedBookmark01;
  static const thumbsUp = HugeIcons.strokeRoundedThumbsUp;
  static const idea = HugeIcons.strokeRoundedIdea01;
  static const analytics = HugeIcons.strokeRoundedAnalytics01;
  static const support = HugeIcons.strokeRoundedCustomerService01;
  static const loading = HugeIcons.strokeRoundedLoading03;

  // ── Settings ──────────────────────────────────────────────────────────────
  static const settings = HugeIcons.strokeRoundedSettings01;
  static const language = HugeIcons.strokeRoundedGlobe02;
  static const logout = HugeIcons.strokeRoundedLogout03;
  static const lightMode = HugeIcons.strokeRoundedSun01;
  static const darkMode = HugeIcons.strokeRoundedMoon02;
  static const user = HugeIcons.strokeRoundedUser;
}

/// Renders an [AppIcons] entry with the app's stroke weight and a theme-aware
/// default colour.
///
/// Prefer this over `HugeIcon` directly so stroke width stays consistent — a
/// mix of 1.5 and 2.0 across screens is subtle enough to survive review and
/// obvious enough to make the app feel unfinished.
class AppIcon extends StatelessWidget {
  const AppIcon(
    this.icon, {
    super.key,
    this.size = Sizes.iconMd,
    this.color,
    this.bold = false,
    this.semanticLabel,
  });

  final List<List<dynamic>> icon;
  final double size;
  final Color? color;

  /// Heavier stroke for active states and large hero icons.
  final bool bold;

  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final resolved = color ?? context.tokens.textSecondary;
    final glyph = HugeIcon(
      icon: icon,
      color: resolved,
      size: size,
      strokeWidth: bold ? Sizes.iconStrokeBold : Sizes.iconStroke,
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

  final List<List<dynamic>> icon;
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
