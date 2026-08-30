import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';

/// The waiting room, as a checklist rather than a spinner.
///
/// This is the screen that decides whether somebody becomes a worker on this
/// platform or deletes the app. An unverified worker who opens it and sees an
/// empty job feed concludes the app is broken; one who sees exactly what is
/// left, and who is looking at it, waits.
///
/// A rejection shows the reason and the one document to redo -- never a status
/// word with no instruction attached.
class VerificationScreen extends ConsumerWidget {
  const VerificationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final status = ref.watch(verificationStatusProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Getting you verified'),
        actions: [
          IconButton(
            onPressed: () => ref.read(authProvider.notifier).signOut(),
            icon: AppIcon(AppIcons.logout, size: 24),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(verificationStatusProvider),
        child: status.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ListView(
            padding: const EdgeInsets.all(Space.page),
            children: [Text('Could not check your status.\n$error')],
          ),
          data: (state) {
            if (state == null) {
              return ListView(
                padding: const EdgeInsets.all(Space.page),
                children: [
                  Text('You have not started yet', style: context.text.headlineSmall),
                  const SizedBox(height: Space.x4),
                  FilledButton(
                    onPressed: () => context.go('/onboarding'),
                    child: const Text('Start'),
                  ),
                ],
              );
            }

            final remaining = state.steps.where((s) => !s.done).toList();

            return ListView(
              padding: const EdgeInsets.all(Space.page),
              children: [
                Container(
                  padding: const EdgeInsets.all(Space.x5),
                  decoration: BoxDecoration(
                    color: state.isRejected ? tokens.dangerSoft : tokens.surfaceBlue,
                    borderRadius: Radii.rXl,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        state.isRejected
                            ? 'Something needs fixing'
                            : remaining.isEmpty
                                ? 'With the cooperative for checking'
                                : '${remaining.length} things left',
                        style: context.text.titleLarge,
                      ),
                      const SizedBox(height: Space.x2),
                      Text(
                        state.isRejected
                            ? (state.rejectionReason ?? 'One of your documents could not be accepted.')
                            : remaining.isEmpty
                                ? 'Usually done within a day. We will tell you the moment it is.'
                                : 'Finish these and we will send it for checking.',
                        style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: Space.x6),
                for (final step in state.steps)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: AppIcon(
                      step.done ? AppIcons.success : AppIcons.circle,
                      color: step.done ? tokens.success : tokens.textTertiary,
                    ),
                    title: Text(step.label),
                    subtitle: step.detail == null ? null : Text(step.detail!),
                  ),
                const SizedBox(height: Space.x6),
                if (remaining.isNotEmpty || state.isRejected)
                  SizedBox(
                    height: WorkerSizes.button,
                    child: FilledButton(
                      onPressed: () => context.push('/onboarding'),
                      child: const Text('Finish setting up'),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
