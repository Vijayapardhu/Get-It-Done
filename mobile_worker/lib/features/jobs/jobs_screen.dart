import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// Today, Upcoming, History.
///
/// Denser rows than the customer app on purpose: between jobs, more rows on
/// screen is worth more than air. The huge targets belong on the job screen,
/// where a mis-tap actually costs something.
class JobsScreen extends ConsumerStatefulWidget {
  const JobsScreen({super.key});

  @override
  ConsumerState<JobsScreen> createState() => _JobsScreenState();
}

class _JobsScreenState extends ConsumerState<JobsScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final upcoming = ref.watch(upcomingJobsProvider);
    final history = ref.watch(jobHistoryProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(Space.page),
          child: SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 0, label: Text('Today')),
              ButtonSegment(value: 1, label: Text('Upcoming')),
              ButtonSegment(value: 2, label: Text('History')),
            ],
            selected: {_tab},
            onSelectionChanged: (s) => setState(() => _tab = s.first),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async {
              ref
                ..invalidate(upcomingJobsProvider)
                ..invalidate(jobHistoryProvider);
            },
            child: switch (_tab) {
              2 => _list(history, empty: 'Nothing finished yet.'),
              _ => _list(
                  upcoming.whenData(
                    (jobs) => _tab == 0
                        ? jobs.where(_isToday).toList()
                        : jobs.where((j) => !_isToday(j)).toList(),
                  ),
                  empty: _tab == 0 ? 'Nothing booked for today.' : 'Nothing booked after today.',
                ),
            },
          ),
        ),
      ],
    );
  }

  /// Instant work has no scheduled time, and it is happening now by definition.
  static bool _isToday(WorkerJob job) {
    final at = job.scheduledAt?.toLocal();
    if (at == null) return true;
    final now = DateTime.now();
    return at.year == now.year && at.month == now.month && at.day == now.day;
  }

  Widget _list(AsyncValue<List<WorkerJob>> async, {required String empty}) {
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => ListView(
        padding: const EdgeInsets.all(Space.page),
        children: [Text('Could not load your jobs.\n$error')],
      ),
      data: (jobs) {
        if (jobs.isEmpty) {
          return ListView(
            padding: const EdgeInsets.all(Space.page),
            children: [
              const SizedBox(height: Space.x16),
              AppIcon(AppIcons.calendar, size: 48, color: context.tokens.textTertiary),
              const SizedBox(height: Space.x4),
              Text(empty, textAlign: TextAlign.center, style: context.text.titleMedium),
            ],
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(Space.page, 0, Space.page, Space.x12),
          itemCount: jobs.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (_, i) => _JobRow(job: jobs[i]),
        );
      },
    );
  }
}

class _JobRow extends StatelessWidget {
  const _JobRow({required this.job});
  final WorkerJob job;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final live = job.stage != JobStage.done;
    final time = job.scheduledAt == null
        ? 'Now'
        : DateFormat('d MMM · h:mm a').format(job.scheduledAt!.toLocal());

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(vertical: Space.x2),
      // A live job opens the state machine; a finished one opens the record.
      // Same row, two destinations, because they are the same job.
      onTap: () => context.push(live ? '/job/${job.id}' : '/job/${job.id}/detail'),
      leading: Container(
        width: 4,
        height: 40,
        decoration: BoxDecoration(
          color: live ? tokens.primary : tokens.border,
          borderRadius: Radii.rPill,
        ),
      ),
      title: Text(job.serviceName, style: context.text.titleMedium),
      subtitle: Text('$time · ${job.address}', maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: job.payout == null
          ? AppIcon(AppIcons.chevronRight)
          : Text(
              '₹${job.payout!.round()}',
              style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
    );
  }
}
