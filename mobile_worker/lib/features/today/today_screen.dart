import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// The home screen, and the whole argument of the app.
///
/// The customer app is a catalogue: you browse, you choose, you wait. This is a
/// shift. It is opened at 8am and closed at 8pm, it lives in a pocket between
/// jobs, and it is looked at with one hand, outdoors, in sunlight.
///
/// So there is no browsing here. No search, no grid, no discovery. Top to
/// bottom, in the order a worker needs them:
///
///   1. The duty toggle. Full width, taller than anything else, green when on.
///   2. The active job, if there is one — because if there is, nothing else on
///      this screen matters.
///   3. What is next.
///   4. Today's money and today's count.
///   5. Anything about to stop them working: a lapsed document, an expiring
///      insurance policy.
///
/// Everything else is one tap away, not on the way.
class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final duty = ref.watch(dutyProvider);
    final active = ref.watch(activeJobProvider);
    final upcoming = ref.watch(upcomingJobsProvider);
    final earnings = ref.watch(earningsSummaryProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref
          ..invalidate(upcomingJobsProvider)
          ..invalidate(earningsSummaryProvider)
          ..invalidate(workerProfileProvider);
        await ref.read(offerInboxProvider).reconcile();
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
        children: [
          DutyToggle(status: duty),
          const SizedBox(height: Space.x5),

          active.when(
            data: (job) => job == null ? const SizedBox.shrink() : _ActiveJobCard(job: job),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),

          upcoming.when(
            data: (jobs) => _NextUp(jobs: jobs, hasActive: active.value != null),
            loading: () => const _CardSkeleton(),
            error: (error, _) => _Problem(
              message: 'Could not load your jobs.',
              onRetry: () => ref.invalidate(upcomingJobsProvider),
            ),
          ),

          const SizedBox(height: Space.x5),
          earnings.when(
            data: (summary) => _TodayMoney(summary: summary),
            loading: () => const _CardSkeleton(),
            error: (_, __) => const SizedBox.shrink(),
          ),

          const SizedBox(height: Space.x5),
          const _Warnings(),
        ],
      ),
    );
  }
}

/// The most important control in the app.
///
/// Full width and 72dp: it is pressed at the start and the end of a twelve-hour
/// day, often with gloves on, and a mis-tap means either missing offers all
/// morning or being offered a job while asleep.
///
/// Going online is optimistic and instant. Going offline waits for the server,
/// because a worker who believes they are off duty and is still matchable is
/// how a customer ends up with nobody at the door.
class DutyToggle extends ConsumerStatefulWidget {
  const DutyToggle({super.key, required this.status});
  final DutyStatus status;

  @override
  ConsumerState<DutyToggle> createState() => _DutyToggleState();
}

class _DutyToggleState extends ConsumerState<DutyToggle> {
  bool _busy = false;

  Future<void> _toggle() async {
    if (_busy) return;

    // `busy` means a job is running. The toggle does not end a job, and a
    // worker mid-job pressing it should be told why rather than have nothing
    // happen.
    if (widget.status == DutyStatus.busy) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Finish your current job first.')),
      );
      return;
    }

    final next = widget.status == DutyStatus.available ? DutyStatus.offline : DutyStatus.available;

    if (next == DutyStatus.available) {
      final granted = await ref.read(locationPumpProvider).ensurePermission();
      if (!mounted) return;
      if (!granted) {
        // Said as a consequence, not as a permission dialog. "We need location"
        // is a request; "you will not be offered jobs" is the truth.
        await showDialog<void>(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('Location is needed to get jobs'),
            content: const Text(
              'Jobs are offered by distance. Without your position we cannot offer you anything, '
              'and the customer cannot see you on the way.\n\n'
              'It is only shared while you are online, and stops the moment you go offline.',
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Not now')),
            ],
          ),
        );
        return;
      }
    }

    setState(() => _busy = true);
    try {
      await ref.read(dutyProvider.notifier).set(next);
      if (next == DutyStatus.available) {
        await ref.read(offerInboxProvider).reconcile();
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not change your status. Check your connection.')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final online = widget.status == DutyStatus.available;
    final onJob = widget.status == DutyStatus.busy;

    final (background, foreground, label, detail) = switch (widget.status) {
      DutyStatus.available => (Duty.online, AppColors.n0, 'You are online', 'Tap to go offline'),
      DutyStatus.busy => (Duty.busy, AppColors.n0, 'On a job', 'Finish the job to change this'),
      DutyStatus.offline => (
          context.tokens.surfaceAlt,
          context.tokens.textPrimary,
          'You are offline',
          'Tap to start taking jobs',
        ),
    };

    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: _busy ? null : _toggle,
        borderRadius: Radii.rXl,
        child: AnimatedContainer(
          duration: Motion.base,
          height: WorkerSizes.dutyToggle,
          padding: const EdgeInsets.symmetric(horizontal: Space.x5),
          decoration: BoxDecoration(
            color: background,
            borderRadius: Radii.rXl,
            border: online || onJob ? null : Border.all(color: context.tokens.border),
          ),
          child: Row(
            children: [
              if (_busy)
                SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.5, color: foreground),
                )
              else
                AppIcon(
                  online ? AppIcons.power : AppIcons.power,
                  color: foreground,
                  size: Sizes.iconLg,
                  bold: online,
                ),
              const SizedBox(width: Space.x4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      label,
                      style: context.text.titleLarge?.copyWith(color: foreground, fontWeight: FontWeight.w700),
                    ),
                    Text(detail, style: context.text.bodySmall?.copyWith(color: foreground.withValues(alpha: 0.85))),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActiveJobCard extends StatelessWidget {
  const _ActiveJobCard({required this.job});
  final WorkerJob job;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final next = switch (job.stage) {
      JobStage.accepted => 'Start heading over',
      JobStage.enRoute => 'Tell us when you arrive',
      JobStage.arrived => 'Get the start code',
      JobStage.inProgress => 'Finish and get paid',
      _ => 'Open',
    };

    return Padding(
      padding: const EdgeInsets.only(bottom: Space.x5),
      child: InkWell(
        onTap: () => context.push('/job/${job.id}'),
        borderRadius: Radii.rXl,
        child: Container(
          padding: const EdgeInsets.all(Space.x5),
          decoration: BoxDecoration(
            color: tokens.primary,
            borderRadius: Radii.rXl,
            boxShadow: tokens.raisedShadow,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'RIGHT NOW',
                style: context.text.labelSmall?.copyWith(color: AppColors.blue100, letterSpacing: 1.2),
              ),
              const SizedBox(height: Space.x2),
              Text(
                job.serviceName,
                style: context.text.headlineSmall?.copyWith(color: AppColors.n0),
              ),
              const SizedBox(height: Space.x1),
              Text(
                job.address,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: context.text.bodyMedium?.copyWith(color: AppColors.blue100),
              ),
              const SizedBox(height: Space.x4),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      next,
                      style: context.text.titleMedium?.copyWith(
                        color: AppColors.n0,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  AppIcon(AppIcons.chevronRight, color: AppColors.n0),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NextUp extends StatelessWidget {
  const _NextUp({required this.jobs, required this.hasActive});
  final List<WorkerJob> jobs;
  final bool hasActive;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final scheduled = jobs.where((j) => j.stage == JobStage.accepted && j.scheduledAt != null).toList()
      ..sort((a, b) => a.scheduledAt!.compareTo(b.scheduledAt!));
    final offered = jobs.where((j) => j.stage == JobStage.offered).toList();

    if (scheduled.isEmpty && offered.isEmpty) {
      if (hasActive) return const SizedBox.shrink();
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(Space.x5),
        decoration: BoxDecoration(
          color: tokens.surfaceAlt,
          borderRadius: Radii.rXl,
        ),
        child: Column(
          children: [
            AppIcon(AppIcons.loading, size: 36, color: tokens.textTertiary),
            const SizedBox(height: Space.x3),
            Text('Nothing booked yet', style: context.text.titleMedium),
            const SizedBox(height: Space.x1),
            Text(
              // What to do, not just what is absent. An empty state that only
              // says "nothing here" teaches a worker the app is broken.
              'Stay online and we will send you the next job in your area.',
              textAlign: TextAlign.center,
              style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: WorkerSizes.rowInsets,
      decoration: BoxDecoration(
        color: tokens.surface,
        borderRadius: Radii.rXl,
        border: Border.all(color: tokens.border),
      ),
      child: Column(
        children: [
          if (offered.isNotEmpty)
            for (final job in offered)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('Offered: ${job.serviceName}', style: context.text.titleMedium),
                subtitle: Text(job.address, maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: job.payout == null
                    ? AppIcon(AppIcons.chevronRight)
                    : Text(
                        '₹${job.payout!.round()}',
                        style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                onTap: () => context.push('/job/${job.id}'),
              ),
          if (scheduled.isNotEmpty && offered.isNotEmpty)
            const Divider(height: 1),
          if (scheduled.isNotEmpty)
            for (final job in scheduled)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('Next: ${job.serviceName}', style: context.text.titleMedium),
                subtitle: Text(
                  '${DateFormat('EEE d MMM, h:mm a').format(job.scheduledAt!.toLocal())} · ${job.address}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: job.payout == null
                    ? AppIcon(AppIcons.chevronRight)
                    : Text(
                        '₹${job.payout!.round()}',
                        style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                onTap: () => context.push('/job/${job.id}'),
              ),
        ],
      ),
    );
  }
}

class _TodayMoney extends StatelessWidget {
  const _TodayMoney({required this.summary});
  final EarningsSummary summary;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return InkWell(
      onTap: () => context.go('/earnings'),
      borderRadius: Radii.rXl,
      child: Container(
        padding: const EdgeInsets.all(Space.x5),
        decoration: BoxDecoration(
          color: tokens.surface,
          borderRadius: Radii.rXl,
          border: Border.all(color: tokens.border),
        ),
        child: Row(
          children: [
            Expanded(
              child: _Figure(
                label: 'Today',
                value: '₹${summary.today.round()}',
                detail: '${summary.jobsToday} ${summary.jobsToday == 1 ? 'job' : 'jobs'}',
              ),
            ),
            Container(width: 1, height: 44, color: tokens.border),
            Expanded(
              child: _Figure(
                label: 'This week',
                value: '₹${summary.week.round()}',
                detail: '${summary.jobsWeek} ${summary.jobsWeek == 1 ? 'job' : 'jobs'}',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value, required this.detail});
  final String label;
  final String value;
  final String detail;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: context.text.bodySmall?.copyWith(color: tokens.textSecondary)),
        const SizedBox(height: Space.x1),
        Text(
          value,
          style: context.text.headlineSmall?.copyWith(
            fontWeight: FontWeight.w700,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        Text(detail, style: context.text.bodySmall?.copyWith(color: tokens.textTertiary)),
      ],
    );
  }
}

/// Things that will stop a worker being matched, said before they happen.
///
/// A worker whose insurance lapsed silently stops getting offers and never
/// finds out why. That is the failure this card exists to prevent, so it sits
/// on the home screen rather than three taps into a documents list.
class _Warnings extends ConsumerWidget {
  const _Warnings();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final verification = ref.watch(verificationStatusProvider).value;
    // The verification screen already trusts the worker profile as a second
    // source for this -- a worker approved by an admin outside the app's own
    // submit/steps flow (a cooperative onboarding them directly, for one)
    // never accumulates `steps`, so `verification.isVerified` can lag behind
    // reality. Without this fallback this banner does not agree with the
    // screen its own "Finish getting verified" link opens.
    final profileVerified = ref.watch(workerProfileProvider).value?.isVerified == true;
    final tokens = context.tokens;

    final warnings = <(String, String, VoidCallback)>[
      if (verification != null && !verification.isVerified && !profileVerified)
        (
          'Finish getting verified',
          '${verification.steps.where((s) => !s.done).length} things left before you can take jobs',
          () => context.push('/verification'),
        ),
    ];

    if (warnings.isEmpty) return const SizedBox.shrink();

    return Column(
      children: [
        for (final (title, detail, onTap) in warnings)
          Padding(
            padding: const EdgeInsets.only(bottom: Space.x3),
            child: InkWell(
              onTap: onTap,
              borderRadius: Radii.rLg,
              child: Container(
                padding: const EdgeInsets.all(Space.x4),
                decoration: BoxDecoration(
                  color: tokens.warningSoft,
                  borderRadius: Radii.rLg,
                  border: Border.all(color: tokens.warning.withValues(alpha: 0.35)),
                ),
                child: Row(
                  children: [
                    AppIcon(AppIcons.emergency, color: tokens.warning),
                    const SizedBox(width: Space.x3),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(title, style: context.text.titleSmall),
                          Text(detail, style: context.text.bodySmall?.copyWith(color: tokens.textSecondary)),
                        ],
                      ),
                    ),
                    AppIcon(AppIcons.chevronRight, color: tokens.textTertiary),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _CardSkeleton extends StatelessWidget {
  const _CardSkeleton();

  @override
  Widget build(BuildContext context) => Container(
        height: 88,
        decoration: BoxDecoration(color: context.tokens.skeletonBase, borderRadius: Radii.rXl),
      );
}

class _Problem extends StatelessWidget {
  const _Problem({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(Space.x5),
      decoration: BoxDecoration(
        color: context.tokens.dangerSoft,
        borderRadius: Radii.rXl,
      ),
      child: Row(
        children: [
          Expanded(child: Text(message, style: context.text.bodyMedium)),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
