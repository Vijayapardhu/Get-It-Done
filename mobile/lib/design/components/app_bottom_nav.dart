import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../icons/app_icons.dart';
import '../theme/app_theme.dart';
import '../tokens/motion.dart';
import '../tokens/spacing.dart';

@immutable
class AppNavItem {
  const AppNavItem({
    required this.icon,
    required this.label,
    this.badgeCount,
  });

  final AppIconData icon;
  final String label;

  /// Unread count, e.g. notifications.
  final int? badgeCount;
}

/// Bottom navigation.
///
/// A full-width bar fixed to the bottom edge, not a floating pill. The pill
/// looked considered and behaved worse: it needed its own margins, it put a
/// second rounded shape under every already-rounded card, and it read as a
/// sheet that might be dismissible. Navigation is furniture. It should sit
/// still and be predictable.
///
/// Every destination carries its label. Four icons alone are a rebus -- a bell
/// and a clipboard could each be two different things -- and the label costs
/// one line of 11pt text.
class AppBottomNav extends StatelessWidget {
  const AppBottomNav({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onTap,
  });

  final List<AppNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.border)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: Sizes.bottomNavHeight,
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: _NavButton(
                    item: items[i],
                    active: i == currentIndex,
                    onTap: () {
                      if (i == currentIndex) return;
                      HapticFeedback.selectionClick();
                      onTap(i);
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  const _NavButton({required this.item, required this.active, required this.onTap});

  final AppNavItem item;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final color = active ? t.primary : t.textTertiary;

    return Semantics(
      button: true,
      selected: active,
      // No explicit label. Every destination now shows its name, and setting
      // one here as well makes a screen reader announce "Bookings Bookings".
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                AppIcon(item.icon, size: Sizes.iconMd, color: color, bold: active),
                if (item.badgeCount != null && item.badgeCount! > 0)
                  Positioned(
                    right: -5,
                    top: -3,
                    child: _CountDot(count: item.badgeCount!),
                  ),
              ],
            ),
            const SizedBox(height: 3),
            AnimatedDefaultTextStyle(
              duration: Motion.base,
              style: context.text.labelSmall!.copyWith(
                color: color,
                letterSpacing: 0,
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
              ),
              child: Text(item.label, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
      ),
    );
  }
}

class _CountDot extends StatelessWidget {
  const _CountDot({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Container(
      constraints: const BoxConstraints(minWidth: 18),
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: t.danger,
        borderRadius: Radii.rPill,
        border: Border.all(color: t.surface, width: 1.5),
      ),
      child: Text(
        count > 99 ? '99+' : '$count',
        textAlign: TextAlign.center,
        style: context.text.labelSmall?.copyWith(
          color: Colors.white,
          fontSize: 10,
          letterSpacing: 0,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// The floating emergency CTA.
///
/// Sits ABOVE the navigation bar rather than merging into it — the emergency
/// path is a different mode, and burying it as a tab makes it read as just
/// another destination. Danger-toned so it is unmistakable, and small enough
/// that it does not dominate a screen the user is only browsing.
class EmergencyFab extends StatefulWidget {
  const EmergencyFab({
    super.key,
    required this.onPressed,
    this.label = 'Emergency',
    this.extended = true,
  });

  final VoidCallback onPressed;
  final String label;

  /// Collapses to a circle when the user scrolls, so it stops covering content.
  final bool extended;

  @override
  State<EmergencyFab> createState() => _EmergencyFabState();
}

class _EmergencyFabState extends State<EmergencyFab> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Semantics(
      button: true,
      label: '${widget.label}. Request urgent help.',
      child: GestureDetector(
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) => setState(() => _pressed = false),
        onTapCancel: () => setState(() => _pressed = false),
        onTap: () {
          // Heavier haptic than a normal tap: this is a consequential action.
          HapticFeedback.mediumImpact();
          widget.onPressed();
        },
        child: AnimatedScale(
          scale: _pressed ? 0.94 : 1,
          duration: Motion.fast,
          curve: Motion.curve,
          child: AnimatedContainer(
            duration: Motion.base,
            curve: Motion.curveEmphasis,
            height: 52,
            padding: EdgeInsets.symmetric(horizontal: widget.extended ? Space.x5 : Space.x3),
            decoration: BoxDecoration(
              color: t.danger,
              borderRadius: Radii.rPill,
              boxShadow: [
                BoxShadow(
                  color: t.danger.withValues(alpha: 0.35),
                  blurRadius: 20,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                AppIcon(AppIcons.emergency, size: Sizes.iconMd, color: Colors.white, bold: true),
                AnimatedSize(
                  duration: Motion.base,
                  curve: Motion.curveEmphasis,
                  child: widget.extended
                      ? Padding(
                          padding: const EdgeInsets.only(left: Space.x2),
                          child: Text(
                            widget.label,
                            style: context.text.labelLarge?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        )
                      : const SizedBox.shrink(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
