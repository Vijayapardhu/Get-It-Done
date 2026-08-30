import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:intl/intl.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// Reviews in the customer's own words.
///
/// `GET /workers/me/reviews` — readable by worker id only; this is the `me`
/// alias so the app does not need a second round trip to learn its own id.
class ReviewsScreen extends ConsumerWidget {
  const ReviewsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviews = ref.watch(reviewsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Reviews')),
      body: reviews.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Could not load reviews.'),
              const SizedBox(height: Space.x3),
              FilledButton(
                onPressed: () => ref.invalidate(reviewsProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (items) {
          if (items.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(Space.x6),
                child: Text(
                  'No reviews yet. Complete a job and the customer can leave feedback.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return _ReviewsList(reviews: items);
        },
      ),
    );
  }
}

class _ReviewsList extends StatelessWidget {
  const _ReviewsList({required this.reviews});
  final List<ReviewReceived> reviews;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final avgRating = reviews.isEmpty
        ? 0.0
        : reviews.map((r) => r.rating).reduce((a, b) => a + b) / reviews.length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
      children: [
        // ── Summary ──
        Container(
          padding: const EdgeInsets.all(Space.x5),
          decoration: BoxDecoration(color: tokens.surfaceAlt, borderRadius: Radii.rXl),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AppIcon(AppIcons.rating, size: 32, color: tokens.warning),
              const SizedBox(width: Space.x2),
              Text(
                avgRating.toStringAsFixed(1),
                style: context.text.headlineMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
              Text(
                '  (${reviews.length} review${reviews.length == 1 ? '' : 's'})',
                style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
              ),
            ],
          ),
        ),

        const SizedBox(height: Space.x5),

        // ── Individual reviews ──
        for (final review in reviews)
          _ReviewCard(review: review),
      ],
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review});
  final ReviewReceived review;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      margin: const EdgeInsets.only(bottom: Space.x3),
      padding: const EdgeInsets.all(Space.x4),
      decoration: BoxDecoration(
        color: tokens.surfaceAlt,
        borderRadius: Radii.rLg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Stars
              for (int i = 1; i <= 5; i++)
                AppIcon(
                  AppIcons.rating,
                  size: 18,
                  color: tokens.warning,
                  bold: i <= review.rating,
                ),
              const Spacer(),
              Text(
                DateFormat('d MMM y').format(review.createdAt),
                style: context.text.bodySmall?.copyWith(color: tokens.textTertiary),
              ),
            ],
          ),
          if (review.customerFirstName != null) ...[
            const SizedBox(height: Space.x2),
            Text(
              review.customerFirstName!,
              style: context.text.labelMedium?.copyWith(color: tokens.textSecondary),
            ),
          ],
          const SizedBox(height: Space.x1),
          Text(review.serviceName, style: context.text.bodySmall?.copyWith(color: tokens.textSecondary)),
          if (review.comment != null && review.comment!.isNotEmpty) ...[
            const SizedBox(height: Space.x2),
            Text(review.comment!, style: context.text.bodyMedium),
          ],
        ],
      ),
    );
  }
}
