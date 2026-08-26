import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../design/design_system.dart';

/// The home screen's coloured header.
///
/// Everything above the catalogue lives on one deep-blue panel with a rounded
/// bottom edge: where you are, who you are, what this app does, and the two
/// ways to start. The panel is doing a job beyond decoration — it separates
/// "the pitch" from "the catalogue" without a divider, so the grid below reads
/// as content rather than as more of the header.
class HomeHero extends ConsumerWidget {
  const HomeHero({
    super.key,
    required this.greeting,
    required this.onOpenSearch,
    required this.onInstant,
    required this.onSchedule,
    required this.onOpenProfile,
  });

  /// "Good afternoon, Anitha". Sits above the headline rather than below the
  /// panel, where it read as a stray line with nothing to attach to.
  final String greeting;

  final VoidCallback onOpenSearch;
  final VoidCallback onInstant;
  final VoidCallback onSchedule;
  final VoidCallback onOpenProfile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final addresses = ref.watch(addressesProvider);
    final user = ref.watch(currentUserProvider);

    final address = addresses.maybeWhen(
      data: (list) {
        if (list.isEmpty) return null;
        final preferred = list.firstWhere((a) => a.isDefault, orElse: () => list.first);
        return preferred;
      },
      orElse: () => null,
    );

    return Container(
      decoration: BoxDecoration(
        // A gradient rather than a flat fill: a single saturated blue across a
        // third of the screen goes heavy, and the lift at the top keeps the
        // status-bar area from looking like a bruise.
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.blue700, AppColors.blue900],
        ),
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(Radii.xxl),
          bottomRight: Radius.circular(Radii.xxl),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.x5, Space.x3, Space.x5, Space.x5),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _AddressRow(
                label: address?.name ?? 'Set your location',
                detail: address?.address,
                initials: user?.initials,
                onOpenProfile: onOpenProfile,
              ),
              const SizedBox(height: Space.x6),

              Text(
                greeting,
                style: context.text.bodyMedium?.copyWith(color: AppColors.blue200),
              ),
              const SizedBox(height: Space.x1),
              Text(
                'Verified workers,\nfrom your local cooperative',
                style: context.text.displaySmall?.copyWith(
                  color: AppColors.n0,
                  height: 1.25,
                ),
              ),
              const SizedBox(height: Space.x5),

              AppSearchField(
                readOnly: true,
                onTap: onOpenSearch,
                hint: 'Search for a service',
              ),
              const SizedBox(height: Space.x5),

              Row(
                children: [
                  Expanded(
                    child: _StartCard(
                      title: 'Get it done now',
                      caption: 'Nearest worker',
                      icon: AppIcons.flash,
                      tint: t.warning,
                      onTap: onInstant,
                    ),
                  ),
                  const SizedBox(width: Space.x3),
                  Expanded(
                    child: _StartCard(
                      title: 'Schedule for later',
                      caption: 'Pick a slot',
                      icon: AppIcons.bookings,
                      tint: t.primary,
                      onTap: onSchedule,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddressRow extends StatelessWidget {
  const _AddressRow({
    required this.label,
    required this.detail,
    required this.initials,
    required this.onOpenProfile,
  });

  final String label;
  final String? detail;
  final String? initials;
  final VoidCallback onOpenProfile;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AppIcon(AppIcons.location, size: 16, color: AppColors.n0, bold: true),
                  const SizedBox(width: Space.x2),
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.titleMedium?.copyWith(color: AppColors.n0),
                    ),
                  ),
                  const SizedBox(width: Space.x1),
                  AppIcon(AppIcons.chevronDown, size: 14, color: AppColors.blue200),
                ],
              ),
              if (detail != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2, left: 24),
                  child: Text(
                    detail!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.bodySmall?.copyWith(color: AppColors.blue200),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(width: Space.x3),
        GestureDetector(
          onTap: onOpenProfile,
          behavior: HitTestBehavior.opaque,
          child: Container(
            width: 40,
            height: 40,
            decoration: const BoxDecoration(color: AppColors.n0, shape: BoxShape.circle),
            alignment: Alignment.center,
            child: initials == null || initials!.isEmpty
                ? AppIcon(AppIcons.user, size: 20, color: AppColors.blue700)
                : Text(
                    initials!,
                    style: context.text.labelLarge?.copyWith(
                      color: AppColors.blue700,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
          ),
        ),
      ],
    );
  }
}

/// One of the two ways to start a booking.
///
/// White cards on the coloured panel, which is what makes them the obvious
/// targets: everything else up here is text.
class _StartCard extends StatelessWidget {
  const _StartCard({
    required this.title,
    required this.caption,
    required this.icon,
    required this.tint,
    required this.onTap,
  });

  final String title;
  final String caption;
  final List<List<dynamic>> icon;
  final Color tint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.all(Space.x4),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(Radii.xl),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            AppIconBadge(icon, size: 36, iconSize: 18, background: tint.withValues(alpha: 0.14), foreground: tint),
            const SizedBox(height: Space.x3),
            Text(
              title,
              style: context.text.titleSmall,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              caption,
              style: context.text.bodySmall?.copyWith(color: t.textTertiary),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
