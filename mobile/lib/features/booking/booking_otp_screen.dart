import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';

/// The job handshake codes.
///
/// The customer holds two codes and reads one aloud when the worker arrives,
/// and the other when the work is done. The worker keys them into their app.
/// That exchange is what stops a worker billing for a job they never attended,
/// so this screen has one purpose: make the right code impossible to miss.
///
/// The codes are returned by POST /bookings exactly ONCE — only SHA-256 hashes
/// are stored server-side — so the app writes them into the encrypted
/// [OtpStore] the moment an order comes back. That is what makes this screen
/// re-openable rather than a one-time reveal: it reads from this device, as
/// often as the customer likes, for as long as the booking is live.
///
/// Issued once, viewable always. The reissue below exists for the one case
/// that breaks — a different device, or storage cleared — and it is a
/// deliberate act, because reissuing mints a NEW pair and invalidates whatever
/// the customer had already written down.
class BookingOtpScreen extends ConsumerStatefulWidget {
  const BookingOtpScreen({
    super.key,
    required this.bookingId,
    required this.otps,
    this.status = 'assigned',
    this.workerName,
    this.serviceName,
  });

  final String bookingId;

  /// Who is asking for the code, and what for. Both optional: a booking with
  /// no worker yet has neither, and the card is simply not shown.
  final String? workerName;
  final String? serviceName;

  /// Null when the customer arrived here after losing the original codes.
  final BookingOtps? otps;

  /// Drives which code is emphasised.
  final String status;

  @override
  ConsumerState<BookingOtpScreen> createState() => _BookingOtpScreenState();
}

class _BookingOtpScreenState extends ConsumerState<BookingOtpScreen> {
  late BookingOtps? _otps = widget.otps;
  bool _reissuing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Nothing was passed in, so look for what this device kept when the
    // booking was placed. Without this the only route to a code is reissuing,
    // which mints a NEW pair and invalidates the one the customer already
    // wrote down.
    if (widget.otps == null) _restore();
  }

  Future<void> _restore() async {
    final stored = await ref.read(otpStoreProvider).read(widget.bookingId);
    if (!mounted || stored == null) return;
    setState(() => _otps = stored);
  }

  /// Which code the worker needs right now. Before work starts it is the start
  /// code; once started, the completion code. Showing both with equal weight is
  /// how a customer reads out the wrong one.
  bool get _needsStartCode => widget.status != 'started';

  Future<void> _reissue() async {
    setState(() { _reissuing = true; _error = null; });
    try {
      final otps = await ref.read(apiProvider).reissueOtps(widget.bookingId);
      await ref.read(otpStoreProvider).save(widget.bookingId, otps);
      if (!mounted) return;
      setState(() => _otps = otps);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('New codes issued. The previous ones no longer work.')),
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _reissuing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final otps = _otps;

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Your codes'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Space.x5, Space.x4, Space.x5, Space.x10),
        children: [
          Text(
            _needsStartCode
                ? 'Share this code when\nthe worker arrives'
                : 'Share this code when\nthe work is done',
            style: context.text.displayLarge,
          ),
          const SizedBox(height: Space.x2),
          Text(
            'Read it out only when you are satisfied. The worker cannot '
            '${_needsStartCode ? 'start' : 'complete'} the job without it.',
            style: context.text.bodyLarge?.copyWith(color: t.textSecondary),
          ),

          // Who is asking, and what for. Reading a number aloud to a stranger
          // is exactly the moment the customer wants to see the name they were
          // told to expect against the job it belongs to.
          if (widget.workerName != null || widget.serviceName != null) ...[
            const SizedBox(height: Space.x5),
            AppCard(
              elevated: false,
              padding: const EdgeInsets.all(Space.x4),
              child: Row(
                children: [
                  WorkerAvatar(
                    name: widget.workerName ?? 'Worker',
                    verified: widget.workerName != null,
                    size: Sizes.avatarMd,
                  ),
                  const SizedBox(width: Space.x3),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.workerName ?? 'Worker not assigned yet',
                          style: context.text.titleSmall,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (widget.serviceName != null)
                          Text(
                            widget.serviceName!,
                            style: context.text.bodySmall
                                ?.copyWith(color: t.textSecondary),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: Space.x8),

          if (otps == null)
            AppStateView.empty(
              title: 'Codes not available',
              message: 'This device does not have the codes for this booking '
                  '— they are kept where the booking was placed. Issuing a new '
                  'pair replaces the old one, so only do that if nobody has '
                  'the first.',
              icon: AppIcons.secure,
              actionLabel: _reissuing ? 'Issuing…' : 'Issue new codes',
              onAction: _reissuing ? null : _reissue,
            )
          else ...[
            // The active code, at full size.
            _CodeCard(
              label: _needsStartCode ? 'Start code' : 'Completion code',
              code: _needsStartCode ? otps.startOtp : otps.completionOtp,
              active: true,
            ),
            const SizedBox(height: Space.x4),
            // The other one stays visible but visibly secondary, so the
            // customer knows it exists without confusing the two.
            _CodeCard(
              label: _needsStartCode ? 'Completion code — later' : 'Start code — already used',
              code: _needsStartCode ? otps.completionOtp : otps.startOtp,
              active: false,
            ),
            const SizedBox(height: Space.x6),
            AppBanner(
              message: 'Never share these over a call or message. Only read them '
                  'to the worker standing in front of you.',
              tone: StateTone.warning,
              icon: AppIcons.shield,
            ),
            const SizedBox(height: Space.x4),
            AppButton.secondary(
              label: 'Issue new codes',
              icon: AppIcons.refresh,
              loading: _reissuing,
              onPressed: _reissuing ? null : _reissue,
            ),
          ],

          if (_error != null) ...[
            const SizedBox(height: Space.x4),
            AppBanner(message: _error!, tone: StateTone.error),
          ],
        ],
      ),
    );
  }
}

/// A single code, rendered large with generous digit spacing so it can be read
/// aloud accurately at arm's length.
class _CodeCard extends StatelessWidget {
  const _CodeCard({required this.label, required this.code, required this.active});

  final String label;
  final String code;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return AppCard(
      background: active ? t.primarySoft : t.surface,
      border: active ? t.primary : t.border,
      padding: const EdgeInsets.symmetric(horizontal: Space.x5, vertical: Space.x6),
      elevated: active,
      child: Column(
        children: [
          Text(
            label.toUpperCase(),
            style: context.text.labelSmall?.copyWith(
              color: active ? t.primary : t.textTertiary,
            ),
          ),
          const SizedBox(height: Space.x3),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (final digit in code.split(''))
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Space.x1),
                  child: Text(
                    digit,
                    style: context.text.displayLarge?.copyWith(
                      fontSize: active ? 40 : 28,
                      color: active ? t.textPrimary : t.textTertiary,
                      // Tabular so the digits sit on an even rhythm; a
                      // proportional '1' next to a '0' reads as a typo.
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
            ],
          ),
          if (active) ...[
            const SizedBox(height: Space.x3),
            GestureDetector(
              onTap: () {
                Clipboard.setData(ClipboardData(text: code));
                HapticFeedback.selectionClick();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Code copied')),
                );
              },
              behavior: HitTestBehavior.opaque,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  AppIcon(AppIcons.copy, size: Sizes.iconXs, color: t.primary),
                  const SizedBox(width: Space.x1),
                  Text(
                    'Copy',
                    style: context.text.labelMedium?.copyWith(
                      color: t.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Shown immediately after a successful booking.
///
/// This is the one moment in the flow that earns a real beat of motion: the
/// booking landed, a worker is assigned, and the codes appear.
class BookingConfirmedScreen extends StatelessWidget {
  const BookingConfirmedScreen({
    super.key,
    required this.result,
    required this.onViewCodes,
    required this.onTrack,
  });

  final BookingCreated result;
  final VoidCallback onViewCodes;
  final VoidCallback onTrack;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final worker = result.recommendedWorker;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Space.x5),
          child: Column(
            children: [
              const Spacer(),
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0.6, end: 1),
                duration: Motion.emphasis,
                curve: Motion.curveSpring,
                builder: (context, scale, child) => Transform.scale(scale: scale, child: child),
                child: AppIconBadge(
                  AppIcons.success,
                  size: 96,
                  iconSize: 46,
                  background: t.successSoft,
                  foreground: t.success,
                ),
              ),
              const SizedBox(height: Space.x6),
              Text(
                worker == null ? "You're booked" : "You're all set",
                style: context.text.displayLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: Space.x2),
              Text(
                worker == null
                    ? 'We are finding a verified worker near you. '
                        'You will be notified as soon as one accepts.'
                    : '${worker.name} has been assigned and is on the way.',
                style: context.text.bodyLarge?.copyWith(color: t.textSecondary),
                textAlign: TextAlign.center,
              ),

              if (worker != null) ...[
                const SizedBox(height: Space.x6),
                AppCard(
                  padding: Space.cardInsetsLarge,
                  child: Row(
                    children: [
                      WorkerAvatar(name: worker.name, verified: true),
                      const SizedBox(width: Space.x3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(worker.name, style: context.text.titleLarge),
                            if (worker.rating != null)
                              RatingPill(rating: worker.rating!, dense: true),
                          ],
                        ),
                      ),
                      if (worker.distanceKm != null)
                        Text(
                          '${worker.distanceKm!.toStringAsFixed(1)} km',
                          style: context.text.labelMedium?.copyWith(color: t.textSecondary),
                        ),
                    ],
                  ),
                ),
              ],

              const Spacer(),

              // Codes first: this is the only time they are shown, and a
              // customer who taps past this screen has lost them.
              if (result.otps != null) ...[
                AppButton.primary(
                  label: 'View my codes',
                  icon: AppIcons.secure,
                  onPressed: onViewCodes,
                ),
                const SizedBox(height: Space.x3),
              ],
              AppButton.secondary(
                label: 'Track booking',
                icon: AppIcons.navigate,
                onPressed: onTrack,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
