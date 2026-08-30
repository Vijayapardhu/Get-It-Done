import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/cart/cart.dart';
import 'package:gid_core/gid_core.dart';
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
    this.showAdd = true,
  });

  final Service service;
  final VoidCallback onOpen;

  /// Whether the tile carries its add-to-cart button.
  ///
  /// False on a screen that is asking for exactly one choice — the instant
  /// flow books a single job — where an Add button offers to build a basket
  /// the very next screen would discard.
  final bool showAdd;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final inCart = ref.watch(cartProvider).contains(service.id);

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
            _Artwork(service: service, inCart: inCart, showAdd: showAdd),
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
                  //
                  // Always rendered, blank when unrated, so every card in a row
                  // is the same height and their prices line up. Reserving the
                  // line costs one text line; not reserving it cost a ragged
                  // grid and an overflow at large text scales.
                  const SizedBox(height: Space.x1),
                  _Rating(rating: service.rating),
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
  const _Artwork({required this.service, required this.inCart, required this.showAdd});

  final Service service;
  final bool inCart;
  final bool showAdd;

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
              // A small, uniform inset rather than full bleed. The artwork
              // set mixes framed illustrations with cut-outs, so zero padding
              // let one asset fill its square while the next floated in the
              // middle of its own baked-in background. Contained inside a
              // consistent margin, they all read at the same optical size and
              // sit centred in their cell.
              padding: const EdgeInsets.all(Space.x2),
              // Motion is on: these are Lottie files when the backend has one
              // and a still PNG when it does not, and the whole point of
              // shipping animated artwork is that it moves.
              animate: true,
            ),
          ),

          // Add, bottom-right and overlapping the artwork edge, so it reads as
          // a control on top of the picture rather than part of it.
          if (showAdd)
            Positioned(
              right: Space.x2,
              bottom: Space.x2,
              child: _AddButton(
                inCart: inCart,
                onAdd: () {
                  HapticFeedback.selectionClick();
                  // Adds the service's default duration. The exact time is
                  // changed in the cart or on the service's own page, where
                  // there is room to show what it costs.
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

  /// Null for a service nobody has reviewed. The row still occupies its line;
  /// inventing a 4.5 to fill it is the one number a customer cannot check.
  final double? rating;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final style = context.text.labelSmall?.copyWith(
      color: t.textSecondary,
      fontWeight: FontWeight.w600,
    );

    if (rating == null) {
      return Text(
        'New',
        style: style?.copyWith(color: t.textTertiary, fontWeight: FontWeight.w500),
      );
    }

    return Row(
      children: [
        AppIcon(AppIcons.rating, size: 12, color: t.warning, bold: true),
        const SizedBox(width: 3),
        Text(rating!.toStringAsFixed(1), style: style),
      ],
    );
  }
}

class _AddButton extends StatelessWidget {
  const _AddButton({required this.inCart, required this.onAdd});

  final bool inCart;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

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
        // A tick once it is in, not a count: a service goes in once and the
        // duration is what changes.
        child: inCart
            ? AppIcon(AppIcons.tick, size: 18, color: t.textOnPrimary, bold: true)
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
          service.isTimed ? '' : 'From ',
          style: context.text.labelSmall?.copyWith(color: t.textTertiary),
        ),
        Text(
          formatRupees(
            service.isTimed ? service.priceFor(service.defaultMinutes) : service.basePrice,
          ),
          style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
        if (service.isTimed)
          Flexible(
            child: Text(
              ' / ${formatMinutes(service.defaultMinutes)}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: context.text.labelSmall?.copyWith(color: t.textTertiary),
            ),
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
