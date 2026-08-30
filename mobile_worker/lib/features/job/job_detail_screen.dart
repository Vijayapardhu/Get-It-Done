import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';

/// The record of a finished job.
///
/// Read-only, and honest: the timeline as the server recorded it, not a
/// prettied summary. When a worker and a customer disagree about when somebody
/// arrived, this is what settles it — so it shows the stamps rather than the
/// story.
class JobDetailScreen extends ConsumerWidget {
  const JobDetailScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final timeline = ref.watch(_timelineProvider(bookingId));
    final tokens = context.tokens;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Job record'),
        actions: [
          IconButton(
            tooltip: 'What you were paid',
            onPressed: () => context.push('/job/$bookingId/payout'),
            icon: AppIcon(AppIcons.invoice, size: 24),
          ),
        ],
      ),
      body: timeline.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Padding(
          padding: const EdgeInsets.all(Space.page),
          child: Text('Could not load this job.\n$error'),
        ),
        data: (events) => ListView(
          padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
          children: [
            for (var i = 0; i < events.length; i++)
              _Event(
                event: events[i],
                first: i == 0,
                last: i == events.length - 1,
              ),
            if (events.isEmpty) Text('No events recorded.', style: context.text.bodyMedium),
            const SizedBox(height: Space.x6),
            Text(
              'These times are recorded by the server, not by your phone.',
              style: context.text.bodySmall?.copyWith(color: tokens.textTertiary),
            ),
          ],
        ),
      ),
    );
  }
}

class _Event extends StatelessWidget {
  const _Event({required this.event, required this.first, required this.last});
  final Json event;
  final bool first;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final at = asDateOrNull(pick(event, 'createdAt', aliases: ['created_at']));
    final status = asString(pick(event, 'status'));
    final reason = asStringOrNull(pick(event, 'reason'));

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 12,
                height: 12,
                margin: const EdgeInsets.only(top: 6),
                decoration: BoxDecoration(color: tokens.primary, shape: BoxShape.circle),
              ),
              if (!last)
                Expanded(child: Container(width: 2, color: tokens.border)),
            ],
          ),
          const SizedBox(width: Space.x4),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: Space.x5),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_words(status), style: context.text.titleSmall),
                  if (at != null)
                    Text(
                      DateFormat('d MMM y, h:mm a').format(at.toLocal()),
                      style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
                    ),
                  if (reason != null && reason.isNotEmpty)
                    Text(
                      reason,
                      style: context.text.bodySmall?.copyWith(color: tokens.textTertiary),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _words(String status) => switch (status) {
        'requested' => 'Customer booked it',
        'matching' => 'Looking for a worker',
        'assigned' => 'Offered to you',
        'accepted' => 'You accepted',
        'en_route' => 'You set off',
        'arrived' => 'You arrived',
        'started' => 'Work started',
        'completed' => 'Work finished',
        'cancelled' => 'Cancelled',
        'no_show' => 'Customer did not appear',
        'expired' => 'Expired',
        _ => status,
      };
}

final _timelineProvider = FutureProvider.family<List<Json>, String>(
  (ref, bookingId) => ref.watch(workerApiProvider).timeline(bookingId),
);
