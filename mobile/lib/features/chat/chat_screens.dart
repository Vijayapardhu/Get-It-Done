import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/account_models.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';

/// Conversations with the workers assigned to a booking.
///
/// Chats are scoped to a booking on the backend, so this list is short and
/// closes itself as bookings complete — it is not a general messenger.
class ChatListScreen extends ConsumerWidget {
  const ChatListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final chats = ref.watch(chatsProvider);

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Messages'),
      ),
      body: chats.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: Column(children: [
            SkeletonCard(lines: 1),
            SizedBox(height: Space.x3),
            SkeletonCard(lines: 1),
          ]),
        ),
        error: (_, __) => AppStateView.error(
          message: 'We could not load your messages.',
          onAction: () => ref.invalidate(chatsProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const AppStateView.empty(
              title: 'No messages',
              message: 'Once a worker is assigned you can message them here about access, '
                  'parking or anything they should know before arriving.',
              icon: AppIcons.chat,
            );
          }

          return RefreshIndicator(
            color: t.primary,
            onRefresh: () async {
              ref.invalidate(chatsProvider);
              await ref.read(chatsProvider.future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.all(Space.x5),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: Space.x2),
              itemBuilder: (context, i) {
                final chat = list[i];
                return AppCard(
                  elevated: false,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => ChatScreen(chat: chat)),
                  ),
                  child: Row(
                    children: [
                      WorkerAvatar(name: chat.title ?? 'Worker', size: Sizes.avatarMd),
                      const SizedBox(width: Space.x3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              chat.title ?? 'Booking chat',
                              style: context.text.titleMedium,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (chat.lastMessage != null)
                              Text(
                                chat.lastMessage!,
                                style: context.text.bodySmall?.copyWith(
                                  color: chat.unreadCount > 0 ? t.textPrimary : t.textTertiary,
                                  fontWeight: chat.unreadCount > 0 ? FontWeight.w600 : null,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: Space.x2),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          if (chat.lastMessageAt != null)
                            Text(
                              formatMessageTime(chat.lastMessageAt!),
                              style: context.text.labelSmall?.copyWith(color: t.textTertiary),
                            ),
                          if (chat.unreadCount > 0) ...[
                            const SizedBox(height: Space.x1),
                            AppBadge('${chat.unreadCount}', tone: BadgeTone.primary, dense: true),
                          ],
                        ],
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
}

/// A single conversation.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, required this.chat});

  final ChatThread chat;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  bool _sending = false;

  /// Messages sent but not yet acknowledged by the server. They render
  /// immediately at the bottom so typing never feels laggy, and are dropped
  /// once the refetched list contains them.
  final _pending = <ChatMessage>[];

  Timer? _poll;

  @override
  void initState() {
    super.initState();
    // No websocket channel exists for chat on the backend — bookings get
    // socket events, messages do not. A slow poll while the screen is open is
    // honest about that rather than pretending to be realtime.
    _poll = Timer.periodic(const Duration(seconds: 12), (_) {
      if (mounted) ref.invalidate(chatMessagesProvider(widget.chat.id));
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;

    final me = ref.read(currentUserProvider);
    final optimistic = ChatMessage(
      id: 'pending-${DateTime.now().microsecondsSinceEpoch}',
      body: text,
      senderId: me?.id,
      createdAt: DateTime.now(),
    );

    setState(() {
      _sending = true;
      _pending.add(optimistic);
      _controller.clear();
    });
    _scrollToBottom();

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(apiProvider).sendChatMessage(widget.chat.id, text);
      ref.invalidate(chatMessagesProvider(widget.chat.id));
      await ref.read(chatMessagesProvider(widget.chat.id).future);
      if (mounted) setState(() => _pending.remove(optimistic));
    } on ApiException catch (e) {
      // Put the text back in the field rather than losing it — retyping a
      // message you already wrote is the worst possible failure here.
      if (mounted) {
        setState(() {
          _pending.remove(optimistic);
          if (_controller.text.isEmpty) _controller.text = text;
        });
      }
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _sending = false);
      _scrollToBottom();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: Motion.base,
          curve: Motion.curve,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final me = ref.watch(currentUserProvider);
    final messages = ref.watch(chatMessagesProvider(widget.chat.id));

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        titleSpacing: 0,
        title: Row(
          children: [
            WorkerAvatar(name: widget.chat.title ?? 'Worker', size: Sizes.avatarSm),
            const SizedBox(width: Space.x3),
            Expanded(
              child: Text(
                widget.chat.title ?? 'Booking chat',
                style: context.text.titleLarge,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: messages.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => AppStateView.error(
                message: 'We could not load this conversation.',
                onAction: () => ref.invalidate(chatMessagesProvider(widget.chat.id)),
              ),
              data: (list) {
                final all = [...list, ..._pending];
                if (all.isEmpty) {
                  return const AppStateView.empty(
                    title: 'Say hello',
                    message: 'Tell them anything useful — gate code, which floor, '
                        'where to park.',
                    icon: AppIcons.chat,
                  );
                }
                return ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.all(Space.x5),
                  itemCount: all.length,
                  itemBuilder: (context, i) {
                    final message = all[i];
                    final mine = me != null && message.senderId == me.id;
                    // Only date-stamp when the day changes.
                    final previous = i > 0 ? all[i - 1] : null;
                    final showDay = message.createdAt != null &&
                        (previous?.createdAt == null ||
                            !_sameDay(previous!.createdAt!, message.createdAt!));

                    return Column(
                      children: [
                        if (showDay)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: Space.x4),
                            child: Text(
                              formatMessageDay(message.createdAt!),
                              style: context.text.labelSmall?.copyWith(color: t.textTertiary),
                            ),
                          ),
                        _Bubble(
                          message: message,
                          mine: mine,
                          pending: message.id.startsWith('pending-'),
                        ),
                      ],
                    );
                  },
                );
              },
            ),
          ),

          // ── Composer ──────────────────────────────────────────────────
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(Space.x4, Space.x3, Space.x4, Space.x3),
              decoration: BoxDecoration(
                color: t.surface,
                border: Border(top: BorderSide(color: t.border)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      minLines: 1,
                      maxLines: 4,
                      textCapitalization: TextCapitalization.sentences,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      decoration: const InputDecoration(hintText: 'Message'),
                    ),
                  ),
                  const SizedBox(width: Space.x2),
                  AppIconButton(
                    icon: AppIcons.send,
                    tooltip: 'Send',
                    background: t.primary,
                    foreground: t.textOnPrimary,
                    onPressed: _sending ? null : _send,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.mine, required this.pending});

  final ChatMessage message;
  final bool mine;
  final bool pending;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
        margin: const EdgeInsets.only(bottom: Space.x2),
        padding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x3),
        decoration: BoxDecoration(
          color: mine ? t.primary : t.surfaceAlt,
          // The squared corner points at the sender, so the direction of a
          // message reads before the colour does.
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(Radii.lg),
            topRight: const Radius.circular(Radii.lg),
            bottomLeft: Radius.circular(mine ? Radii.lg : Radii.xs),
            bottomRight: Radius.circular(mine ? Radii.xs : Radii.lg),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!mine && message.senderName != null)
              Text(
                message.senderName!,
                style: context.text.labelSmall?.copyWith(color: t.primary),
              ),
            Text(
              message.body,
              style: context.text.bodyMedium?.copyWith(
                color: mine ? t.textOnPrimary : t.textPrimary,
              ),
            ),
            if (message.createdAt != null)
              Padding(
                padding: const EdgeInsets.only(top: Space.x1),
                child: Text(
                  pending ? 'Sending…' : formatMessageTime(message.createdAt!),
                  style: context.text.labelSmall?.copyWith(
                    color: mine ? t.textOnPrimary.withValues(alpha: 0.7) : t.textTertiary,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// 14:05 today, "Yesterday", or 3 Aug.
String formatMessageTime(DateTime at) {
  final local = at.toLocal();
  final now = DateTime.now();
  if (local.year == now.year && local.month == now.month && local.day == now.day) {
    return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }
  final yesterday = now.subtract(const Duration(days: 1));
  if (local.year == yesterday.year &&
      local.month == yesterday.month &&
      local.day == yesterday.day) {
    return 'Yesterday';
  }
  return '${local.day} ${_months[local.month - 1]}';
}

String formatMessageDay(DateTime at) {
  final local = at.toLocal();
  final now = DateTime.now();
  if (local.year == now.year && local.month == now.month && local.day == now.day) {
    return 'Today';
  }
  return '${local.day} ${_months[local.month - 1]} ${local.year}';
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
