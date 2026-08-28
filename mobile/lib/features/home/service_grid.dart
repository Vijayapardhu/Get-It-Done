import 'package:flutter/material.dart';

import '../../core/models/models.dart';
import '../../design/design_system.dart';
import 'service_card.dart';

/// The catalogue grid: three tiles across, everywhere the catalogue appears.
///
/// Home, search and the instant picker all show the same twenty-four services
/// and used to show them three different ways -- a grid here, full-width rows
/// there, a third list somewhere else. That is three layouts to keep in step
/// and, worse, three different mental pictures of the same catalogue: a
/// service the customer recognises by its tile on the home screen arrived as
/// an unfamiliar row the moment they searched for it.
///
/// One grid, one card, one set of proportions. Search and instant differ only
/// in what a tap does, which is a parameter rather than a layout.

class ServiceCatalogueGrid extends StatelessWidget {
  const ServiceCatalogueGrid({
    super.key,
    required this.services,
    required this.onOpenService,
    this.showAdd = true,
    this.emptyMessage = 'The catalogue for your area is still being set up.',
  });

  final List<Service> services;
  final ValueChanged<Service> onOpenService;

  /// Whether each tile carries its add-to-cart button.
  ///
  /// False where the screen is asking the customer to pick exactly one thing —
  /// the instant flow books a single job — because an Add button there offers
  /// a basket the next screen is about to throw away.
  final bool showAdd;

  final String emptyMessage;

  // Tighter than the page's own rhythm on purpose. Three columns on a phone
  // leave the tile width fixed by arithmetic, so every point taken out of the
  // gutters goes straight into the artwork.
  static const _gap = Space.x2;
  static const _minTile = 104.0;

  /// The grid runs closer to the screen edge than the prose around it.
  static const insets = EdgeInsets.symmetric(horizontal: Space.x4);

  /// Three across, and only fewer if three genuinely will not fit.
  ///
  /// Capped rather than derived upward: a wide screen used to give four, and
  /// the catalogue is meant to read as a considered set of three columns, not
  /// as many tiles as happen to fit. Two remains the floor for a narrow phone
  /// at a large accessibility text scale, where three columns of clipped words
  /// help nobody.
  static int columnsFor(double width, double textScale) {
    final target = _minTile * (textScale > 1.3 ? 1.4 : 1);
    final fits = ((width + _gap) / (target + _gap)).floor();
    return fits.clamp(2, 3);
  }

  /// Height of everything below the artwork square: the inset, two lines of
  /// name, the rating line, the gaps, and the price row.
  ///
  /// Measured rather than expressed as a childAspectRatio. A ratio has to be
  /// guessed against the worst case — the longest name at the largest text
  /// scale — and a guess that is slightly small does not clip quietly, it
  /// throws a layout overflow. Sizing the cell as "the square, plus this"
  /// makes the arithmetic exact at any text scale.
  static double footerHeight(BuildContext context) {
    final scaler = MediaQuery.textScalerOf(context);
    final title = context.text.titleSmall;
    final price = context.text.titleSmall;

    double lineHeight(TextStyle? style) {
      final size = scaler.scale(style?.fontSize ?? 14);
      return size * (style?.height ?? 1.35);
    }

    // Space.x1 twice: above and below the rating line, which every card now
    // carries whether or not the service has been reviewed.
    return Space.x3 +
        Space.x4 +
        (lineHeight(title) * 2) +
        Space.x1 +
        lineHeight(context.text.labelSmall) +
        Space.x1 +
        lineHeight(price);
  }

  @override
  Widget build(BuildContext context) {
    if (services.isEmpty) {
      return AppStateView.empty(
        title: 'No services yet',
        message: emptyMessage,
        icon: AppIcons.home,
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = columnsFor(
          constraints.maxWidth,
          MediaQuery.textScalerOf(context).scale(1),
        );

        return GridView.builder(
          padding: EdgeInsets.zero,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: services.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: _gap,
            mainAxisSpacing: _gap,
            // The square of artwork is as wide as the cell, so the cell is that
            // square plus the text block underneath it.
            mainAxisExtent:
                (constraints.maxWidth - _gap * (columns - 1)) / columns +
                    footerHeight(context),
          ),
          itemBuilder: (context, i) => ServiceCard(
            service: services[i],
            onOpen: () => onOpenService(services[i]),
            showAdd: showAdd,
          ),
        );
      },
    );
  }
}

/// A grid cell's worth of skeleton.
///
/// SkeletonCard is row-shaped — an avatar beside two lines of text — which is
/// right for a list and overflows a 110px grid cell. This mirrors the real
/// card instead: a square of artwork, a title line, a price line.
class ServiceCardSkeleton extends StatelessWidget {
  const ServiceCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(Radii.xl),
        border: Border.all(color: t.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AspectRatio(
            aspectRatio: 1,
            child: Skeleton(width: double.infinity, height: double.infinity, radius: 0),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.x3, Space.x3, Space.x3, Space.x4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: const [
                Skeleton.text(width: 68),
                SizedBox(height: Space.x2),
                Skeleton.text(width: 44),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class ServiceCatalogueSkeletons extends StatelessWidget {
  const ServiceCatalogueSkeletons({super.key});

  @override
  Widget build(BuildContext context) {
    // Same geometry as the loaded grid. A placeholder of a different shape
    // makes the page jump at the moment the user is deciding where to tap.
    return Padding(
      padding: ServiceCatalogueGrid.insets,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final columns = ServiceCatalogueGrid.columnsFor(
            constraints.maxWidth,
            MediaQuery.textScalerOf(context).scale(1),
          );

          return GridView.builder(
            padding: EdgeInsets.zero,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: columns * 2,
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              crossAxisSpacing: Space.x2,
              mainAxisSpacing: Space.x2,
              mainAxisExtent:
                  (constraints.maxWidth - Space.x2 * (columns - 1)) / columns +
                      ServiceCatalogueGrid.footerHeight(context),
            ),
            itemBuilder: (_, __) => const ServiceCardSkeleton(),
          );
        },
      ),
    );
  }
}

