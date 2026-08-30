import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';

import '../../core/providers.dart';

/// A single chat conversation with message bubbles and text input.
class ChatThreadScreen extends ConsumerStatefulWidget {
  const ChatThreadScreen({super.key, required this.chatId});
  final String chatId;

  @override
  ConsumerState<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends ConsumerState<ChatThreadScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    _controller.clear();
    try {
      await ref.read(workerApiProvider).sendChatMessage(widget.chatId, text);
      ref.invalidate(_chatThreadProvider(widget.chatId));
      _scrollToBottom();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not send message.')),
        );
        _controller.text = text;
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final thread = ref.watch(_chatThreadProvider(widget.chatId));

    return Scaffold(
      appBar: AppBar(title: const Text('Chat')),
      body: thread.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Could not load messages.'),
              const SizedBox(height: Space.x3),
              FilledButton(
                onPressed: () => ref.invalidate(_chatThreadProvider(widget.chatId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (chat) {
          final messages = asJsonList(pick(chat, 'messages', aliases: ['thread']));
          if (messages.isEmpty) {
            return const Center(
              child: Text('No messages yet.\nSend the first one below.'),
            );
          }
          WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
          return ListView.builder(
            controller: _scrollController,
            padding: const EdgeInsets.fromLTRB(Space.x4, Space.x4, Space.x4, Space.x8),
            itemCount: messages.length,
            itemBuilder: (context, index) => _MessageBubble(message: messages[index]),
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x2),
          decoration: BoxDecoration(
            color: context.tokens.surface,
            border: Border(top: BorderSide(color: context.tokens.border)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    hintText: 'Type a message…',
                    border: InputBorder.none,
                  ),
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: Space.x2),
              IconButton.filled(
                onPressed: _sending ? null : _send,
                icon: _sending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : AppIcon(AppIcons.send, size: 20),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Thread data fetched and cached by Riverpod.
final _chatThreadProvider = FutureProvider.family<Json, String>(
  (ref, chatId) => ref.watch(workerApiProvider).chatThread(chatId),
);

class _MessageBubble extends ConsumerWidget {
  const _MessageBubble({required this.message});
  final Json message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final text = asString(pick(message, 'text', aliases: ['body', 'content']));
    final isMine = asBool(pick(message, 'isMine', aliases: ['fromWorker']));
    final createdAt = asDateOrNull(pick(message, 'createdAt'));

    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: Space.x2),
        padding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x3),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
        decoration: BoxDecoration(
          color: isMine ? tokens.primary : tokens.surfaceAlt,
          borderRadius: Radii.rLg,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              text,
              style: context.text.bodyMedium?.copyWith(
                color: isMine ? AppColors.n0 : tokens.textPrimary,
              ),
            ),
            if (createdAt != null) ...[
              const SizedBox(height: Space.x1),
              Text(
                _formatTime(createdAt),
                style: context.text.labelSmall?.copyWith(
                  color: isMine ? AppColors.n0.withValues(alpha: 0.7) : tokens.textTertiary,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _formatTime(DateTime date) {
    final h = date.hour.toString().padLeft(2, '0');
    final m = date.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}
