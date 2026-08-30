import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// Everything about the worker that is not a job or a rupee.
///
/// Behind the header avatar rather than in the bottom bar: three destinations
/// is the right number, and spending a third of the bar on settings is the
/// mistake the customer app documents having already fixed.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(workerProfileProvider).value;
    final stats = ref.watch(statisticsProvider);
    final tokens = context.tokens;

    return Scaffold(
      appBar: AppBar(title: const Text('You')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 34,
                backgroundColor: tokens.primarySoft,
                backgroundImage: profile?.photoUrl == null ? null : NetworkImage(profile!.photoUrl!),
                child: profile?.photoUrl != null
                    ? null
                    : AppIcon(AppIcons.user, size: 34, color: tokens.primary),
              ),
              const SizedBox(width: Space.x4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(profile?.name ?? '', style: context.text.titleLarge),
                    if (profile?.cooperativeName != null)
                      Text(
                        profile!.cooperativeName!,
                        style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
                      ),
                    const SizedBox(height: Space.x2),
                    if (profile != null)
                      Row(
                        children: [
                          AppIcon(
                            profile.isVerified ? AppIcons.verified : AppIcons.info,
                            size: Sizes.iconSm,
                            color: profile.isVerified ? tokens.success : tokens.warning,
                          ),
                          const SizedBox(width: Space.x1),
                          Text(
                            profile.isVerified ? 'Verified' : 'Being verified',
                            style: context.text.bodySmall,
                          ),
                          if (profile.rating > 0) ...[
                            const SizedBox(width: Space.x3),
                            AppIcon(AppIcons.rating, size: Sizes.iconSm, color: tokens.warning),
                            Text(profile.rating.toStringAsFixed(1), style: context.text.bodySmall),
                          ],
                        ],
                      ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: Space.x6),
          stats.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (s) => _Statistics(stats: s),
          ),

          const SizedBox(height: Space.x6),
          _Group(title: 'Your work', items: [
            (AppIcons.user, 'Edit profile', '/profile/edit'),
            (AppIcons.tools, 'Trades you take', '/profile/skills'),
            (AppIcons.location, 'Where you work', '/profile/areas'),
            (AppIcons.time, 'Working hours', '/profile/schedule'),
            (AppIcons.document, 'Documents', '/profile/documents'),
            (AppIcons.wallet, 'Payout account', '/profile/payout-account'),
          ]),
          _Group(title: 'Looking after you', items: [
            (AppIcons.emergency, 'Safety and SOS', '/profile/safety'),
            (AppIcons.shield, 'Welfare passport', '/profile/welfare'),
            (AppIcons.rating, 'Reviews received', '/profile/reviews'),
            (AppIcons.shield, 'Blocked customers', '/profile/blocked'),
            (AppIcons.chat, 'Chats', '/chats'),
            (AppIcons.support, 'Help & support', '/support'),
          ]),
          _Group(title: 'App', items: [
            (AppIcons.settings, 'Settings', '/profile/settings'),
          ]),

          const SizedBox(height: Space.x6),
          OutlinedButton.icon(
            onPressed: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('Sign out?'),
                  // Said because it is the consequence that matters: signing
                  // out is also going off duty, and a worker who does not know
                  // that wonders why the offers stopped.
                  content: const Text('You will go offline and stop receiving job offers.'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Stay')),
                    FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
                  ],
                ),
              );
              if (confirmed == true) await ref.read(authProvider.notifier).signOut();
            },
            icon: AppIcon(AppIcons.logout),
            label: const Text('Sign out'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(WorkerSizes.button),
              foregroundColor: tokens.danger,
            ),
          ),
        ],
      ),
    );
  }
}

/// The figures, with what they mean and over what window.
///
/// Acceptance rate feeds matching, so it must be visible to the worker it is
/// measured on — with the window and the caveat, or it is a number nobody can
/// act on and everybody resents.
class _Statistics extends StatelessWidget {
  const _Statistics({required this.stats});
  final WorkerStatistics stats;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    String pct(double? value) => value == null ? '—' : '${(value * 100).round()}%';

    return Container(
      padding: const EdgeInsets.all(Space.x5),
      decoration: BoxDecoration(color: tokens.surfaceAlt, borderRadius: Radii.rXl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'LAST ${stats.windowDays} DAYS',
            style: context.text.labelSmall?.copyWith(color: tokens.textTertiary, letterSpacing: 1.2),
          ),
          const SizedBox(height: Space.x4),
          Row(
            children: [
              Expanded(child: _Stat(label: 'Jobs done', value: '${stats.completedJobs}')),
              Expanded(child: _Stat(label: 'Finished', value: pct(stats.completionRate))),
              Expanded(child: _Stat(label: 'Accepted', value: pct(stats.acceptanceRate))),
            ],
          ),
          if (stats.medianResponseSeconds != null) ...[
            const SizedBox(height: Space.x3),
            Text(
              'You usually answer an offer in ${stats.medianResponseSeconds} seconds.',
              style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
            ),
          ],
          if (stats.acceptanceRateAffects.isNotEmpty) ...[
            const SizedBox(height: Space.x3),
            Text(
              // The server's own words, shown verbatim rather than paraphrased
              // in the client where they could drift from the truth.
              stats.acceptanceRateAffects,
              style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: context.text.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          Text(label, style: context.text.bodySmall?.copyWith(color: context.tokens.textSecondary)),
        ],
      );
}

class _Group extends StatelessWidget {
  const _Group({required this.title, required this.items});
  final String title;
  final List<(AppIconData, String, String)> items;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: Space.x4, bottom: Space.x2),
          child: Text(
            title.toUpperCase(),
            style: context.text.labelSmall
                ?.copyWith(color: context.tokens.textTertiary, letterSpacing: 1.1),
          ),
        ),
        for (final (icon, label, route) in items)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: AppIcon(icon),
            title: Text(label),
            trailing: AppIcon(AppIcons.chevronRight),
            onTap: () => context.push(route),
          ),
      ],
    );
  }
}
