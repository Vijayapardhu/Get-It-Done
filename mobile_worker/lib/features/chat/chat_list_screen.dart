import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';

/// List of chat conversations.
class ChatListScreen extends ConsumerWidget {
  const ChatListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chats = ref.watch(chatsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Chats')),
      body: chats.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Could not load chats.'),
              const SizedBox(height: Space.x3),
              FilledButton(
                onPressed: () => ref.invalidate(chatsProvider),
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
                  'No conversations yet.\n\nYou can message customers about your jobs here.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(chatsProvider),
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
              itemCount: items.length,
              itemBuilder: (context, index) => _ChatCard(chat: items[index]),
            ),
          );
        },
      ),
    );
  }
}

class _ChatCard extends ConsumerWidget {
  const _ChatCard({required this.chat});
  final Json chat;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final chatId = asString(pick(chat, 'id', aliases: ['chatId']));
    final participant = asStringOrNull(pick(chat, 'participantName', aliases: ['customerName', 'name'])) ?? 'Customer';
    final lastMessage = asStringOrNull(pick(chat, 'lastMessage', aliases: ['lastMessageText', 'preview'])) ?? '';
    final unread = asInt(pick(chat, 'unreadCount', aliases: ['unread']), fallback: 0);
    final updatedAt = asDateOrNull(pick(chat, 'updatedAt', aliases: ['lastMessageAt']));

    return Container(
      margin: const EdgeInsets.only(bottom: Space.x2),
      decoration: BoxDecoration(
        color: tokens.surfaceAlt,
        borderRadius: Radii.rLg,
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x1),
        leading: CircleAvatar(
          radius: 20,
          backgroundColor: tokens.primarySoft,
          child: Text(
            participant.isNotEmpty ? participant[0].toUpperCase() : '?',
            style: TextStyle(color: tokens.primary, fontWeight: FontWeight.w700),
          ),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                participant,
                style: context.text.titleSmall?.copyWith(
                  fontWeight: unread > 0 ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ),
            if (updatedAt != null)
              Text(
                _formatDate(updatedAt),
                style: context.text.bodySmall?.copyWith(color: tokens.textTertiary),
              ),
          ],
        ),
        subtitle: Row(
          children: [
            Expanded(
              child: Text(
                lastMessage,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.bodySmall?.copyWith(
                  color: unread > 0 ? tokens.textPrimary : tokens.textTertiary,
                ),
              ),
            ),
            if (unread > 0) ...[
              const SizedBox(width: Space.x2),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: tokens.primary,
                  borderRadius: Radii.rPill,
                ),
                child: Text(
                  '$unread',
                  style: context.text.labelSmall?.copyWith(
                    color: AppColors.n0,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ],
        ),
        onTap: () => context.push('/chat/$chatId'),
      ),
    );
  }

  static String _formatDate(DateTime date) {
    final now = DateTime.now();
    if (date.year == now.year && date.month == now.month && date.day == now.day) {
      return DateFormat('HH:mm').format(date);
    }
    if (date.year == now.year) {
      return DateFormat('d MMM').format(date);
    }
    return DateFormat('d MMM y').format(date);
  }
}
