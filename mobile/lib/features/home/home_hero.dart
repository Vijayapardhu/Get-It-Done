import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/cart/checkout.dart';
import '../../core/location/current_location.dart';
import 'package:gid_core/gid_core.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import '../address/address_picker.dart';

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
    required this.onOpenAlerts,
  });

  /// "Good afternoon, Anitha". Sits above the headline rather than below the
  /// panel, where it read as a stray line with nothing to attach to.
  final String greeting;

  final VoidCallback onOpenSearch;
  final VoidCallback onInstant;
  final VoidCallback onSchedule;
  final VoidCallback onOpenProfile;
  final VoidCallback onOpenAlerts;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final addresses = ref.watch(addressesProvider);
    final user = ref.watch(currentUserProvider);

    final chosen = ref.watch(checkoutProvider).addressId;

    // Asking the phone where it is, on open, rather than waiting for a tap.
    // Warms the picker and fills the header on a first run; never overrides an
    // address the customer has already saved.
    ref.watch(locationBootstrapProvider);

    final list = addresses.maybeWhen(
      data: (value) => value,
      orElse: () => const <SavedAddress>[],
    );

    // Default the choice as soon as the addresses land, so the header and
    // checkout start from the same place instead of each picking their own.
    if (list.isNotEmpty && chosen == null) {
      Future.microtask(() => ref.read(checkoutProvider.notifier).ensureAddress(list));
    }

    // What is shown IS what the next booking will use. Falling back to the
    // default only until a choice exists.
    final address = list.where((a) => a.id == chosen).firstOrNull ??
        (list.isEmpty
            ? null
            : list.firstWhere((a) => a.isDefault, orElse: () => list.first));

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
                detail: address?.shortAddress,
                initials: user?.initials,
                onOpenProfile: onOpenProfile,
                onChangeAddress: () => showAddressPicker(context, ref),
                onOpenAlerts: onOpenAlerts,
                unread: ref.watch(unreadNotificationCountProvider),
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

              Row(
                children: [
                  Expanded(
                    child: _StartCard(
                      title: 'Get Instant Service',
                      caption: 'Find an available worker',
                      icon: AppIcons.flash,
                      tint: t.warning,
                      onTap: onInstant,
                    ),
                  ),
                  const SizedBox(width: Space.x3),
                  Expanded(
                    child: _StartCard(
                      title: 'Schedule for Later',
                      caption: 'Pick a convenient time',
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

/// Where you are, and who you are: the two things the coloured panel says
/// about the person holding the phone.
///
/// The address is the consequential half. It decides which workers can be
/// offered at all, and checkout then uses it rather than asking again — which
/// is why the chevron beside it is not decoration.
class _AddressRow extends StatelessWidget {
  const _AddressRow({
    required this.label,
    required this.detail,
    required this.initials,
    required this.onOpenProfile,
    required this.onChangeAddress,
    required this.onOpenAlerts,
    required this.unread,
  });

  final String label;
  final String? detail;
  final String? initials;
  final VoidCallback onOpenProfile;
  final VoidCallback onChangeAddress;
  final VoidCallback onOpenAlerts;
  final int unread;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: GestureDetector(
            onTap: onChangeAddress,
            behavior: HitTestBehavior.opaque,
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
        ),
        const SizedBox(width: Space.x3),
        _AlertsBell(unread: unread, onTap: onOpenAlerts),
        const SizedBox(width: Space.x2),
        _Avatar(initials: initials, onTap: onOpenProfile),
      ],
    );
  }
}

/// The profile target.
///
/// A white disc on the coloured panel, carrying initials where we have a name
/// and the person glyph where we do not. It is the only round thing in the
/// hero, which is what makes it read as "you" rather than as another card.
class _Avatar extends StatelessWidget {
  const _Avatar({required this.initials, required this.onTap});

  final String? initials;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
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
  final AppIconData icon;
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
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}


/// Alerts, reachable from Home.
///
/// The Alerts tab already carries this count in the bottom bar, but the bar is
/// the thing a user scans last. A worker on the way generates the notification
/// that matters most, and Home is where they are already looking — so the
/// count is repeated here rather than waiting to be discovered.
///
/// Translucent rather than the avatar's solid white: two white discs side by
/// side would read as a pair of equal targets, and the avatar is the anchor.
class _AlertsBell extends StatelessWidget {
  const _AlertsBell({required this.unread, required this.onTap});

  final int unread;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 40,
        height: 40,
        // Clip.none: the badge deliberately overhangs the disc, which is what
        // stops it reading as part of the glyph.
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppColors.n0.withValues(alpha: 0.16),
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: const AppIcon(AppIcons.notifications, size: 20, color: AppColors.n0),
            ),
            if (unread > 0)
              Positioned(
                top: -2,
                right: -2,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  constraints: const BoxConstraints(minWidth: 18),
                  decoration: BoxDecoration(
                    color: AppColors.danger,
                    borderRadius: BorderRadius.circular(9),
                    // Separates the badge from the bell behind it, which
                    // otherwise blur together at a glance on the blue panel.
                    border: Border.all(color: AppColors.blue900, width: 2),
                  ),
                  child: Text(
                    // Past 9 the exact number stops being useful and starts
                    // being a wide pill that shoves the avatar sideways.
                    unread > 9 ? '9+' : '$unread',
                    textAlign: TextAlign.center,
                    style: context.text.labelSmall?.copyWith(
                      color: AppColors.n0,
                      fontWeight: FontWeight.w700,
                      height: 1.1,
                      fontSize: 10,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
