import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';

/// Detail view of a support ticket: header, comment thread, add comment, resolve.
class TicketDetailScreen extends ConsumerStatefulWidget {
  const TicketDetailScreen({super.key, required this.ticketId});
  final String ticketId;

  @override
  ConsumerState<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends ConsumerState<TicketDetailScreen> {
  final _commentController = TextEditingController();
  final _scrollController = ScrollController();
  bool _submitting = false;

  @override
  void dispose() {
    _commentController.dispose();
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

  Future<void> _addComment() async {
    final text = _commentController.text.trim();
    if (text.isEmpty || _submitting) return;
    setState(() => _submitting = true);
    _commentController.clear();
    try {
      await ref.read(workerApiProvider).addTicketComment(widget.ticketId, text);
      ref.invalidate(_ticketDetailProvider(widget.ticketId));
      _scrollToBottom();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not add comment.')),
        );
        _commentController.text = text;
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _markResolved() async {
    final resolutionController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Mark as resolved'),
        content: TextField(
          controller: resolutionController,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Resolution note (optional)',
            hintText: 'How was this resolved?',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Resolve')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(workerApiProvider).resolveTicket(widget.ticketId, resolutionController.text.trim());
      ref.invalidate(_ticketDetailProvider(widget.ticketId));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not resolve ticket.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(_ticketDetailProvider(widget.ticketId));

    return Scaffold(
      appBar: AppBar(title: const Text('Ticket')),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Could not load ticket.'),
              const SizedBox(height: Space.x3),
              FilledButton(
                onPressed: () => ref.invalidate(_ticketDetailProvider(widget.ticketId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (ticket) {
          final category = asStringOrNull(pick(ticket, 'category')) ?? 'other';
          final status = asStringOrNull(pick(ticket, 'status')) ?? 'open';
          final createdAt = asDateOrNull(pick(ticket, 'createdAt'));
          final description = asStringOrNull(pick(ticket, 'description', aliases: ['title'])) ?? '';
          final comments = asJsonList(pick(ticket, 'comments', aliases: ['thread', 'messages']));
          final isResolved = status == 'resolved' || status == 'closed';

          return Column(
            children: [
              Expanded(
                child: ListView(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, 0),
                  children: [
                    _TicketHeader(
                      category: category,
                      status: status,
                      createdAt: createdAt,
                      description: description,
                    ),
                    const SizedBox(height: Space.x3),
                    const Divider(),
                    const SizedBox(height: Space.x2),
                    if (comments.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: Space.x6),
                        child: Text(
                          'No comments yet.',
                          textAlign: TextAlign.center,
                          style: context.text.bodyMedium?.copyWith(
                            color: context.tokens.textTertiary,
                          ),
                        ),
                      )
                    else
                      ...comments.map((c) => _CommentTile(comment: c)),
                    const SizedBox(height: Space.x4),
                  ],
                ),
              ),
              if (!isResolved) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x2),
                  decoration: BoxDecoration(
                    color: context.tokens.surface,
                    border: Border(top: BorderSide(color: context.tokens.border)),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _commentController,
                          textCapitalization: TextCapitalization.sentences,
                          decoration: const InputDecoration(
                            hintText: 'Add a comment…',
                            border: InputBorder.none,
                          ),
                          onSubmitted: (_) => _addComment(),
                        ),
                      ),
                      const SizedBox(width: Space.x2),
                      IconButton.filled(
                        onPressed: _submitting ? null : _addComment,
                        icon: _submitting
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
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(Space.page, 0, Space.page, Space.x3),
                    child: SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: _markResolved,
                        child: const Text('Mark resolved'),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

final _ticketDetailProvider = FutureProvider.family<Json, String>(
  (ref, ticketId) => ref.watch(workerApiProvider).ticketDetail(ticketId),
);

class _TicketHeader extends StatelessWidget {
  const _TicketHeader({
    required this.category,
    required this.status,
    required this.createdAt,
    required this.description,
  });

  final String category;
  final String status;
  final DateTime? createdAt;
  final String description;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final (statusColor, statusLabel) = switch (status) {
      'open' => (tokens.warning, 'Open'),
      'in_progress' => (tokens.primary, 'In progress'),
      'resolved' => (tokens.success, 'Resolved'),
      'closed' => (tokens.textTertiary, 'Closed'),
      _ => (tokens.textTertiary, status),
    };
    final categoryLabel = switch (category) {
      'booking_issue' => 'Booking issue',
      'payment' => 'Payment',
      'safety' => 'Safety',
      _ => 'Other',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(categoryLabel, style: context.text.titleLarge),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.15),
                borderRadius: Radii.rPill,
              ),
              child: Text(
                statusLabel,
                style: context.text.labelSmall?.copyWith(
                  color: statusColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        if (createdAt != null) ...[
          const SizedBox(height: Space.x1),
          Text(
            DateFormat('d MMM y').format(createdAt!),
            style: context.text.bodySmall?.copyWith(color: tokens.textTertiary),
          ),
        ],
        if (description.isNotEmpty) ...[
          const SizedBox(height: Space.x3),
          Text(description, style: context.text.bodyMedium),
        ],
      ],
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({required this.comment});
  final Json comment;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final text = asString(pick(comment, 'text', aliases: ['body', 'content']));
    final author = asStringOrNull(pick(comment, 'authorName', aliases: ['author', 'sender'])) ?? 'Support';
    final isWorker = asBool(pick(comment, 'isWorker', aliases: ['fromWorker']));
    final createdAt = asDateOrNull(pick(comment, 'createdAt'));

    return Container(
      margin: const EdgeInsets.only(bottom: Space.x3),
      padding: const EdgeInsets.all(Space.x3),
      decoration: BoxDecoration(
        color: isWorker ? tokens.primarySoft.withValues(alpha: 0.3) : tokens.surfaceAlt,
        borderRadius: Radii.rLg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                author,
                style: context.text.labelMedium?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(width: Space.x2),
              if (createdAt != null)
                Text(
                  DateFormat('d MMM y, HH:mm').format(createdAt),
                  style: context.text.labelSmall?.copyWith(color: tokens.textTertiary),
                ),
            ],
          ),
          const SizedBox(height: Space.x1),
          Text(text, style: context.text.bodyMedium),
        ],
      ),
    );
  }
}
