import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import '../../core/ui/service_artwork.dart';
import 'home_hero.dart';
import 'service_card.dart';

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
    required this.onStartEmergency,
    required this.onOpenProfile,
  });

  final ValueChanged<Service> onOpenService;
  final ValueChanged<Booking> onOpenBooking;
  final VoidCallback onOpenSearch;
  final ValueChanged<String> onOpenWorker;

  /// "Get it done now" — the instant path, which is the emergency flow.
  final VoidCallback onStartEmergency;

  /// The avatar in the hero.
  final VoidCallback onOpenProfile;

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
        padding: const EdgeInsets.only(bottom: Space.x20),
        children: [
          HomeHero(
            greeting: _greeting(user?.shortName),
            onOpenSearch: onOpenSearch,
            onInstant: onStartEmergency,
            onSchedule: onOpenSearch,
            onOpenProfile: onOpenProfile,
          ),

          // ── The cooperative story ─────────────────────────────────────
          // Sits where a commercial app puts its promotional banner, because
          // it is doing that job: it is the reason to choose this app over the
          // one with faster delivery. It is not a promotion, though — we run
          // none, and a fabricated "50% off" would undo exactly the trust this
          // is claiming.
          const SizedBox(height: Space.x5),
          Padding(
            padding: Space.pageInsets,
            child: AppCard(
              elevated: false,
              padding: const EdgeInsets.all(Space.x4),
              child: Row(
                children: [
                  AppIconBadge(AppIcons.cooperative, size: 44, iconSize: 22),
                  const SizedBox(width: Space.x4),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('Every booking funds worker welfare',
                            style: context.text.titleSmall),
                        const SizedBox(height: 2),
                        Text(
                          '2% of every job goes to insurance and training for '
                          'the cooperative members who serve you.',
                          style: context.text.bodySmall
                              ?.copyWith(color: t.textSecondary, height: 1.45),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
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

          // ── The catalogue ────────────────────────────────
          // Every service, as pictures, rather than eight of them in a strip
          // with the rest behind a "see all". The catalogue is small enough to
          // show whole, and a customer who can see everything on offer does not
          // have to guess whether the thing they want exists.
          Section(
            title: 'All home services',
            subtitle: 'Book trusted cooperative workers.',
            child: services.when(
              loading: () => const _ServiceGridSkeletons(),
              error: (error, _) => Padding(
                padding: Space.pageInsets,
                child: AppBanner(
                  message: 'Could not load services.',
                  tone: StateTone.error,
                  actionLabel: 'Retry',
                  onAction: () => ref.invalidate(servicesProvider),
                ),
              ),
              data: (list) => Padding(
                padding: _ServiceGrid.insets,
                child: _ServiceGrid(
                  services: list,
                  onOpenService: onOpenService,
                ),
              ),
            ),
          ),

          const SizedBox(height: Space.section),

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

/// The catalogue grid.
///
/// Three columns on a phone, more on anything wider. Derived from the
/// available width rather than hardcoded, so the same grid serves a tablet
/// without a second layout — and so a large accessibility text scale gets
/// fewer, wider cards instead of three columns of clipped words.
class _ServiceGrid extends StatelessWidget {
  const _ServiceGrid({required this.services, required this.onOpenService});

  final List<Service> services;
  final ValueChanged<Service> onOpenService;

  // Tighter than the page's own rhythm on purpose. Three columns on a phone
  // leave the tile width fixed by arithmetic, so every point taken out of the
  // gutters goes straight into the artwork.
  static const _gap = Space.x2;
  static const _minTile = 104.0;

  /// The grid runs closer to the screen edge than the prose around it.
  static const insets = EdgeInsets.symmetric(horizontal: Space.x4);

  static int columnsFor(double width, double textScale) {
    final target = _minTile * (textScale > 1.3 ? 1.4 : 1);
    final fits = ((width + _gap) / (target + _gap)).floor();
    return fits.clamp(2, 4);
  }

  /// Height of everything below the artwork square: the inset, two lines of
  /// name, the gap, and the price row.
  ///
  /// Measured rather than expressed as a childAspectRatio. A ratio has to be
  /// guessed against the worst case — the longest name at the largest text
  /// scale — and a guess that is slightly small does not clip quietly, it
  /// throws a layout overflow. Sizing the cell as "the square, plus this"
  /// makes the arithmetic exact at any text scale.
  static double footerHeight(BuildContext context) {
    final scaler = MediaQuery.textScalerOf(context);
    final title = context.text.titleSmall;
    final price = context.text.titleSmall;

    double lineHeight(TextStyle? style) {
      final size = scaler.scale(style?.fontSize ?? 14);
      return size * (style?.height ?? 1.35);
    }

    return Space.x3 + Space.x4 + (lineHeight(title) * 2) + Space.x2 + lineHeight(price);
  }

  @override
  Widget build(BuildContext context) {
    if (services.isEmpty) {
      return AppStateView.empty(
        title: 'No services yet',
        message: 'The catalogue for your area is still being set up.',
        icon: AppIcons.home,
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = columnsFor(
          constraints.maxWidth,
          MediaQuery.textScalerOf(context).scale(1),
        );

        return GridView.builder(
          padding: EdgeInsets.zero,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: services.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: _gap,
            mainAxisSpacing: _gap,
            // The square of artwork is as wide as the cell, so the cell is that
            // square plus the text block underneath it.
            mainAxisExtent:
                (constraints.maxWidth - _gap * (columns - 1)) / columns +
                    footerHeight(context),
          ),
          itemBuilder: (context, i) => ServiceCard(
            service: services[i],
            onOpen: () => onOpenService(services[i]),
          ),
        );
      },
    );
  }
}

/// A grid cell's worth of skeleton.
///
/// SkeletonCard is row-shaped — an avatar beside two lines of text — which is
/// right for a list and overflows a 110px grid cell. This mirrors the real
/// card instead: a square of artwork, a title line, a price line.
class _ServiceCardSkeleton extends StatelessWidget {
  const _ServiceCardSkeleton();

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(Radii.xl),
        border: Border.all(color: t.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AspectRatio(
            aspectRatio: 1,
            child: Skeleton(width: double.infinity, height: double.infinity, radius: 0),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.x3, Space.x3, Space.x3, Space.x4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: const [
                Skeleton.text(width: 68),
                SizedBox(height: Space.x2),
                Skeleton.text(width: 44),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ServiceGridSkeletons extends StatelessWidget {
  const _ServiceGridSkeletons();

  @override
  Widget build(BuildContext context) {
    // Same geometry as the loaded grid. A placeholder of a different shape
    // makes the page jump at the moment the user is deciding where to tap.
    return Padding(
      padding: _ServiceGrid.insets,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final columns = _ServiceGrid.columnsFor(
            constraints.maxWidth,
            MediaQuery.textScalerOf(context).scale(1),
          );

          return GridView.builder(
            padding: EdgeInsets.zero,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: columns * 2,
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              crossAxisSpacing: Space.x2,
              mainAxisSpacing: Space.x2,
              mainAxisExtent:
                  (constraints.maxWidth - Space.x2 * (columns - 1)) / columns +
                      _ServiceGrid.footerHeight(context),
            ),
            itemBuilder: (_, __) => const _ServiceCardSkeleton(),
          );
        },
      ),
    );
  }
}

