import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/models/models.dart';
import '../../design/design_system.dart';
import '../cart/slot_picker_screen.dart' show formatSlot;

/// Shown once, immediately after an order is placed.
///
/// This page exists because the codes on it exist nowhere else. The server
/// returns each booking's start and completion handshake codes EXACTLY ONCE —
/// only SHA-256 hashes are kept — so a screen that merely said "booked" and
/// moved on would destroy them. Before this page there was a snackbar, and the
/// codes were parsed away and lost.
///
/// An order of three services has three pairs, and reading the wrong pair to
/// the wrong worker fails the check. So each pair is shown against the service
/// it belongs to rather than as a list the customer has to match up.
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

    return PopScope(
      // Leaving by the back gesture would drop the codes as surely as tapping
      // through, so the only way out is the button — which says what it costs.
      canPop: false,
      child: Scaffold(
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

              // ── The codes ────────────────────────────────────────────
              // First, and unmissable. Everything else on this page can be
              // found again later; these cannot.
              AppBanner(
                message: 'These codes are shown once. Read the arrival code to '
                    'the worker when they reach you, and the completion code '
                    'only after the work is done.',
                tone: StateTone.warning,
              ),
              const SizedBox(height: Space.x4),

              for (final booking in order.bookings) ...[
                _BookingCodes(
                  booking: booking,
                  otps: order.otpsFor(booking.id),
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
              label: "I've saved the codes",
              onPressed: onDone,
            ),
          ),
        ),
      ),
    );
  }
}

class _BookingCodes extends StatelessWidget {
  const _BookingCodes({
    required this.booking,
    required this.otps,
    required this.onTrack,
  });

  final Booking booking;
  final OrderOtps? otps;
  final VoidCallback onTrack;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

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
          const SizedBox(height: Space.x4),

          if (otps == null)
            Text(
              'Codes for this booking were not issued. Open the booking to '
              'request them.',
              style: context.text.bodySmall?.copyWith(color: t.textSecondary),
            )
          else
            Row(
              children: [
                Expanded(
                  child: _Code(
                    label: 'On arrival',
                    code: otps!.startOtp,
                    tint: t.primary,
                  ),
                ),
                const SizedBox(width: Space.x3),
                Expanded(
                  child: _Code(
                    label: 'When finished',
                    code: otps!.completionOtp,
                    tint: t.success,
                  ),
                ),
              ],
            ),

          const SizedBox(height: Space.x3),
          AppButton.tertiary(label: 'Track this booking', onPressed: onTrack),
        ],
      ),
    );
  }
}

class _Code extends StatelessWidget {
  const _Code({required this.label, required this.code, required this.tint});

  final String label;
  final String code;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return GestureDetector(
      onTap: () {
        Clipboard.setData(ClipboardData(text: code));
        HapticFeedback.selectionClick();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$label code copied'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      },
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: Space.x3, horizontal: Space.x3),
        decoration: BoxDecoration(
          color: tint.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(Radii.lg),
          border: Border.all(color: tint.withValues(alpha: 0.35)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: context.text.bodySmall?.copyWith(color: t.textSecondary),
            ),
            const SizedBox(height: 2),
            Text(
              // Spaced, because it is read aloud rather than scanned. "4 8 2
              // 9 1 5" survives a doorway and a noisy street; "482915" does
              // not.
              code.split('').join(' '),
              style: context.text.headlineSmall?.copyWith(
                color: tint,
                fontWeight: FontWeight.w700,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
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
