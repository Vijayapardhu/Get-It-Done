import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:gid_core/gid_core.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';

/// Rate a completed booking.
///
/// A rating here does more than rank a worker: it feeds the fair-match score
/// and the cooperative's own performance reporting. The copy says so, because
/// "rate your experience" gets ignored and "this helps your local society"
/// does not.
///
/// One review per booking is enforced by a unique index server-side, so a
/// duplicate submit comes back 409 rather than stacking — handled explicitly
/// below instead of showing a generic failure.
class ReviewScreen extends ConsumerStatefulWidget {
  const ReviewScreen({super.key, required this.booking});

  final Booking booking;

  @override
  ConsumerState<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends ConsumerState<ReviewScreen> {
  final _feedbackController = TextEditingController();

  int _rating = 0;
  final Set<String> _tags = {};
  bool _submitting = false;
  String? _error;
  bool _done = false;

  @override
  void dispose() {
    _feedbackController.dispose();
    super.dispose();
  }

  /// Quick tags, split by sentiment. Offering "On time" after a one-star
  /// rating is tone-deaf, so the set follows the score.
  List<String> get _availableTags => _rating >= 4
      ? const ['On time', 'Polite', 'Clean work', 'Fair price', 'Well equipped', 'Explained clearly']
      : const ['Arrived late', 'Work unfinished', 'Left a mess', 'Price disputed', 'Unprofessional'];

  Future<void> _submit() async {
    if (_rating == 0) {
      setState(() => _error = 'Choose a rating first.');
      return;
    }

    setState(() { _submitting = true; _error = null; });

    // Tags are folded into the feedback text: the backend's reviews table
    // stores a single `feedback` column, with no separate tag field.
    final parts = [
      if (_tags.isNotEmpty) _tags.join(', '),
      if (_feedbackController.text.trim().isNotEmpty) _feedbackController.text.trim(),
    ];

    try {
      await ref.read(apiProvider).submitReview(
            bookingId: widget.booking.id,
            rating: _rating,
            feedback: parts.isEmpty ? null : parts.join('. '),
          );

      ref.invalidate(dashboardProvider);
      ref.invalidate(bookingsProvider);
      if (mounted) setState(() => _done = true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.isConflict
            ? 'You have already reviewed this booking.'
            : e.message;
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    if (_done) return _ThankYou(onClose: () => Navigator.of(context).maybePop());

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.close,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Rate this service'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Space.x5, Space.x4, Space.x5, Space.x10),
        children: [
          if (widget.booking.workerName != null) ...[
            Row(
              children: [
                WorkerAvatar(name: widget.booking.workerName!, verified: true, size: Sizes.avatarLg),
                const SizedBox(width: Space.x3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.booking.workerName!, style: context.text.titleLarge),
                      Text(
                        widget.booking.serviceName ?? 'Service',
                        style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: Space.x6),
          ],

          Text('How was the work?', style: context.text.displayMedium),
          const SizedBox(height: Space.x6),

          _StarPicker(
            rating: _rating,
            onChanged: (value) => setState(() {
              // Tags belong to the previous sentiment; clear them when the
              // score crosses the boundary.
              if ((value >= 4) != (_rating >= 4)) _tags.clear();
              _rating = value;
              _error = null;
            }),
          ),

          if (_rating > 0) ...[
            const SizedBox(height: Space.x3),
            Center(
              child: Text(
                switch (_rating) {
                  5 => 'Excellent',
                  4 => 'Good',
                  3 => 'Okay',
                  2 => 'Poor',
                  _ => 'Very poor',
                },
                style: context.text.titleLarge?.copyWith(color: t.primary),
              ),
            ),
            const SizedBox(height: Space.x6),
            Text(
              _rating >= 4 ? 'What went well?' : 'What went wrong?',
              style: context.text.titleMedium,
            ),
            const SizedBox(height: Space.x3),
            Wrap(
              spacing: Space.x2,
              runSpacing: Space.x2,
              children: [
                for (final tag in _availableTags)
                  GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() => _tags.contains(tag) ? _tags.remove(tag) : _tags.add(tag));
                    },
                    child: AppBadge(
                      tag,
                      tone: _tags.contains(tag)
                          ? (_rating >= 4 ? BadgeTone.success : BadgeTone.warning)
                          : BadgeTone.neutral,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: Space.x6),
            AppTextField(
              label: 'Anything else?',
              hint: 'Optional',
              controller: _feedbackController,
              maxLines: 4,
              maxLength: 500,
            ),
          ],

          if (_error != null) ...[
            const SizedBox(height: Space.x4),
            AppBanner(message: _error!, tone: StateTone.error),
          ],

          const SizedBox(height: Space.x6),
          AppButton.primary(
            label: 'Submit rating',
            loading: _submitting,
            onPressed: _rating == 0 || _submitting ? null : _submit,
          ),
          const SizedBox(height: Space.x3),
          Row(
            children: [
              AppIcon(AppIcons.cooperative, size: Sizes.iconXs, color: t.textTertiary),
              const SizedBox(width: Space.x2),
              Expanded(
                child: Text(
                  'Ratings feed the fair-match system, so good work leads to more work.',
                  style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StarPicker extends StatelessWidget {
  const _StarPicker({required this.rating, required this.onChanged});

  final int rating;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var star = 1; star <= 5; star++)
          GestureDetector(
            onTap: () {
              HapticFeedback.lightImpact();
              onChanged(star);
            },
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: Space.x2, vertical: Space.x2),
              child: AnimatedScale(
                scale: star <= rating ? 1.1 : 1,
                duration: Motion.fast,
                curve: Motion.curveSpring,
                child: AppIcon(
                  AppIcons.rating,
                  size: 44,
                  color: star <= rating ? AppRatingColors.star : t.borderStrong,
                  bold: star <= rating,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _ThankYou extends StatelessWidget {
  const _ThankYou({required this.onClose});

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Space.x5),
          child: Column(
            children: [
              const Spacer(),
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0.6, end: 1),
                duration: Motion.emphasis,
                curve: Motion.curveSpring,
                builder: (context, scale, child) => Transform.scale(scale: scale, child: child),
                child: AppIconBadge(
                  AppIcons.thumbsUp,
                  size: 96,
                  iconSize: 46,
                  background: t.successSoft,
                  foreground: t.success,
                ),
              ),
              const SizedBox(height: Space.x6),
              Text('Thank you', style: context.text.displayLarge, textAlign: TextAlign.center),
              const SizedBox(height: Space.x2),
              Text(
                'Your rating goes to the worker and their cooperative society.',
                style: context.text.bodyLarge?.copyWith(color: t.textSecondary),
                textAlign: TextAlign.center,
              ),
              const Spacer(),
              AppButton.primary(label: 'Done', onPressed: onClose),
            ],
          ),
        ),
      ),
    );
  }
}
