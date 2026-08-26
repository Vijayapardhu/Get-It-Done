import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/models.dart';
import '../../core/providers.dart';
import '../../core/realtime/realtime_service.dart';
import '../../design/design_system.dart';
import '../../core/network/api_exception.dart';
import '../chat/chat_screens.dart';
import '../payment/payment_screen.dart';

/// Live booking tracking.
///
/// Two data paths, deliberately:
///
///  * Socket for STATUS. `booking:status_changed` arrives in the booking room
///    the moment the worker accepts, sets off or starts, so the screen changes
///    without the user pulling to refresh.
///  * HTTP for ETA and distance. `/customer/bookings/:id/track` computes those
///    server-side; a socket event only says the status moved.
///
/// The screen re-fetches the track endpoint whenever a status event lands,
/// rather than polling on a timer — the timer would either lag the change or
/// hammer the API between changes.
class TrackBookingScreen extends ConsumerStatefulWidget {
  const TrackBookingScreen({
    super.key,
    required this.bookingId,
    required this.onOpenCodes,
    required this.onOpenWorker,
    required this.onReview,
    required this.onOpenOrder,
  });

  final String bookingId;
  final VoidCallback onOpenCodes;
  final ValueChanged<String> onOpenWorker;
  final ValueChanged<Booking> onReview;

  /// Open the order this visit was booked in, when it was part of one.
  final ValueChanged<String> onOpenOrder;

  @override
  ConsumerState<TrackBookingScreen> createState() => _TrackBookingScreenState();
}

class _TrackBookingScreenState extends ConsumerState<TrackBookingScreen> {
  ProviderSubscription<AsyncValue<BookingStatusEvent>>? _statusSubscription;

  @override
  void initState() {
    super.initState();

    // Refresh the server-computed tracking data whenever the status moves.
    _statusSubscription = ref.listenManual(
      bookingStatusStreamProvider(widget.bookingId),
      (previous, next) {
        next.whenData((_) => ref.invalidate(bookingTrackingProvider(widget.bookingId)));
      },
    );
  }

  @override
  void dispose() {
    _statusSubscription?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final tracking = ref.watch(bookingTrackingProvider(widget.bookingId));
    final connected = ref.watch(realtimeConnectedProvider).value ?? false;

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Track booking'),
        actions: [
          // Honest about the connection: a stale map with no indicator is
          // worse than a visibly disconnected one.
          Padding(
            padding: const EdgeInsets.only(right: Space.x5),
            child: Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: connected ? t.success : t.textTertiary,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: Space.x2),
                Text(
                  connected ? 'Live' : 'Offline',
                  style: context.text.labelSmall?.copyWith(
                    color: connected ? t.success : t.textTertiary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      body: tracking.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: Column(children: [SkeletonCard(), SizedBox(height: Space.x3), SkeletonCard(hasAvatar: false)]),
        ),
        error: (_, __) => AppStateView.error(
          message: 'We could not load this booking.',
          onAction: () => ref.invalidate(bookingTrackingProvider(widget.bookingId)),
        ),
        data: (data) => RefreshIndicator(
          color: t.primary,
          onRefresh: () async {
            ref.invalidate(bookingTrackingProvider(widget.bookingId));
            await ref.read(bookingTrackingProvider(widget.bookingId).future);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(Space.x5, Space.x4, Space.x5, Space.x10),
            children: [
              _StatusHeadline(tracking: data),
              const SizedBox(height: Space.x6),

              if (data.worker != null) ...[
                _WorkerPanel(
                  worker: data.worker!,
                  distanceKm: data.distanceKm,
                  etaMinutes: data.etaMinutes,
                  onOpenProfile: () => widget.onOpenWorker(data.worker!.workerId),
                ),
                const SizedBox(height: Space.x3),
                // Reaching the worker matters most while they are on the way —
                // gate codes, which floor, where to park.
                _ContactRow(bookingId: widget.bookingId, phone: data.booking.workerPhone),
                const SizedBox(height: Space.x4),
              ],

              // The handshake is the customer's next action once a worker is
              // at the door, so it is promoted rather than buried in a menu.
              if (data.booking.awaitsStartOtp || data.booking.awaitsCompletionOtp) ...[
                AppCard(
                  background: t.primarySoft,
                  border: t.primary,
                  padding: Space.cardInsetsLarge,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          AppIconBadge(AppIcons.secure, size: 44),
                          const SizedBox(width: Space.x3),
                          Expanded(
                            child: Text(
                              data.booking.awaitsStartOtp
                                  ? 'Share your start code when the worker arrives'
                                  : 'Share your completion code when the work is done',
                              style: context.text.titleMedium,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: Space.x4),
                      AppButton.primary(
                        label: 'Show my code',
                        size: AppButtonSize.medium,
                        onPressed: widget.onOpenCodes,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: Space.x4),
              ],

              // Part of a larger order. Without this the customer has no way
              // back to everything they booked in one go, and no way to tell
              // whether the second visit ever found anybody.
              if (data.booking.orderId != null) ...[
                AppCard(
                  onTap: () => widget.onOpenOrder(data.booking.orderId!),
                  elevated: false,
                  padding: const EdgeInsets.all(Space.x4),
                  child: Row(
                    children: [
                      AppIcon(AppIcons.bookings, size: Sizes.iconMd, color: t.textTertiary),
                      const SizedBox(width: Space.x3),
                      Expanded(
                        child: Text(
                          'Booked with other services',
                          style: context.text.bodyMedium,
                        ),
                      ),
                      AppIcon(AppIcons.chevronRight, size: Sizes.iconSm, color: t.textTertiary),
                    ],
                  ),
                ),
                const SizedBox(height: Space.x4),
              ],

              if (data.booking.status == 'completed') ...[
                AppCard(
                  padding: Space.cardInsetsLarge,
                  child: Column(
                    children: [
                      AppIconBadge(
                        AppIcons.success,
                        size: 56,
                        background: t.successSoft,
                        foreground: t.success,
                      ),
                      const SizedBox(height: Space.x4),
                      Text('Work completed', style: context.text.titleLarge),
                      const SizedBox(height: Space.x2),
                      Text(
                        'How did it go? Your rating helps the cooperative.',
                        style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: Space.x4),
                      AppButton.primary(
                        label: 'Rate this service',
                        size: AppButtonSize.medium,
                        icon: AppIcons.rating,
                        onPressed: () => widget.onReview(data.booking),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: Space.x4),

                // Payment sits AFTER the completion card rather than inside
                // it: the work is done either way, and burying "you still owe
                // money" in a congratulations panel reads as a trick.
                _PayPrompt(booking: data.booking),
              ],

              Section(
                title: 'Progress',
                padding: EdgeInsets.zero,
                child: _Timeline(events: data.timeline, currentStatus: data.booking.status),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusHeadline extends StatelessWidget {
  const _StatusHeadline({required this.tracking});

  final BookingTracking tracking;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final booking = tracking.booking;
    final worker = tracking.worker?.name ?? booking.workerName;

    final headline = switch (booking.status) {
      'requested' || 'matching' => 'Finding a verified worker',
      'assigned' => worker == null ? 'Worker assigned' : '$worker was assigned',
      'accepted' => worker == null ? 'Booking confirmed' : '$worker confirmed',
      'en_route' => worker == null ? 'On the way' : '$worker is on the way',
      'started' => 'Work in progress',
      'completed' => 'Work completed',
      'cancelled' => 'Booking cancelled',
      _ => booking.serviceName ?? 'Your booking',
    };

    final detail = switch (booking.status) {
      'requested' || 'matching' =>
        'We are matching you with the nearest available member of a local cooperative society.',
      'assigned' => 'Waiting for the worker to accept.',
      'en_route' when tracking.etaMinutes != null =>
        'Arriving in about ${tracking.etaMinutes} minutes.',
      'started' => 'Share your completion code once you are satisfied.',
      _ => booking.address ?? '',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        BookingStatusBadge(booking.status),
        const SizedBox(height: Space.x3),
        Text(headline, style: context.text.displayMedium),
        if (detail.isNotEmpty) ...[
          const SizedBox(height: Space.x2),
          Text(detail, style: context.text.bodyLarge?.copyWith(color: t.textSecondary)),
        ],
      ],
    );
  }
}

class _WorkerPanel extends StatelessWidget {
  const _WorkerPanel({
    required this.worker,
    required this.distanceKm,
    required this.etaMinutes,
    required this.onOpenProfile,
  });

  final WorkerMatch worker;
  final double? distanceKm;
  final int? etaMinutes;
  final VoidCallback onOpenProfile;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return AppCard(
      onTap: onOpenProfile,
      padding: Space.cardInsetsLarge,
      child: Column(
        children: [
          Row(
            children: [
              WorkerAvatar(name: worker.name, verified: true, size: Sizes.avatarLg),
              const SizedBox(width: Space.x3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(worker.name, style: context.text.titleLarge),
                    if (worker.rating != null) ...[
                      const SizedBox(height: Space.x1),
                      RatingPill(rating: worker.rating!, dense: true),
                    ],
                  ],
                ),
              ),
              AppIcon(AppIcons.chevronRight, size: Sizes.iconSm, color: t.textTertiary),
            ],
          ),
          if (distanceKm != null || etaMinutes != null) ...[
            const Divider(height: Space.x6),
            Row(
              children: [
                if (etaMinutes != null)
                  Expanded(
                    child: _Metric(
                      icon: AppIcons.time,
                      value: '$etaMinutes min',
                      label: 'Estimated arrival',
                    ),
                  ),
                if (distanceKm != null)
                  Expanded(
                    child: _Metric(
                      icon: AppIcons.navigate,
                      value: '${distanceKm!.toStringAsFixed(1)} km',
                      label: 'Away',
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Call and message actions for the assigned worker.
///
/// The chat thread is created lazily: the backend only opens one on demand, so
/// tapping Message is what brings it into existence.
class _ContactRow extends ConsumerStatefulWidget {
  const _ContactRow({required this.bookingId, required this.phone});

  final String bookingId;
  final String? phone;

  @override
  ConsumerState<_ContactRow> createState() => _ContactRowState();
}

class _ContactRowState extends ConsumerState<_ContactRow> {
  bool _opening = false;

  Future<void> _openChat() async {
    setState(() => _opening = true);
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final chat = await ref.read(apiProvider).startChat(bookingId: widget.bookingId);
      ref.invalidate(chatsProvider);
      await navigator.push(MaterialPageRoute<void>(builder: (_) => ChatScreen(chat: chat)));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  Future<void> _call() async {
    final phone = widget.phone;
    if (phone == null) return;
    final uri = Uri(scheme: 'tel', path: phone);
    if (!await launchUrl(uri)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Could not start the call.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (widget.phone != null) ...[
          Expanded(
            child: AppButton.secondary(
              label: 'Call',
              icon: AppIcons.call,
              size: AppButtonSize.medium,
              onPressed: _call,
            ),
          ),
          const SizedBox(width: Space.x2),
        ],
        Expanded(
          child: AppButton(
            label: 'Message',
            variant: AppButtonVariant.soft,
            icon: AppIcons.chat,
            size: AppButtonSize.medium,
            loading: _opening,
            onPressed: _opening ? null : _openChat,
          ),
        ),
      ],
    );
  }
}

/// "Pay now" for a completed booking that has not been settled.
///
/// Renders nothing at all when the booking is already paid — an outstanding
/// balance is worth interrupting someone for, a settled one is not.
class _PayPrompt extends ConsumerWidget {
  const _PayPrompt({required this.booking});

  final Booking booking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final payment = ref.watch(bookingPaymentProvider(booking.id));

    return payment.when(
      // Neither a spinner nor an error belongs here. If we cannot tell whether
      // the booking is paid, saying nothing is better than wrongly demanding
      // money from someone who has already paid.
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (order) {
        if (order != null && order.isPaid) {
          return Row(
            children: [
              AppIcon(AppIcons.success, size: Sizes.iconXs, color: t.success),
              const SizedBox(width: Space.x2),
              Text(
                'Paid ₹${order.amount.toStringAsFixed(2)}',
                style: context.text.bodySmall?.copyWith(color: t.textSecondary),
              ),
            ],
          );
        }

        return AppCard(
          padding: Space.cardInsetsLarge,
          border: t.primary,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AppIconBadge(AppIcons.wallet, size: 44),
                  const SizedBox(width: Space.x3),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Payment due', style: context.text.titleMedium),
                        Text(
                          booking.price == null
                              ? 'Settle up to close this booking.'
                              : '₹${booking.price!.toStringAsFixed(2)} for this service',
                          style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Space.x4),
              AppButton.primary(
                label: 'Pay now',
                size: AppButtonSize.medium,
                icon: AppIcons.secure,
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => PaymentScreen(booking: booking),
                    ),
                  );
                  ref.invalidate(bookingPaymentProvider(booking.id));
                },
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.icon, required this.value, required this.label});

  final AppIconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Row(
      children: [
        AppIcon(icon, size: Sizes.iconSm, color: t.primary),
        const SizedBox(width: Space.x2),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: context.text.titleMedium?.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            Text(label, style: context.text.bodySmall?.copyWith(color: t.textTertiary)),
          ],
        ),
      ],
    );
  }
}

/// Booking history as a vertical stepper.
///
/// Shows the FULL expected lifecycle with completed steps filled in, not just
/// the events that have happened — a customer waiting on a worker wants to see
/// what comes next, not only what is done.
class _Timeline extends StatelessWidget {
  const _Timeline({required this.events, required this.currentStatus});

  final List<BookingEvent> events;
  final String currentStatus;

  /// The happy path. Cancelled and disputed bookings fall out of it, so those
  /// render only the events that actually occurred.
  static const _expected = ['requested', 'assigned', 'accepted', 'en_route', 'started', 'completed'];

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final isDerailed = const {'cancelled', 'expired', 'disputed', 'refunded'}.contains(currentStatus);

    final reached = {for (final event in events) event.status};
    final steps = isDerailed
        ? events.map((e) => e.status).toList()
        : _expected;

    final currentIndex = steps.indexOf(currentStatus);

    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          _TimelineRow(
            label: BookingStatusBadge.describe(steps[i]).$1,
            at: events.where((e) => e.status == steps[i]).firstOrNull?.at,
            done: reached.contains(steps[i]) || (currentIndex >= 0 && i < currentIndex),
            current: steps[i] == currentStatus,
            isLast: i == steps.length - 1,
            tone: isDerailed && steps[i] == currentStatus ? t.danger : t.primary,
          ),
      ],
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.label,
    required this.at,
    required this.done,
    required this.current,
    required this.isLast,
    required this.tone,
  });

  final String label;
  final DateTime? at;
  final bool done;
  final bool current;
  final bool isLast;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final active = done || current;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  color: active ? tone : Colors.transparent,
                  shape: BoxShape.circle,
                  border: Border.all(color: active ? tone : t.borderStrong, width: 2),
                ),
                child: done
                    ? Center(child: AppIcon(AppIcons.tick, size: 11, color: t.textOnPrimary, bold: true))
                    : null,
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    // The connector between two completed steps is filled; the
                    // rest is muted, so progress reads at a glance.
                    color: done ? tone : t.border,
                    margin: const EdgeInsets.symmetric(vertical: 2),
                  ),
                ),
            ],
          ),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : Space.x5),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: context.text.titleMedium?.copyWith(
                      color: active ? t.textPrimary : t.textTertiary,
                      fontWeight: current ? FontWeight.w700 : FontWeight.w600,
                    ),
                  ),
                  if (at != null)
                    Text(
                      _formatTime(at!),
                      style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _formatTime(DateTime at) {
    final local = at.toLocal();
    final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final minute = local.minute.toString().padLeft(2, '0');
    return '$hour:$minute ${local.hour < 12 ? 'AM' : 'PM'}';
  }
}
