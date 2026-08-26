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

  final List<List<dynamic>> icon;
  final String label;

  /// Unread count, e.g. notifications.
  final int? badgeCount;
}

/// Bottom navigation.
///
/// A floating pill rather than a full-width bar welded to the bottom edge. Two
/// reasons beyond the look: content scrolls visibly underneath it, so the page
/// reads as continuing rather than stopping at a wall; and the bar no longer
/// has to span the screen, which stops three destinations from being stretched
/// across a width meant for five.
///
/// Only the active destination carries its label. The icons alone are not
/// self-evident — "Alerts" and "Bookings" are a bell and a calendar, which
/// could be either — so the label appears where you are, and the pill animates
/// between destinations. That keeps the bar quiet without making it a rebus.
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

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Space.x5, 0, Space.x5, Space.x3),
        child: Container(
          padding: const EdgeInsets.all(Space.x1),
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: Radii.rPill,
            border: Border.all(color: t.border),
            boxShadow: t.raisedShadow,
          ),
          // Sized to content, NOT Flexible. Flexible gives every destination an
          // equal share, which is precisely wrong here: the active one is
          // wider because it carries a label, and equal shares clipped it to
          // "Ho…". spaceEvenly then distributes what is left over.
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              for (var i = 0; i < items.length; i++)
                _NavButton(
                  item: items[i],
                  active: i == currentIndex,
                  onTap: () {
                    if (i == currentIndex) return;
                    HapticFeedback.selectionClick();
                    onTap(i);
                  },
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
    final color = active ? t.textOnPrimary : t.textTertiary;

    return Semantics(
      button: true,
      selected: active,
      label: item.label,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: Motion.base,
          curve: Motion.curveEmphasis,
          height: 48,
          padding: EdgeInsets.symmetric(horizontal: active ? Space.x4 : Space.x3),
          decoration: BoxDecoration(
            color: active ? t.primary : Colors.transparent,
            borderRadius: Radii.rPill,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  AppIcon(item.icon, size: Sizes.iconMd, color: color, bold: active),
                  if (item.badgeCount != null && item.badgeCount! > 0)
                    Positioned(
                      right: -6,
                      top: -4,
                      child: _CountDot(count: item.badgeCount!),
                    ),
                ],
              ),
              // The label grows out of the pill rather than fading in place, so
              // the eye follows one moving shape instead of watching text
              // appear and disappear in three positions.
              // Flexible, so the pill compresses instead of overflowing. Four
              // destinations at a large text scale do not fit a phone at the
              // label's natural width, and a nav bar is the one component that
              // must survive being given more items than it was designed for.
              Flexible(
                child: AnimatedSize(
                  duration: Motion.base,
                  curve: Motion.curveEmphasis,
                  alignment: Alignment.centerLeft,
                  child: active
                      ? Padding(
                          padding: const EdgeInsets.only(left: Space.x2),
                          child: Text(
                            item.label,
                            maxLines: 1,
                            overflow: TextOverflow.fade,
                            softWrap: false,
                            style: context.text.labelMedium?.copyWith(
                              color: color,
                              letterSpacing: 0,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        )
                      : const SizedBox.shrink(),
                ),
              ),
            ],
          ),
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
