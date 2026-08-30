import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:intl/intl.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// Manage blocked customers — those you never want to be offered again.
///
/// §4.11 of the plan: "never being offered a customer they filed a safety
/// incident about." The block is per-worker and prevents matching.
class BlockedCustomersScreen extends ConsumerWidget {
  const BlockedCustomersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final blocked = ref.watch(blockedCustomersProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Blocked customers'),
        actions: [
          IconButton(
            onPressed: () => _showBlockDialog(context, ref),
            icon: AppIcon(AppIcons.user, size: 24),
            tooltip: 'Block a customer',
          ),
        ],
      ),
      body: blocked.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Could not load blocked customers.'),
              const SizedBox(height: Space.x3),
              FilledButton(
                onPressed: () => ref.invalidate(blockedCustomersProvider),
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
                  'No blocked customers.\n\nWhen you block a customer, you will never be offered their jobs again.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return _BlockedList(items: items);
        },
      ),
    );
  }

  void _showBlockDialog(BuildContext context, WidgetRef ref) {
    final controller = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Block a customer'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            labelText: 'Customer ID',
            hintText: 'Paste the customer\'s ID',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () async {
              final id = controller.text.trim();
              if (id.isEmpty) return;
              Navigator.pop(ctx);
              try {
                await ref.read(workerApiProvider).blockCustomer(id);
                ref.invalidate(blockedCustomersProvider);
              } catch (_) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Could not block customer.')),
                  );
                }
              }
            },
            child: const Text('Block'),
          ),
        ],
      ),
    );
  }
}

class _BlockedList extends StatelessWidget {
  const _BlockedList({required this.items});
  final List<BlockedCustomer> items;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
      itemCount: items.length,
      itemBuilder: (context, index) => _BlockedTile(item: items[index]),
    );
  }
}

class _BlockedTile extends ConsumerWidget {
  const _BlockedTile({required this.item});
  final BlockedCustomer item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    return Container(
      margin: const EdgeInsets.only(bottom: Space.x2),
      padding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x3),
      decoration: BoxDecoration(
        color: tokens.surfaceAlt,
        borderRadius: Radii.rLg,
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: tokens.dangerSoft,
            child: Text(
              item.name.isNotEmpty ? item.name[0].toUpperCase() : '?',
              style: TextStyle(color: tokens.danger),
            ),
          ),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name, style: context.text.titleSmall),
                if (item.reason != null && item.reason!.isNotEmpty)
                  Text(
                    item.reason!,
                    style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
                  ),
                Text(
                  'Blocked ${DateFormat('d MMM y').format(item.createdAt)}',
                  style: context.text.bodySmall?.copyWith(color: tokens.textTertiary),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('Unblock?'),
                  content: Text('You may be offered jobs from ${item.name} again.'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep blocked')),
                    FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Unblock')),
                  ],
                ),
              );
              if (confirmed == true) {
                try {
                  await ref.read(workerApiProvider).unblockCustomer(item.customerId);
                  ref.invalidate(blockedCustomersProvider);
                } catch (_) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Could not unblock customer.')),
                    );
                  }
                }
              }
            },
            icon: AppIcon(AppIcons.shield, color: tokens.danger),
            tooltip: 'Unblock',
          ),
        ],
      ),
    );
  }
}
