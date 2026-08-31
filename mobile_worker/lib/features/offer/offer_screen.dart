import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/worker_models.dart';
import '../../core/offers/offer_inbox.dart';
import '../../core/providers.dart';

/// The forty-five seconds.
///
/// This screen is worth more than every other screen in the app combined, and
/// everything on it is arranged around one question: **do I take this?**
///
/// What is on it, in the order a worker's eye goes:
///
///  1. A countdown ring. Rendered from the SERVER's deadline against the
///     measured clock skew, never from a local timer started on receipt.
///     `danger` and a pulse under ten seconds, because at that point the worker
///     needs to be told with colour rather than with a number to read.
///  2. **The payout.** Not the customer's price — that is not their money, and
///     showing it is the single most common way this kind of app lies to the
///     person doing the work.
///  3. Distance and ETA, then the area name, then the time bought.
///  4. Two 64dp buttons, far apart, Accept on the right where the thumb is.
///
/// What is deliberately NOT on it: the exact address (disclosed on
/// acceptance), the customer's name, and any navigation away from the decision.
/// A worker with 45 seconds must not be able to wander off into a map.
class OfferScreen extends ConsumerStatefulWidget {
  const OfferScreen({super.key, required this.offer});

  final JobOffer offer;

  @override
  ConsumerState<OfferScreen> createState() => _OfferScreenState();
}

class _OfferScreenState extends ConsumerState<OfferScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  StreamSubscription<JobRevoked>? _revocations;
  Timer? _ticker;
  Duration _remaining = Duration.zero;
  bool _answering = false;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))
      ..repeat(reverse: true);

    HapticFeedback.heavyImpact();

    final clock = ref.read(serverClockProvider);
    _remaining = clock.remaining(widget.offer.expiresAt);

    // 100ms rather than 1s: the ring sweeps continuously, and a one-second step
    // reads as a stutter on the one screen where the animation IS the message.
    _ticker = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (!mounted) return;
      final left = clock.remaining(widget.offer.expiresAt);
      setState(() => _remaining = left);
      if (left == Duration.zero) _close(_OfferOutcome.expired);
    });

    _revocations = ref.read(offerInboxProvider).revocations.listen((revoked) {
      if (revoked.offerId != widget.offer.offerId) return;
      _close(switch (revoked.reason) {
        RevokeReason.timeout => _OfferOutcome.expired,
        _ => _OfferOutcome.taken,
      });
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _revocations?.cancel();
    _pulse.dispose();
    super.dispose();
  }

  void _close(_OfferOutcome outcome, {String? bookingId}) {
    if (!mounted) return;
    _ticker?.cancel();
    ref.read(offerNotificationsProvider).dismissOffer();
    Navigator.of(context).pop(outcome);

    if (outcome == _OfferOutcome.accepted && bookingId != null && mounted) {
      context.push('/job/$bookingId');
    }
  }

  Future<void> _accept() async {
    if (_answering) return;
    setState(() => _answering = true);
    HapticFeedback.mediumImpact();

    try {
      await ref.read(offerInboxProvider).accept(widget.offer);
      if (!mounted) return;
      _close(_OfferOutcome.accepted, bookingId: widget.offer.bookingId);
    } on ApiException catch (error) {
      if (!mounted) return;
      switch (error.code) {
        case 'OFFER_EXPIRED':
        case 'OFFER_REVOKED':
          _close(_OfferOutcome.taken);
        case 'OFFER_ACCEPTED_ELSEWHERE':
          _close(_OfferOutcome.taken);
        default:
          setState(() => _answering = false);
          _say('Could not reach the server. Try again.');
      }
    }
  }

  Future<void> _decline() async {
    HapticFeedback.selectionClick();
    final reason = await showModalBottomSheet<DeclineReason>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _DeclineSheet(),
    );
    if (reason == null || !mounted) return;

    await ref.read(offerInboxProvider).decline(widget.offer, reason);
    if (mounted) _close(_OfferOutcome.declined);
  }

  void _say(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final offer = widget.offer;
    final urgent = urgencyFor(_remaining) == OfferUrgency.hurry;
    final ringColour = urgent ? Duty.offerUrgent : tokens.primary;

    // A full-screen route rather than a dialog. There is nothing else to do on
    // this screen, and a dismissible sheet over a job offer invites exactly the
    // accidental dismissal that costs the worker the job.
    return PopScope(
      // Back does not dismiss. The only ways out are Accept, Decline, and the
      // clock — an offer silently dropped by a mis-swipe is unaccounted-for
      // lost income.
      canPop: false,
      child: Scaffold(
        backgroundColor: WorkerTheme.headerLight,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.page, vertical: Space.x4),
            child: Column(
              children: [
                if (offer.isEmergency) const _EmergencyFlag(),
                const Spacer(),
                _Countdown(
                  remaining: _remaining,
                  total: Duration(seconds: math.max(1, offer.expiresAt.difference(offer.serverNow).inSeconds)),
                  colour: ringColour,
                  pulse: urgent ? _pulse : null,
                ),
                const SizedBox(height: Space.x6),
                Text(
                  offer.serviceName,
                  textAlign: TextAlign.center,
                  style: context.text.headlineSmall?.copyWith(color: AppColors.n0),
                ),
                const SizedBox(height: Space.x6),
                _Payout(offer: offer),
                const SizedBox(height: Space.x6),
                _Facts(offer: offer),
                const Spacer(),
                _Actions(
                  onDecline: _answering ? null : _decline,
                  onAccept: _answering ? null : _accept,
                  busy: _answering,
                ),
                const SizedBox(height: Space.x2),
                Text(
                  // Said plainly. A worker who does not answer must know what
                  // happens, so an expired offer is understood rather than
                  // experienced as the app failing them.
                  'If you do not answer, this job goes to another worker.',
                  textAlign: TextAlign.center,
                  style: context.text.bodySmall?.copyWith(color: AppColors.blue300),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

enum _OfferOutcome { accepted, declined, expired, taken }

/// The ring.
class _Countdown extends StatelessWidget {
  const _Countdown({
    required this.remaining,
    required this.total,
    required this.colour,
    this.pulse,
  });

  final Duration remaining;
  final Duration total;
  final Color colour;
  final Animation<double>? pulse;

  @override
  Widget build(BuildContext context) {
    final fraction = total.inMilliseconds == 0
        ? 0.0
        : (remaining.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0);

    final ring = SizedBox(
      width: 168,
      height: 168,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox.expand(
            child: CircularProgressIndicator(
              value: fraction,
              strokeWidth: 10,
              strokeCap: StrokeCap.round,
              backgroundColor: AppColors.blue800,
              valueColor: AlwaysStoppedAnimation(colour),
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '${remaining.inSeconds}',
                // Tabular figures, so the digits do not jitter as it counts.
                style: context.text.displayMedium?.copyWith(
                  color: AppColors.n0,
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              Text('seconds', style: context.text.bodySmall?.copyWith(color: AppColors.blue300)),
            ],
          ),
        ],
      ),
    );

    if (pulse == null) return ring;
    return ScaleTransition(
      scale: Tween<double>(begin: 1.0, end: 1.06).animate(
        CurvedAnimation(parent: pulse!, curve: Curves.easeInOut),
      ),
      child: ring,
    );
  }
}

/// What the worker takes home.
class _Payout extends StatelessWidget {
  const _Payout({required this.offer});
  final JobOffer offer;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          'YOU EARN',
          style: context.text.labelSmall?.copyWith(color: AppColors.blue300, letterSpacing: 1.2),
        ),
        const SizedBox(height: Space.x1),
        Text(
          '₹${offer.payout.round()}',
          style: context.text.displayLarge?.copyWith(
            color: AppColors.n0,
            fontWeight: FontWeight.w700,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        const SizedBox(height: Space.x1),
        Text(
          // The customer's total alongside, so the split is checkable rather
          // than asserted. On a cooperative platform that is the product.
          'Customer pays ₹${offer.customerTotal.round()}',
          style: context.text.bodySmall?.copyWith(color: AppColors.blue300),
        ),
      ],
    );
  }
}

class _Facts extends StatelessWidget {
  const _Facts({required this.offer});
  final JobOffer offer;

  @override
  Widget build(BuildContext context) {
    final facts = <(AppIconData, String)>[
      if (offer.distanceKm != null)
        (AppIcons.location, '${offer.distanceKm!.toStringAsFixed(1)} km away'),
      if (offer.etaMinutes != null) (AppIcons.time, '${offer.etaMinutes} min drive'),
      // Area name only. The street address is not sent before acceptance and
      // must not appear here even if it were.
      if (offer.area != null && offer.area!.isNotEmpty) (AppIcons.locationPin, offer.area!),
      if (offer.durationMinutes != null)
        (AppIcons.time, '${offer.durationMinutes} min booked'),
    ];

    return Wrap(
      alignment: WrapAlignment.center,
      spacing: Space.x2,
      runSpacing: Space.x2,
      children: [
        for (final (icon, label) in facts)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: Space.x3, vertical: Space.x2),
            decoration: BoxDecoration(color: AppColors.blue800, borderRadius: Radii.rPill),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                AppIcon(icon, size: Sizes.iconSm, color: AppColors.blue200),
                const SizedBox(width: Space.x1),
                Text(label, style: context.text.bodyMedium?.copyWith(color: AppColors.n0)),
              ],
            ),
          ),
      ],
    );
  }
}

class _EmergencyFlag extends StatelessWidget {
  const _EmergencyFlag();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x3),
      decoration: BoxDecoration(color: Duty.offerUrgent, borderRadius: Radii.rMd),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AppIcon(AppIcons.emergency, color: AppColors.n0),
          const SizedBox(width: Space.x2),
          Text(
            'EMERGENCY — go now',
            style: context.text.titleMedium?.copyWith(color: AppColors.n0, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

/// Two buttons, 64dp, far apart.
///
/// Far apart because they are pressed with one hand, outdoors, in a hurry, and
/// the cost of hitting the wrong one is a job lost or a job taken that the
/// worker cannot do. Accept sits right, under the thumb.
class _Actions extends StatelessWidget {
  const _Actions({required this.onDecline, required this.onAccept, required this.busy});

  final VoidCallback? onDecline;
  final VoidCallback? onAccept;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: SizedBox(
            height: WorkerSizes.jobAction,
            child: OutlinedButton(
              onPressed: onDecline,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.n0,
                side: const BorderSide(color: AppColors.blue400, width: 1.5),
                shape: const RoundedRectangleBorder(borderRadius: Radii.rLg),
              ),
              child: Text('Decline', style: context.text.titleMedium?.copyWith(color: AppColors.n0)),
            ),
          ),
        ),
        const SizedBox(width: Space.x4),
        Expanded(
          flex: 2,
          child: SizedBox(
            height: WorkerSizes.jobAction,
            child: FilledButton(
              onPressed: onAccept,
              style: FilledButton.styleFrom(
                backgroundColor: Duty.online,
                foregroundColor: AppColors.n0,
                shape: const RoundedRectangleBorder(borderRadius: Radii.rLg),
              ),
              child: busy
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.n0),
                    )
                  : Text(
                      'Accept',
                      style: context.text.titleLarge?.copyWith(
                        color: AppColors.n0,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Four buttons, not a text field.
///
/// Free text cannot be counted, and these reasons are the input matching needs:
/// "too far" is a radius problem and "not my trade" is a skills problem, and
/// prose cannot tell them apart. Answering is one tap, because a worker
/// declining is already busy.
class _DeclineSheet extends StatelessWidget {
  const _DeclineSheet();

  static const _reasons = <(DeclineReason, String, String)>[
    (DeclineReason.tooFar, 'Too far', 'We will stop offering jobs this far away'),
    (DeclineReason.busy, 'Busy right now', 'Nothing changes; we will offer you the next one'),
    (DeclineReason.notMyTrade, 'Not my trade', 'Check your skills so this stops happening'),
    (DeclineReason.unsafe, 'Does not feel safe', 'Reviewed by the cooperative'),
  ];

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Space.page, Space.x2, Space.page, Space.x6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Why are you passing?', style: context.text.titleLarge),
            const SizedBox(height: Space.x2),
            Text(
              'This does not count against you. It tells us what to offer you next.',
              style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
            ),
            const SizedBox(height: Space.x4),
            for (final (reason, label, detail) in _reasons) ...[
              InkWell(
                onTap: () => Navigator.of(context).pop(reason),
                borderRadius: Radii.rLg,
                child: Container(
                  constraints: const BoxConstraints(minHeight: WorkerSizes.button),
                  padding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x3),
                  decoration: BoxDecoration(
                    color: tokens.surfaceAlt,
                    borderRadius: Radii.rLg,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(label, style: context.text.titleMedium),
                            Text(
                              detail,
                              style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
                            ),
                          ],
                        ),
                      ),
                      AppIcon(AppIcons.chevronRight, color: tokens.textTertiary),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: Space.x2),
            ],
          ],
        ),
      ),
    );
  }
}

/// Push the offer over whatever is on screen, and say what happened when it
/// closes.
///
/// Lives here rather than in the router because an offer is an interrupt, not a
/// destination: it must be able to appear over onboarding, over a job in
/// progress, over the settings screen, without disturbing the stack underneath.
Future<void> showOffer(BuildContext context, WidgetRef ref, JobOffer offer) async {
  final outcome = await Navigator.of(context, rootNavigator: true).push<_OfferOutcome>(
    PageRouteBuilder(
      opaque: true,
      barrierDismissible: false,
      transitionDuration: Motion.base,
      pageBuilder: (_, __, ___) => OfferScreen(offer: offer),
      transitionsBuilder: (_, animation, __, child) => FadeTransition(opacity: animation, child: child),
    ),
  );

  if (!context.mounted || outcome == null) return;

  if (outcome == _OfferOutcome.accepted) {
    ref.invalidate(upcomingJobsProvider);
    return;
  }

  final message = switch (outcome) {
    _OfferOutcome.accepted => null,
    _OfferOutcome.declined => 'Passed. We will offer you the next one.',
    _OfferOutcome.expired => 'That offer ran out of time.',
    _OfferOutcome.taken => 'That job went to another worker.',
  };

  if (message != null && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}
