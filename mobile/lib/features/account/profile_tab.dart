import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/server_config.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import '../address/address_screen.dart';
import '../support/support_screens.dart';
import 'invoices_screen.dart';
import 'recurring_plans_screen.dart';
import 'edit_profile_screen.dart';
import 'language_screen.dart';
import 'developer_screen.dart';
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
    final guest = ref.watch(authControllerProvider).isGuest;

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
                if (guest)
                  AppIconBadge(AppIcons.user, size: Sizes.avatarLg, iconSize: 26)
                else
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
                        guest ? 'Browsing' : (user?.name ?? 'You'),
                        style: context.text.headlineSmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        guest
                            ? 'No account yet'
                            : (user?.phone ?? user?.email ?? ''),
                        style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                if (!guest)
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

          // Everything in this group reads or writes something attached to an
          // account — addresses, standing plans, receipts. For a guest it is
          // replaced by the offer to have one, rather than by three rows that
          // each open a screen with nothing in it.
          if (guest)
            Padding(
              padding: Space.pageInsets,
              child: AppCard(
                elevated: false,
                padding: const EdgeInsets.all(Space.x5),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Create an account', style: context.text.titleMedium),
                    const SizedBox(height: Space.x2),
                    Text(
                      'Keep your addresses, see every booking in one place and '
                      'get receipts. Browsing stays exactly as it is.',
                      style: context.text.bodySmall?.copyWith(
                        color: t.textSecondary,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: Space.x5),
                    AppButton.primary(
                      label: 'Sign in or create an account',
                      onPressed: () =>
                          ref.read(authControllerProvider.notifier).exitGuest(),
                    ),
                  ],
                ),
              ),
            )
          else
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

          if (ref.watch(developerModeProvider)) ...[
            const SizedBox(height: Space.section),
            _Group(
              title: 'Developer',
              rows: [
                _Row(
                  icon: AppIcons.settings,
                  label: 'Server',
                  subtitle: ref.watch(serverUrlProvider),
                  onTap: () => push(const DeveloperScreen()),
                ),
              ],
            ),
          ],

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

          // Nothing to sign out OF as a guest, and the label would be the
          // opposite of what the button does.
          if (!guest)
            Padding(
              padding: Space.pageInsets,
              child: AppButton.secondary(
                label: 'Sign out',
                icon: AppIcons.logout,
                onPressed: () => _confirmSignOut(context, ref),
              ),
            ),

          const SizedBox(height: Space.x5),
          const _VersionLine(),
          const SizedBox(height: Space.x8),
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

  final AppIconData icon;
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

/// The build, and the way in to developer settings.
///
/// Seven taps, which is the gesture Android itself uses for developer options —
/// obscure enough that nobody finds it by accident, familiar enough that anyone
/// who needs it already knows it. Hidden rather than absent because repointing
/// the app at another server is a phishing primitive, not a preference.
class _VersionLine extends ConsumerStatefulWidget {
  const _VersionLine();

  @override
  ConsumerState<_VersionLine> createState() => _VersionLineState();
}

class _VersionLineState extends ConsumerState<_VersionLine> {
  String? _hint;

  void _tap() {
    final tap = ref.read(developerModeProvider.notifier).registerTap();
    final remaining = tap.remaining;

    setState(() {
      // Silent until the last few, so the gesture stays hidden from anyone who
      // taps the line by accident.
      _hint = remaining != null && remaining <= 3
          ? '$remaining more to show developer settings'
          : null;
    });

    // Only on the tap that actually flipped it. Firing whenever developer mode
    // is already on meant the toast came back on every tap afterwards.
    if (tap.justUnlocked && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Developer settings are on.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Center(
      child: GestureDetector(
        onTap: _tap,
        behavior: HitTestBehavior.opaque,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: Space.x2, horizontal: Space.x5),
          child: Column(
            children: [
              Text(
                'GET IT DONE',
                style: context.text.labelSmall?.copyWith(
                  color: t.textTertiary,
                  letterSpacing: 1.2,
                ),
              ),
              if (_hint != null) ...[
                const SizedBox(height: 2),
                Text(
                  _hint!,
                  style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
