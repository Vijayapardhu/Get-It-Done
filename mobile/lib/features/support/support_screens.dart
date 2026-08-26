import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/account_models.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';

/// Support tickets.
///
/// Open ones first, because a customer opening this screen almost always wants
/// the thing they are already waiting on, not their history.
class SupportScreen extends ConsumerWidget {
  const SupportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final tickets = ref.watch(supportTicketsProvider);

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Help & support'),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: t.primary,
        foregroundColor: t.textOnPrimary,
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => const NewTicketScreen()),
        ),
        icon: AppIcon(AppIcons.add, size: Sizes.iconSm, color: t.textOnPrimary, bold: true),
        label: const Text('New request'),
      ),
      body: tickets.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: Column(children: [
            SkeletonCard(lines: 2, hasAvatar: false),
            SizedBox(height: Space.x3),
            SkeletonCard(lines: 2, hasAvatar: false),
          ]),
        ),
        error: (_, __) => AppStateView.error(
          message: 'We could not load your support requests.',
          onAction: () => ref.invalidate(supportTicketsProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return AppStateView.empty(
              title: 'Nothing open',
              message: 'If something goes wrong with a booking, raise it here and '
                  'your cooperative society will look into it.',
              icon: AppIcons.support,
              actionLabel: 'Raise a request',
              onAction: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const NewTicketScreen()),
              ),
            );
          }

          final open = list.where((t) => t.isOpen).toList();
          final closed = list.where((t) => !t.isOpen).toList();

          return RefreshIndicator(
            color: t.primary,
            onRefresh: () async {
              ref.invalidate(supportTicketsProvider);
              await ref.read(supportTicketsProvider.future);
            },
            child: ListView(
              padding: const EdgeInsets.only(top: Space.x4, bottom: Space.x20),
              children: [
                if (open.isNotEmpty)
                  Section(
                    title: 'Open',
                    child: Padding(
                      padding: Space.pageInsets,
                      child: Column(
                        children: [
                          for (final ticket in open) ...[
                            _TicketCard(ticket: ticket),
                            const SizedBox(height: Space.x3),
                          ],
                        ],
                      ),
                    ),
                  ),
                if (closed.isNotEmpty) ...[
                  const SizedBox(height: Space.section),
                  Section(
                    title: 'Resolved',
                    child: Padding(
                      padding: Space.pageInsets,
                      child: Column(
                        children: [
                          for (final ticket in closed) ...[
                            _TicketCard(ticket: ticket),
                            const SizedBox(height: Space.x3),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.ticket});

  final SupportTicket ticket;

  static (String, BadgeTone) _describe(String status) => switch (status) {
        'open' => ('Open', BadgeTone.warning),
        'in_progress' || 'investigating' => ('Being looked at', BadgeTone.primary),
        'resolved' => ('Resolved', BadgeTone.success),
        'closed' => ('Closed', BadgeTone.neutral),
        'rejected' => ('Declined', BadgeTone.danger),
        _ => (status, BadgeTone.neutral),
      };

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final (label, tone) = _describe(ticket.status);

    return AppCard(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => TicketDetailScreen(ticketId: ticket.id)),
      ),
      padding: Space.cardInsetsLarge,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(ticket.title, style: context.text.titleMedium)),
              const SizedBox(width: Space.x2),
              AppBadge(label, tone: tone, dense: true),
            ],
          ),
          if (ticket.serviceName != null) ...[
            const SizedBox(height: Space.x2),
            Row(
              children: [
                AppIcon(AppIcons.bookings, size: Sizes.iconXs, color: t.textTertiary),
                const SizedBox(width: Space.x1),
                Text(
                  ticket.serviceName!,
                  style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                ),
              ],
            ),
          ],
          if (ticket.createdAt != null) ...[
            const SizedBox(height: Space.x1),
            Text(
              _relative(ticket.createdAt!),
              style: context.text.bodySmall?.copyWith(color: t.textTertiary),
            ),
          ],
        ],
      ),
    );
  }

  static String _relative(DateTime at) {
    final diff = clock.now().difference(at);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays == 1) return 'Yesterday';
    if (diff.inDays < 7) return '${diff.inDays} days ago';
    // Matches the receipts and bookings screens — "14/8/2026" reads as a
    // different app than "14 Aug 2026" three taps away.
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final local = at.toLocal();
    return '${local.day} ${months[local.month - 1]} ${local.year}';
  }
}

/// Raise a ticket.
class NewTicketScreen extends ConsumerStatefulWidget {
  const NewTicketScreen({super.key, this.bookingId});

  /// Pre-links the ticket to a booking when raised from a booking screen.
  final String? bookingId;

  @override
  ConsumerState<NewTicketScreen> createState() => _NewTicketScreenState();
}

class _NewTicketScreenState extends ConsumerState<NewTicketScreen> {
  final _subjectController = TextEditingController();
  final _descriptionController = TextEditingController();

  String _category = 'service_quality';
  bool _busy = false;
  String? _error;

  /// Mirrors the backend's complaint categories.
  static const _categories = <({String value, String label, List<List<dynamic>> icon})>[
    (value: 'service_quality', label: 'Quality of work', icon: AppIcons.thumbsUp),
    (value: 'worker_behaviour', label: 'Worker behaviour', icon: AppIcons.user),
    (value: 'billing', label: 'Billing or payment', icon: AppIcons.wallet),
    (value: 'safety', label: 'Safety concern', icon: AppIcons.shield),
    (value: 'other', label: 'Something else', icon: AppIcons.info),
  ];

  @override
  void dispose() {
    _subjectController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_descriptionController.text.trim().length < 10) {
      setState(() => _error = 'Tell us a little more so we can help.');
      return;
    }

    setState(() { _busy = true; _error = null; });
    final navigator = Navigator.of(context);

    try {
      final ticket = await ref.read(apiProvider).createSupportTicket(
            subject: _subjectController.text.trim(),
            description: _descriptionController.text.trim(),
            category: _category,
            bookingId: widget.bookingId,
          );
      ref.invalidate(supportTicketsProvider);
      // Replace, not push: there is no reason to go back into a form for a
      // ticket that now exists.
      navigator.pushReplacement(
        MaterialPageRoute<void>(builder: (_) => TicketDetailScreen(ticketId: ticket.id)),
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.close,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('New request'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(Space.x5),
        children: [
          Text('What went wrong?', style: context.text.displayMedium),
          const SizedBox(height: Space.x6),

          for (final category in _categories) ...[
            AppSelectableRow(
              title: category.label,
              icon: category.icon,
              selected: _category == category.value,
              onTap: () => setState(() => _category = category.value),
            ),
            const SizedBox(height: Space.x2),
          ],

          const SizedBox(height: Space.x4),
          AppTextField(
            label: 'Summary',
            hint: 'One line, so we can find it quickly',
            controller: _subjectController,
            maxLength: 80,
          ),
          const SizedBox(height: Space.x4),
          AppTextField(
            label: 'What happened?',
            hint: 'Tell us what you expected and what happened instead.',
            controller: _descriptionController,
            maxLines: 5,
            maxLength: 2000,
            onChanged: (_) => setState(() => _error = null),
          ),

          if (_error != null) ...[
            const SizedBox(height: Space.x4),
            AppBanner(message: _error!, tone: StateTone.error),
          ],

          const SizedBox(height: Space.x6),
          AppButton.primary(label: 'Send request', loading: _busy, onPressed: _busy ? null : _submit),
          const SizedBox(height: Space.x3),
          Row(
            children: [
              AppIcon(AppIcons.cooperative, size: Sizes.iconXs, color: t.textTertiary),
              const SizedBox(width: Space.x2),
              Expanded(
                child: Text(
                  'Requests go to the cooperative society that dispatched your worker.',
                  style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A ticket and its conversation.
class TicketDetailScreen extends ConsumerStatefulWidget {
  const TicketDetailScreen({super.key, required this.ticketId});

  final String ticketId;

  @override
  ConsumerState<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends ConsumerState<TicketDetailScreen> {
  final _commentController = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _commentController.text.trim();
    if (text.isEmpty) return;

    setState(() => _sending = true);
    final messenger = ScaffoldMessenger.of(context);

    try {
      await ref.read(apiProvider).addTicketComment(widget.ticketId, text);
      _commentController.clear();
      ref.invalidate(supportTicketProvider(widget.ticketId));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final ticket = ref.watch(supportTicketProvider(widget.ticketId));

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Request'),
      ),
      body: ticket.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: SkeletonCard(lines: 3, hasAvatar: false),
        ),
        error: (_, __) => AppStateView.error(
          message: 'We could not load this request.',
          onAction: () => ref.invalidate(supportTicketProvider(widget.ticketId)),
        ),
        data: (data) => Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(Space.x5),
                children: [
                  Row(
                    children: [
                      AppBadge(
                        _TicketCard._describe(data.status).$1,
                        tone: _TicketCard._describe(data.status).$2,
                      ),
                      if (data.category != null) ...[
                        const SizedBox(width: Space.x2),
                        AppBadge(_categoryLabel(data.category!), dense: true),
                      ],
                    ],
                  ),
                  const SizedBox(height: Space.x4),
                  Text(data.title, style: context.text.headlineSmall),
                  const SizedBox(height: Space.x3),
                  AppCard(
                    elevated: false,
                    child: Text(data.description, style: context.text.bodyMedium),
                  ),

                  if (data.resolution != null) ...[
                    const SizedBox(height: Space.x4),
                    AppCard(
                      background: t.successSoft,
                      border: t.success,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              AppIcon(AppIcons.success, size: Sizes.iconSm, color: t.success, bold: true),
                              const SizedBox(width: Space.x2),
                              Text('Resolution', style: context.text.titleMedium),
                            ],
                          ),
                          const SizedBox(height: Space.x2),
                          Text(data.resolution!, style: context.text.bodyMedium),
                        ],
                      ),
                    ),
                  ],

                  const SizedBox(height: Space.x6),
                  // Internal notes are staff-only and must never surface here.
                  ...() {
                    final visible = data.comments.where((c) => !c.isInternal).toList();
                    if (visible.isEmpty) {
                      return [
                        Text(
                          'No replies yet. Your society usually responds within a day.',
                          style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                        ),
                      ];
                    }
                    return [
                      Text('Conversation', style: context.text.titleMedium),
                      const SizedBox(height: Space.x3),
                      for (final comment in visible) ...[
                        _CommentBubble(comment: comment),
                        const SizedBox(height: Space.x3),
                      ],
                    ];
                  }(),
                ],
              ),
            ),

            if (data.isOpen)
              Container(
                padding: const EdgeInsets.fromLTRB(Space.x5, Space.x3, Space.x5, Space.x5),
                decoration: BoxDecoration(
                  color: t.surface,
                  border: Border(top: BorderSide(color: t.border)),
                ),
                child: SafeArea(
                  top: false,
                  child: Row(
                    children: [
                      Expanded(
                        child: AppTextField(
                          hint: 'Add a reply',
                          controller: _commentController,
                          maxLines: 3,
                          onSubmitted: (_) => _send(),
                        ),
                      ),
                      const SizedBox(width: Space.x2),
                      AppButton(
                        label: 'Send',
                        size: AppButtonSize.medium,
                        expand: false,
                        loading: _sending,
                        onPressed: _sending ? null : _send,
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  static String _categoryLabel(String value) => switch (value) {
        'service_quality' => 'Quality of work',
        'worker_behaviour' => 'Worker behaviour',
        'billing' => 'Billing',
        'safety' => 'Safety',
        _ => 'Other',
      };
}

class _CommentBubble extends StatelessWidget {
  const _CommentBubble({required this.comment});

  final TicketComment comment;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final fromStaff = comment.isFromStaff;

    return Row(
      mainAxisAlignment: fromStaff ? MainAxisAlignment.start : MainAxisAlignment.end,
      children: [
        Flexible(
          child: Container(
            padding: const EdgeInsets.all(Space.x3),
            decoration: BoxDecoration(
              color: fromStaff ? t.surfaceAlt : t.primarySoft,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(Radii.lg),
                topRight: const Radius.circular(Radii.lg),
                // The squared corner points at the sender, so who said what is
                // readable without checking the label.
                bottomLeft: Radius.circular(fromStaff ? Radii.xs : Radii.lg),
                bottomRight: Radius.circular(fromStaff ? Radii.lg : Radii.xs),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (comment.authorName != null)
                  Text(
                    comment.authorName!,
                    style: context.text.labelSmall?.copyWith(
                      color: fromStaff ? t.primary : t.textSecondary,
                      letterSpacing: 0,
                    ),
                  ),
                Text(comment.comment, style: context.text.bodyMedium),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
