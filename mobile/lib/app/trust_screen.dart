import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:gid_core/gid_core.dart';
import '../core/providers.dart';
import '../design/design_system.dart';

/// The Cooperative Trust Profile.
///
/// This is the screen that separates GET IT DONE from an aggregator, so it is
/// laid out as a profile rather than a data table: who this person is, which
/// society vouches for them, what is verified, and what their record looks
/// like. No document URLs, no identity numbers — only the signals a customer
/// needs to decide.
class TrustScreen extends ConsumerWidget {
  const TrustScreen({super.key, required this.workerId});

  final String workerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final graph = ref.watch(trustGraphProvider(workerId));

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: graph.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: Column(children: [SkeletonCard(), SizedBox(height: Space.x3), SkeletonCard(hasAvatar: false)]),
        ),
        error: (_, __) => AppStateView.error(
          message: 'We could not load this profile.',
          onAction: () => ref.invalidate(trustGraphProvider(workerId)),
        ),
        data: (trust) => _TrustBody(trust: trust),
      ),
    );
  }
}

class _TrustBody extends StatelessWidget {
  const _TrustBody({required this.trust});

  final TrustGraph trust;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return ListView(
      padding: const EdgeInsets.only(bottom: Space.x20),
      children: [
        // Identity, centred — a profile, not a row in a list.
        Padding(
          padding: Space.pageInsets,
          child: Column(
            children: [
              WorkerAvatar(
                name: trust.name,
                imageUrl: trust.avatarUrl,
                verified: trust.isVerified,
                size: Sizes.avatarXl,
              ),
              const SizedBox(height: Space.x4),
              Text(trust.name, style: context.text.displayMedium, textAlign: TextAlign.center),
              const SizedBox(height: Space.x2),
              if (trust.rating != null)
                RatingPill(rating: trust.rating!, reviewCount: trust.reviewCount),
              const SizedBox(height: Space.x3),
              if (trust.isVerified) const VerifiedBadge(label: 'Verified worker'),
              if (trust.cooperativeName != null) ...[
                const SizedBox(height: Space.x3),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    AppIcon(AppIcons.cooperative, size: Sizes.iconSm, color: t.textSecondary),
                    const SizedBox(width: Space.x2),
                    Flexible(
                      child: Text(
                        trust.cooperativeName!,
                        style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),

        const SizedBox(height: Space.section),

        // Record. Three numbers, no chrome.
        Padding(
          padding: Space.pageInsets,
          child: Row(
            children: [
              _Stat(value: '${trust.completedJobs ?? 0}', label: 'Jobs done'),
              _StatDivider(),
              _Stat(
                value: trust.completionRate == null
                    ? '—'
                    : '${trust.completionRate!.toStringAsFixed(0)}%',
                label: 'Completed',
              ),
              _StatDivider(),
              _Stat(
                value: trust.experienceYears == null ? '—' : '${trust.experienceYears}y',
                label: 'Experience',
              ),
            ],
          ),
        ),

        const SizedBox(height: Space.section),

        if (trust.skills.isNotEmpty) ...[
          Section(
            title: 'Skills',
            child: Padding(
              padding: Space.pageInsets,
              child: Wrap(
                spacing: Space.x2,
                runSpacing: Space.x2,
                children: [for (final skill in trust.skills) AppBadge(skill)],
              ),
            ),
          ),
          const SizedBox(height: Space.section),
        ],

        // Verification, shown in full — including what is NOT verified.
        // Publishing the gaps is what makes the ticks credible.
        Section(
          title: 'Verification',
          subtitle: 'Checked and recorded by the cooperative society.',
          child: Padding(
            padding: Space.pageInsets,
            child: AppCard(
              padding: Space.cardInsetsLarge,
              child: Column(
                children: [
                  TrustRow(
                    label: 'Identity verified',
                    verified: trust.hasBadge('identity_verified'),
                    detail: trust.isVerified ? 'Approved by the society' : 'Pending review',
                  ),
                  TrustRow(
                    label: 'Society member',
                    verified: trust.hasBadge('society_member'),
                    detail: trust.cooperativeName,
                    icon: AppIcons.cooperative,
                  ),
                  TrustRow(
                    label: 'Skills certified',
                    verified: trust.hasBadge('certified_skills'),
                    detail: trust.activeCertifications > 0
                        ? '${trust.activeCertifications} active certification'
                            '${trust.activeCertifications == 1 ? '' : 's'}'
                        : 'No active certifications',
                    icon: AppIcons.certificate,
                  ),
                  TrustRow(
                    label: 'Insured',
                    verified: trust.hasBadge('insured'),
                    detail: trust.activeInsurancePolicies > 0
                        ? 'Cover active'
                        : 'No active policy',
                    icon: AppIcons.shield,
                  ),
                  TrustRow(
                    label: 'Safety trained',
                    verified: trust.hasBadge('trained'),
                    detail: trust.completedTrainings > 0
                        ? '${trust.completedTrainings} programme'
                            '${trust.completedTrainings == 1 ? '' : 's'} completed'
                        : 'Not yet completed',
                    icon: AppIcons.idea,
                  ),
                ],
              ),
            ),
          ),
        ),

        const SizedBox(height: Space.section),

        // A clean record is worth stating positively; an incident count is
        // shown plainly rather than hidden.
        Padding(
          padding: Space.pageInsets,
          child: AppFeatureBand(
            background: trust.incidentsLast12Months == 0 ? t.successSoft : t.warningSoft,
            padding: const EdgeInsets.all(Space.x5),
            child: Row(
              children: [
                AppIconBadge(
                  trust.incidentsLast12Months == 0 ? AppIcons.shield : AppIcons.alertCircle,
                  size: 48,
                  background: Colors.white.withValues(alpha: 0.6),
                  foreground: trust.incidentsLast12Months == 0 ? t.success : t.warning,
                ),
                const SizedBox(width: Space.x4),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        trust.incidentsLast12Months == 0
                            ? 'Clean safety record'
                            : '${trust.incidentsLast12Months} recorded incident'
                                '${trust.incidentsLast12Months == 1 ? '' : 's'}',
                        style: context.text.titleLarge?.copyWith(color: AppColors.blue900),
                      ),
                      Text(
                        'In the last 12 months',
                        style: context.text.bodySmall?.copyWith(color: AppColors.n600),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: context.text.headlineMedium?.copyWith(
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: Space.x1),
          Text(label, style: context.text.bodySmall?.copyWith(color: t.textTertiary)),
        ],
      ),
    );
  }
}

class _StatDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 36,
      color: context.tokens.border,
    );
  }
}
