import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import '../../core/ui/service_artwork.dart';

/// Edge of the artwork square in the "popular services" strip.
///
/// Was 60, sized for the line glyph. The backend now serves illustrated
/// artwork, and an illustration is a scene rather than a single stroke: at 60
/// the two figures in it are three pixels wide and the tile reads as a smudge.
/// 108 is the smallest size at which the subject is recognisable, so the strip
/// is built around that and the label sits under a card rather than a bead.
const double _railArtwork = 108;

/// Home.
///
/// Editorial rather than dense: a greeting, one question, search, then sections
/// that each do exactly one job. Deliberately NOT a card per row — the page
/// opens on plain text and white space, and cards appear only where content
/// genuinely groups (the active booking, a worker).
class HomeScreen extends ConsumerWidget {
  const HomeScreen({
    super.key,
    required this.onOpenService,
    required this.onOpenBooking,
    required this.onOpenSearch,
    required this.onOpenWorker,
  });

  final ValueChanged<Service> onOpenService;
  final ValueChanged<Booking> onOpenBooking;
  final VoidCallback onOpenSearch;
  final ValueChanged<String> onOpenWorker;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final user = ref.watch(currentUserProvider);
    final dashboard = ref.watch(dashboardProvider);
    final services = ref.watch(servicesProvider);

    return RefreshIndicator(
      color: t.primary,
      onRefresh: () async {
        ref.invalidate(dashboardProvider);
        ref.invalidate(servicesProvider);
        await ref.read(dashboardProvider.future);
      },
      child: ListView(
        padding: const EdgeInsets.only(top: Space.x4, bottom: Space.x20),
        children: [
          _LocationHeader(),
          const SizedBox(height: Space.x5),

          Padding(
            padding: Space.pageInsets,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _greeting(user?.shortName),
                  style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
                ),
                const SizedBox(height: Space.x1),
                Text('What do you need\nhelp with?', style: context.text.displayLarge),
              ],
            ),
          ),

          const SizedBox(height: Space.x5),
          Padding(
            padding: Space.pageInsets,
            child: AppSearchField(readOnly: true, onTap: onOpenSearch),
          ),

          // ── Active booking ────────────────────────────────────────────
          // Placed high and only when there is one: a customer with a worker
          // on the way opened the app for exactly this.
          dashboard.maybeWhen(
            data: (data) {
              final active = data.activeBooking;
              if (active == null) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(top: Space.section),
                child: Section(
                  title: 'Your active booking',
                  child: Padding(
                    padding: Space.pageInsets,
                    child: _ActiveBookingCard(
                      booking: active,
                      onTap: () => onOpenBooking(active),
                    ),
                  ),
                ),
              );
            },
            orElse: () => const SizedBox.shrink(),
          ),

          const SizedBox(height: Space.section),

          // ── Popular services ──────────────────────────────────────────
          Section(
            title: 'Popular services',
            actionLabel: 'See all',
            onAction: onOpenSearch,
            child: services.when(
              loading: () => const _ServiceChipSkeletons(),
              error: (error, _) => Padding(
                padding: Space.pageInsets,
                child: AppBanner(
                  message: 'Could not load services.',
                  tone: StateTone.error,
                  actionLabel: 'Retry',
                  onAction: () => ref.invalidate(servicesProvider),
                ),
              ),
              data: (list) => SizedBox(
                height: ServiceChip.artworkHeight(_railArtwork),
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: Space.pageInsets,
                  itemCount: list.length.clamp(0, 8),
                  separatorBuilder: (_, __) => const SizedBox(width: Space.x3),
                  itemBuilder: (context, i) => ServiceChip(
                    name: list[i].name,
                    category: list[i].category,
                    artworkSize: _railArtwork,
                    // The one place motion is on: a short horizontal strip of
                    // featured services, where an animated tile draws the eye
                    // to the primary action rather than competing with a grid.
                    artwork: ServiceArtwork(
                      service: list[i],
                      size: _railArtwork,
                      animate: true,
                    ),
                    onTap: () => onOpenService(list[i]),
                  ),
                ),
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          // ── The cooperative story ─────────────────────────────────────
          // A full-bleed tinted band rather than another card, so the page has
          // rhythm instead of a uniform stack.
          Padding(
            padding: Space.pageInsets,
            child: AppFeatureBand(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppIconBadge(AppIcons.shield, size: 52, iconSize: 26),
                  const SizedBox(height: Space.x4),
                  Text('Every booking funds\nworker welfare', style: context.text.headlineMedium),
                  const SizedBox(height: Space.x2),
                  Text(
                    '2% of every job goes to insurance and training for the '
                    'cooperative members who serve you.',
                    style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
                  ),
                ],
              ),
            ),
          ),

          // ── Recent ────────────────────────────────────────────────────
          dashboard.maybeWhen(
            data: (data) {
              if (data.recent.isEmpty) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(top: Space.section),
                child: Section(
                  title: 'Book again',
                  subtitle: 'Services you have used before.',
                  child: Padding(
                    padding: Space.pageInsets,
                    child: Column(
                      children: [
                        for (final booking in data.recent.take(3)) ...[
                          _PastBookingRow(booking: booking, onTap: () => onOpenBooking(booking)),
                          if (booking != data.recent.take(3).last)
                            const SizedBox(height: Space.x3),
                        ],
                      ],
                    ),
                  ),
                ),
              );
            },
            orElse: () => const SizedBox.shrink(),
          ),

          // ── Favourites ────────────────────────────────────────────────
          dashboard.maybeWhen(
            data: (data) {
              if (data.favorites.isEmpty) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(top: Space.section),
                child: Section(
                  title: 'Your preferred workers',
                  child: SizedBox(
                    height: 190,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: Space.pageInsets,
                      itemCount: data.favorites.length,
                      separatorBuilder: (_, __) => const SizedBox(width: Space.x3),
                      itemBuilder: (context, i) {
                        final worker = data.favorites[i];
                        return WorkerCardCompact(
                          name: worker.name,
                          imageUrl: worker.avatarUrl,
                          verified: true,
                          rating: worker.rating,
                          onTap: () => onOpenWorker(worker.workerId),
                        );
                      },
                    ),
                  ),
                ),
              );
            },
            orElse: () => const SizedBox.shrink(),
          ),

          // First run: nothing to show yet, so say so rather than leaving a
          // blank page under the search bar.
          dashboard.maybeWhen(
            data: (data) {
              final isEmpty = data.activeBooking == null &&
                  data.recent.isEmpty &&
                  data.favorites.isEmpty;
              if (!isEmpty) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(top: Space.x6),
                child: AppStateView.empty(
                  title: 'Nothing booked yet',
                  message: 'Pick a service above and we will match you with a '
                      'verified worker nearby.',
                  icon: AppIcons.bookings,
                ),
              );
            },
            orElse: () => const SizedBox.shrink(),
          ),

          dashboard.maybeWhen(
            loading: () => const Padding(
              padding: EdgeInsets.only(top: Space.section),
              child: Padding(
                padding: Space.pageInsets,
                child: SkeletonCard(),
              ),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  static String _greeting(String? name) {
    final hour = clock.now().hour;
    final part = hour < 12
        ? 'Good morning'
        : hour < 17
            ? 'Good afternoon'
            : 'Good evening';
    return name == null || name.isEmpty ? part : '$part, $name';
  }
}

class _LocationHeader extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final addresses = ref.watch(addressesProvider);

    final label = addresses.maybeWhen(
      data: (list) {
        if (list.isEmpty) return 'Set your location';
        final preferred = list.firstWhere((a) => a.isDefault, orElse: () => list.first);
        return preferred.address;
      },
      orElse: () => 'Locating…',
    );

    return Padding(
      padding: Space.pageInsets,
      child: Row(
        children: [
          AppIcon(AppIcons.locationPin, size: Sizes.iconSm, color: t.primary, bold: true),
          const SizedBox(width: Space.x1),
          Flexible(
            child: Text(
              label,
              style: context.text.labelMedium,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          AppIcon(AppIcons.chevronDown, size: Sizes.iconXs, color: t.textTertiary),
        ],
      ),
    );
  }
}

class _ActiveBookingCard extends StatelessWidget {
  const _ActiveBookingCard({required this.booking, required this.onTap});

  final Booking booking;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final worker = booking.workerName;

    return AppCard(
      onTap: onTap,
      padding: Space.cardInsetsLarge,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (worker != null)
                WorkerAvatar(name: worker, verified: true)
              else
                AppIconBadge(AppIcons.time, size: Sizes.avatarMd),
              const SizedBox(width: Space.x3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _headline(booking),
                      style: context.text.titleLarge,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      booking.serviceName ?? booking.address ?? '',
                      style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: Space.x2),
              BookingStatusBadge(booking.status, dense: true),
            ],
          ),
          const SizedBox(height: Space.x4),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: booking.isTrackable ? 'Track' : 'View',
                  variant: AppButtonVariant.soft,
                  size: AppButtonSize.small,
                  icon: booking.isTrackable ? AppIcons.navigate : AppIcons.chevronRight,
                  onPressed: onTap,
                ),
              ),
              if (booking.workerPhone != null) ...[
                const SizedBox(width: Space.x2),
                Expanded(
                  child: AppButton.secondary(
                    label: 'Call',
                    size: AppButtonSize.small,
                    icon: AppIcons.call,
                    onPressed: onTap,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  static String _headline(Booking booking) {
    final worker = booking.workerName;
    return switch (booking.status) {
      'requested' || 'matching' => 'Finding a worker…',
      'assigned' => worker == null ? 'Worker assigned' : '$worker was assigned',
      'accepted' => worker == null ? 'Booking confirmed' : '$worker confirmed',
      'en_route' => worker == null ? 'On the way' : '$worker is on the way',
      'started' => worker == null ? 'Work in progress' : '$worker is working',
      _ => booking.serviceName ?? 'Your booking',
    };
  }
}

class _PastBookingRow extends StatelessWidget {
  const _PastBookingRow({required this.booking, required this.onTap});

  final Booking booking;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return AppCard(
      onTap: onTap,
      elevated: false,
      padding: const EdgeInsets.all(Space.x3),
      child: Row(
        children: [
          ServiceArtwork.raw(
            name: booking.serviceCategory ?? booking.serviceName,
            size: 44,
          ),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  booking.serviceName ?? 'Service',
                  style: context.text.titleMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  booking.address ?? '',
                  style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          AppIcon(AppIcons.repeat, size: Sizes.iconSm, color: t.primary),
        ],
      ),
    );
  }
}

class _ServiceChipSkeletons extends StatelessWidget {
  const _ServiceChipSkeletons();

  @override
  Widget build(BuildContext context) {
    // Every measurement here mirrors the loaded strip. A skeleton that is a
    // different size than what replaces it makes the page jump at the moment
    // the user is deciding where to tap.
    return SizedBox(
      height: ServiceChip.artworkHeight(_railArtwork),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: Space.pageInsets,
        itemCount: 4,
        separatorBuilder: (_, __) => const SizedBox(width: Space.x3),
        itemBuilder: (_, __) => const SizedBox(
          width: _railArtwork + 16,
          child: Column(
            children: [
              Skeleton(
                width: _railArtwork,
                height: _railArtwork,
                radius: _railArtwork * 0.32,
              ),
              SizedBox(height: Space.x2),
              Skeleton.text(width: 64),
            ],
          ),
        ),
      ),
    );
  }
}
