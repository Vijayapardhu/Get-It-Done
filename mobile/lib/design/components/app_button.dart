import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../icons/app_icons.dart';
import '../theme/app_theme.dart';
import '../tokens/motion.dart';
import '../tokens/spacing.dart';

enum AppButtonVariant {
  /// One per screen. The single most important action.
  primary,

  /// Outlined. Secondary path — "Add another address".
  secondary,

  /// Text only. Tertiary — "Skip", "Not now".
  tertiary,

  /// Filled soft blue. For actions inside an already-blue section, where a
  /// solid primary would be too loud.
  soft,

  /// Destructive: cancel booking, delete address.
  danger,
}

enum AppButtonSize { small, medium, large }

/// The app's button.
///
/// Press feedback is a subtle scale-down rather than a Material ripple (ripples
/// are disabled app-wide in the theme). It reads as more deliberate and it
/// behaves identically on both platforms.
class AppButton extends StatefulWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.size = AppButtonSize.large,
    this.icon,
    this.trailingIcon,
    this.loading = false,
    this.expand = true,
  });

  /// Convenience for the common full-width primary CTA.
  const AppButton.primary({
    super.key,
    required this.label,
    this.onPressed,
    this.size = AppButtonSize.large,
    this.icon,
    this.trailingIcon,
    this.loading = false,
    this.expand = true,
  }) : variant = AppButtonVariant.primary;

  const AppButton.secondary({
    super.key,
    required this.label,
    this.onPressed,
    this.size = AppButtonSize.large,
    this.icon,
    this.trailingIcon,
    this.loading = false,
    this.expand = true,
  }) : variant = AppButtonVariant.secondary;

  const AppButton.tertiary({
    super.key,
    required this.label,
    this.onPressed,
    this.size = AppButtonSize.medium,
    this.icon,
    this.trailingIcon,
    this.loading = false,
    this.expand = false,
  }) : variant = AppButtonVariant.tertiary;

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final AppButtonSize size;
  final AppIconData? icon;
  final AppIconData? trailingIcon;

  /// Shows a spinner and blocks input. The label stays laid out underneath so
  /// the button does not change width mid-press.
  final bool loading;

  final bool expand;

  @override
  State<AppButton> createState() => _AppButtonState();
}

class _AppButtonState extends State<AppButton> {
  bool _pressed = false;

  bool get _enabled => widget.onPressed != null && !widget.loading;

  double get _height => switch (widget.size) {
        AppButtonSize.small => Sizes.buttonSm,
        AppButtonSize.medium => Sizes.buttonMd,
        AppButtonSize.large => Sizes.buttonLg,
      };

  double get _iconSize => switch (widget.size) {
        AppButtonSize.small => Sizes.iconSm,
        _ => Sizes.iconMd,
      };

  EdgeInsets get _padding => switch (widget.size) {
        AppButtonSize.small => const EdgeInsets.symmetric(horizontal: Space.x3),
        AppButtonSize.medium => const EdgeInsets.symmetric(horizontal: Space.x5),
        AppButtonSize.large => const EdgeInsets.symmetric(horizontal: Space.x6),
      };

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    final (Color background, Color foreground, Color? border) = switch (widget.variant) {
      AppButtonVariant.primary => (_pressed ? t.primaryPressed : t.primary, t.textOnPrimary, null),
      AppButtonVariant.secondary => (_pressed ? t.surfaceAlt : Colors.transparent, t.textPrimary, t.borderStrong),
      AppButtonVariant.tertiary => (_pressed ? t.surfaceAlt : Colors.transparent, t.primary, null),
      AppButtonVariant.soft => (_pressed ? t.surfaceBlueStrong : t.primarySoft, t.primary, null),
      AppButtonVariant.danger => (_pressed ? t.danger.withValues(alpha: 0.85) : t.danger, Colors.white, null),
    };

    // Disabled is expressed by flattening opacity rather than by a separate
    // grey palette — one rule, and it works for every variant.
    final opacity = _enabled ? 1.0 : 0.4;

    final labelStyle = (widget.size == AppButtonSize.small ? context.text.labelMedium : context.text.labelLarge)
        ?.copyWith(color: foreground, fontWeight: FontWeight.w700);

    Widget content = Row(
      mainAxisSize: widget.expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (widget.icon != null) ...[
          AppIcon(widget.icon!, size: _iconSize, color: foreground, bold: true),
          const SizedBox(width: Space.x2),
        ],
        Flexible(
          child: Text(
            widget.label,
            style: labelStyle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
        ),
        if (widget.trailingIcon != null) ...[
          const SizedBox(width: Space.x2),
          AppIcon(widget.trailingIcon!, size: _iconSize, color: foreground, bold: true),
        ],
      ],
    );

    if (widget.loading) {
      // Keep the label in the tree but invisible, so the button holds its width.
      content = Stack(
        alignment: Alignment.center,
        children: [
          Opacity(opacity: 0, child: content),
          SizedBox(
            width: _iconSize,
            height: _iconSize,
            child: CircularProgressIndicator(strokeWidth: 2.2, color: foreground),
          ),
        ],
      );
    }

    return Semantics(
      // `container` forces its own node rather than annotating a descendant,
      // and `excludeSemantics` stops the inner Text announcing the label a
      // second time — a screen reader should say "Confirm booking, button"
      // once, not twice.
      container: true,
      excludeSemantics: true,
      button: true,
      enabled: _enabled,
      label: widget.label,
      child: GestureDetector(
        onTapDown: _enabled ? (_) => setState(() => _pressed = true) : null,
        onTapUp: _enabled ? (_) => setState(() => _pressed = false) : null,
        onTapCancel: _enabled ? () => setState(() => _pressed = false) : null,
        onTap: _enabled
            ? () {
                HapticFeedback.lightImpact();
                widget.onPressed!.call();
              }
            : null,
        child: AnimatedScale(
          scale: _pressed ? 0.975 : 1,
          duration: Motion.fast,
          curve: Motion.curve,
          child: AnimatedOpacity(
            opacity: opacity,
            duration: Motion.fast,
            child: AnimatedContainer(
              duration: Motion.fast,
              curve: Motion.curve,
              height: _height,
              width: widget.expand ? double.infinity : null,
              padding: _padding,
              decoration: BoxDecoration(
                color: background,
                borderRadius: BorderRadius.circular(Radii.lg),
                border: border == null ? null : Border.all(color: border, width: 1.4),
                // Only the primary CTA floats. If every button has a shadow,
                // none of them read as primary.
                boxShadow: widget.variant == AppButtonVariant.primary && _enabled && !_pressed
                    ? t.cardShadow
                    : null,
              ),
              child: Center(child: content),
            ),
          ),
        ),
      ),
    );
  }
}

/// Square icon-only button — back arrows, close, overflow.
class AppIconButton extends StatelessWidget {
  const AppIconButton({
    super.key,
    required this.icon,
    this.onPressed,
    this.size = Sizes.tapTargetMin,
    this.iconSize = Sizes.iconMd,
    this.background,
    this.foreground,
    this.tooltip,
  });

  final AppIconData icon;
  final VoidCallback? onPressed;
  final double size;
  final double iconSize;
  final Color? background;
  final Color? foreground;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final button = GestureDetector(
      onTap: onPressed == null
          ? null
          : () {
              HapticFeedback.selectionClick();
              onPressed!.call();
            },
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: background ?? Colors.transparent,
          borderRadius: BorderRadius.circular(Radii.md),
        ),
        alignment: Alignment.center,
        child: AppIcon(icon, size: iconSize, color: foreground ?? t.textPrimary),
      ),
    );

    return tooltip == null ? button : Tooltip(message: tooltip!, child: button);
  }
}
