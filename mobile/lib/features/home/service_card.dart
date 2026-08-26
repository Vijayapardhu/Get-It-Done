import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/cart/cart.dart';
import '../../core/models/models.dart';
import '../../core/ui/service_artwork.dart';
import '../../design/design_system.dart';

/// A service in the catalogue grid: picture, rating, name, price, add button.
///
/// The picture is the point. A three-column grid of line glyphs reads as a
/// settings menu; a grid of pictures reads as a catalogue you can shop, which
/// is what this screen is for.
///
/// Everything on the card that could be invented is instead conditional. No
/// rating renders where nothing has been reviewed, and no struck-through price
/// renders where no promotion exists — a fabricated 4.5 and a fake "was ₹999"
/// are the two numbers a customer cannot check and would be right not to
/// forgive.
class ServiceCard extends ConsumerWidget {
  const ServiceCard({
    super.key,
    required this.service,
    required this.onOpen,
  });

  final Service service;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final quantity = ref.watch(cartProvider).quantityOf(service.id);

    return GestureDetector(
      onTap: onOpen,
      behavior: HitTestBehavior.opaque,
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(Radii.xl),
          border: Border.all(color: t.border),
          boxShadow: t.cardShadow,
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            _Artwork(service: service, quantity: quantity),
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.x3, Space.x3, Space.x3, Space.x4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    service.name,
                    style: context.text.titleSmall,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  // Rating under the name rather than floating on the picture:
                  // at this card width a pill over the artwork covered the
                  // subject, and the number belongs with the price anyway.
                  if (service.rating != null) ...[
                    const SizedBox(height: Space.x1),
                    _Rating(rating: service.rating!),
                  ],
                  const SizedBox(height: Space.x1),
                  _PriceRow(service: service),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Artwork extends ConsumerWidget {
  const _Artwork({required this.service, required this.quantity});

  final Service service;
  final int quantity;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;

    return AspectRatio(
      // Square, so a row of cards has one baseline for its titles however the
      // artwork is shaped.
      aspectRatio: 1,
      child: Stack(
        children: [
          Positioned.fill(
            child: ServiceArtwork(
              service: service,
              // Filled by the parent's constraints; the tile paints its own
              // tinted field, so it carries the whole square.
              size: double.infinity,
              radius: BorderRadius.zero,
              // Full bleed. Catalogue artwork is a background-removed subject,
              // and the default proportional inset shrank it to about half the
              // square with a ring of empty tint around it.
              padding: EdgeInsets.zero,
              // Never animated. These tiles are the app's densest surface, and
              // a grid of looping Lottie files is a battery drain that reads as
              // noise; the catalogue is a still picture per service.
              animate: false,
            ),
          ),

          // Add, bottom-right and overlapping the artwork edge, so it reads as
          // a control on top of the picture rather than part of it.
          Positioned(
            right: Space.x2,
            bottom: Space.x2,
            child: _AddButton(
              quantity: quantity,
              onAdd: () {
                HapticFeedback.selectionClick();
                ref.read(cartProvider.notifier).add(service);
              },
            ),
          ),

          // A hairline under the artwork rather than a hard edge against the
          // white body.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(height: 1, color: t.border),
          ),
        ],
      ),
    );
  }
}

class _Rating extends StatelessWidget {
  const _Rating({required this.rating});

  final double rating;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Row(
      children: [
        AppIcon(AppIcons.rating, size: 12, color: t.warning, bold: true),
        const SizedBox(width: 3),
        Text(
          rating.toStringAsFixed(1),
          style: context.text.labelSmall?.copyWith(
            color: t.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _AddButton extends StatelessWidget {
  const _AddButton({required this.quantity, required this.onAdd});

  final int quantity;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final inCart = quantity > 0;

    return GestureDetector(
      onTap: onAdd,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: Motion.fast,
        curve: Motion.curve,
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          // Filled once it is in the cart, so a glance down the grid shows what
          // has been picked without reading any numbers.
          color: inCart ? t.primary : t.surface,
          borderRadius: BorderRadius.circular(Radii.md),
          border: Border.all(color: inCart ? t.primary : t.border),
          boxShadow: t.cardShadow,
        ),
        alignment: Alignment.center,
        child: inCart
            ? Text(
                '$quantity',
                style: context.text.labelLarge?.copyWith(
                  color: t.textOnPrimary,
                  fontWeight: FontWeight.w700,
                ),
              )
            : AppIcon(AppIcons.add, size: 18, color: t.primary, bold: true),
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({required this.service});

  final Service service;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(
          'From ',
          style: context.text.labelSmall?.copyWith(color: t.textTertiary),
        ),
        Text(
          formatRupees(service.basePrice),
          style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
        if (service.hasDiscount) ...[
          const SizedBox(width: Space.x2),
          Flexible(
            child: Text(
              formatRupees(service.listPrice!),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: context.text.bodySmall?.copyWith(
                color: t.textTertiary,
                decoration: TextDecoration.lineThrough,
                decorationColor: t.textTertiary,
              ),
            ),
          ),
        ],
      ],
    );
  }
}
