import 'package:flutter/material.dart';

import '../../core/models/models.dart';
import '../../design/design_system.dart';
import '../cart/slot_picker_screen.dart' show formatSlot;

/// Shown immediately after an order is placed.
///
/// NO HANDSHAKE CODES HERE, deliberately.
///
/// This page used to lead with them, because the server issues each pair
/// exactly once — only SHA-256 hashes are kept — and losing them meant a
/// reissue that invalidates whatever the customer had written down. The fix
/// for that was never "show them immediately"; it was to WRITE THEM DOWN, and
/// the cart already does, into the encrypted [OtpStore] the moment the order
/// comes back. They are not fragile any more, so they no longer have to be
/// shouted at a customer who has nobody to say them to yet.
///
/// Showing them here was actively wrong:
///
///  * At this moment no worker is assigned. A code with no one to read it to
///    is a number to forget, and asking the customer to memorise two of them
///    per booking before anybody is on the way is a poor trade.
///  * It forced the page to trap the back gesture, so the only way out of a
///    confirmed booking was a button reading "I've saved the codes".
///  * It taught people the codes are a one-time thing. They are not: the
///    booking screen reads them back from this device as often as you like.
///
/// The codes now appear on the booking itself, once a worker has accepted,
/// alongside that worker's name and the service they are coming for — which
/// is the moment they mean something.
class OrderConfirmedScreen extends StatelessWidget {
  const OrderConfirmedScreen({
    super.key,
    required this.order,
    required this.onTrack,
    required this.onDone,
  });

  final PlacedOrder order;

  /// Open one of the bookings.
  final ValueChanged<Booking> onTrack;

  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final scheduled = order.scheduledAt;

    // No PopScope. Nothing on this page is unrecoverable now, so trapping the
    // back gesture would be trapping the user for no reason.
    return Builder(
      builder: (context) => Scaffold(
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(Space.x5, Space.x8, Space.x5, Space.x10),
            children: [
              Center(
                child: TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0.6, end: 1),
                  duration: Motion.emphasis,
                  curve: Motion.curveSpring,
                  builder: (context, scale, child) =>
                      Transform.scale(scale: scale, child: child),
                  child: AppIconBadge(
                    AppIcons.success,
                    size: 88,
                    iconSize: 44,
                    background: t.successSoft,
                    foreground: t.success,
                  ),
                ),
              ),
              const SizedBox(height: Space.x5),
              Text(
                order.bookingCount == 1 ? 'Booking confirmed' : 'Order confirmed',
                textAlign: TextAlign.center,
                style: context.text.headlineMedium,
              ),
              const SizedBox(height: Space.x2),
              Text(
                scheduled == null
                    ? 'We are finding workers now. You will be told as soon as '
                        'each one accepts.'
                    : 'Scheduled for ${formatSlot(scheduled)}.',
                textAlign: TextAlign.center,
                style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
              ),

              const SizedBox(height: Space.x8),

              // What happens next, in the order it will happen. The codes are
              // step three, and saying so is what stops the customer hunting
              // for them now.
              AppCard(
                elevated: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('What happens next', style: context.text.titleMedium),
                    const SizedBox(height: Space.x4),
                    const _NextStep(
                      icon: AppIcons.search,
                      title: 'We find a worker nearby',
                      detail: 'Usually within a few minutes.',
                    ),
                    const _NextStep(
                      icon: AppIcons.user,
                      title: 'You see who is coming',
                      detail: 'Their name, their trade and their rating.',
                    ),
                    const _NextStep(
                      icon: AppIcons.secure,
                      title: 'Your codes appear',
                      detail: 'On the booking, once a worker has accepted. '
                          'They stay there — you can look them up any time.',
                      last: true,
                    ),
                  ],
                ),
              ),

              const SizedBox(height: Space.x4),

              for (final booking in order.bookings) ...[
                _BookingRow(
                  booking: booking,
                  onTrack: () => onTrack(booking),
                ),
                const SizedBox(height: Space.x3),
              ],

              const SizedBox(height: Space.x4),
              AppCard(
                elevated: false,
                child: Column(
                  children: [
                    _SummaryRow(
                      label: order.bookingCount == 1 ? '1 visit' : '${order.bookingCount} visits',
                      value: formatRupees(order.total, paise: true),
                    ),
                    if (order.address != null) ...[
                      const SizedBox(height: Space.x3),
                      Divider(color: t.border, height: 1),
                      const SizedBox(height: Space.x3),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppIcon(AppIcons.location, size: Sizes.iconSm, color: t.textTertiary),
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
                  ],
                ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(Space.x5),
            child: AppButton.primary(
              label: 'Done',
              onPressed: onDone,
            ),
          ),
        ),
      ),
    );
  }
}

/// One step of what happens next, with its symbol and its connecting rail.
class _NextStep extends StatelessWidget {
  const _NextStep({
    required this.icon,
    required this.title,
    required this.detail,
    this.last = false,
  });

  final AppIconData icon;
  final String title;
  final String detail;

  /// The rail stops at the last step rather than running off the card.
  final bool last;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              AppIconBadge(icon, size: 36, iconSize: 18),
              if (!last)
                Expanded(
                  child: Container(width: 2, color: t.border),
                ),
            ],
          ),
          const SizedBox(width: Space.x4),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : Space.x5),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: context.text.titleSmall),
                  const SizedBox(height: 2),
                  Text(
                    detail,
                    style: context.text.bodySmall
                        ?.copyWith(color: t.textSecondary, height: 1.45),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One booking in the order: what was booked, where it has got to, and a way
/// in. No codes — see the note at the top of the file.
class _BookingRow extends StatelessWidget {
  const _BookingRow({required this.booking, required this.onTrack});

  final Booking booking;
  final VoidCallback onTrack;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      elevated: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  booking.serviceName ?? 'Service',
                  style: context.text.titleMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              BookingStatusBadge(booking.status, dense: true),
            ],
          ),
          const SizedBox(height: Space.x3),
          AppButton.tertiary(label: 'Track this booking', onPressed: onTrack),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
          ),
        ),
        Text(value, style: context.text.titleMedium),
      ],
    );
  }
}
