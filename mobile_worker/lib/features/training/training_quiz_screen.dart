import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';

import '../../core/providers.dart';
import 'training_list_screen.dart';

/// Quiz screen for a training module.
class TrainingQuizScreen extends ConsumerStatefulWidget {
  const TrainingQuizScreen({super.key, required this.moduleId, this.retake = false});

  final String moduleId;
  final bool retake;

  @override
  ConsumerState<TrainingQuizScreen> createState() => _TrainingQuizScreenState();
}

class _TrainingQuizScreenState extends ConsumerState<TrainingQuizScreen> {
  int _currentQuestion = 0;
  final Map<int, int> _answers = {};
  bool _submitting = false;
  bool _finished = false;
  Json? _result;

  @override
  Widget build(BuildContext context) {
    final quiz = ref.watch(_trainingQuizProvider(widget.moduleId));

    return Scaffold(
      appBar: AppBar(
        title: Text(_finished ? 'Quiz Complete' : 'Quiz'),
      ),
      body: quiz.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Could not load quiz.'),
              const SizedBox(height: Space.x3),
              FilledButton(
                onPressed: () => ref.invalidate(_trainingQuizProvider(widget.moduleId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (quizData) {
          final questions = asJsonList(pick(quizData, 'questions'));
          if (questions.isEmpty) {
            return const Center(child: Text('No questions in this quiz.'));
          }

          if (_finished) {
            return _ResultScreen(
              result: _result!,
              onRetake: () => setState(() {
                _currentQuestion = 0;
                _answers.clear();
                _finished = false;
              }),
            );
          }

          final question = questions[_currentQuestion];
          final questionText = asString(pick(question, 'text'));
          final options = asJsonList(pick(question, 'options', aliases: ['choices']));
          final explanation = asStringOrNull(pick(question, 'explanation'));

          return Column(
            children: [
              _ProgressBar(current: _currentQuestion + 1, total: questions.length),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Question ${_currentQuestion + 1} of ${questions.length}',
                        style: context.text.labelSmall?.copyWith(
                          color: context.tokens.textTertiary,
                        ),
                      ),
                      const SizedBox(height: Space.x2),
                      Text(questionText, style: context.text.titleLarge),
                      if (explanation != null && _answers.containsKey(_currentQuestion)) ...[
                        const SizedBox(height: Space.x4),
                        Container(
                          padding: const EdgeInsets.all(Space.x3),
                          decoration: BoxDecoration(
                            color: context.tokens.surfaceAlt,
                            borderRadius: Radii.rLg,
                          ),
                          child: Text(explanation, style: context.text.bodyMedium),
                        ),
                      ],
                      const SizedBox(height: Space.x4),
                      for (var i = 0; i < options.length; i++)
                        _OptionCard(
                          index: i,
                          option: options[i],
                          selected: _answers[_currentQuestion] == i,
                          onTap: () => _selectOption(i),
                          showResult: _answers.containsKey(_currentQuestion),
                          correctIndex: asInt(pick(question, 'correctIndex')),
                        ),
                    ],
                  ),
                ),
              ),
              SafeArea(
                minimum: const EdgeInsets.all(Space.x4),
                child: _currentQuestion == questions.length - 1
                    ? FilledButton(
                        onPressed: _answers.containsKey(_currentQuestion) && !_submitting
                            ? _submit
                            : null,
                        child: _submitting
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.n0),
                              )
                            : const Text('Submit quiz'),
                      )
                    : FilledButton(
                        onPressed: _answers.containsKey(_currentQuestion) ? _next : null,
                        child: const Text('Next'),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  void _selectOption(int index) {
    if (!_answers.containsKey(_currentQuestion)) {
      setState(() => _answers[_currentQuestion] = index);
    }
  }

  void _next() {
    if (_currentQuestion < 100) {
      setState(() => _currentQuestion++);
    }
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);
    try {
      final answers = _answers.entries
          .map((e) => {'questionId': e.key, 'optionIndex': e.value})
          .toList();

      final result = await ref
          .read(workerApiProvider)
          .submitQuiz(moduleId: widget.moduleId, answers: answers, retake: widget.retake);

      setState(() {
        _result = result;
        _finished = true;
        _submitting = false;
      });
      ref.invalidate(trainingListProvider);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not submit quiz.')),
        );
      }
      setState(() => _submitting = false);
    }
  }
}

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.current, required this.total});
  final int current;
  final int total;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      height: 4,
      margin: const EdgeInsets.symmetric(horizontal: Space.page),
      child: Row(
        children: List.generate(total, (i) {
          final isActive = i < current;
          return Expanded(
            child: Container(
              margin: EdgeInsets.only(right: i == total - 1 ? 0 : 2),
              decoration: BoxDecoration(
                color: isActive ? tokens.primary : tokens.border,
                borderRadius: Radii.rPill,
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _OptionCard extends StatelessWidget {
  const _OptionCard({
    required this.index,
    required this.option,
    required this.selected,
    required this.onTap,
    required this.showResult,
    required this.correctIndex,
  });
  final int index;
  final Json option;
  final bool selected;
  final VoidCallback onTap;
  final bool showResult;
  final int correctIndex;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final text = asString(pick(option, 'text', aliases: ['label']));
    final isCorrect = index == correctIndex;
    final isSelected = selected;

    Color? background;
    Color? border;
    AppIconData? trailingIcon;

    if (showResult) {
      if (isCorrect) {
        background = tokens.successSoft;
        border = tokens.success;
        trailingIcon = AppIcons.success;
      } else if (isSelected) {
        background = tokens.dangerSoft;
        border = tokens.danger;
        trailingIcon = AppIcons.close;
      }
    } else if (isSelected) {
      background = tokens.primarySoft;
      border = tokens.primary;
    }

    return InkWell(
      onTap: showResult ? null : onTap,
      borderRadius: Radii.rLg,
      child: Container(
        margin: const EdgeInsets.only(bottom: Space.x2),
        padding: const EdgeInsets.all(Space.x4),
        decoration: BoxDecoration(
          color: background ?? tokens.surface,
          borderRadius: Radii.rLg,
          border: Border.all(
            color: border ?? tokens.border,
            width: border != null ? 2 : 1,
          ),
        ),
child: Row(
            children: [
              Expanded(child: Text(text, style: context.text.bodyLarge)),
              if (trailingIcon != null)
                AppIcon(trailingIcon, color: border ?? tokens.textSecondary),
            ],
          ),
      ),
    );
  }
}

class _ResultScreen extends StatelessWidget {
  const _ResultScreen({required this.result, required this.onRetake});
  final Json result;
  final VoidCallback onRetake;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final passed = asBool(pick(result, 'passed'));
    final score = asInt(pick(result, 'score', aliases: ['percentage']), fallback: 0);
    final certificateUrl = asStringOrNull(pick(result, 'certificateUrl'));

    return Padding(
      padding: const EdgeInsets.all(Space.x6),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AppIcon(
            passed ? AppIcons.success : AppIcons.close,
            size: 80,
            color: passed ? tokens.success : tokens.danger,
          ),
          const SizedBox(height: Space.x4),
          Text(
            passed ? 'Quiz passed!' : 'Quiz not passed',
            style: context.text.headlineMedium?.copyWith(
              color: passed ? tokens.success : tokens.danger,
            ),
          ),
          const SizedBox(height: Space.x2),
          Text(
            '$score%',
            style: context.text.displayLarge?.copyWith(
              fontWeight: FontWeight.w700,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: Space.x6),
          if (passed && certificateUrl != null) ...[
            Container(
              padding: const EdgeInsets.all(Space.x4),
              decoration: BoxDecoration(
                color: tokens.successSoft,
                borderRadius: Radii.rXl,
              ),
              child: Row(
                children: [
                  AppIcon(AppIcons.verified, color: tokens.success),
                  const SizedBox(width: Space.x3),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Certificate earned', style: context.text.titleMedium),
                        Text(
                          'View it in your Welfare Passport',
                          style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: Space.x4),
          ],
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: onRetake, child: const Text('Retake quiz')),
          ),
          const SizedBox(height: Space.x2),
          OutlinedButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Back to training'),
          ),
        ],
      ),
    );
  }
}

/// Quiz data fetched and cached by Riverpod.
final _trainingQuizProvider = FutureProvider.family<Json, String>(
  (ref, moduleId) => ref.watch(workerApiProvider).trainingQuiz(moduleId),
);