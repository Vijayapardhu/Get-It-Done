import 'dart:io';

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/models/account_models.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import '../../core/ui/service_artwork.dart';

/// Recurring service plans.
///
/// The backend generates bookings from these every 15 minutes via the
/// `recurring.generate` job, so a plan is a standing instruction rather than a
/// list of bookings the user has to create. Pausing stops generation without
/// losing the schedule, which is what people actually want when they travel.
class RecurringPlansScreen extends ConsumerWidget {
  const RecurringPlansScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final plans = ref.watch(recurringPlansProvider);

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Repeat services'),
      ),
      body: plans.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: Column(children: [
            SkeletonCard(lines: 2, hasAvatar: false),
            SizedBox(height: Space.x3),
            SkeletonCard(lines: 2, hasAvatar: false),
          ]),
        ),
        error: (_, __) => AppStateView.error(
          message: 'We could not load your repeat services.',
          onAction: () => ref.invalidate(recurringPlansProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const AppStateView.empty(
              title: 'No repeat services',
              message: 'Set one up from any booking to have it happen automatically — '
                  'weekly cleaning, monthly maintenance.',
              icon: AppIcons.repeat,
            );
          }

          return RefreshIndicator(
            color: t.primary,
            onRefresh: () async {
              ref.invalidate(recurringPlansProvider);
              await ref.read(recurringPlansProvider.future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.all(Space.x5),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: Space.x3),
              itemBuilder: (context, i) => _PlanCard(plan: list[i]),
            ),
          );
        },
      ),
    );
  }
}

class _PlanCard extends ConsumerStatefulWidget {
  const _PlanCard({required this.plan});

  final RecurringPlan plan;

  @override
  ConsumerState<_PlanCard> createState() => _PlanCardState();
}

class _PlanCardState extends ConsumerState<_PlanCard> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, String success) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
      ref.invalidate(recurringPlansProvider);
      messenger.showSnackBar(SnackBar(content: Text(success)));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmCancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this repeat service?'),
        content: const Text(
          'No further bookings will be created. Bookings already scheduled are not affected.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep it')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text('Cancel it', style: TextStyle(color: context.tokens.danger)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    await _run(
      () => ref.read(apiProvider).cancelRecurringPlan(widget.plan.id),
      'Repeat service cancelled',
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final plan = widget.plan;

    return AppCard(
      padding: Space.cardInsetsLarge,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ServiceArtwork.raw(name: plan.serviceName, size: 44),
              const SizedBox(width: Space.x3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(plan.serviceName ?? 'Service', style: context.text.titleMedium),
                    Text(
                      plan.scheduleLabel,
                      style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                    ),
                  ],
                ),
              ),
              AppBadge(
                plan.isActive ? 'Active' : plan.isPaused ? 'Paused' : 'Cancelled',
                tone: plan.isActive
                    ? BadgeTone.success
                    : plan.isPaused
                        ? BadgeTone.warning
                        : BadgeTone.neutral,
                dense: true,
              ),
            ],
          ),

          if (plan.isActive && plan.nextGenerationAt != null) ...[
            const SizedBox(height: Space.x3),
            Row(
              children: [
                AppIcon(AppIcons.time, size: Sizes.iconXs, color: t.textTertiary),
                const SizedBox(width: Space.x2),
                Text(
                  'Next booking ${_relative(plan.nextGenerationAt!)}',
                  style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                ),
              ],
            ),
          ],

          if (plan.status != 'cancelled') ...[
            const SizedBox(height: Space.x4),
            Row(
              children: [
                Expanded(
                  child: plan.isActive
                      ? AppButton(
                          label: 'Pause',
                          variant: AppButtonVariant.soft,
                          size: AppButtonSize.small,
                          loading: _busy,
                          onPressed: _busy
                              ? null
                              : () => _run(
                                    () => ref.read(apiProvider).pauseRecurringPlan(plan.id),
                                    'Paused — no new bookings will be created',
                                  ),
                        )
                      : AppButton(
                          label: 'Resume',
                          variant: AppButtonVariant.soft,
                          size: AppButtonSize.small,
                          loading: _busy,
                          onPressed: _busy
                              ? null
                              : () => _run(
                                    () => ref.read(apiProvider).resumeRecurringPlan(plan.id),
                                    'Resumed',
                                  ),
                        ),
                ),
                const SizedBox(width: Space.x2),
                Expanded(
                  child: AppButton.secondary(
                    label: 'Cancel',
                    size: AppButtonSize.small,
                    onPressed: _busy ? null : _confirmCancel,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  static String _relative(DateTime at) {
    final now = clock.now();
    final target = at.toLocal();
    if (target.isBefore(now)) return 'shortly';

    // Calendar days, not elapsed hours: 47 hours from now is "in 2 days" to a
    // reader looking at a calendar, but only one `inDays` to Duration.
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(target.year, target.month, target.day);
    final days = day.difference(today).inDays;

    if (days == 0) {
      final diff = target.difference(now);
      if (diff.inHours < 1) return 'in ${diff.inMinutes} min';
      return 'today';
    }
    if (days == 1) return 'tomorrow';
    return 'in $days days';
  }
}

/// Invoices and receipts.
///
/// The welfare-fund line is shown on every receipt. Nobody else itemises it,
/// and it is the clearest evidence that a booking funded a worker's insurance
/// rather than only a platform's margin.
class InvoicesScreen extends ConsumerWidget {
  const InvoicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final invoices = ref.watch(invoicesProvider);

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Payments'),
      ),
      body: invoices.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: Column(children: [
            SkeletonCard(lines: 2, hasAvatar: false),
            SizedBox(height: Space.x3),
            SkeletonCard(lines: 2, hasAvatar: false),
          ]),
        ),
        error: (_, __) => AppStateView.error(
          message: 'We could not load your payments.',
          onAction: () => ref.invalidate(invoicesProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const AppStateView.empty(
              title: 'No payments yet',
              message: 'Receipts appear here once a booking is complete and paid.',
              icon: AppIcons.invoice,
            );
          }

          final welfareTotal = list.fold<double>(0, (sum, i) => sum + i.welfareFund);

          return RefreshIndicator(
            color: t.primary,
            onRefresh: () async {
              ref.invalidate(invoicesProvider);
              await ref.read(invoicesProvider.future);
            },
            child: ListView(
              padding: const EdgeInsets.all(Space.x5),
              children: [
                if (welfareTotal > 0) ...[
                  AppFeatureBand(
                    padding: const EdgeInsets.all(Space.x5),
                    child: Row(
                      children: [
                        AppIconBadge(AppIcons.shield, size: 48),
                        const SizedBox(width: Space.x4),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '₹${welfareTotal.toStringAsFixed(0)}',
                                style: context.text.headlineMedium?.copyWith(
                                  fontFeatures: const [FontFeature.tabularFigures()],
                                ),
                              ),
                              Text(
                                'you have contributed to worker welfare',
                                style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: Space.x5),
                ],
                for (final invoice in list) ...[
                  _InvoiceCard(invoice: invoice),
                  const SizedBox(height: Space.x3),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _InvoiceCard extends ConsumerStatefulWidget {
  const _InvoiceCard({required this.invoice});

  final Invoice invoice;

  @override
  ConsumerState<_InvoiceCard> createState() => _InvoiceCardState();
}

class _InvoiceCardState extends ConsumerState<_InvoiceCard> {
  bool _expanded = false;
  bool _downloading = false;

  /// Download the rendered receipt and hand it to the share sheet.
  ///
  /// The PDF route needs the bearer token, so this cannot be a link — the
  /// bytes come through the API client and are written to a temp file the
  /// platform can pass on.
  Future<void> _shareReceipt() async {
    setState(() => _downloading = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final bytes = await ref.read(apiProvider).invoicePdf(widget.invoice.id);
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/${widget.invoice.invoiceNumber}.pdf');
      await file.writeAsBytes(bytes, flush: true);
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf')],
        subject: 'Receipt ${widget.invoice.invoiceNumber}',
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text('We could not save the receipt.')),
      );
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final invoice = widget.invoice;

    return AppCard(
      onTap: () => setState(() => _expanded = !_expanded),
      padding: Space.cardInsetsLarge,
      child: Column(
        children: [
          Row(
            children: [
              AppIconBadge(
                AppIcons.invoice,
                size: 44,
                background: invoice.isPaid ? t.successSoft : t.warningSoft,
                foreground: invoice.isPaid ? t.success : t.warning,
              ),
              const SizedBox(width: Space.x3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      invoice.invoiceNumber,
                      style: context.text.titleMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (invoice.issuedAt != null)
                      Text(
                        _formatDate(invoice.issuedAt!),
                        style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                      ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '₹${invoice.total.toStringAsFixed(2)}',
                    style: context.text.titleMedium?.copyWith(
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  AppBadge(
                    invoice.isPaid ? 'Paid' : 'Due',
                    tone: invoice.isPaid ? BadgeTone.success : BadgeTone.warning,
                    dense: true,
                  ),
                ],
              ),
            ],
          ),

          // The split is collapsed by default — most people want the total.
          // Expanding shows where every rupee went, which is the point.
          AnimatedCrossFade(
            duration: Motion.base,
            crossFadeState: _expanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            firstChild: const SizedBox(width: double.infinity),
            secondChild: Column(
              children: [
                const Divider(height: Space.x6),
                _SplitRow(label: 'Service', amount: invoice.subtotal),
                _SplitRow(label: 'Tax', amount: invoice.tax),
                const SizedBox(height: Space.x3),
                Text(
                  'Where your money goes',
                  style: context.text.labelSmall?.copyWith(color: t.primary),
                ),
                const SizedBox(height: Space.x2),
                _SplitRow(label: 'To the worker', amount: invoice.workerShare, highlight: true),
                _SplitRow(label: 'Cooperative society', amount: invoice.cooperativeShare),
                _SplitRow(
                  label: 'Worker welfare fund',
                  amount: invoice.welfareFund,
                  icon: AppIcons.shield,
                ),
                _SplitRow(label: 'Platform fee', amount: invoice.platformFee),
                const SizedBox(height: Space.x4),
                AppButton.secondary(
                  label: 'Save receipt',
                  icon: AppIcons.download,
                  size: AppButtonSize.small,
                  loading: _downloading,
                  onPressed: _downloading ? null : _shareReceipt,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _formatDate(DateTime at) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final local = at.toLocal();
    return '${local.day} ${months[local.month - 1]} ${local.year}';
  }
}

class _SplitRow extends StatelessWidget {
  const _SplitRow({
    required this.label,
    required this.amount,
    this.highlight = false,
    this.icon,
  });

  final String label;
  final double amount;
  final bool highlight;
  final List<List<dynamic>>? icon;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Space.x1),
      child: Row(
        children: [
          if (icon != null) ...[
            AppIcon(icon!, size: Sizes.iconXs, color: t.success),
            const SizedBox(width: Space.x2),
          ],
          Expanded(
            child: Text(
              label,
              style: context.text.bodySmall?.copyWith(
                color: highlight ? t.textPrimary : t.textSecondary,
                fontWeight: highlight ? FontWeight.w700 : null,
              ),
            ),
          ),
          Text(
            '₹${amount.toStringAsFixed(2)}',
            style: context.text.bodySmall?.copyWith(
              color: highlight ? t.textPrimary : t.textSecondary,
              fontWeight: highlight ? FontWeight.w700 : null,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
