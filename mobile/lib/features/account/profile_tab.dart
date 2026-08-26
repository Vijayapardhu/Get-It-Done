import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../design/design_system.dart';
import '../address/address_screen.dart';
import '../support/support_screens.dart';
import 'invoices_screen.dart';
import 'recurring_plans_screen.dart';
import 'edit_profile_screen.dart';
import 'language_screen.dart';
import 'notification_settings_screen.dart';

/// Profile and settings.
///
/// Grouped by what the user is trying to do, not by which API serves it:
/// their account, their bookings, then the app itself. Every row here goes
/// somewhere — this screen previously had four taps that did nothing.
class ProfileTab extends ConsumerWidget {
  const ProfileTab({super.key, required this.onToggleTheme});

  final VoidCallback onToggleTheme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final user = ref.watch(currentUserProvider);

    void push(Widget screen) => Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => screen),
        );

    return Scaffold(
      // Profile is a pushed route now rather than a tab, so it carries a back
      // affordance. Transparent and titleless: the identity block below is the
      // heading, and an app bar saying "Profile" above a name and a photo is
      // a label on a label.
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.only(top: Space.x4, bottom: Space.x20),
        children: [
          // ── Identity ──────────────────────────────────────────────────
          Padding(
            padding: Space.pageInsets,
            child: Row(
              children: [
                WorkerAvatar(
                  name: user?.name ?? 'You',
                  imageUrl: user?.avatarUrl,
                  size: Sizes.avatarLg,
                ),
                const SizedBox(width: Space.x4),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.name ?? 'You',
                        style: context.text.headlineSmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        user?.phone ?? user?.email ?? '',
                        style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                AppButton.secondary(
                  label: 'Edit',
                  size: AppButtonSize.small,
                  expand: false,
                  onPressed: () => push(const EditProfileScreen()),
                ),
              ],
            ),
          ),

          const SizedBox(height: Space.section),

          _Group(
            title: 'Your bookings',
            rows: [
              _Row(
                icon: AppIcons.location,
                label: 'Saved addresses',
                onTap: () => push(const AddressListScreen()),
              ),
              _Row(
                icon: AppIcons.repeat,
                label: 'Repeat services',
                subtitle: 'Booked automatically for you',
                onTap: () => push(const RecurringPlansScreen()),
              ),
              _Row(
                icon: AppIcons.invoice,
                label: 'Payments and receipts',
                onTap: () => push(const InvoicesScreen()),
              ),
            ],
          ),

          const SizedBox(height: Space.section),

          _Group(
            title: 'App',
            rows: [
              _Row(
                icon: AppIcons.language,
                label: 'Language',
                subtitle: switch (user?.language) {
                  'te' => 'తెలుగు',
                  'hi' => 'हिन्दी',
                  _ => 'English',
                },
                onTap: () => push(const LanguageScreen()),
              ),
              _Row(
                icon: AppIcons.notifications,
                label: 'Notifications',
                onTap: () => push(const NotificationSettingsScreen()),
              ),
              _Row(
                icon: context.isDark ? AppIcons.lightMode : AppIcons.darkMode,
                label: context.isDark ? 'Switch to light theme' : 'Switch to dark theme',
                onTap: onToggleTheme,
                showChevron: false,
              ),
            ],
          ),

          const SizedBox(height: Space.section),

          _Group(
            title: 'Help',
            rows: [
              _Row(
                icon: AppIcons.support,
                label: 'Help and support',
                subtitle: 'Raise an issue with a booking',
                onTap: () => push(const SupportScreen()),
              ),
            ],
          ),

          const SizedBox(height: Space.section),

          // ── The cooperative story, restated where it lands quietly ────
          Padding(
            padding: Space.pageInsets,
            child: AppFeatureBand(
              padding: const EdgeInsets.all(Space.x5),
              child: Row(
                children: [
                  AppIconBadge(AppIcons.cooperative, size: 44),
                  const SizedBox(width: Space.x4),
                  Expanded(
                    child: Text(
                      'Every worker you book is a verified member of a local '
                      'cooperative society.',
                      style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          Padding(
            padding: Space.pageInsets,
            child: AppButton.secondary(
              label: 'Sign out',
              icon: AppIcons.logout,
              onPressed: () => _confirmSignOut(context, ref),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need to sign in again to book a service.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Stay')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text('Sign out', style: TextStyle(color: context.tokens.danger)),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(authControllerProvider.notifier).signOut();
    }
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.title, required this.rows});

  final String title;
  final List<_Row> rows;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Section(
      title: title,
      child: Padding(
        padding: Space.pageInsets,
        child: AppCard(
          elevated: false,
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                rows[i],
                // Inset divider, so the rule starts where the text does rather
                // than cutting across the icon column.
                if (i < rows.length - 1)
                  Padding(
                    padding: const EdgeInsets.only(left: 68),
                    child: Divider(height: 1, color: t.border),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.label,
    required this.onTap,
    this.subtitle,
    this.showChevron = true,
  });

  final List<List<dynamic>> icon;
  final String label;
  final String? subtitle;
  final VoidCallback onTap;
  final bool showChevron;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x3),
        child: Row(
          children: [
            AppIconBadge(icon, size: 40),
            const SizedBox(width: Space.x3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: context.text.titleMedium),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
            if (showChevron)
              AppIcon(AppIcons.chevronRight, size: Sizes.iconSm, color: t.textTertiary),
          ],
        ),
      ),
    );
  }
}
