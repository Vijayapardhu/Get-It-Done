import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';

class PayoutsScreen extends ConsumerWidget {
  const PayoutsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final payouts = ref.watch(payoutsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Payouts')),
      body: payouts.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Could not load payouts.'),
              const SizedBox(height: Space.x3),
              FilledButton(
                onPressed: () => ref.invalidate(payoutsProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (items) {
          if (items.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(Space.x6),
                child: Text(
                  'No payouts yet.\n\nPayouts are processed once you complete jobs.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(payoutsProvider.future),
            child: _PayoutsList(payouts: items),
          );
        },
      ),
    );
  }
}

class _PayoutsList extends StatelessWidget {
  const _PayoutsList({required this.payouts});
  final List<Json> payouts;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(
        Space.page,
        Space.x4,
        Space.page,
        Space.x12,
      ),
      itemCount: payouts.length,
      itemBuilder: (context, index) => _PayoutCard(payout: payouts[index]),
    );
  }
}

class _PayoutCard extends StatelessWidget {
  const _PayoutCard({required this.payout});
  final Json payout;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final amount = asDouble(pick(payout, 'amount'));
    final status = asStringOrNull(pick(payout, 'status')) ?? 'pending';
    final dateStr = asStringOrNull(pick(payout, 'paidAt', aliases: ['date', 'createdAt']));

    DateTime? date;
    if (dateStr != null) {
      date = DateTime.tryParse(dateStr);
    }
    date ??= DateTime.now();

    final (label, tone) = switch (status) {
      'paid' => ('Paid', BadgeTone.success),
      'failed' => ('Failed', BadgeTone.danger),
      _ => ('Pending', BadgeTone.warning),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: Space.x3),
      padding: const EdgeInsets.all(Space.x4),
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
                Text(
                  '₹${amount.toStringAsFixed(2)}',
                  style: context.text.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: Space.x1),
                Text(
                  DateFormat('d MMM y, h:mm a').format(date),
                  style: context.text.bodySmall?.copyWith(
                    color: tokens.textTertiary,
                  ),
                ),
              ],
            ),
          ),
          AppBadge(label, tone: tone, dense: true),
        ],
      ),
    );
  }
}
