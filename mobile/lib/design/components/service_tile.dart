import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../icons/app_icons.dart';
import '../icons/service_icons.dart';
import '../theme/app_theme.dart';
import '../tokens/motion.dart';
import '../tokens/spacing.dart';

/// The home-screen service tile.
///
/// A visual tile rather than a label under an icon: the glyph is dominant and
/// sits on its own tinted field, with the name and a one-line description
/// beneath. The tint comes from [ServiceVisuals] so a category is the same
/// colour everywhere in the app.
class ServiceTile extends StatefulWidget {
  const ServiceTile({
    super.key,
    required this.name,
    this.description,
    this.category,
    this.onTap,
    this.selected = false,
  });

  final String name;

  /// One short line — "Repairs & fixes". Omit rather than pad it out.
  final String? description;

  /// Falls back to matching on [name] when the catalogue has no category.
  final String? category;

  final VoidCallback? onTap;
  final bool selected;

  @override
  State<ServiceTile> createState() => _ServiceTileState();
}

class _ServiceTileState extends State<ServiceTile> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final brightness = Theme.of(context).brightness;
    final visual = ServiceVisuals.forName(widget.category ?? widget.name);

    final accent = visual.accentFor(brightness);
    final soft = visual.softFor(brightness);

    return GestureDetector(
      onTapDown: widget.onTap == null ? null : (_) => setState(() => _pressed = true),
      onTapUp: widget.onTap == null ? null : (_) => setState(() => _pressed = false),
      onTapCancel: widget.onTap == null ? null : () => setState(() => _pressed = false),
      onTap: widget.onTap == null
          ? null
          : () {
              HapticFeedback.selectionClick();
              widget.onTap!.call();
            },
      child: AnimatedScale(
        scale: _pressed ? 0.96 : 1,
        duration: Motion.fast,
        curve: Motion.curve,
        child: AnimatedContainer(
          duration: Motion.fast,
          padding: const EdgeInsets.all(Space.x4),
          decoration: BoxDecoration(
            color: widget.selected ? soft : t.surface,
            borderRadius: BorderRadius.circular(Radii.xl),
            border: Border.all(
              color: widget.selected ? accent : t.border,
              width: widget.selected ? 1.6 : 1,
            ),
            boxShadow: _pressed ? null : t.cardShadow,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // The glyph field. Larger than a list icon on purpose — this is
              // the tile's visual anchor.
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: soft,
                  borderRadius: BorderRadius.circular(Radii.lg),
                ),
                alignment: Alignment.center,
                child: AppIcon(visual.icon, size: 26, color: accent, bold: true),
              ),
              const SizedBox(height: Space.x3),
              Text(
                widget.name,
                style: context.text.titleMedium,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (widget.description != null) ...[
                const SizedBox(height: Space.x0_5),
                Text(
                  widget.description!,
                  style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Compact circular variant for the "popular services" strip, where a row of
/// full tiles would dominate the screen.
class ServiceChip extends StatelessWidget {
  const ServiceChip({
    super.key,
    required this.name,
    this.category,
    this.onTap,
  });

  final String name;
  final String? category;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final brightness = Theme.of(context).brightness;
    final visual = ServiceVisuals.forName(category ?? name);

    return GestureDetector(
      onTap: onTap == null
          ? null
          : () {
              HapticFeedback.selectionClick();
              onTap!.call();
            },
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 76,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: visual.softFor(brightness),
                borderRadius: BorderRadius.circular(Radii.xl),
              ),
              alignment: Alignment.center,
              child: AppIcon(visual.icon, size: 28, color: visual.accentFor(brightness), bold: true),
            ),
            const SizedBox(height: Space.x2),
            Text(
              name,
              style: context.text.labelMedium,
              maxLines: 2,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

/// Responsive service grid.
///
/// Column count derives from available width rather than a hardcoded 2, so the
/// same widget serves phone, tablet and the eventual web build without a
/// separate layout.
class ServiceGrid extends StatelessWidget {
  const ServiceGrid({
    super.key,
    required this.children,
    this.minTileWidth = 160,
    this.spacing = Space.x3,
  });

  final List<Widget> children;
  final double minTileWidth;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = (constraints.maxWidth / minTileWidth).floor().clamp(2, 5);
        return GridView.count(
          crossAxisCount: columns,
          mainAxisSpacing: spacing,
          crossAxisSpacing: spacing,
          // Tall enough for icon + title + description without clipping at the
          // largest supported text scale.
          childAspectRatio: 1.15,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: children,
        );
      },
    );
  }
}
