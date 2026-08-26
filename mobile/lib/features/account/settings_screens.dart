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
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  late final TextEditingController _nameController;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: ref.read(currentUserProvider)?.name ?? '');
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.length < 2) {
      setState(() => _error = 'Enter your name.');
      return;
    }

    setState(() { _busy = true; _error = null; });
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    try {
      await ref.read(apiProvider).updateProfile(name: name);
      // Refresh the cached user so every screen showing the name updates.
      await ref.read(authControllerProvider.notifier).refreshUser();
      messenger.showSnackBar(const SnackBar(content: Text('Profile updated')));
      navigator.maybePop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final user = ref.watch(currentUserProvider);

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Edit profile'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(Space.x5),
        children: [
          Center(child: WorkerAvatar(name: user?.name ?? 'You', size: Sizes.avatarXl)),
          const SizedBox(height: Space.x8),

          AppTextField(
            label: 'Your name',
            controller: _nameController,
            prefixIcon: AppIcons.user,
            onChanged: (_) => setState(() => _error = null),
            onSubmitted: (_) => _save(),
          ),

          const SizedBox(height: Space.x5),
          Text('Account', style: context.text.titleMedium),
          const SizedBox(height: Space.x3),
          AppCard(
            elevated: false,
            child: Column(
              children: [
                if (user?.phone != null)
                  _ReadOnlyRow(icon: AppIcons.call, label: 'Phone', value: user!.phone!),
                if (user?.phone != null && user?.email != null) const Divider(height: Space.x5),
                if (user?.email != null)
                  _ReadOnlyRow(icon: AppIcons.message, label: 'Email', value: user!.email!),
              ],
            ),
          ),
          const SizedBox(height: Space.x2),
          Row(
            children: [
              AppIcon(AppIcons.info, size: Sizes.iconXs, color: t.textTertiary),
              const SizedBox(width: Space.x2),
              Expanded(
                child: Text(
                  'Your phone and email identify your account. Contact support to change them.',
                  style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                ),
              ),
            ],
          ),

          if (_error != null) ...[
            const SizedBox(height: Space.x4),
            AppBanner(message: _error!, tone: StateTone.error),
          ],

          const SizedBox(height: Space.x6),
          AppButton.primary(label: 'Save changes', loading: _busy, onPressed: _busy ? null : _save),
        ],
      ),
    );
  }
}

class _ReadOnlyRow extends StatelessWidget {
  const _ReadOnlyRow({required this.icon, required this.label, required this.value});

  final List<List<dynamic>> icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Row(
      children: [
        AppIcon(icon, size: Sizes.iconSm, color: t.textTertiary),
        const SizedBox(width: Space.x3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: context.text.labelMedium?.copyWith(color: t.textTertiary)),
              Text(value, style: context.text.bodyMedium),
            ],
          ),
        ),
        AppIcon(AppIcons.secure, size: Sizes.iconXs, color: t.textTertiary),
      ],
    );
  }
}

/// Language picker.
///
/// Each option is shown in its own script, because someone looking for Telugu
/// is looking for "తెలుగు" and may not read the English label at all. The
/// choice is stored on the user, so it follows them to a new device.
class LanguageScreen extends ConsumerStatefulWidget {
  const LanguageScreen({super.key});

  @override
  ConsumerState<LanguageScreen> createState() => _LanguageScreenState();
}

class _LanguageScreenState extends ConsumerState<LanguageScreen> {
  String? _saving;

  Future<void> _select(AppLanguage language) async {
    final user = ref.read(currentUserProvider);
    if (user?.language == language.code) return;

    setState(() => _saving = language.code);
    final messenger = ScaffoldMessenger.of(context);

    try {
      await ref.read(apiProvider).setPreferredLanguage(language.code);
      // Refreshing the user is what actually re-themes the app: the locale
      // drives the script-aware font swap in AppTypography.
      await ref.read(authControllerProvider.notifier).refreshUser();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final languages = ref.watch(languagesProvider);
    final current = ref.watch(currentUserProvider)?.language ?? 'en';

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Language'),
      ),
      body: languages.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: Column(children: [
            SkeletonCard(lines: 1, hasAvatar: false),
            SizedBox(height: Space.x3),
            SkeletonCard(lines: 1, hasAvatar: false),
          ]),
        ),
        error: (_, __) => AppStateView.error(
          message: 'We could not load the language list.',
          onAction: () => ref.invalidate(languagesProvider),
        ),
        data: (list) => ListView(
          padding: const EdgeInsets.all(Space.x5),
          children: [
            Text(
              'Choose how the app talks to you. Workers still see their own language.',
              style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
            ),
            const SizedBox(height: Space.x5),
            for (final language in list) ...[
              AppSelectableRow(
                title: language.nativeName,
                subtitle: language.nativeName == language.name ? null : language.name,
                icon: AppIcons.language,
                selected: current == language.code,
                onTap: () => _select(language),
                trailing: _saving == language.code
                    ? const SizedBox(
                        width: Sizes.iconSm,
                        height: Sizes.iconSm,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : null,
              ),
              const SizedBox(height: Space.x3),
            ],
          ],
        ),
      ),
    );
  }
}

/// Notification channel settings.
///
/// Saved optimistically: the toggle moves immediately and reverts if the call
/// fails. A switch that waits for a round trip before moving feels broken.
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
