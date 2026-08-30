import 'package:flutter/material.dart';

import 'package:gid_ui/gid_ui.dart';

/// Worker avatar with an optional verification mark.
///
/// Falls back to initials rather than a generic silhouette — a grid of
/// identical placeholder people is worse than no photo at all.
class WorkerAvatar extends StatelessWidget {
  const WorkerAvatar({
    super.key,
    required this.name,
    this.imageUrl,
    this.size = Sizes.avatarMd,
    this.verified = false,
  });

  final String name;
  final String? imageUrl;
  final double size;
  final bool verified;

  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.characters.first.toUpperCase();
    return (parts.first.characters.first + parts.last.characters.first).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    final avatar = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: t.surfaceBlueStrong,
        shape: BoxShape.circle,
        image: imageUrl != null && imageUrl!.isNotEmpty
            ? DecorationImage(image: NetworkImage(imageUrl!), fit: BoxFit.cover)
            : null,
      ),
      alignment: Alignment.center,
      child: imageUrl != null && imageUrl!.isNotEmpty
          ? null
          : Text(
              _initials,
              style: context.text.titleMedium?.copyWith(
                color: t.primary,
                fontSize: size * 0.34,
                fontWeight: FontWeight.w700,
              ),
            ),
    );

    if (!verified) return avatar;

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          avatar,
          Positioned(
            right: -2,
            bottom: -2,
            child: VerifiedBadge(compact: true),
          ),
        ],
      ),
    );
  }
}

/// Worker summary card.
///
/// Trust is inline, not buried: the verification mark sits on the avatar and
/// the society name sits directly under the worker's name. That pairing is the
/// product's whole positioning — this is a cooperative member, not an anonymous
/// gig worker — so it should never be one tap away.
class WorkerCard extends StatelessWidget {
  const WorkerCard({
    super.key,
    required this.name,
    this.imageUrl,
    this.verified = false,
    this.cooperativeName,
    this.rating,
    this.reviewCount,
    this.completedJobs,
    this.skills = const [],
    this.distanceKm,
    this.onTap,
    this.trailing,
  });

  final String name;
  final String? imageUrl;
  final bool verified;

  /// The society this worker belongs to.
  final String? cooperativeName;

  final double? rating;
  final int? reviewCount;
  final int? completedJobs;
  final List<String> skills;
  final double? distanceKm;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return AppCard(
      onTap: onTap,
      padding: Space.cardInsetsLarge,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              WorkerAvatar(name: name, imageUrl: imageUrl, verified: verified, size: Sizes.avatarLg),
              const SizedBox(width: Space.x3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: context.text.titleLarge, maxLines: 1, overflow: TextOverflow.ellipsis),
                    if (cooperativeName != null) ...[
                      const SizedBox(height: Space.x0_5),
                      Row(
                        children: [
                          AppIcon(AppIcons.cooperative, size: Sizes.iconXs, color: t.textTertiary),
                          const SizedBox(width: Space.x1),
                          Expanded(
                            child: Text(
                              cooperativeName!,
                              style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: Space.x2),
                    // Wrap, not Row: rating + job count + distance overflows a
                    // narrow card once real font metrics apply, and a worker
                    // with a four-digit job count is the common case.
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        if (rating != null) ...[
                          RatingPill(rating: rating!, reviewCount: reviewCount, dense: true),
                          if (completedJobs != null || distanceKm != null)
                            _Dot(color: t.textTertiary),
                        ],
                        if (completedJobs != null) ...[
                          Text(
                            '$completedJobs jobs',
                            style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                          ),
                          if (distanceKm != null) _Dot(color: t.textTertiary),
                        ],
                        if (distanceKm != null)
                          Text(
                            '${distanceKm!.toStringAsFixed(1)} km',
                            style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
          if (skills.isNotEmpty) ...[
            const SizedBox(height: Space.x4),
            Wrap(
              spacing: Space.x2,
              runSpacing: Space.x2,
              // Cap at four; a worker with twelve skills should not push the
              // card to four lines on a list screen.
              children: [
                for (final skill in skills.take(4)) AppBadge(skill, dense: true),
                if (skills.length > 4)
                  AppBadge('+${skills.length - 4}', dense: true, tone: BadgeTone.primary),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Horizontal strip variant for "trusted workers near you".
class WorkerCardCompact extends StatelessWidget {
  const WorkerCardCompact({
    super.key,
    required this.name,
    this.imageUrl,
    this.verified = false,
    this.cooperativeName,
    this.rating,
    this.onTap,
  });

  final String name;
  final String? imageUrl;
  final bool verified;
  final String? cooperativeName;
  final double? rating;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return SizedBox(
      width: 164,
      child: AppCard(
        onTap: onTap,
        padding: const EdgeInsets.all(Space.x4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            WorkerAvatar(name: name, imageUrl: imageUrl, verified: verified, size: Sizes.avatarMd),
            const SizedBox(height: Space.x3),
            Text(name, style: context.text.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
            if (cooperativeName != null) ...[
              const SizedBox(height: Space.x0_5),
              Text(
                cooperativeName!,
                style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            if (rating != null) ...[
              const SizedBox(height: Space.x2),
              RatingPill(rating: rating!, dense: true),
            ],
          ],
        ),
      ),
    );
  }
}

/// The separator dot used between inline metadata items.
class _Dot extends StatelessWidget {
  const _Dot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.x2),
      child: Container(
        width: 3,
        height: 3,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
    );
  }
}
