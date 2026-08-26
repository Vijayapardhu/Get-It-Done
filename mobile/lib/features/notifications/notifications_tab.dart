import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../design/design_system.dart';
import '../account/notification_settings_screen.dart';
import '../../features/chat/chat_screens.dart';

// ── Bookings ──────────────────────────────────────────────────────────────

class NotificationsTab extends ConsumerWidget {
  const NotificationsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsProvider);
    final t = context.tokens;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          AppIconButton(
            icon: AppIcons.settings,
            tooltip: 'Notification settings',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const NotificationSettingsScreen()),
            ),
          ),
          const SizedBox(width: Space.x2),
        ],
      ),
      body: notifications.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: SkeletonCard(hasAvatar: false),
        ),
        error: (_, __) => AppStateView.error(
          message: 'We could not load your notifications.',
          onAction: () => ref.invalidate(notificationsProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const AppStateView.empty(
              title: 'All caught up',
              message: 'Updates about your bookings will appear here.',
              icon: AppIcons.notifications,
            );
          }
          return RefreshIndicator(
            color: t.primary,
            onRefresh: () async {
              ref.invalidate(notificationsProvider);
              await ref.read(notificationsProvider.future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(Space.x5, Space.x5, Space.x5, Space.x20),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: Space.x2),
              itemBuilder: (context, i) {
                final item = list[i];
                return AppCard(
                  elevated: false,
                  background: item.isUnread ? t.primarySoft : null,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AppIconBadge(_iconFor(item.type), size: 40),
                      const SizedBox(width: Space.x3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(item.title, style: context.text.titleMedium),
                                ),
                                if (item.createdAt != null)
                                  Text(
                                    formatMessageTime(item.createdAt!),
                                    style: context.text.labelSmall
                                        ?.copyWith(color: t.textTertiary),
                                  ),
                              ],
                            ),
                            if (item.body != null)
                              Text(
                                item.body!,
                                style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }

  /// Notification types come from the backend as free-form strings; anything
  /// unrecognised falls back to the bell rather than rendering nothing.
  static List<List<dynamic>> _iconFor(String? type) {
    final value = type ?? '';
    if (value.contains('payment') || value.contains('invoice')) return AppIcons.invoice;
    if (value.contains('emergency')) return AppIcons.emergency;
    if (value.contains('chat') || value.contains('message')) return AppIcons.chat;
    if (value.contains('review') || value.contains('rating')) return AppIcons.rating;
    if (value.contains('booking') || value.contains('worker')) return AppIcons.bookings;
    return AppIcons.notifications;
  }
}
