import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/providers.dart';

/// Monthly grouped list of invoices (statements). Each can be opened as a PDF.
class StatementsScreen extends ConsumerWidget {
  const StatementsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statements = ref.watch(statementsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Statements')),
      body: statements.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Could not load statements.'),
              const SizedBox(height: Space.x3),
              FilledButton(
                onPressed: () => ref.invalidate(statementsProvider),
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
                  'No statements yet.\n\nYour invoices will appear here once you complete jobs.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          final grouped = _groupByMonth(items);
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(statementsProvider),
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
              itemCount: grouped.length,
              itemBuilder: (context, index) {
                final entry = grouped[index];
                return _MonthGroup(label: entry.label, invoices: entry.invoices);
              },
            ),
          );
        },
      ),
    );
  }

  List<_MonthGroupData> _groupByMonth(List<Json> items) {
    final map = <String, List<Json>>{};
    for (final item in items) {
      final date = asDateOrNull(pick(item, 'createdAt', aliases: ['issuedAt', 'date'])) ?? DateTime.now();
      final key = DateFormat('MMMM yyyy').format(date);
      map.putIfAbsent(key, () => []).add(item);
    }
    return map.entries
        .map((e) => _MonthGroupData(label: e.key, invoices: e.value))
        .toList();
  }
}

class _MonthGroupData {
  const _MonthGroupData({required this.label, required this.invoices});
  final String label;
  final List<Json> invoices;
}

class _MonthGroup extends StatelessWidget {
  const _MonthGroup({required this.label, required this.invoices});
  final String label;
  final List<Json> invoices;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: Space.x4, bottom: Space.x2),
          child: Text(
            label,
            style: context.text.labelSmall?.copyWith(
              color: tokens.textTertiary,
              letterSpacing: 1.2,
            ),
          ),
        ),
        ...invoices.map((inv) => _InvoiceTile(invoice: inv)),
      ],
    );
  }
}

class _InvoiceTile extends ConsumerWidget {
  const _InvoiceTile({required this.invoice});
  final Json invoice;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final amount = asDouble(pick(invoice, 'amount', aliases: ['total', 'totalAmount']));
    final date = asDateOrNull(pick(invoice, 'createdAt', aliases: ['issuedAt', 'date']));
    final pdfUrl = asStringOrNull(pick(invoice, 'pdfUrl', aliases: ['invoiceUrl', 'url']));
    final description = asStringOrNull(pick(invoice, 'description', aliases: ['service', 'label'])) ?? 'Statement';

    return Container(
      margin: const EdgeInsets.only(bottom: Space.x2),
      decoration: BoxDecoration(
        color: tokens.surfaceAlt,
        borderRadius: Radii.rLg,
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x1),
        title: Text(description, style: context.text.titleSmall),
        subtitle: date != null
            ? Text(
                DateFormat('d MMM y').format(date),
                style: context.text.bodySmall?.copyWith(color: tokens.textTertiary),
              )
            : null,
        trailing: Text(
          '₹${amount.round()}',
          style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        onTap: pdfUrl != null && pdfUrl.isNotEmpty
            ? () async {
                final uri = Uri.parse(pdfUrl);
                if (await canLaunchUrl(uri)) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                } else if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Could not open statement.')),
                  );
                }
              }
            : null,
      ),
    );
  }
}
