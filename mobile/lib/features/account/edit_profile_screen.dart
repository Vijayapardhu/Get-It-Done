import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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

  final AppIconData icon;
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
