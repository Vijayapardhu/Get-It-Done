import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';

/// The waiting room and verification progress monitor.
///
/// Handles:
///   - Unsubmitted / Draft: Directs to onboarding wizard
///   - Submitted / Under Review: Real-time checklist, ETA banner, pull-to-refresh
///   - Rejected: Highlights exact rejection reason with 1-tap "Fix & Update" button
///   - Verified: Celebratory card with direct "Start Taking Jobs" action to `/today`
class VerificationScreen extends ConsumerWidget {
  const VerificationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final status = ref.watch(verificationStatusProvider);
    final profile = ref.watch(workerProfileProvider).value;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Worker Verification'),
        actions: [
          IconButton(
            tooltip: 'Sign Out',
            onPressed: () => ref.read(authProvider.notifier).signOut(),
            icon: AppIcon(AppIcons.logout, size: 24),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(verificationStatusProvider);
          ref.invalidate(workerProfileProvider);
        },
        child: status.when(
          loading: () => const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: Space.x4),
                Text('Checking verification status…'),
              ],
            ),
          ),
          error: (error, _) => ListView(
            padding: const EdgeInsets.all(Space.page),
            children: [
              Container(
                padding: const EdgeInsets.all(Space.x4),
                decoration: BoxDecoration(color: tokens.dangerSoft, borderRadius: Radii.rMd),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Could not check your status', style: context.text.titleMedium),
                    const SizedBox(height: Space.x2),
                    Text('$error', style: context.text.bodySmall),
                    const SizedBox(height: Space.x3),
                    FilledButton.tonal(
                      onPressed: () => ref.invalidate(verificationStatusProvider),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ],
          ),
          data: (state) {
            // If worker is already verified
            final isVerified = state?.isVerified == true || profile?.isVerified == true;
            if (isVerified) {
              return ListView(
                padding: const EdgeInsets.all(Space.page),
                children: [
                  const SizedBox(height: Space.x4),
                  Center(
                    child: Container(
                      padding: const EdgeInsets.all(Space.x6),
                      decoration: BoxDecoration(
                        color: tokens.success.withValues(alpha: 0.15),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.verified_user, size: 64, color: tokens.success),
                    ),
                  ),
                  const SizedBox(height: Space.x5),
                  Text(
                    'You are Verified!',
                    style: context.text.headlineMedium?.copyWith(fontWeight: FontWeight.w700),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: Space.x2),
                  Text(
                    'Your documents have been approved by the cooperative administrator. You can now toggle online to receive job offers.',
                    style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: Space.x8),
                  SizedBox(
                    height: WorkerSizes.button,
                    child: FilledButton.icon(
                      onPressed: () => context.go('/today'),
                      icon: const Icon(Icons.bolt, size: 20),
                      label: const Text('Start Taking Jobs'),
                    ),
                  ),
                ],
              );
            }

            if (state == null) {
              return ListView(
                padding: const EdgeInsets.all(Space.page),
                children: [
                  const SizedBox(height: Space.x4),
                  Center(
                    child: Container(
                      padding: const EdgeInsets.all(Space.x6),
                      decoration: BoxDecoration(
                        color: tokens.surfaceBlue,
                        shape: BoxShape.circle,
                      ),
                      child: AppIcon(AppIcons.work, size: 56, color: tokens.primary),
                    ),
                  ),
                  const SizedBox(height: Space.x5),
                  Text(
                    'Start Your Onboarding',
                    style: context.text.headlineSmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: Space.x2),
                  Text(
                    'Complete the quick 6-step setup to register your trade skills, travel radius, and identity documents.',
                    style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: Space.x6),
                  SizedBox(
                    height: WorkerSizes.button,
                    child: FilledButton.icon(
                      onPressed: () => context.go('/onboarding'),
                      icon: AppIcon(AppIcons.chevronRight, size: 20),
                      label: const Text('Start Onboarding Wizard'),
                    ),
                  ),
                ],
              );
            }

            final isRejected = state.isRejected;

            return ListView(
              padding: const EdgeInsets.all(Space.page),
              children: [
                Container(
                  padding: const EdgeInsets.all(Space.x5),
                  decoration: BoxDecoration(
                    color: isRejected ? tokens.dangerSoft : tokens.surfaceBlue,
                    borderRadius: Radii.rXl,
                    border: Border.all(
                      color: isRejected ? tokens.danger.withValues(alpha: 0.4) : tokens.primarySoft,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            isRejected ? Icons.warning_amber_rounded : Icons.hourglass_top_rounded,
                            size: 28,
                            color: isRejected ? tokens.danger : tokens.primary,
                          ),
                          const SizedBox(width: Space.x3),
                          Expanded(
                            child: Text(
                              isRejected
                                  ? 'Action Needed: Update Application'
                                  : 'With Cooperative for Review',
                              style: context.text.titleLarge?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: isRejected ? tokens.danger : tokens.primary,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: Space.x3),
                      Text(
                        isRejected
                            ? (state.rejectionReason ?? 'One or more of your documents could not be verified. Please review and re-submit.')
                            : 'Your application is in the verification queue. Cooperative administrators review profiles within 24 hours.',
                        style: context.text.bodyMedium?.copyWith(
                          color: isRejected ? tokens.danger : tokens.textSecondary,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: Space.x6),
                Text('Verification Checklist', style: context.text.titleMedium),
                const SizedBox(height: Space.x3),
                if (state.steps.isNotEmpty)
                  for (final step in state.steps)
                    Container(
                      margin: const EdgeInsets.only(bottom: Space.x3),
                      padding: const EdgeInsets.all(Space.x3),
                      decoration: BoxDecoration(
                        color: tokens.surfaceAlt,
                        borderRadius: Radii.rMd,
                        border: Border.all(color: tokens.border),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            step.done ? Icons.check_circle : Icons.radio_button_unchecked,
                            size: 22,
                            color: step.done ? tokens.success : tokens.textTertiary,
                          ),
                          const SizedBox(width: Space.x3),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  step.label,
                                  style: context.text.titleSmall?.copyWith(
                                    fontWeight: step.done ? FontWeight.w600 : FontWeight.normal,
                                  ),
                                ),
                                if (step.detail != null)
                                  Text(
                                    step.detail!,
                                    style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
                                  ),
                              ],
                            ),
                          ),
                          Text(
                            step.done ? 'Verified' : 'Pending',
                            style: context.text.labelSmall?.copyWith(
                              color: step.done ? tokens.success : tokens.textSecondary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    )
                else ...[
                  _buildCheckItem(context, 'Personal Details Submitted', true),
                  _buildCheckItem(context, 'Trade Skills Selected', true),
                  _buildCheckItem(context, 'Documents Uploaded (Aadhaar/PAN)', true),
                  _buildCheckItem(context, 'Payout Details Configured', true),
                  _buildCheckItem(context, 'Admin Approval', false),
                ],
                const SizedBox(height: Space.x6),
                if (isRejected) ...[
                  SizedBox(
                    height: WorkerSizes.button,
                    child: FilledButton.icon(
                      onPressed: () => context.push('/onboarding'),
                      icon: const Icon(Icons.edit, size: 18),
                      label: const Text('Update & Re-submit Application'),
                    ),
                  ),
                  const SizedBox(height: Space.x3),
                ],
                OutlinedButton.icon(
                  onPressed: () {
                    ref.invalidate(verificationStatusProvider);
                    ref.invalidate(workerProfileProvider);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Checking latest status…')),
                    );
                  },
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Check Status Now'),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildCheckItem(BuildContext context, String title, bool done) {
    final tokens = context.tokens;
    return Container(
      margin: const EdgeInsets.only(bottom: Space.x3),
      padding: const EdgeInsets.all(Space.x3),
      decoration: BoxDecoration(
        color: tokens.surfaceAlt,
        borderRadius: Radii.rMd,
        border: Border.all(color: tokens.border),
      ),
      child: Row(
        children: [
          Icon(
            done ? Icons.check_circle : Icons.hourglass_empty,
            size: 22,
            color: done ? tokens.success : tokens.warning,
          ),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Text(
              title,
              style: context.text.bodyMedium?.copyWith(
                fontWeight: done ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
          ),
          Text(
            done ? 'Completed' : 'Reviewing',
            style: context.text.labelSmall?.copyWith(
              color: done ? tokens.success : tokens.warning,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
