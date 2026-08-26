import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/account_models.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';

/// Edit the profile.
///
/// Only the name is editable. Phone and email are the account identifiers —
/// changing either is an account-recovery operation that needs re-verification,
/// and the backend has no endpoint for it, so they are shown read-only rather
/// than offered as fields that would silently fail.

class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  ConsumerState<NotificationSettingsScreen> createState() => _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState extends ConsumerState<NotificationSettingsScreen> {
  NotificationPreferences? _local;
  bool _saving = false;

  Future<void> _update(NotificationPreferences next) async {
    final previous = _local;
    setState(() { _local = next; _saving = true; });

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(apiProvider).updateNotificationPreferences(next);
    } on ApiException catch (e) {
      // Put the switch back where it was; leaving it flipped would tell the
      // user something is on when it is not.
      if (mounted) setState(() => _local = previous);
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final remote = ref.watch(notificationPreferencesProvider);

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Notifications'),
      ),
      body: remote.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: SkeletonCard(lines: 3, hasAvatar: false),
        ),
        error: (_, __) => AppStateView.error(
          message: 'We could not load your notification settings.',
          onAction: () => ref.invalidate(notificationPreferencesProvider),
        ),
        data: (loaded) {
          final prefs = _local ?? loaded;
          return ListView(
            padding: const EdgeInsets.all(Space.x5),
            children: [
              Text(
                'Choose how we reach you about your bookings.',
                style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
              ),
              const SizedBox(height: Space.x5),

              _ChannelToggle(
                icon: AppIcons.notifications,
                title: 'Push notifications',
                subtitle: 'Worker assigned, on the way, job complete',
                value: prefs.push,
                enabled: !_saving,
                onChanged: (v) => _update(prefs.copyWith(push: v)),
              ),
              const SizedBox(height: Space.x3),
              _ChannelToggle(
                icon: AppIcons.message,
                title: 'SMS',
                subtitle: 'Booking confirmations and verification codes',
                value: prefs.sms,
                enabled: !_saving,
                onChanged: (v) => _update(prefs.copyWith(sms: v)),
              ),
              const SizedBox(height: Space.x3),
              _ChannelToggle(
                icon: AppIcons.invoice,
                title: 'Email',
                subtitle: 'Invoices and receipts',
                value: prefs.email,
                enabled: !_saving,
                onChanged: (v) => _update(prefs.copyWith(email: v)),
              ),
              const SizedBox(height: Space.x3),
              _ChannelToggle(
                icon: AppIcons.home,
                title: 'In-app',
                subtitle: 'Shown in your notifications tab',
                value: prefs.inApp,
                enabled: !_saving,
                onChanged: (v) => _update(prefs.copyWith(inApp: v)),
              ),

              const SizedBox(height: Space.x5),
              const AppBanner(
                message: 'Verification codes are always sent, whatever you choose here — '
                    'they are how a worker proves they are at your door.',
                tone: StateTone.neutral,
                icon: AppIcons.shield,
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ChannelToggle extends StatelessWidget {
  const _ChannelToggle({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
    this.enabled = true,
  });

  final List<List<dynamic>> icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return AppCard(
      elevated: false,
      onTap: enabled ? () => onChanged(!value) : null,
      child: Row(
        children: [
          AppIconBadge(
            icon,
            size: 40,
            background: value ? t.primarySoft : t.surfaceAlt,
            foreground: value ? t.primary : t.textTertiary,
          ),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: context.text.titleMedium),
                Text(subtitle, style: context.text.bodySmall?.copyWith(color: t.textTertiary)),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: enabled ? onChanged : null,
            activeColor: t.textOnPrimary,
            activeTrackColor: t.primary,
          ),
        ],
      ),
    );
  }
}
