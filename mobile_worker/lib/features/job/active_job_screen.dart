import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/location/location_pump.dart';
import '../../core/models/worker_models.dart';
import '../../core/providers.dart';
import 'cancel_job_sheet.dart';
import 'otp_screen.dart';

/// One screen, five states, and always exactly one next thing to do.
///
///     accepted → en_route → arrived → started → completed
///
/// The chrome changes with the state and the sticky bottom action is always the
/// single next step. That is the whole design: a worker holding a toolbox, in
/// somebody's stairwell, should never have to decide which of four buttons is
/// the right one.
///
/// Two things are load-bearing and easy to miss:
///
///  * **Arrival needs a real GPS fix**, and a mocked one is refused by the
///    server. Arrival gates the start OTP, which gates the money.
///  * **The OTP steps are the only ones that cannot be queued offline.** They
///    need a live check against a hash only the server holds, and the screen
///    says so rather than failing oddly in a lift.
class ActiveJobScreen extends ConsumerStatefulWidget {
  const ActiveJobScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  ConsumerState<ActiveJobScreen> createState() => _ActiveJobScreenState();
}

class _ActiveJobScreenState extends ConsumerState<ActiveJobScreen> {
  bool _working = false;
  DateTime? _noShowEligibleAt;

  Future<void> _run(Future<void> Function() action, {String? failure}) async {
    if (_working) return;
    setState(() => _working = true);
    try {
      await action();
      ref.invalidate(upcomingJobsProvider);
      ref.invalidate(activeJobProvider);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(failure ?? error.message)),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  /// "On my way".
  ///
  /// Queued rather than awaited: this is pressed in a car park with one bar of
  /// signal, and the worker's next tap must not wait on it. The cadence goes to
  /// 10-second fixes because the customer is now watching a map.
  Future<void> _setEnRoute(WorkerJob job) async {
    await ref.read(actionQueueProvider).enqueue(
          bookingId: job.id,
          method: 'PATCH',
          path: '/bookings/${job.id}/status',
          body: {'status': 'en_route'},
        );
    ref.read(locationPumpProvider).setCadence(PumpCadence.enRoute, bookingId: job.id);
    ref.invalidate(upcomingJobsProvider);
  }

  /// "I'm here".
  ///
  /// NOT queued. It carries a position taken at the moment it was pressed, and
  /// a fix recorded in a car park and delivered from the customer's kitchen
  /// forty minutes later is not evidence of anything.
  Future<void> _markArrived(WorkerJob job) async {
    final pump = ref.read(locationPumpProvider);
    final fix = await pump.currentFix();
    if (!mounted) return;

    if (fix == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not get your position. Step outside and try again.'),
        ),
      );
      return;
    }

    await _run(
      () async {
        final result = await ref.read(workerApiProvider).markArrived(
              job.id,
              latitude: fix.latitude,
              longitude: fix.longitude,
              accuracy: fix.accuracy,
              isMocked: fix.isMocked,
            );
        if (mounted) setState(() => _noShowEligibleAt = result.noShowEligibleAt);
        pump.setCadence(PumpCadence.onSite, bookingId: job.id);
      },
      failure: 'Could not record your arrival.',
    );
  }

  Future<void> _navigate(WorkerJob job) async {
    // Google Maps by intent, never a navigation SDK. It has the traffic data,
    // the worker already knows how to use it, and it is free.
    final aid = await ref.read(workerApiProvider).navigation(job.id).catchError(
          (_) => const NavigationAid(distanceKm: null, etaMinutes: null, navigationUrl: null, embedMapUrl: null),
        );

    final url = aid.navigationUrl ??
        (job.latitude != null && job.longitude != null
            ? 'google.navigation:q=${job.latitude},${job.longitude}'
            : null);
    if (url == null) return;

    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (job.latitude != null) {
      // Falls back to the web map, which every device can open.
      await launchUrl(
        Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${job.latitude},${job.longitude}'),
        mode: LaunchMode.externalApplication,
      );
    }
  }

  Future<void> _call(String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(upcomingJobsProvider);

    return async.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (error, _) => Scaffold(
        appBar: AppBar(),
        body: Center(child: Text('Could not load this job.\n$error', textAlign: TextAlign.center)),
      ),
      data: (jobs) {
        final job = jobs.where((j) => j.id == widget.bookingId).firstOrNull;
        if (job == null) {
          return Scaffold(
            appBar: AppBar(),
            body: const Center(child: Text('This job is no longer yours.')),
          );
        }
        return _JobBody(
          job: job,
          working: _working,
          noShowEligibleAt: _noShowEligibleAt ?? job.arrivedAt?.add(const Duration(minutes: 10)),
          onEnRoute: () => _setEnRoute(job),
          onArrived: () => _markArrived(job),
          onNavigate: () => _navigate(job),
          onCall: job.contactPhone == null ? null : () => _call(job.contactPhone!),
          onStart: () => _openOtp(job, start: true),
          onComplete: () => _openOtp(job, start: false),
          onNoShow: () => _confirmNoShow(job),
          onCancel: () => _confirmCancel(job),
        );
      },
    );
  }

  Future<void> _openOtp(WorkerJob job, {required bool start}) async {
    final done = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => OtpScreen(job: job, start: start)),
    );
    if (done != true || !mounted) return;

    final pump = ref.read(locationPumpProvider);
    if (start) {
      pump.setCadence(PumpCadence.onSite, bookingId: job.id);
      await ref.read(workerApiProvider).workClock(job.id, start: true).catchError((_) => _noClock);
    } else {
      pump.setCadence(
        ref.read(dutyProvider).isOnDuty ? PumpCadence.idle : PumpCadence.off,
      );
      await ref.read(workerApiProvider).workClock(job.id, start: false).catchError((_) => _noClock);
      if (mounted) context.pushReplacement('/job/${job.id}/payout');
    }
    ref.invalidate(upcomingJobsProvider);
  }

  static final _noClock = WorkClock(
    workStartedAt: null,
    workFinishedAt: null,
    purchasedMinutes: null,
    elapsedMinutes: 0,
    serverNow: DateTime.now(),
    promptExtensionAtPercent: 85,
  );

  Future<void> _confirmCancel(WorkerJob job) async {
    final result = await showModalBottomSheet<String>(
      context: context,
      builder: (_) => CancelJobSheet(bookingId: job.id),
    );
    if (result == null || !mounted) return;
    ref.invalidate(upcomingJobsProvider);
    if (mounted) context.pop();
  }

  /// The button that did not exist.
  ///
  /// Before this, a worker outside a locked gate had nothing to press. It is
  /// deliberately behind a confirmation and only offered once the waiting
  /// window has run: it ends the job and pays a reduced amount, and it must not
  /// be reachable by a mis-tap.
  Future<void> _confirmNoShow(WorkerJob job) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Customer did not appear?'),
        content: const Text(
          'This ends the job. You will be paid a call-out amount for the journey, '
          'and it will not count against your completion rate.\n\n'
          'Try calling them once more first.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep waiting')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Report no-show')),
        ],
      ),
    );
    if (confirmed != true) return;

    await _run(() async {
      final result = await ref.read(workerApiProvider).reportNoShow(job.id);
      ref.read(locationPumpProvider).setCadence(
            ref.read(dutyProvider).isOnDuty ? PumpCadence.idle : PumpCadence.off,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Reported. ₹${result.compensation.round()} added for the journey.')),
        );
        context.pop();
      }
    });
  }
}

class _JobBody extends ConsumerWidget {
  const _JobBody({
    required this.job,
    required this.working,
    required this.noShowEligibleAt,
    required this.onEnRoute,
    required this.onArrived,
    required this.onNavigate,
    required this.onCall,
    required this.onStart,
    required this.onComplete,
    required this.onNoShow,
    required this.onCancel,
  });

  final WorkerJob job;
  final bool working;
  final DateTime? noShowEligibleAt;
  final VoidCallback onEnRoute;
  final VoidCallback onArrived;
  final VoidCallback onNavigate;
  final VoidCallback? onCall;
  final VoidCallback onStart;
  final VoidCallback onComplete;
  final VoidCallback onNoShow;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final order = ref.watch(orderContextProvider(job.id));

    return Scaffold(
      appBar: AppBar(
        title: Text(job.serviceName),
        actions: [
          IconButton(
            tooltip: 'What you will be paid',
            onPressed: () => context.push('/job/${job.id}/payout'),
            icon: AppIcon(AppIcons.invoice, size: 24),
          ),
          if (job.stage != JobStage.inProgress && job.stage != JobStage.done)
            IconButton(
              tooltip: 'Cancel job',
              onPressed: onCancel,
              icon: AppIcon(AppIcons.close, size: 24),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, 140),
        children: [
          _Stepper(stage: job.stage),
          const SizedBox(height: Space.x5),

          if (job.stage == JobStage.arrived)
            _WaitingCard(arrivedAt: job.arrivedAt, eligibleAt: noShowEligibleAt, onNoShow: onNoShow),

          if (job.stage == JobStage.inProgress) _WorkTimer(job: job),

          _Section(
            title: 'The door',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // The contact from the ORDER, not from the account. Somebody
                // books a clean for their parents' flat; the person answering
                // the door is not the account holder, and asking for the wrong
                // name at a stranger's door is a bad start.
                if (job.contactName != null)
                  Text('Ask for ${job.contactName}', style: context.text.titleMedium),
                const SizedBox(height: Space.x2),
                Text(job.address, style: context.text.bodyLarge),
                if (job.description != null && job.description!.isNotEmpty) ...[
                  const SizedBox(height: Space.x3),
                  Container(
                    padding: const EdgeInsets.all(Space.x3),
                    decoration: BoxDecoration(color: tokens.surfaceAlt, borderRadius: Radii.rMd),
                    child: Text(job.description!, style: context.text.bodyMedium),
                  ),
                ],
                const SizedBox(height: Space.x4),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: onNavigate,
                        icon: AppIcon(AppIcons.navigate, size: 20),
                        label: const Text('Navigate'),
                        style: OutlinedButton.styleFrom(minimumSize: const Size(0, WorkerSizes.button)),
                      ),
                    ),
                    const SizedBox(width: Space.x3),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: onCall,
                        icon: AppIcon(AppIcons.call, size: 20),
                        label: const Text('Call'),
                        style: OutlinedButton.styleFrom(minimumSize: const Size(0, WorkerSizes.button)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // The other trades arriving at the same address. Genuinely useful for
          // parking, access and sequencing, and invisible before this.
          order.when(
            data: (context0) => context0.siblings.isEmpty
                ? const SizedBox.shrink()
                : _Section(
                    title: 'Also at this address',
                    child: Column(
                      children: [
                        for (final sibling in context0.siblings)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                            leading: AppIcon(AppIcons.tools, color: tokens.textSecondary),
                            title: Text(sibling.serviceName),
                            subtitle: Text(
                              sibling.workerFirstName == null
                                  ? _statusWords(sibling.status)
                                  : '${sibling.workerFirstName} · ${_statusWords(sibling.status)}',
                            ),
                          ),
                      ],
                    ),
                  ),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),

          if (job.payout != null)
            _Section(
              title: 'You will be paid',
              child: Row(
                children: [
                  Text(
                    '₹${job.payout!.round()}',
                    style: context.text.headlineMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () => context.push('/job/${job.id}/payout'),
                    child: const Text('See the breakdown'),
                  ),
                ],
              ),
            ),
        ],
      ),

      // One sticky action, always the single next thing to do.
      bottomNavigationBar: _NextAction(
        stage: job.stage,
        working: working,
        onEnRoute: onEnRoute,
        onArrived: onArrived,
        onStart: onStart,
        onComplete: onComplete,
      ),
    );
  }

  static String _statusWords(String status) => switch (status) {
        'assigned' => 'being assigned',
        'accepted' => 'confirmed',
        'en_route' => 'on the way',
        'arrived' => 'at the door',
        'started' => 'working',
        'completed' => 'finished',
        'cancelled' => 'cancelled',
        _ => status,
      };
}

/// The sticky bottom bar. 64dp, full width, and it says the action rather than
/// naming the state.
class _NextAction extends StatelessWidget {
  const _NextAction({
    required this.stage,
    required this.working,
    required this.onEnRoute,
    required this.onArrived,
    required this.onStart,
    required this.onComplete,
  });

  final JobStage stage;
  final bool working;
  final VoidCallback onEnRoute;
  final VoidCallback onArrived;
  final VoidCallback onStart;
  final VoidCallback onComplete;

  @override
  Widget build(BuildContext context) {
    final (label, action, colour) = switch (stage) {
      JobStage.accepted => ('On my way', onEnRoute, context.tokens.primary),
      JobStage.enRoute => ("I'm here", onArrived, context.tokens.primary),
      JobStage.arrived => ('Start the job', onStart, Duty.online),
      JobStage.inProgress => ('Finish the job', onComplete, Duty.online),
      _ => (null, null, context.tokens.primary),
    };

    if (label == null) return const SizedBox.shrink();

    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(Space.page, 0, Space.page, Space.x4),
      child: SizedBox(
        height: WorkerSizes.jobAction,
        width: double.infinity,
        child: FilledButton(
          onPressed: working ? null : action,
          style: FilledButton.styleFrom(
            backgroundColor: colour,
            shape: const RoundedRectangleBorder(borderRadius: Radii.rLg),
          ),
          child: working
              ? const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.n0),
                )
              : Text(
                  label,
                  style: context.text.titleLarge?.copyWith(
                    color: AppColors.n0,
                    fontWeight: FontWeight.w700,
                  ),
                ),
        ),
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.stage});
  final JobStage stage;

  static const _steps = [
    (JobStage.accepted, 'Booked'),
    (JobStage.enRoute, 'On the way'),
    (JobStage.arrived, 'At the door'),
    (JobStage.inProgress, 'Working'),
    (JobStage.done, 'Done'),
  ];

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final currentIndex = _steps.indexWhere((s) => s.$1 == stage);

    return Row(
      children: [
        for (var i = 0; i < _steps.length; i++) ...[
          Expanded(
            child: Column(
              children: [
                Container(
                  height: 6,
                  decoration: BoxDecoration(
                    color: i <= currentIndex ? Duty.online : tokens.border,
                    borderRadius: Radii.rPill,
                  ),
                ),
                const SizedBox(height: Space.x2),
                Text(
                  _steps[i].$2,
                  textAlign: TextAlign.center,
                  style: context.text.bodySmall?.copyWith(
                    color: i <= currentIndex ? tokens.textPrimary : tokens.textTertiary,
                    fontWeight: i == currentIndex ? FontWeight.w700 : FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
          if (i < _steps.length - 1) const SizedBox(width: Space.x1),
        ],
      ],
    );
  }
}

/// The ten minutes at a door nobody is answering.
class _WaitingCard extends StatefulWidget {
  const _WaitingCard({required this.arrivedAt, required this.eligibleAt, required this.onNoShow});
  final DateTime? arrivedAt;
  final DateTime? eligibleAt;
  final VoidCallback onNoShow;

  @override
  State<_WaitingCard> createState() => _WaitingCardState();
}

class _WaitingCardState extends State<_WaitingCard> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final eligible = widget.eligibleAt;
    final left = eligible == null ? Duration.zero : eligible.difference(DateTime.now());
    final canReport = left <= Duration.zero;

    return Padding(
      padding: const EdgeInsets.only(bottom: Space.x5),
      child: Container(
        padding: const EdgeInsets.all(Space.x5),
        decoration: BoxDecoration(color: tokens.warningSoft, borderRadius: Radii.rXl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Waiting at the door', style: context.text.titleMedium),
            const SizedBox(height: Space.x1),
            Text(
              canReport
                  ? 'You have waited long enough. If nobody comes, report it.'
                  // Counted down rather than described, so the worker knows
                  // exactly how long they are expected to stand there.
                  : 'You can report a no-show in ${left.inMinutes}m ${left.inSeconds % 60}s.',
              style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
            ),
            const SizedBox(height: Space.x4),
            SizedBox(
              width: double.infinity,
              height: WorkerSizes.button,
              child: OutlinedButton(
                onPressed: canReport ? widget.onNoShow : null,
                child: const Text('Customer did not appear'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The live timer against the minutes the customer bought.
///
/// Time is sold by the minute and, before this, nothing recorded how long the
/// work actually took. A two-hour clean that needs a third hour had no path
/// other than the worker doing it free.
class _WorkTimer extends ConsumerStatefulWidget {
  const _WorkTimer({required this.job});
  final WorkerJob job;

  @override
  ConsumerState<_WorkTimer> createState() => _WorkTimerState();
}

class _WorkTimerState extends ConsumerState<_WorkTimer> {
  Timer? _ticker;
  bool _asked = false;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 30), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _askForMoreTime() async {
    final minutes = await showModalBottomSheet<int>(
      context: context,
      builder: (_) => const _ExtensionSheet(),
    );
    if (minutes == null || !mounted) return;

    try {
      await ref.read(workerApiProvider).requestExtension(widget.job.id, minutes: minutes);
      if (mounted) {
        setState(() => _asked = true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Asked. The customer decides — keep working meanwhile.')),
        );
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final started = widget.job.workStartedAt;
    final bought = widget.job.durationMinutes;
    if (started == null || bought == null) return const SizedBox.shrink();

    final elapsed = DateTime.now().difference(started).inMinutes;
    final fraction = (elapsed / bought).clamp(0.0, 1.5);
    final over = elapsed > bought;
    final nearlyDone = fraction >= 0.85;

    return Padding(
      padding: const EdgeInsets.only(bottom: Space.x5),
      child: Container(
        padding: const EdgeInsets.all(Space.x5),
        decoration: BoxDecoration(
          color: over ? tokens.dangerSoft : tokens.surfaceAlt,
          borderRadius: Radii.rXl,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  '$elapsed min',
                  style: context.text.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(width: Space.x2),
                Text('of $bought booked', style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary)),
              ],
            ),
            const SizedBox(height: Space.x3),
            ClipRRect(
              borderRadius: Radii.rPill,
              child: LinearProgressIndicator(
                value: fraction.clamp(0.0, 1.0),
                minHeight: 8,
                backgroundColor: tokens.border,
                valueColor: AlwaysStoppedAnimation(over ? tokens.danger : Duty.online),
              ),
            ),
            if (nearlyDone && !_asked) ...[
              const SizedBox(height: Space.x4),
              SizedBox(
                width: double.infinity,
                height: WorkerSizes.button,
                child: OutlinedButton.icon(
                  onPressed: _askForMoreTime,
                  icon: AppIcon(AppIcons.time, size: 20),
                  label: const Text('Need more time?'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ExtensionSheet extends StatelessWidget {
  const _ExtensionSheet();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Space.page, Space.x2, Space.page, Space.x6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('How much longer?', style: context.text.titleLarge),
            const SizedBox(height: Space.x2),
            Text(
              // Two facts a worker needs before asking: the rate does not
              // change, and it is not their decision.
              'Charged at the same rate the customer already agreed. They have to approve it.',
              style: context.text.bodyMedium?.copyWith(color: context.tokens.textSecondary),
            ),
            const SizedBox(height: Space.x4),
            for (final minutes in [15, 30, 60, 120])
              Padding(
                padding: const EdgeInsets.only(bottom: Space.x2),
                child: SizedBox(
                  height: WorkerSizes.button,
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context, minutes),
                    child: Text(minutes < 60 ? '$minutes minutes' : '${minutes ~/ 60} hour${minutes > 60 ? 's' : ''}'),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.x5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: context.text.labelSmall?.copyWith(
              color: context.tokens.textTertiary,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: Space.x2),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(Space.x4),
            decoration: BoxDecoration(
              color: context.tokens.surface,
              borderRadius: Radii.rXl,
              border: Border.all(color: context.tokens.border),
            ),
            child: child,
          ),
        ],
      ),
    );
  }
}
