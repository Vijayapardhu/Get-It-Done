import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:gid_core/gid_core.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import '../../core/ui/service_artwork.dart';
import 'home_hero.dart';
import 'service_grid.dart';

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
    required this.onOpenAlerts,
  });

  final ValueChanged<Service> onOpenService;
  final ValueChanged<Booking> onOpenBooking;
  final VoidCallback onOpenSearch;
  final ValueChanged<String> onOpenWorker;

  /// "Get it done now" — the instant path, which is the emergency flow.
  final VoidCallback onStartEmergency;

  /// The avatar in the hero.
  final VoidCallback onOpenProfile;

  /// Switches the shell to the Alerts tab. The bell in the hero needs the
  /// shell's tab state, which this screen does not own.
  final VoidCallback onOpenAlerts;

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
      // A CustomScrollView rather than a ListView, so the search can be a
      // pinned sliver. Everything else is the same list wrapped in one adapter:
      // the page is short and its children are cheap, and splitting it into a
      // dozen slivers would buy nothing but noise.
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: HomeHero(
            greeting: _greeting(user?.shortName),
            onOpenSearch: onOpenSearch,
            onInstant: onStartEmergency,
            onSchedule: onOpenSearch,
              onOpenProfile: onOpenProfile,
              onOpenAlerts: onOpenAlerts,
            ),
          ),

          // Sits under the hero and sticks to the top once the hero has
          // scrolled away, so search is always one tap from wherever you are
          // in the catalogue.
          SliverPersistentHeader(
            pinned: true,
            delegate: _StickySearch(
              onTap: onOpenSearch,
              topInset: MediaQuery.paddingOf(context).top,
            ),
          ),

          SliverList(
            delegate: SliverChildListDelegate([
          // ── Active booking ────────────────────────────────────────────
          // Placed high and only when there is one: a customer with a worker
          // on the way opened the app for exactly this.
          dashboard.maybeWhen(
            data: (data) {
              final active = data.activeBooking;
              if (active == null) return const SizedBox.shrink();
              return Padding(
                // Space.x4, not Space.section: the pinned search bar above
                // already contributes the unpinned half of the status-bar
                // inset as bottom padding, and a full section gap on top of
                // that left a visible hole under the search field.
                padding: const EdgeInsets.only(top: Space.x4),
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

          const SizedBox(height: Space.x5),

          // ── The catalogue ────────────────────────────────
          // Grouped by trade rather than one long grid. Twenty-four services in
          // a single run is a wall: the customer has to read every tile to find
          // out there is an Appliances section at all. Under headings, the eye
          // picks the group first and the tile second, which is how someone who
          // came for "my AC is not cooling" actually searches.
          services.when(
            loading: () => const Section(
              title: 'Services',
              subtitle: 'Book trusted cooperative workers.',
              child: ServiceCatalogueSkeletons(),
            ),
            error: (error, _) => Section(
              title: 'Services',
              child: Padding(
                padding: Space.pageInsets,
                child: AppBanner(
                  message: 'Could not load services.',
                  tone: StateTone.error,
                  actionLabel: 'Retry',
                  onAction: () => ref.invalidate(servicesProvider),
                ),
              ),
            ),
            data: (list) => _CategorySections(
              services: list,
              onOpenService: onOpenService,
            ),
          ),

          const SizedBox(height: Space.section),

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
              const SizedBox(height: Space.x20),
            ]),
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

/// The search bar, pinned to the top of the catalogue.
///
/// One field, not two. The obvious alternative -- leave a search inside the
/// hero and fade a second one in when it scrolls past -- means two widgets that
/// have to agree about state and a cross-fade the eye can catch. This is the
/// same field the whole time; it simply stops moving when it reaches the top.
///
/// The surface and its hairline fade in over the first few points of overlap
/// rather than snapping on, so the bar separates from the content it is now
/// covering without announcing itself.
class _StickySearch extends SliverPersistentHeaderDelegate {
  const _StickySearch({required this.onTap, required this.topInset});

  final VoidCallback onTap;

  /// The status bar's height, from the screen above. Reserved by the header
  /// whatever its scroll position, and only SPENT once the bar has pinned:
  /// see [build].
  final double topInset;

  /// Field plus the padding around it. Fixed, because min and max are the
  /// same: this bar does not collapse, it pins.
  static const _base = Space.x3 + Sizes.inputHeight + Space.x3;

  double get _height => _base + topInset;

  @override
  double get minExtent => _height;

  @override
  double get maxExtent => _height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final t = context.tokens;

    // Ramped over 24 points so the transition reads as smooth at any scroll
    // speed. A boolean here would flick the shadow on and off when the user
    // rests a finger near the boundary.
    final settled = (shrinkOffset / 24).clamp(0.0, 1.0);

    return Container(
      height: _height,
      // The status bar's height is reserved ABOVE the field at all times, not
      // moved there as the bar pins.
      //
      // A persistent header cannot change its extent mid-scroll, so the inset
      // has to be paid for either way. Paying for it above means: pinned, the
      // field clears the clock; unpinned, the slack lands between the hero and
      // the field, where it reads as breathing room under the coloured panel.
      // Paying for it below — which is what this did first — put a status
      // bar's worth of empty page between the search and the first card, and
      // that hole is the thing everybody noticed.
      padding: const EdgeInsets.only(
        left: Space.page,
        right: Space.page,
        top: Space.x3,
        bottom: Space.x3,
      ).copyWith(top: Space.x3 + topInset),
      decoration: BoxDecoration(
        color: t.pageBackground,
        border: Border(
          bottom: BorderSide(
            color: t.border.withValues(alpha: settled),
            width: settled == 0 ? 0 : 1,
          ),
        ),
      ),
      child: AppSearchField(readOnly: true, onTap: onTap, hint: 'Search for a service'),
    );
  }

  @override
  bool shouldRebuild(covariant _StickySearch oldDelegate) =>
      oldDelegate.onTap != onTap || oldDelegate.topInset != topInset;
}

/// The catalogue, one grid per category.
///
/// Order comes from the order the API returned services in, which is the
/// category display_order the cooperative set -- not alphabetical, and not
/// whatever the map iteration happens to produce. A category the admin moved to
/// the top should appear at the top.
class _CategorySections extends StatelessWidget {
  const _CategorySections({required this.services, required this.onOpenService});

  final List<Service> services;
  final ValueChanged<Service> onOpenService;

  @override
  Widget build(BuildContext context) {
    if (services.isEmpty) {
      return const Section(
        title: 'Services',
        child: AppStateView.empty(
          title: 'No services yet',
          message: 'The catalogue for your area is still being set up.',
          icon: AppIcons.home,
        ),
      );
    }

    // Insertion-ordered, so the first time a category is seen fixes its place.
    final grouped = <String, List<Service>>{};
    for (final service in services) {
      grouped.putIfAbsent(service.category, () => <Service>[]).add(service);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final entry in grouped.entries) ...[
          Section(
            title: entry.key,
            subtitle: _subtitleFor(entry.value.length),
            child: Padding(
              padding: ServiceCatalogueGrid.insets,
              child: ServiceCatalogueGrid(
                services: entry.value,
                onOpenService: onOpenService,
              ),
            ),
          ),
          // Space.x6 between one grid and the next heading. At Space.section
          // the categories read as separate pages rather than as one
          // catalogue, and on a phone it cost most of a screen of scrolling
          // for six of them.
          const SizedBox(height: Space.x6),
        ],
      ],
    );
  }

  /// Counting the group is more useful than a slogan repeated under every
  /// heading, and it tells the customer whether scrolling is worth it.
  static String _subtitleFor(int count) =>
      count == 1 ? '1 service' : '$count services';
}
