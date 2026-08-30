import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';

/// Help & Support screen: create tickets and view existing ones.
class SupportScreen extends ConsumerWidget {
  const SupportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tickets = ref.watch(supportTicketsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Help & Support')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, 0),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => _showCreateDialog(context, ref),
                icon: AppIcon(AppIcons.add, size: 20),
                label: const Text('Create ticket'),
              ),
            ),
          ),
          const SizedBox(height: Space.x3),
          Expanded(
            child: tickets.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Could not load tickets.'),
                    const SizedBox(height: Space.x3),
                    FilledButton(
                      onPressed: () => ref.invalidate(supportTicketsProvider),
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
                        'No support tickets.\n\nIf you have an issue, tap the button above to create one.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                }
                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(supportTicketsProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(Space.page, Space.x2, Space.page, Space.x12),
                    itemCount: items.length,
                    itemBuilder: (context, index) => _TicketCard(ticket: items[index]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _showCreateDialog(BuildContext context, WidgetRef ref) {
    String category = 'booking_issue';
    final descriptionController = TextEditingController();

    showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Create support ticket'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                value: category,
                decoration: const InputDecoration(labelText: 'Category'),
                items: const [
                  DropdownMenuItem(value: 'booking_issue', child: Text('Booking issue')),
                  DropdownMenuItem(value: 'payment', child: Text('Payment')),
                  DropdownMenuItem(value: 'safety', child: Text('Safety')),
                  DropdownMenuItem(value: 'other', child: Text('Other')),
                ],
                onChanged: (v) {
                  if (v != null) setDialogState(() => category = v);
                },
              ),
              const SizedBox(height: Space.x3),
              TextField(
                controller: descriptionController,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Description',
                  hintText: 'Describe your issue…',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                final desc = descriptionController.text.trim();
                if (desc.isEmpty) return;
                Navigator.pop(ctx);
                try {
                  await ref.read(workerApiProvider).createSupportTicket(
                        category: category,
                        description: desc,
                      );
                  ref.invalidate(supportTicketsProvider);
                } catch (_) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Could not create ticket.')),
                    );
                  }
                }
              },
              child: const Text('Submit'),
            ),
          ],
        ),
      ),
    );
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.ticket});
  final Json ticket;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final ticketId = asString(pick(ticket, 'id', aliases: ['ticketId']));
    final category = asStringOrNull(pick(ticket, 'category')) ?? 'other';
    final status = asStringOrNull(pick(ticket, 'status')) ?? 'open';
    final createdAt = asDateOrNull(pick(ticket, 'createdAt'));
    final description = asStringOrNull(pick(ticket, 'description', aliases: ['title'])) ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: Space.x2),
      decoration: BoxDecoration(
        color: tokens.surfaceAlt,
        borderRadius: Radii.rLg,
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x1),
        title: Row(
          children: [
            Expanded(
              child: Text(_categoryLabel(category), style: context.text.titleSmall),
            ),
            _StatusBadge(status: status),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (description.isNotEmpty) ...[
              const SizedBox(height: Space.x1),
              Text(
                description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
              ),
            ],
            if (createdAt != null) ...[
              const SizedBox(height: Space.x1),
              Text(
                DateFormat('d MMM y').format(createdAt),
                style: context.text.bodySmall?.copyWith(color: tokens.textTertiary),
              ),
            ],
          ],
        ),
        onTap: () => context.push('/support/$ticketId'),
      ),
    );
  }

  static String _categoryLabel(String category) => switch (category) {
        'booking_issue' => 'Booking issue',
        'payment' => 'Payment',
        'safety' => 'Safety',
        _ => 'Other',
      };
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final (color, label) = switch (status) {
      'open' => (tokens.warning, 'Open'),
      'in_progress' => (tokens.primary, 'In progress'),
      'resolved' => (tokens.success, 'Resolved'),
      'closed' => (tokens.textTertiary, 'Closed'),
      _ => (tokens.textTertiary, status),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: Radii.rPill,
      ),
      child: Text(
        label,
        style: context.text.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}
