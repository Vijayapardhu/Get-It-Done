import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';

import '../../core/providers.dart';
import 'training_quiz_screen.dart';

/// List of available training modules with progress.
class TrainingListScreen extends ConsumerWidget {
  const TrainingListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final training = ref.watch(trainingListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Training')),
      body: training.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Could not load training.'),
              const SizedBox(height: Space.x3),
              FilledButton(
                onPressed: () => ref.invalidate(trainingListProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (modules) {
          if (modules.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(Space.x6),
                child: Text(
                  'No training modules available yet.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(trainingListProvider),
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
              itemCount: modules.length,
              itemBuilder: (context, index) => _TrainingCard(module: modules[index]),
            ),
          );
        },
      ),
    );
  }
}

class _TrainingCard extends ConsumerWidget {
  const _TrainingCard({required this.module});
  final Json module;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final id = asString(pick(module, 'id'));
    final title = asString(pick(module, 'title'));
    final description = asStringOrNull(pick(module, 'description')) ?? '';
    final progress = asInt(pick(module, 'progress', aliases: ['completionPercent']), fallback: 0);
    final status = asStringOrNull(pick(module, 'status')) ?? 'not_started';
    final certificateUrl = asStringOrNull(pick(module, 'certificateUrl'));
    final updatedAt = asDateOrNull(pick(module, 'updatedAt'));

    final isCompleted = status == 'completed';
    final isInProgress = status == 'in_progress';

    return Container(
      margin: const EdgeInsets.only(bottom: Space.x3),
      padding: const EdgeInsets.all(Space.x4),
      decoration: BoxDecoration(
        color: tokens.surface,
        borderRadius: Radii.rXl,
        border: Border.all(color: tokens.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: context.text.titleMedium),
                    if (description.isNotEmpty) ...[
                      const SizedBox(height: Space.x1),
                      Text(description, style: context.text.bodySmall?.copyWith(color: tokens.textSecondary)),
                    ],
                  ],
                ),
              ),
              if (isCompleted)
                AppBadge('Completed', tone: BadgeTone.success)
              else if (isInProgress)
                AppBadge('In progress', tone: BadgeTone.primary)
              else
                AppBadge('Not started', tone: BadgeTone.neutral),
            ],
          ),
          const SizedBox(height: Space.x3),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: Radii.rPill,
                  child: LinearProgressIndicator(
                    value: progress / 100,
                    minHeight: 6,
                    backgroundColor: tokens.border,
                    valueColor: AlwaysStoppedAnimation(isCompleted ? tokens.success : tokens.primary),
                  ),
                ),
              ),
              const SizedBox(width: Space.x3),
              Text(
                '$progress%',
                style: context.text.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          if (certificateUrl != null && isCompleted) ...[
            const SizedBox(height: Space.x3),
            TextButton.icon(
              onPressed: () {},
              icon: AppIcon(AppIcons.verified, size: 18),
              label: const Text('View certificate'),
            ),
          ],
          if (updatedAt != null) ...[
            const SizedBox(height: Space.x2),
            Text(
              'Last updated ${_formatDate(updatedAt)}',
              style: context.text.labelSmall?.copyWith(color: tokens.textTertiary),
            ),
          ],
          const SizedBox(height: Space.x3),
          SizedBox(
            width: double.infinity,
            child: isCompleted
                ? OutlinedButton(
                    onPressed: () => _retake(context, id),
                    child: const Text('Retake quiz'),
                  )
                : FilledButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => TrainingQuizScreen(moduleId: id)),
                    ),
                    child: Text(isInProgress ? 'Continue' : 'Start'),
                  ),
          ),
        ],
      ),
    );
  }

  void _retake(BuildContext context, String moduleId) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Retake quiz?'),
        content: const Text('This will reset your progress and you\'ll start from the beginning.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => TrainingQuizScreen(moduleId: moduleId, retake: true)),
              );
            },
            child: const Text('Retake'),
          ),
        ],
      ),
    );
  }

  static String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }
}

/// Training data fetched and cached by Riverpod.
final trainingListProvider = FutureProvider<List<Json>>(
  (ref) => ref.watch(workerApiProvider).trainingModules(),
);