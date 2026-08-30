import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:intl/intl.dart';

import 'package:go_router/go_router.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// The cooperative's differentiator — training, insurance, benefits, and
/// eligibility. This is not a settings list; it is a worker's proof that
/// the cooperative is looking after them.
class WelfareScreen extends ConsumerWidget {
  const WelfareScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final welfare = ref.watch(welfareProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Welfare passport')),
      body: welfare.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: _Problem(message: 'Could not load your welfare records.', onRetry: () => ref.invalidate(welfareProvider)),
        ),
        data: (passport) {
          if (passport == null) {
            return const Center(child: Text('No welfare records found.'));
          }
          return _WelfareBody(passport: passport);
        },
      ),
    );
  }
}

class _WelfareBody extends StatelessWidget {
  const _WelfareBody({required this.passport});
  final WelfarePassport passport;

  @override
  Widget build(BuildContext context) {
    final summary = passport.summary;

    return ListView(
      padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
      children: [
        // ── Status cards ──
        if (summary != null) ...[
          _StatusRow(
            insuranceStatus: summary.insuranceStatus,
            trainingStatus: summary.trainingStatus,
          ),
          const SizedBox(height: Space.x5),
        ],

        // ── Training ──
        _Section(title: 'Training', children: [
          Row(
            children: [
              Expanded(
                child: Text('View all training modules', style: context.text.bodyMedium),
              ),
              TextButton(
                onPressed: () => context.push('/training'),
                child: const Text('Browse'),
              ),
            ],
          ),
          const SizedBox(height: Space.x3),
          if (passport.training == null || passport.training!.isEmpty)
            _EmptyCard(message: 'No training records yet.')
          else
            for (final record in passport.training!)
              _TrainingTile(record: record),
        ]),

        const SizedBox(height: Space.x5),

        // ── Insurance ──
        _Section(title: 'Insurance', children: [
          if (passport.insurance == null || passport.insurance!.isEmpty)
            _EmptyCard(message: 'No insurance records yet.')
          else
            for (final record in passport.insurance!)
              _InsuranceTile(record: record),
        ]),

        const SizedBox(height: Space.x5),

        // ── Payout account ──
        _Section(title: 'Payout account', children: [
          if (passport.payoutAccount == null)
            _EmptyCard(message: 'No payout account set up.')
          else
            _PayoutAccountTile(account: passport.payoutAccount!),
        ]),
      ],
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({required this.insuranceStatus, required this.trainingStatus});
  final String insuranceStatus;
  final String trainingStatus;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _StatusChip(label: 'Insurance', status: insuranceStatus)),
        const SizedBox(width: Space.x3),
        Expanded(child: _StatusChip(label: 'Training', status: trainingStatus)),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.status});
  final String label;
  final String status;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final (color, icon) = switch (status) {
      'active' || 'completed' => (tokens.success, AppIcons.success),
      'expired' => (tokens.danger, AppIcons.alertCircle),
      'pending' => (tokens.warning, AppIcons.time),
      _ => (tokens.textTertiary, AppIcons.info),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: Radii.rLg,
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          AppIcon(icon, size: 18, color: color),
          const SizedBox(width: Space.x2),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: context.text.labelSmall?.copyWith(color: tokens.textSecondary)),
                Text(status.toUpperCase(), style: context.text.labelMedium?.copyWith(color: color)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: Space.x2),
          child: Text(
            title.toUpperCase(),
            style: context.text.labelSmall?.copyWith(color: context.tokens.textTertiary, letterSpacing: 1.1),
          ),
        ),
        ...children,
      ],
    );
  }
}

class _TrainingTile extends StatelessWidget {
  const _TrainingTile({required this.record});
  final TrainingRecord record;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final expired = record.expiresOn != null && record.expiresOn!.isBefore(DateTime.now());

    return Container(
      margin: const EdgeInsets.only(bottom: Space.x2),
      padding: const EdgeInsets.all(Space.x4),
      decoration: BoxDecoration(
        color: tokens.surfaceAlt,
        borderRadius: Radii.rLg,
        border: expired ? Border.all(color: tokens.danger.withValues(alpha: 0.3)) : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(record.courseName, style: context.text.titleSmall),
              ),
              _StatusBadge(status: record.status),
            ],
          ),
          if (record.provider != null) ...[
            const SizedBox(height: Space.x1),
            Text(record.provider!, style: context.text.bodySmall?.copyWith(color: tokens.textSecondary)),
          ],
          const SizedBox(height: Space.x2),
          Row(
            children: [
              if (record.completedOn != null)
                Text(
                  'Completed ${DateFormat('d MMM y').format(record.completedOn!)}',
                  style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
                ),
              if (record.expiresOn != null) ...[
                const SizedBox(width: Space.x3),
                Text(
                  'Expires ${DateFormat('d MMM y').format(record.expiresOn!)}',
                  style: context.text.bodySmall?.copyWith(
                    color: expired ? tokens.danger : tokens.textSecondary,
                    fontWeight: expired ? FontWeight.w600 : null,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _InsuranceTile extends StatelessWidget {
  const _InsuranceTile({required this.record});
  final InsuranceRecord record;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final expired = record.expiresOn != null && record.expiresOn!.isBefore(DateTime.now());

    return Container(
      margin: const EdgeInsets.only(bottom: Space.x2),
      padding: const EdgeInsets.all(Space.x4),
      decoration: BoxDecoration(
        color: tokens.surfaceAlt,
        borderRadius: Radii.rLg,
        border: expired ? Border.all(color: tokens.danger.withValues(alpha: 0.3)) : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(record.provider, style: context.text.titleSmall),
              ),
              _StatusBadge(status: record.status),
            ],
          ),
          const SizedBox(height: Space.x1),
          Text(
            '₹${record.coverageAmount.toStringAsFixed(0)} coverage',
            style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
          ),
          if (record.expiresOn != null) ...[
            const SizedBox(height: Space.x2),
            Text(
              'Expires ${DateFormat('d MMM y').format(record.expiresOn!)}',
              style: context.text.bodySmall?.copyWith(
                color: expired ? tokens.danger : tokens.textSecondary,
                fontWeight: expired ? FontWeight.w600 : null,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PayoutAccountTile extends StatelessWidget {
  const _PayoutAccountTile({required this.account});
  final PayoutAccountInfo account;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      padding: const EdgeInsets.all(Space.x4),
      decoration: BoxDecoration(color: tokens.surfaceAlt, borderRadius: Radii.rLg),
      child: Row(
        children: [
          AppIcon(AppIcons.wallet, color: tokens.primary),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(account.provider.toUpperCase(), style: context.text.labelMedium),
                Text(account.accountReference, style: context.text.bodyMedium),
              ],
            ),
          ),
          if (account.verifiedAt != null)
            AppIcon(AppIcons.verified, size: 18, color: tokens.success)
          else
            AppIcon(AppIcons.info, size: 18, color: tokens.warning),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final (color, label) = switch (status) {
      'active' || 'completed' => (tokens.success, status.toUpperCase()),
      'expired' => (tokens.danger, 'EXPIRED'),
      'pending' => (tokens.warning, 'PENDING'),
      'in_progress' => (tokens.primary, 'IN PROGRESS'),
      _ => (tokens.textTertiary, status.toUpperCase()),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Space.x2, vertical: Space.x1),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: Radii.rSm),
      child: Text(label, style: context.text.labelSmall?.copyWith(color: color, fontSize: 10)),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(Space.x5),
      decoration: BoxDecoration(
        color: context.tokens.surfaceAlt,
        borderRadius: Radii.rLg,
      ),
      child: Text(
        message,
        style: context.text.bodyMedium?.copyWith(color: context.tokens.textSecondary),
      ),
    );
  }
}

class _Problem extends StatelessWidget {
  const _Problem({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: Space.x3),
        FilledButton(onPressed: onRetry, child: const Text('Retry')),
      ],
    );
  }
}
