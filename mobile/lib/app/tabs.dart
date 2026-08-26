import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/models.dart';
import '../core/providers.dart';
import '../design/design_system.dart';
import '../core/ui/service_artwork.dart';
import '../features/account/settings_screens.dart';
import '../features/chat/chat_screens.dart';
import '../features/payment/payment_screen.dart';

// ── Bookings ──────────────────────────────────────────────────────────────

enum BookingFilter { upcoming, past }

/// The bookings tab.
///
/// Split into upcoming and past rather than one long list: they are different
/// questions. "When is the plumber coming?" and "what did I pay in June?" do
/// not belong on the same screen, and mixing them buries the live booking
/// under months of history.
class BookingsTab extends ConsumerStatefulWidget {
  const BookingsTab({super.key, required this.onOpenBooking});

  final ValueChanged<Booking> onOpenBooking;

  @override
  ConsumerState<BookingsTab> createState() => _BookingsTabState();
}

class _BookingsTabState extends ConsumerState<BookingsTab> {
  BookingFilter _filter = BookingFilter.upcoming;

  /// Exactly the terminal states in the schema's `bookings_status_check`.
  /// Anything not listed here is still in flight and belongs under Upcoming —
  /// inventing status names here silently files live bookings under history.
  static const _finished = {'completed', 'cancelled', 'expired', 'refunded', 'disputed'};

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final bookings = ref.watch(bookingsProvider);

    // One request for the whole list. An invoice exists only once a booking is
    // settled, and `pending` on it means the work is done but unpaid — so this
    // is exactly the set worth flagging, without a payment lookup per card.
    final unpaidBookingIds = ref.watch(invoicesProvider).maybeWhen(
          data: (invoices) => invoices
              .where((i) => !i.isPaid && i.bookingId != null)
              .map((i) => i.bookingId!)
              .toSet(),
          orElse: () => <String>{},
        );

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your bookings'),
        actions: [
          AppIconButton(
            icon: AppIcons.chat,
            tooltip: 'Messages',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const ChatListScreen()),
            ),
          ),
          const SizedBox(width: Space.x2),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.x5, Space.x2, Space.x5, Space.x4),
            child: AppSegmented<BookingFilter>(
              value: _filter,
              onChanged: (v) => setState(() => _filter = v),
              options: const [
                (value: BookingFilter.upcoming, label: 'Upcoming'),
                (value: BookingFilter.past, label: 'Past'),
              ],
            ),
          ),
          Expanded(
            child: bookings.when(
              loading: () => const Padding(
                padding: Space.pageInsets,
                child: Column(children: [
                  SkeletonCard(),
                  SizedBox(height: Space.x3),
                  SkeletonCard(),
                ]),
              ),
              error: (error, _) => AppStateView.error(
                message: 'We could not load your bookings.',
                onAction: () => ref.invalidate(bookingsProvider),
              ),
              data: (all) {
                final list = all
                    .where((b) => _finished.contains(b.status) == (_filter == BookingFilter.past))
                    .toList();

                // Newest first for history; soonest first for what is coming.
                list.sort((a, b) {
                  final at = a.scheduledAt ?? a.createdAt;
                  final bt = b.scheduledAt ?? b.createdAt;
                  if (at == null || bt == null) return 0;
                  return _filter == BookingFilter.past ? bt.compareTo(at) : at.compareTo(bt);
                });

                if (list.isEmpty) {
                  return AppStateView.empty(
                    title: _filter == BookingFilter.upcoming
                        ? 'Nothing scheduled'
                        : 'No past bookings',
                    message: _filter == BookingFilter.upcoming
                        ? 'Book a service and it will appear here with live tracking.'
                        : 'Completed and cancelled bookings are kept here.',
                    icon: AppIcons.bookings,
                  );
                }

                return RefreshIndicator(
                  color: t.primary,
                  onRefresh: () async {
                    ref.invalidate(bookingsProvider);
                    await ref.read(bookingsProvider.future);
                  },
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(Space.x5, 0, Space.x5, Space.x20),
                    itemCount: list.length,
                    separatorBuilder: (_, __) => const SizedBox(height: Space.x3),
                    itemBuilder: (context, i) => BookingListCard(
                      booking: list[i],
                      unpaid: unpaidBookingIds.contains(list[i].id),
                      onTap: () => widget.onOpenBooking(list[i]),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class BookingListCard extends StatelessWidget {
  const BookingListCard({
    super.key,
    required this.booking,
    required this.onTap,
    this.unpaid = false,
  });

  final Booking booking;
  final VoidCallback onTap;

  /// Work is done and settled, but the customer still owes for it.
  final bool unpaid;

  /// The states where a worker is actually moving — these get the live accent
  /// so a glance at the list finds the one that matters.
  static const _live = {'assigned', 'accepted', 'en_route', 'started'};

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final isLive = _live.contains(booking.status);

    return AppCard(
      onTap: onTap,
      padding: Space.cardInsetsLarge,
      border: isLive ? t.primary : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
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
              const SizedBox(width: Space.x2),
              BookingStatusBadge(booking.status, dense: true),
            ],
          ),
          if (booking.scheduledAt != null || booking.price != null) ...[
            const SizedBox(height: Space.x3),
            Divider(height: 1, color: t.border),
            const SizedBox(height: Space.x3),
            Row(
              children: [
                if (booking.scheduledAt != null) ...[
                  AppIcon(AppIcons.time, size: Sizes.iconXs, color: t.textTertiary),
                  const SizedBox(width: Space.x2),
                  Expanded(
                    child: Text(
                      _when(booking.scheduledAt!),
                      style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ] else
                  const Spacer(),
                if (booking.price != null)
                  Text(
                    '₹${booking.price!.toStringAsFixed(0)}',
                    style: context.text.titleMedium?.copyWith(
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
              ],
            ),
          ],
          if (unpaid) ...[
            const SizedBox(height: Space.x3),
            AppButton.primary(
              label: 'Pay now',
              size: AppButtonSize.small,
              icon: AppIcons.secure,
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => PaymentScreen(booking: booking)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  static String _when(DateTime at) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final local = at.toLocal();
    final now = clock.now();
    final time =
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';

    final sameDay = local.year == now.year && local.month == now.month && local.day == now.day;
    if (sameDay) return 'Today at $time';

    final tomorrow = now.add(const Duration(days: 1));
    if (local.year == tomorrow.year &&
        local.month == tomorrow.month &&
        local.day == tomorrow.day) {
      return 'Tomorrow at $time';
    }

    if (local.difference(now).inDays.abs() < 7) {
      return '${days[local.weekday - 1]} at $time';
    }

    return '${local.day} ${months[local.month - 1]} at $time';
  }
}

// ── Notifications ─────────────────────────────────────────────────────────

/// Notifications, newest first, with unread marked rather than counted.
class NotificationsTab extends ConsumerWidget {
  const NotificationsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsProvider);
    final t = context.tokens;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          AppIconButton(
            icon: AppIcons.settings,
            tooltip: 'Notification settings',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const NotificationSettingsScreen()),
            ),
          ),
          const SizedBox(width: Space.x2),
        ],
      ),
      body: notifications.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: SkeletonCard(hasAvatar: false),
        ),
        error: (_, __) => AppStateView.error(
          message: 'We could not load your notifications.',
          onAction: () => ref.invalidate(notificationsProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const AppStateView.empty(
              title: 'All caught up',
              message: 'Updates about your bookings will appear here.',
              icon: AppIcons.notifications,
            );
          }
          return RefreshIndicator(
            color: t.primary,
            onRefresh: () async {
              ref.invalidate(notificationsProvider);
              await ref.read(notificationsProvider.future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(Space.x5, Space.x5, Space.x5, Space.x20),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: Space.x2),
              itemBuilder: (context, i) {
                final item = list[i];
                return AppCard(
                  elevated: false,
                  background: item.isUnread ? t.primarySoft : null,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AppIconBadge(_iconFor(item.type), size: 40),
                      const SizedBox(width: Space.x3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(item.title, style: context.text.titleMedium),
                                ),
                                if (item.createdAt != null)
                                  Text(
                                    formatMessageTime(item.createdAt!),
                                    style: context.text.labelSmall
                                        ?.copyWith(color: t.textTertiary),
                                  ),
                              ],
                            ),
                            if (item.body != null)
                              Text(
                                item.body!,
                                style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }

  /// Notification types come from the backend as free-form strings; anything
  /// unrecognised falls back to the bell rather than rendering nothing.
  static List<List<dynamic>> _iconFor(String? type) {
    final value = type ?? '';
    if (value.contains('payment') || value.contains('invoice')) return AppIcons.invoice;
    if (value.contains('emergency')) return AppIcons.emergency;
    if (value.contains('chat') || value.contains('message')) return AppIcons.chat;
    if (value.contains('review') || value.contains('rating')) return AppIcons.rating;
    if (value.contains('booking') || value.contains('worker')) return AppIcons.bookings;
    return AppIcons.notifications;
  }
}
