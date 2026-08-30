import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// Where every rupee went.
///
/// Gross, tax out, platform 5%, cooperative 10%, welfare 2%, and what is left.
/// Every line says its destination, because "5% platform fee" without "to GET
/// IT DONE" is exactly the sort of line that makes a worker distrust the whole
/// figure — and on a cooperative platform, that transparency is not a nicety.
/// It is the product.
///
/// The arithmetic is the server's `computeSplit`, the same function settlement
/// uses. The app does not compute it, because two implementations of a split
/// would eventually disagree and the worker would be the one to find out.
class PayoutBreakdownScreen extends ConsumerWidget {
  const PayoutBreakdownScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preview = ref.watch(payoutPreviewProvider(bookingId));
    final tokens = context.tokens;

    return Scaffold(
      appBar: AppBar(title: const Text('Your pay for this job')),
      body: preview.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Padding(
          padding: const EdgeInsets.all(Space.page),
          child: Text('Could not load the breakdown.\n$error'),
        ),
        data: (split) => ListView(
          padding: const EdgeInsets.all(Space.page),
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(Space.x6),
              decoration: BoxDecoration(color: tokens.successSoft, borderRadius: Radii.rXl),
              child: Column(
                children: [
                  Text('YOU RECEIVE',
                      style: context.text.labelSmall
                          ?.copyWith(color: tokens.textSecondary, letterSpacing: 1.2)),
                  const SizedBox(height: Space.x2),
                  Text(
                    '₹${split.payout.round()}',
                    style: context.text.displayLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: tokens.success,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  Text(
                    '${(split.payout / (split.customerTotal == 0 ? 1 : split.customerTotal) * 100).round()}% of what the customer paid',
                    style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
                  ),
                ],
              ),
            ),
            const SizedBox(height: Space.x6),
            for (final line in split.lines) _Line(line: line),
            const SizedBox(height: Space.x6),
            Container(
              padding: const EdgeInsets.all(Space.x4),
              decoration: BoxDecoration(color: tokens.surfaceAlt, borderRadius: Radii.rLg),
              child: Text(
                // The welfare fund is the reason a cooperative exists rather
                // than a marketplace. Saying so here, next to the deduction, is
                // the difference between a fee and a contribution.
                'The welfare fund pays for insurance, training and support when you cannot work. '
                'It comes out of every job on the platform, including this one.',
                style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.line});
  final PayoutLine line;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    // `payout` and `gross` are totals, not deductions, and read as sums.
    final emphasised = line.key == 'payout' || line.key == 'total';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Space.x2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.label,
                  style: emphasised
                      ? context.text.titleMedium
                      : context.text.bodyLarge,
                ),
                if (line.destination.isNotEmpty)
                  Text(
                    line.destination,
                    style: context.text.bodySmall?.copyWith(color: tokens.textTertiary),
                  ),
              ],
            ),
          ),
          Text(
            '${line.isDeduction ? '− ' : ''}₹${line.amount.abs().round()}',
            style: (emphasised ? context.text.titleMedium : context.text.bodyLarge)?.copyWith(
              fontWeight: emphasised ? FontWeight.w700 : FontWeight.w500,
              color: line.isDeduction ? tokens.textSecondary : tokens.textPrimary,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
