import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/cart/cart.dart';
import '../../core/models/models.dart';
import '../../core/providers.dart';
import '../../core/ui/service_artwork.dart';
import '../../design/design_system.dart';

/// A service's own page.
///
/// The job of this screen is to answer the questions that make someone
/// hesitate, in the order they occur: what is this, what does it cost, what
/// exactly do I get, what do I NOT get, what will happen when someone arrives,
/// and the specific worry that is not covered by any of that.
///
/// "Does not include" is given the same weight as "includes" rather than being
/// buried. A customer who discovers on the doorstep that something was never
/// part of the job is a dispute, a refund and a bad review; saying so here
/// costs a paragraph.
class ServiceDetailScreen extends ConsumerWidget {
  const ServiceDetailScreen({super.key, required this.service});

  /// The catalogue's copy, so the page has a name, a price and a picture to
  /// render immediately rather than a spinner while the detail loads.
  final Service service;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(serviceDetailProvider(service.id));

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          _Hero(service: service),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Space.x5, Space.x5, Space.x5, 0),
              child: _Headline(service: service),
            ),
          ),

          detail.when(
            loading: () => const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(Space.x5),
                child: SkeletonCard(hasAvatar: false, lines: 4),
              ),
            ),
            error: (error, _) => SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(Space.x5),
                child: AppBanner(
                  message: 'Could not load the full details.',
                  tone: StateTone.error,
                  actionLabel: 'Retry',
                  onAction: () => ref.invalidate(serviceDetailProvider(service.id)),
                ),
              ),
            ),
            data: (data) => SliverToBoxAdapter(child: _Body(detail: data)),
          ),

          const SliverToBoxAdapter(child: SizedBox(height: Space.x16)),
        ],
      ),
      bottomNavigationBar: _AddBar(service: service),
    );
  }
}

/// Full-bleed artwork with the back button floating on it.
class _Hero extends StatelessWidget {
  const _Hero({required this.service});

  final Service service;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return SliverAppBar(
      expandedHeight: 280,
      pinned: true,
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      leading: const Padding(
        padding: EdgeInsets.all(Space.x2),
        child: _CircleButton(icon: AppIcons.chevronLeft),
      ),
      flexibleSpace: FlexibleSpaceBar(
        background: ServiceArtwork(
          service: service,
          size: double.infinity,
          radius: BorderRadius.zero,
          // Full bleed: this is the page's photograph, not a tile.
          padding: EdgeInsets.zero,
          // The one place motion is right. A single large illustration at the
          // top of a page the user chose to open is not the battery drain that
          // a grid of them would be.
          animate: true,
        ),
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({required this.icon});

  final AppIconData icon;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.of(context).maybePop(),
      behavior: HitTestBehavior.opaque,
      child: Container(
        decoration: BoxDecoration(
          // Scrim rather than a themed surface: it sits on artwork whose
          // colour we do not control, and a white circle disappears against a
          // pale illustration.
          color: Colors.black.withValues(alpha: 0.45),
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: AppIcon(icon, size: Sizes.iconMd, color: Colors.white, bold: true),
      ),
    );
  }
}

class _Headline extends StatelessWidget {
  const _Headline({required this.service});

  final Service service;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(service.name, style: context.text.headlineMedium),
        const SizedBox(height: Space.x2),
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(
              formatRupees(service.basePrice),
              style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            if (service.hasDiscount) ...[
              const SizedBox(width: Space.x2),
              Text(
                formatRupees(service.listPrice!),
                style: context.text.bodyMedium?.copyWith(
                  color: t.textTertiary,
                  decoration: TextDecoration.lineThrough,
                  decorationColor: t.textTertiary,
                ),
              ),
            ],
            const SizedBox(width: Space.x2),
            Text(
              'starting',
              style: context.text.bodySmall?.copyWith(color: t.textTertiary),
            ),
          ],
        ),
        if (service.rating != null) ...[
          const SizedBox(height: Space.x3),
          Row(
            children: [
              AppIcon(AppIcons.rating, size: 16, color: t.warning, bold: true),
              const SizedBox(width: Space.x2),
              Text(
                service.rating!.toStringAsFixed(1),
                style: context.text.titleSmall,
              ),
              const SizedBox(width: Space.x1),
              Text(
                '(${service.reviewCount ?? 0} ratings)',
                style: context.text.bodySmall?.copyWith(color: t.textSecondary),
              ),
            ],
          ),
        ],
        if (service.description != null) ...[
          const SizedBox(height: Space.x4),
          Text(
            service.description!,
            style: context.text.bodyMedium?.copyWith(color: t.textSecondary, height: 1.55),
          ),
        ],
      ],
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.detail});

  final ServiceDetail detail;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    if (!detail.hasContent) {
      // Nothing written for this service yet. Say so plainly rather than
      // rendering four empty headings.
      return Padding(
        padding: const EdgeInsets.all(Space.x5),
        child: AppBanner(
          message: 'Full details for this service are still being written. '
              'The worker will confirm exactly what is covered before starting.',
          tone: StateTone.neutral,
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (detail.includes.isNotEmpty)
          _TickList(
            title: "What's included",
            items: detail.includes,
            icon: AppIcons.verified,
            tint: t.success,
          ),
        if (detail.excludes.isNotEmpty)
          _TickList(
            title: 'Not included',
            items: detail.excludes,
            icon: AppIcons.close,
            tint: t.danger,
          ),
        if (detail.steps.isNotEmpty) _Steps(steps: detail.steps),
        if (detail.faqs.isNotEmpty) _Faqs(faqs: detail.faqs),
      ],
    );
  }
}

class _TickList extends StatelessWidget {
  const _TickList({
    required this.title,
    required this.items,
    required this.icon,
    required this.tint,
  });

  final String title;
  final List<String> items;
  final AppIconData icon;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.x5, Space.x6, Space.x5, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: context.text.titleLarge),
          const SizedBox(height: Space.x4),
          for (final item in items)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.x3),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 22,
                    height: 22,
                    decoration: BoxDecoration(color: tint, shape: BoxShape.circle),
                    alignment: Alignment.center,
                    child: AppIcon(icon, size: 12, color: Colors.white, bold: true),
                  ),
                  const SizedBox(width: Space.x3),
                  Expanded(
                    child: Text(
                      item,
                      style: context.text.bodyMedium?.copyWith(height: 1.5),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Steps extends StatelessWidget {
  const _Steps({required this.steps});

  final List<ServiceStep> steps;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.x5, Space.x6, Space.x5, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('How it works', style: context.text.titleLarge),
          const SizedBox(height: Space.x4),
          for (var i = 0; i < steps.length; i++)
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // A numbered marker with a rule running to the next one, so
                  // the four steps read as a sequence rather than a list.
                  Column(
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: t.primarySoft,
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          '${i + 1}',
                          style: context.text.labelMedium?.copyWith(
                            color: t.primary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      if (i != steps.length - 1)
                        Expanded(child: Container(width: 2, color: t.border)),
                    ],
                  ),
                  const SizedBox(width: Space.x4),
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(
                        bottom: i == steps.length - 1 ? 0 : Space.x5,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(steps[i].title, style: context.text.titleSmall),
                          if (steps[i].description.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              steps[i].description,
                              style: context.text.bodySmall?.copyWith(
                                color: t.textSecondary,
                                height: 1.5,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Faqs extends StatelessWidget {
  const _Faqs({required this.faqs});

  final List<ServiceFaq> faqs;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.x5, Space.x6, Space.x5, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Questions', style: context.text.titleLarge),
          const SizedBox(height: Space.x3),
          for (final faq in faqs) _FaqTile(faq: faq),
        ],
      ),
    );
  }
}

class _FaqTile extends StatefulWidget {
  const _FaqTile({required this.faq});

  final ServiceFaq faq;

  @override
  State<_FaqTile> createState() => _FaqTileState();
}

class _FaqTileState extends State<_FaqTile> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Padding(
      padding: const EdgeInsets.only(bottom: Space.x2),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          setState(() => _open = !_open);
        },
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: Motion.fast,
          padding: const EdgeInsets.all(Space.x4),
          decoration: BoxDecoration(
            color: t.surfaceAlt,
            borderRadius: BorderRadius.circular(Radii.lg),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(widget.faq.question, style: context.text.titleSmall),
                  ),
                  const SizedBox(width: Space.x3),
                  AnimatedRotation(
                    turns: _open ? 0.125 : 0,
                    duration: Motion.fast,
                    curve: Motion.curve,
                    child: AppIcon(AppIcons.add, size: 18, color: t.textSecondary, bold: true),
                  ),
                ],
              ),
              AnimatedSize(
                duration: Motion.fast,
                curve: Motion.curve,
                alignment: Alignment.topCenter,
                child: _open
                    ? Padding(
                        padding: const EdgeInsets.only(top: Space.x3),
                        child: Text(
                          widget.faq.answer,
                          style: context.text.bodyMedium?.copyWith(
                            color: t.textSecondary,
                            height: 1.55,
                          ),
                        ),
                      )
                    : const SizedBox(width: double.infinity),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The persistent add-to-cart bar.
class _AddBar extends ConsumerWidget {
  const _AddBar({required this.service});

  final Service service;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final quantity = ref.watch(cartProvider).quantityOf(service.id);

    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(Space.x4),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      formatRupees(service.basePrice),
                      style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      quantity > 0 ? '$quantity in cart' : 'Starting price',
                      style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: Space.x4),
              AppButton.primary(
                label: quantity > 0 ? 'Add another' : 'Add to cart',
                expand: false,
                onPressed: () {
                  HapticFeedback.selectionClick();
                  ref.read(cartProvider.notifier).add(service);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
