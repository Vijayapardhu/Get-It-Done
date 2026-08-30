import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';

/// Everything the platform has told this worker, durably.
///
/// The socket and the push are delivery; this list is the record. A worker who
/// was in a lift when their payout settled finds it here, which is why the
/// backend writes every notification to a table before it tries to deliver it.
class AlertsScreen extends ConsumerWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alerts = ref.watch(notificationsProvider);
    final tokens = context.tokens;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Alerts'),
        actions: [
          TextButton(
            onPressed: () async {
              await ref.read(sharedApiProvider).markAllNotificationsRead();
              ref.invalidate(notificationsProvider);
            },
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(notificationsProvider),
        child: alerts.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ListView(
            padding: const EdgeInsets.all(Space.page),
            children: [Text('Could not load your alerts.\n$error')],
          ),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                padding: const EdgeInsets.all(Space.page),
                children: [
                  const SizedBox(height: Space.x16),
                  AppIcon(AppIcons.notifications, size: 48, color: tokens.textTertiary),
                  const SizedBox(height: Space.x4),
                  Text('Nothing yet', textAlign: TextAlign.center, style: context.text.titleMedium),
                ],
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(Space.page, Space.x2, Space.page, Space.x12),
              itemCount: list.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final alert = list[i];
                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(vertical: Space.x2),
                  // Unread is a dot, not a bold row. Bolding half a list makes
                  // the list harder to read than either state alone.
                  leading: Container(
                    width: 10,
                    height: 10,
                    margin: const EdgeInsets.only(top: 6),
                    decoration: BoxDecoration(
                      color: alert.isUnread ? tokens.primary : Colors.transparent,
                      shape: BoxShape.circle,
                    ),
                  ),
                  title: Text(alert.title, style: context.text.titleSmall),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(alert.body ?? ''),
                      const SizedBox(height: Space.x1),
                      Text(
                        alert.createdAt == null
                            ? ''
                            : DateFormat('d MMM, h:mm a').format(alert.createdAt!.toLocal()),
                        style: context.text.bodySmall?.copyWith(color: tokens.textTertiary),
                      ),
                    ],
                  ),
                  onTap: !alert.isUnread
                      ? null
                      : () async {
                          await ref.read(sharedApiProvider).markNotificationRead(alert.id);
                          ref.invalidate(notificationsProvider);
                        },
                );
              },
            );
          },
        ),
      ),
    );
  }
}
