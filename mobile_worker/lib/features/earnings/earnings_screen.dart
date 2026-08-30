import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// This week as the hero, then a seven-day strip, then the ledger.
///
/// Money is the second screen, not the fifth: a worker checks it several times
/// a day, so it earns a bottom-nav destination. The one thing this screen must
/// never do is imply money can be pulled on demand — settlements are generated
/// and released by the cooperative on a schedule, and "pending" says so.
class EarningsScreen extends ConsumerWidget {
  const EarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(earningsSummaryProvider);
    final ledger = ref.watch(ledgerProvider);
    final tokens = context.tokens;

    return RefreshIndicator(
      onRefresh: () async {
        ref
          ..invalidate(earningsSummaryProvider)
          ..invalidate(ledgerProvider);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
        children: [
          summary.when(
            loading: () =>
                const SizedBox(height: 160, child: Center(child: CircularProgressIndicator())),
            error: (error, _) => Text('Could not load your earnings.\n$error'),
            data: (s) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'THIS WEEK',
                  style: context.text.labelSmall
                      ?.copyWith(color: tokens.textTertiary, letterSpacing: 1.2),
                ),
                const SizedBox(height: Space.x1),
                Text(
                  '₹${s.week.round()}',
                  style: context.text.displayLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                Text(
                  '${s.jobsWeek} jobs done',
                  style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
                ),
                const SizedBox(height: Space.x6),
                _WeekBars(days: s.dailyBars),
                const SizedBox(height: Space.x6),
                _PendingCard(pending: s.pending),
              ],
            ),
          ),
          const SizedBox(height: Space.x8),
          Text(
            'EVERY LINE',
            style: context.text.labelSmall?.copyWith(color: tokens.textTertiary, letterSpacing: 1.2),
          ),
          const SizedBox(height: Space.x2),
          ledger.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => const Text('Could not load the ledger.'),
            data: (entries) => entries.isEmpty
                ? Text('Nothing yet.', style: context.text.bodyMedium)
                : Column(children: [for (final e in entries) _LedgerRow(entry: e)]),
          ),
          const SizedBox(height: Space.x6),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: AppIcon(AppIcons.invoice),
            title: const Text('Payouts'),
            trailing: AppIcon(AppIcons.chevronRight),
            onTap: () => context.push('/earnings/payouts'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: AppIcon(AppIcons.document),
            title: const Text('Statements'),
            trailing: AppIcon(AppIcons.chevronRight),
            onTap: () => context.push('/earnings/statements'),
          ),
        ],
      ),
    );
  }
}

/// Seven bars, no axis, no legend.
///
/// A worker reading this on a phone in sunlight wants the shape of their week,
/// not a chart. Today is tinted; the tallest bar sets the scale.
class _WeekBars extends StatelessWidget {
  const _WeekBars({required this.days});
  final List<DayEarning> days;

  @override
  Widget build(BuildContext context) {
    if (days.isEmpty) return const SizedBox.shrink();
    final tokens = context.tokens;
    final peak = days.map((d) => d.amount).fold<double>(1, (a, b) => a > b ? a : b);
    final today = DateTime.now();

    return SizedBox(
      height: 108,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final day in days)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      day.amount == 0 ? '' : '${day.amount.round()}',
                      style: context.text.bodySmall?.copyWith(color: tokens.textTertiary),
                    ),
                    const SizedBox(height: Space.x1),
                    Container(
                      // Floored at 3dp so a zero day is still a visible tick.
                      // A gap in the row reads as missing data rather than as a
                      // day off.
                      height: (day.amount / peak * 64).clamp(3, 64),
                      decoration: BoxDecoration(
                        color: _isSameDay(day.date, today) ? tokens.primary : tokens.primarySoft,
                        borderRadius: Radii.rSm,
                      ),
                    ),
                    const SizedBox(height: Space.x1),
                    Text(
                      DateFormat('E').format(day.date.toLocal()).substring(0, 1),
                      style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  static bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _PendingCard extends StatelessWidget {
  const _PendingCard({required this.pending});
  final double pending;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      padding: const EdgeInsets.all(Space.x4),
      decoration: BoxDecoration(color: tokens.surfaceAlt, borderRadius: Radii.rXl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('₹${pending.round()} waiting to be paid out', style: context.text.titleMedium),
          const SizedBox(height: Space.x1),
          Text(
            // The honest sentence. Anything shorter reads as a button that is
            // missing, and a worker hunting for it is a support ticket.
            'Payouts are released by the cooperative on a schedule. You cannot request one here.',
            style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _LedgerRow extends StatelessWidget {
  const _LedgerRow({required this.entry});
  final LedgerEntry entry;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    // Keyed on the TYPE, not the sign. The settlement pipeline writes a payout
    // as a positive worker_share row, so a sign test would render money leaving
    // the balance as "+₹500" -- which is the one mistake a ledger cannot make.
    final credit = entry.entryType != 'payout';

    // Named for what happened, not for the enum. "adjustment" tells a worker
    // nothing; "wasted journey" tells them exactly which afternoon it was.
    final label = switch (entry.entryType) {
      'earning' => 'Job completed',
      'payout' => 'Paid out',
      'adjustment' =>
        entry.reference == 'no_show_compensation' ? 'Wasted journey' : 'Adjustment',
      'refund' => 'Refunded',
      _ => entry.entryType,
    };

    return ListTile(
      contentPadding: EdgeInsets.zero,
      dense: true,
      onTap: entry.bookingId == null ? null : () => context.push('/job/${entry.bookingId}/payout'),
      title: Text(label),
      subtitle: Text(DateFormat('d MMM, h:mm a').format(entry.createdAt.toLocal())),
      trailing: Text(
        '${credit ? '+' : '−'}₹${entry.amount.abs().round()}',
        style: context.text.titleMedium?.copyWith(
          color: credit ? tokens.success : tokens.textPrimary,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
