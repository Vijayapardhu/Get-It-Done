import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../icons/app_icons.dart';
import '../theme/app_theme.dart';
import '../tokens/motion.dart';
import '../tokens/spacing.dart';

/// Labelled text field.
///
/// The label sits ABOVE the field rather than floating inside it. Floating
/// labels lose the field's purpose the moment it has content, which matters
/// most on exactly the forms people get wrong — addresses and phone numbers.
class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    this.label,
    this.hint,
    this.helper,
    this.error,
    this.controller,
    this.keyboardType,
    this.textInputAction,
    this.obscureText = false,
    this.enabled = true,
    this.maxLines = 1,
    this.maxLength,
    this.prefixIcon,
    this.suffix,
    this.onChanged,
    this.onSubmitted,
    this.autofocus = false,
    this.inputFormatters,
    this.focusNode,
  });

  final String? label;
  final String? hint;

  /// Guidance shown when there is no error.
  final String? helper;

  /// Replaces [helper] and turns the field red.
  final String? error;

  final TextEditingController? controller;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final bool obscureText;
  final bool enabled;
  final int maxLines;
  final int? maxLength;
  final List<List<dynamic>>? prefixIcon;
  final Widget? suffix;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool autofocus;
  final List<TextInputFormatter>? inputFormatters;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final hasError = error != null && error!.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Text(label!, style: context.text.titleMedium),
          const SizedBox(height: Space.x2),
        ],
        TextField(
          controller: controller,
          focusNode: focusNode,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          obscureText: obscureText,
          enabled: enabled,
          maxLines: obscureText ? 1 : maxLines,
          maxLength: maxLength,
          autofocus: autofocus,
          inputFormatters: inputFormatters,
          onChanged: onChanged,
          onSubmitted: onSubmitted,
          style: context.text.bodyLarge,
          cursorColor: t.primary,
          decoration: InputDecoration(
            hintText: hint,
            counterText: '',
            errorText: hasError ? error : null,
            prefixIcon: prefixIcon == null
                ? null
                : Padding(
                    padding: const EdgeInsets.only(left: Space.x4, right: Space.x3),
                    child: AppIcon(prefixIcon!, size: Sizes.iconSm, color: t.textTertiary),
                  ),
            prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
            suffixIcon: suffix == null
                ? null
                : Padding(
                    padding: const EdgeInsets.only(right: Space.x3),
                    child: suffix,
                  ),
            suffixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
          ),
        ),
        if (helper != null && !hasError) ...[
          const SizedBox(height: Space.x1 + 2),
          Text(helper!, style: context.text.bodySmall?.copyWith(color: t.textTertiary)),
        ],
      ],
    );
  }
}

/// The home-screen search bar.
///
/// Pill-shaped and visually distinct from a form field, because it is a
/// navigation affordance rather than data entry. Often used with
/// [readOnly] = true to push to a dedicated search screen.
class AppSearchField extends StatelessWidget {
  const AppSearchField({
    super.key,
    this.hint = 'Search for a service',
    this.controller,
    this.onChanged,
    this.onSubmitted,
    this.onTap,
    this.readOnly = false,
    this.autofocus = false,
    this.trailing,
  });

  final String hint;
  final TextEditingController? controller;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onTap;
  final bool readOnly;
  final bool autofocus;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Container(
      height: Sizes.inputHeight,
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: Radii.rPill,
        border: Border.all(color: t.border),
        boxShadow: t.cardShadow,
      ),
      child: Row(
        children: [
          const SizedBox(width: Space.x4),
          AppIcon(AppIcons.search, size: Sizes.iconSm, color: t.textTertiary, bold: true),
          const SizedBox(width: Space.x3),
          Expanded(
            child: TextField(
              controller: controller,
              readOnly: readOnly,
              autofocus: autofocus,
              onTap: onTap,
              onChanged: onChanged,
              onSubmitted: onSubmitted,
              textInputAction: TextInputAction.search,
              style: context.text.bodyLarge,
              cursorColor: t.primary,
              decoration: InputDecoration(
                hintText: hint,
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: EdgeInsets.zero,
                isDense: true,
              ),
            ),
          ),
          if (trailing != null) ...[
            trailing!,
            const SizedBox(width: Space.x2),
          ] else
            const SizedBox(width: Space.x4),
        ],
      ),
    );
  }
}

/// Segmented selector — "Now / Schedule", "Home / Work".
///
/// The sliding indicator is animated so the change of selection is legible
/// without reading the labels.
class AppSegmented<T> extends StatelessWidget {
  const AppSegmented({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
  });

  final List<({T value, String label})> options;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final index = options.indexWhere((o) => o.value == value).clamp(0, options.length - 1);

    return Container(
      height: 48,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: t.surfaceAlt, borderRadius: Radii.rPill),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final segmentWidth = constraints.maxWidth / options.length;
          return Stack(
            children: [
              AnimatedPositioned(
                duration: Motion.base,
                curve: Motion.curveEmphasis,
                left: segmentWidth * index,
                width: segmentWidth,
                top: 0,
                bottom: 0,
                child: Container(
                  decoration: BoxDecoration(
                    color: t.surface,
                    borderRadius: Radii.rPill,
                    boxShadow: t.cardShadow,
                  ),
                ),
              ),
              Row(
                children: [
                  for (final option in options)
                    Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () {
                          if (option.value == value) return;
                          HapticFeedback.selectionClick();
                          onChanged(option.value);
                        },
                        child: Center(
                          child: AnimatedDefaultTextStyle(
                            duration: Motion.base,
                            style: context.text.labelLarge!.copyWith(
                              color: option.value == value ? t.textPrimary : t.textSecondary,
                              fontWeight: option.value == value ? FontWeight.w700 : FontWeight.w500,
                            ),
                            child: Text(option.label),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Selectable row for a list of choices — saved addresses, time slots, payment
/// methods. The whole row is the target, not just a small radio circle.
class AppSelectableRow extends StatelessWidget {
  const AppSelectableRow({
    super.key,
    required this.title,
    required this.selected,
    required this.onTap,
    this.subtitle,
    this.icon,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final bool selected;
  final VoidCallback onTap;
  final List<List<dynamic>>? icon;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: AnimatedContainer(
        duration: Motion.fast,
        curve: Motion.curve,
        padding: const EdgeInsets.all(Space.x4),
        decoration: BoxDecoration(
          color: selected ? t.primarySoft : t.surface,
          borderRadius: Radii.rLg,
          border: Border.all(
            color: selected ? t.primary : t.border,
            width: selected ? 1.6 : 1,
          ),
        ),
        child: Row(
          children: [
            if (icon != null) ...[
              AppIcon(icon!, size: Sizes.iconMd, color: selected ? t.primary : t.textSecondary, bold: selected),
              const SizedBox(width: Space.x3),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: context.text.titleMedium),
                  if (subtitle != null) ...[
                    const SizedBox(height: Space.x0_5),
                    Text(
                      subtitle!,
                      style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null)
              trailing!
            else
              _RadioMark(selected: selected),
          ],
        ),
      ),
    );
  }
}

class _RadioMark extends StatelessWidget {
  const _RadioMark({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return AnimatedContainer(
      duration: Motion.fast,
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? t.primary : Colors.transparent,
        border: Border.all(color: selected ? t.primary : t.borderStrong, width: 1.8),
      ),
      // Hugeicons, not Material's Icons.check — this was the one place a
      // second icon family leaked into the system.
      child: selected
          ? Center(child: AppIcon(AppIcons.tick, size: 13, color: t.textOnPrimary, bold: true))
          : null,
    );
  }
}
