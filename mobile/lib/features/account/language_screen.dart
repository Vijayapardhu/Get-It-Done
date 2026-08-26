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
