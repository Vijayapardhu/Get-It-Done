import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/providers.dart';
import '../../core/ui/service_artwork.dart';
import '../../design/design_system.dart';
import '../cart/slot_picker_screen.dart' show formatSlot;

/// One order, after the fact.
///
/// An order of three services is three separate bookings, each matched to its
/// own worker and each moving through its own states. The bookings list shows
/// them individually — correctly, because that is what a customer tracks — and
/// this page is the other view: what was ordered together, and how the whole
/// thing is going.
///
/// Without it, a customer who booked a plumber and an electrician in one go
/// has no way to see them as one order again, and no way to tell whether the
/// second one ever found anybody.
class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({
    super.key,
    required this.orderId,
    required this.onOpenBooking,
  });

  final String orderId;
  final ValueChanged<Booking> onOpenBooking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final order = ref.watch(orderProvider(orderId));

    return Scaffold(
      appBar: AppBar(title: const Text('Your order')),
      body: order.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(Space.x5),
          child: SkeletonCard(lines: 3),
        ),
        error: (error, _) => Padding(
          padding: const EdgeInsets.all(Space.x5),
          child: AppBanner(
            message: 'Could not load this order.',
            tone: StateTone.error,
            actionLabel: 'Retry',
            onAction: () => ref.invalidate(orderProvider(orderId)),
          ),
        ),
        data: (data) => RefreshIndicator(
          color: t.primary,
          onRefresh: () async => ref.invalidate(orderProvider(orderId)),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(Space.x5, Space.x4, Space.x5, Space.x10),
            children: [
              _Summary(order: data),
              const SizedBox(height: Space.x6),
              Text(
                data.bookingCount == 1
                    ? 'The visit'
                    : '${data.bookingCount} visits in this order',
                style: context.text.titleLarge,
              ),
              const SizedBox(height: Space.x3),
              for (final booking in data.bookings) ...[
                _BookingRow(booking: booking, onTap: () => onOpenBooking(booking)),
                const SizedBox(height: Space.x2),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.order});

  final PlacedOrder order;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final scheduled = order.scheduledAt;

    return AppCard(
      elevated: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppIcon(
                scheduled == null ? AppIcons.flash : AppIcons.bookings,
                size: Sizes.iconMd,
                color: t.primary,
              ),
              const SizedBox(width: Space.x3),
              Expanded(
                child: Text(
                  scheduled == null
                      ? 'Matched as soon as workers are free'
                      : formatSlot(scheduled),
                  style: context.text.titleSmall,
                ),
              ),
            ],
          ),
          if (order.address != null) ...[
            const SizedBox(height: Space.x3),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppIcon(AppIcons.location, size: Sizes.iconMd, color: t.textTertiary),
                const SizedBox(width: Space.x3),
                Expanded(
                  child: Text(
                    order.address!,
                    style: context.text.bodySmall
                        ?.copyWith(color: t.textSecondary, height: 1.5),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: Space.x3),
          Divider(color: t.border, height: 1),
          const SizedBox(height: Space.x3),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Order total',
                  style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
                ),
              ),
              Text(
                formatRupees(order.total, paise: true),
                style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BookingRow extends StatelessWidget {
  const _BookingRow({required this.booking, required this.onTap});

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
            padding: EdgeInsets.zero,
          ),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  booking.serviceName ?? 'Service',
                  style: context.text.titleSmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: Space.x1),
                BookingStatusBadge(booking.status, dense: true),
              ],
            ),
          ),
          if (booking.price != null) ...[
            const SizedBox(width: Space.x2),
            Text(
              formatRupees(booking.price!, paise: true),
              style: context.text.titleSmall,
            ),
          ],
          const SizedBox(width: Space.x2),
          AppIcon(AppIcons.chevronRight, size: Sizes.iconSm, color: t.textTertiary),
        ],
      ),
    );
  }
}
