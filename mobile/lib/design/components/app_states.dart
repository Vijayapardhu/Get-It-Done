import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/app_theme.dart';
import '../tokens/motion.dart';
import '../tokens/spacing.dart';
import 'app_button.dart';

/// Shimmer skeleton block.
///
/// Skeletons rather than spinners for anything with a known shape: a spinner
/// tells the user to wait, a skeleton tells them what is coming. The shimmer
/// sweeps once every [Motion.shimmer]; faster reads as anxious.
class Skeleton extends StatefulWidget {
  const Skeleton({
    super.key,
    this.width,
    this.height = 16,
    this.radius = Radii.sm,
    this.shape = BoxShape.rectangle,
  });

  const Skeleton.circle({super.key, required double size})
      : width = size,
        height = size,
        radius = 0,
        shape = BoxShape.circle;

  /// Matches [Skeleton] to a line of body text.
  const Skeleton.text({super.key, this.width})
      : height = 14,
        radius = Radii.xs,
        shape = BoxShape.rectangle;

  final double? width;
  final double height;
  final double radius;
  final BoxShape shape;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: Motion.shimmer,
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            shape: widget.shape,
            borderRadius: widget.shape == BoxShape.circle ? null : BorderRadius.circular(widget.radius),
            gradient: LinearGradient(
              // Sweep left-to-right across a wide band so the highlight reads as
              // a moving sheen rather than a pulsing block.
              begin: Alignment(-1 - 2 * _controller.value, 0),
              end: Alignment(1 - 2 * _controller.value, 0),
              colors: [t.skeletonBase, t.skeletonHighlight, t.skeletonBase],
              stops: const [0.35, 0.5, 0.65],
            ),
          ),
        );
      },
    );
  }
}

/// Placeholder matching the shape of a [WorkerCard] or booking card.
class SkeletonCard extends StatelessWidget {
  const SkeletonCard({super.key, this.lines = 2, this.hasAvatar = true});

  final int lines;
  final bool hasAvatar;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Container(
      padding: Space.cardInsetsLarge,
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: Radii.rXl,
        border: Border.all(color: t.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasAvatar) ...[
            const Skeleton.circle(size: Sizes.avatarLg),
            const SizedBox(width: Space.x3),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Skeleton(width: 140, height: 18),
                const SizedBox(height: Space.x2),
                for (var i = 0; i < lines; i++) ...[
                  // Each successive line is shorter, like real ragged text.
                  Skeleton.text(width: i.isEven ? 200 : 120),
                  if (i < lines - 1) const SizedBox(height: Space.x2),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Empty, error and offline states.
///
/// All three share one widget because they are the same shape: a mark, a short
/// headline, one sentence of explanation, and at most one action. The
/// difference is tone, not structure.
class AppStateView extends StatelessWidget {
  const AppStateView({
    super.key,
    required this.title,
    required this.message,
    this.icon,
    this.tone = StateTone.neutral,
    this.actionLabel,
    this.onAction,
    this.secondaryActionLabel,
    this.onSecondaryAction,
  });

  /// Nothing here yet — first-run and filtered-to-nothing.
  const AppStateView.empty({
    super.key,
    required this.title,
    required this.message,
    this.icon,
    this.actionLabel,
    this.onAction,
    this.secondaryActionLabel,
    this.onSecondaryAction,
  }) : tone = StateTone.neutral;

  /// Something failed. Always offer a retry.
  const AppStateView.error({
    super.key,
    this.title = 'Something went wrong',
    required this.message,
    this.icon,
    this.actionLabel = 'Try again',
    this.onAction,
    this.secondaryActionLabel,
    this.onSecondaryAction,
  }) : tone = StateTone.error;

  /// No connection. Phrased as temporary, because it is.
  const AppStateView.offline({
    super.key,
    this.title = "You're offline",
    this.message = "We'll reconnect automatically.",
    this.icon,
    this.actionLabel,
    this.onAction,
    this.secondaryActionLabel,
    this.onSecondaryAction,
  }) : tone = StateTone.warning;

  final String title;
  final String message;
  final AppIconData? icon;
  final StateTone tone;
  final String? actionLabel;
  final VoidCallback? onAction;
  final String? secondaryActionLabel;
  final VoidCallback? onSecondaryAction;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    final (Color fg, Color bg, AppIconData defaultIcon) = switch (tone) {
      StateTone.neutral => (t.primary, t.primarySoft, AppIcons.idea),
      StateTone.error => (t.danger, t.dangerSoft, AppIcons.alertCircle),
      StateTone.warning => (t.warning, t.warningSoft, AppIcons.info),
      StateTone.success => (t.success, t.successSoft, AppIcons.success),
    };

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Space.x8, vertical: Space.x10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppIconBadge(icon ?? defaultIcon, size: 88, background: bg, foreground: fg, iconSize: 40),
            const SizedBox(height: Space.x6),
            Text(title, style: context.text.headlineSmall, textAlign: TextAlign.center),
            const SizedBox(height: Space.x2),
            Text(
              message,
              style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
              textAlign: TextAlign.center,
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: Space.x6),
              AppButton.primary(
                label: actionLabel!,
                onPressed: onAction,
                size: AppButtonSize.medium,
                expand: false,
              ),
            ],
            if (secondaryActionLabel != null && onSecondaryAction != null) ...[
              const SizedBox(height: Space.x2),
              AppButton.tertiary(label: secondaryActionLabel!, onPressed: onSecondaryAction),
            ],
          ],
        ),
      ),
    );
  }
}

enum StateTone { neutral, error, warning, success }

/// Inline banner for non-blocking messages — a degraded connection, a pending
/// verification, a booking that needs attention.
class AppBanner extends StatelessWidget {
  const AppBanner({
    super.key,
    required this.message,
    this.tone = StateTone.neutral,
    this.icon,
    this.onDismiss,
    this.actionLabel,
    this.onAction,
  });

  final String message;
  final StateTone tone;
  final AppIconData? icon;
  final VoidCallback? onDismiss;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    final (Color fg, Color bg, AppIconData defaultIcon) = switch (tone) {
      StateTone.neutral => (t.primary, t.primarySoft, AppIcons.info),
      StateTone.error => (t.danger, t.dangerSoft, AppIcons.alertCircle),
      StateTone.warning => (t.warning, t.warningSoft, AppIcons.info),
      StateTone.success => (t.success, t.successSoft, AppIcons.success),
    };

    return Container(
      padding: const EdgeInsets.all(Space.x3),
      decoration: BoxDecoration(color: bg, borderRadius: Radii.rLg),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppIcon(icon ?? defaultIcon, size: Sizes.iconSm, color: fg, bold: true),
          const SizedBox(width: Space.x2),
          Expanded(
            child: Text(
              message,
              style: context.text.bodySmall?.copyWith(color: t.textPrimary),
            ),
          ),
          if (actionLabel != null && onAction != null)
            GestureDetector(
              onTap: onAction,
              child: Padding(
                padding: const EdgeInsets.only(left: Space.x2),
                child: Text(
                  actionLabel!,
                  style: context.text.labelSmall?.copyWith(color: fg, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          if (onDismiss != null)
            GestureDetector(
              onTap: onDismiss,
              child: Padding(
                padding: const EdgeInsets.only(left: Space.x2),
                child: AppIcon(AppIcons.close, size: Sizes.iconXs, color: fg),
              ),
            ),
        ],
      ),
    );
  }
}
