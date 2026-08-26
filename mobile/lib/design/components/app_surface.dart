import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../icons/app_icons.dart';
import '../theme/app_theme.dart';
import '../tokens/motion.dart';
import '../tokens/spacing.dart';

/// The base card.
///
/// Deliberately plain, because the layout rule for this app is *not everything
/// is a card*. Reach for [AppCard] when content genuinely groups; otherwise use
/// a [Section] with plain children. The home screen should have three or four
/// cards, not fourteen.
class AppCard extends StatefulWidget {
  const AppCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = Space.cardInsets,
    this.background,
    this.border,
    this.radius = Radii.xl,
    this.elevated = true,
    this.selected = false,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;
  final Color? background;
  final Color? border;
  final double radius;

  /// Soft shadow. Turn off for cards nested inside another surface — stacked
  /// shadows read as muddy.
  final bool elevated;

  /// Selected cards fill soft blue and take a primary-coloured border.
  final bool selected;

  @override
  State<AppCard> createState() => _AppCardState();
}

class _AppCardState extends State<AppCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final interactive = widget.onTap != null;

    final background = widget.selected
        ? t.surfaceBlueStrong
        : (widget.background ?? t.surface);

    final borderColor = widget.selected
        ? t.primary
        : (widget.border ?? t.border);

    final card = AnimatedContainer(
      duration: Motion.fast,
      curve: Motion.curve,
      padding: widget.padding,
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(widget.radius),
        border: Border.all(
          color: borderColor,
          width: widget.selected ? 1.6 : 1,
        ),
        boxShadow: widget.elevated && !_pressed ? t.cardShadow : null,
      ),
      child: widget.child,
    );

    if (!interactive) return card;

    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: () {
        HapticFeedback.selectionClick();
        widget.onTap!.call();
      },
      child: AnimatedScale(
        scale: _pressed ? 0.985 : 1,
        duration: Motion.fast,
        curve: Motion.curve,
        child: card,
      ),
    );
  }
}

/// A full-bleed tinted band.
///
/// This is the "large light-blue feature area" from the visual direction — the
/// device breaks the white rhythm of the page without introducing another card.
class AppFeatureBand extends StatelessWidget {
  const AppFeatureBand({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.symmetric(horizontal: Space.page, vertical: Space.x8),
    this.background,
    this.radius = Radii.xxl,
  });

  final Widget child;
  final EdgeInsets padding;
  final Color? background;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: background ?? context.tokens.surfaceBlue,
        borderRadius: BorderRadius.circular(radius),
      ),
      child: child,
    );
  }
}

/// An editorial section: eyebrow, title, optional action, then content.
///
/// Every section does exactly one job. This widget exists so that rule is
/// enforced structurally rather than remembered — the vertical rhythm between
/// heading and content is identical on every screen.
class Section extends StatelessWidget {
  const Section({
    super.key,
    required this.child,
    this.title,
    this.eyebrow,
    this.subtitle,
    this.actionLabel,
    this.onAction,
    this.padding = Space.pageInsets,
    this.gap = Space.sectionHeader,
  });

  final Widget child;

  /// The section heading. Short — two or three words.
  final String? title;

  /// Small uppercase label above the title. Use sparingly.
  final String? eyebrow;

  final String? subtitle;

  /// Trailing text action, e.g. "See all".
  final String? actionLabel;
  final VoidCallback? onAction;

  final EdgeInsets padding;
  final double gap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final hasHeader = title != null || eyebrow != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (hasHeader)
          Padding(
            padding: padding,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (eyebrow != null) ...[
                        Text(
                          eyebrow!.toUpperCase(),
                          style: context.text.labelSmall?.copyWith(color: t.primary),
                        ),
                        const SizedBox(height: Space.x1),
                      ],
                      if (title != null)
                        Text(title!, style: context.text.headlineSmall),
                      if (subtitle != null) ...[
                        const SizedBox(height: Space.x1),
                        Text(
                          subtitle!,
                          style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                        ),
                      ],
                    ],
                  ),
                ),
                if (actionLabel != null && onAction != null)
                  GestureDetector(
                    onTap: onAction,
                    behavior: HitTestBehavior.opaque,
                    child: Padding(
                      // Padding rather than a taller box, so the action's text
                      // baseline still aligns with the title.
                      padding: const EdgeInsets.only(left: Space.x3, top: Space.x1, bottom: Space.x2),
                      child: Row(
                        children: [
                          Text(
                            actionLabel!,
                            style: context.text.labelMedium?.copyWith(
                              color: t.primary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(width: Space.x0_5),
                          AppIcon(AppIcons.chevronRight, size: Sizes.iconXs, color: t.primary, bold: true),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        if (hasHeader) SizedBox(height: gap),
        child,
      ],
    );
  }
}

/// The "2 OF 6" step indicator from the booking journey.
///
/// A count plus a progress bar. Showing both matters: the number tells the user
/// where they are, the bar tells them how much is left, and a multi-step form
/// without the second one feels endless.
class StepIndicator extends StatelessWidget {
  const StepIndicator({
    super.key,
    required this.step,
    required this.total,
    this.label,
  });

  final int step;
  final int total;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final progress = (step / total).clamp(0.0, 1.0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label ?? '$step OF $total',
          style: context.text.labelSmall?.copyWith(color: t.primary),
        ),
        const SizedBox(height: Space.x2),
        ClipRRect(
          borderRadius: Radii.rPill,
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: progress),
            duration: Motion.slow,
            curve: Motion.curve,
            builder: (context, value, _) => LinearProgressIndicator(
              value: value,
              minHeight: 4,
              backgroundColor: t.surfaceAlt,
              valueColor: AlwaysStoppedAnimation(t.primary),
            ),
          ),
        ),
      ],
    );
  }
}
