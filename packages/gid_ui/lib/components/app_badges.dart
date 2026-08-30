import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/app_theme.dart';
import '../tokens/spacing.dart';

/// Tone maps a badge to the semantic palette. Components take a tone rather
/// than two colours, so a status can never be rendered green-on-red.
enum BadgeTone { neutral, primary, success, warning, danger }

extension _BadgeToneColors on BadgeTone {
  (Color fg, Color bg) resolve(AppTokens t) => switch (this) {
        BadgeTone.neutral => (t.textSecondary, t.surfaceAlt),
        BadgeTone.primary => (t.primary, t.primarySoft),
        BadgeTone.success => (t.success, t.successSoft),
        BadgeTone.warning => (t.warning, t.warningSoft),
        BadgeTone.danger => (t.danger, t.dangerSoft),
      };
}

/// A small pill. Booking status, service tags, skill chips.
class AppBadge extends StatelessWidget {
  const AppBadge(
    this.label, {
    super.key,
    this.tone = BadgeTone.neutral,
    this.icon,
    this.dense = false,
  });

  final String label;
  final BadgeTone tone;
  final AppIconData? icon;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final (fg, bg) = tone.resolve(context.tokens);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: dense ? Space.x2 : Space.x3,
        vertical: dense ? Space.x1 : Space.x1 + 2,
      ),
      decoration: BoxDecoration(color: bg, borderRadius: Radii.rPill),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            AppIcon(icon!, size: dense ? 12 : Sizes.iconXs, color: fg, bold: true),
            const SizedBox(width: Space.x1 + 2),
          ],
          Text(
            label,
            style: (dense ? context.text.labelSmall : context.text.labelMedium)?.copyWith(
              color: fg,
              fontWeight: FontWeight.w700,
              letterSpacing: 0,
            ),
          ),
        ],
      ),
    );
  }
}

/// Booking lifecycle status, mapped from the backend's `bookings.status`.
///
/// The backend statuses are: requested, matching, assigned, accepted, en_route,
/// started, completed, cancelled, expired, disputed, refunded. Mapping them in
/// one place means a status never renders as a raw snake_case string in the UI.
class BookingStatusBadge extends StatelessWidget {
  const BookingStatusBadge(this.status, {super.key, this.dense = false});

  final String status;
  final bool dense;

  static (String label, BadgeTone tone) describe(String status) => switch (status) {
        'requested' => ('Requested', BadgeTone.neutral),
        'matching' => ('Finding worker', BadgeTone.primary),
        'assigned' => ('Worker assigned', BadgeTone.primary),
        'accepted' => ('Confirmed', BadgeTone.primary),
        'en_route' => ('On the way', BadgeTone.primary),
        'started' => ('In progress', BadgeTone.warning),
        'completed' => ('Completed', BadgeTone.success),
        'cancelled' => ('Cancelled', BadgeTone.danger),
        'expired' => ('Expired', BadgeTone.neutral),
        'disputed' => ('Disputed', BadgeTone.danger),
        'refunded' => ('Refunded', BadgeTone.neutral),
        _ => (status, BadgeTone.neutral),
      };

  @override
  Widget build(BuildContext context) {
    final (label, tone) = describe(status);
    return AppBadge(label, tone: tone, dense: dense);
  }
}

/// The verified-worker mark.
///
/// This appears on worker cards, booking screens and the trust profile. It is
/// the single most important trust signal in the product, so it gets its own
/// widget rather than being assembled ad hoc — that guarantees it looks
/// identical everywhere and cannot drift into meaning something looser.
class VerifiedBadge extends StatelessWidget {
  const VerifiedBadge({super.key, this.label = 'Verified', this.compact = false});

  final String label;

  /// Icon only, for tight spots like an avatar corner.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    if (compact) {
      return Container(
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: t.surface,
          shape: BoxShape.circle,
        ),
        child: AppIcon(AppIcons.verified, size: Sizes.iconSm, color: t.success, bold: true),
      );
    }

    return AppBadge(label, tone: BadgeTone.success, icon: AppIcons.verified);
  }
}

/// Rating with its count. Tabular figures so the star does not shift as the
/// number changes width.
class RatingPill extends StatelessWidget {
  const RatingPill({
    super.key,
    required this.rating,
    this.reviewCount,
    this.dense = false,
  });

  final double rating;
  final int? reviewCount;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        AppIcon(AppIcons.rating, size: dense ? 14 : Sizes.iconSm, color: AppRatingColors.star, bold: true),
        const SizedBox(width: Space.x1),
        Text(
          rating.toStringAsFixed(1),
          style: (dense ? context.text.labelSmall : context.text.labelMedium)?.copyWith(
            color: t.textPrimary,
            fontWeight: FontWeight.w700,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        if (reviewCount != null) ...[
          const SizedBox(width: Space.x1),
          Text(
            '($reviewCount)',
            style: (dense ? context.text.labelSmall : context.text.bodySmall)?.copyWith(color: t.textTertiary),
          ),
        ],
      ],
    );
  }
}

abstract final class AppRatingColors {
  /// Amber, not the warning amber — a rating star is not a warning.
  static const star = Color(0xFFF6B93B);
}

/// A single trust line: "Identity verified", "Insured", "Skill certified".
///
/// Used as a stack on the worker profile. Renders unmet items in a muted state
/// rather than hiding them — showing what is *not* verified is what makes the
/// verified items credible.
class TrustRow extends StatelessWidget {
  const TrustRow({
    super.key,
    required this.label,
    required this.verified,
    this.detail,
    this.icon,
  });

  final String label;
  final bool verified;
  final String? detail;
  final AppIconData? icon;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final color = verified ? t.success : t.textTertiary;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Space.x2),
      child: Row(
        children: [
          AppIconBadge(
            icon ?? (verified ? AppIcons.verified : AppIcons.info),
            size: 34,
            background: verified ? t.successSoft : t.surfaceAlt,
            foreground: color,
          ),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: context.text.titleMedium?.copyWith(
                    color: verified ? t.textPrimary : t.textSecondary,
                  ),
                ),
                if (detail != null)
                  Text(detail!, style: context.text.bodySmall?.copyWith(color: t.textTertiary)),
              ],
            ),
          ),
          if (verified)
            AppIcon(AppIcons.verified, size: Sizes.iconSm, color: t.success, bold: true)
          else
            Text('Pending', style: context.text.labelSmall?.copyWith(color: t.textTertiary)),
        ],
      ),
    );
  }
}
