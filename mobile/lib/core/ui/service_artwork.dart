import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/design_system.dart';
import 'package:gid_core/gid_core.dart';
import '../providers.dart';

/// The artwork for a service, wherever one is shown.
///
/// Wraps [AppArtwork] with the two things every caller would otherwise repeat:
/// resolving the API's relative `/media/artwork/...` paths against the current
/// host, and choosing the fallback glyph and tint from [ServiceVisuals].
///
/// The result is that a card renders backend-supplied artwork when it exists
/// and the built-in glyph when it does not, and no screen has to know which
/// case it is in.
class ServiceArtwork extends ConsumerWidget {
  const ServiceArtwork({
    super.key,
    required this.service,
    this.size = 44,
    this.animate = false,
    this.radius,
    this.padding,
  })  : _name = null,
        _imageUrl = null,
        _animationUrl = null,
        _accentColor = null;

  /// Build from the loose parts, for the screens that hold a booking or an
  /// invoice rather than a full [Service].
  const ServiceArtwork.raw({
    super.key,
    required String? name,
    String? imageUrl,
    String? animationUrl,
    String? accentColor,
    this.size = 44,
    this.animate = false,
    this.radius,
    this.padding,
  })  : service = null,
        _name = name,
        _imageUrl = imageUrl,
        _animationUrl = animationUrl,
        _accentColor = accentColor;

  final Service? service;
  final double size;

  /// Whether the Lottie plays or holds its first frame.
  ///
  /// It no longer decides whether the animation is FETCHED -- that is what
  /// made Lottie artwork invisible everywhere, since the dense surfaces that
  /// have pictures are the ones that switch motion off. A still Lottie is a
  /// picture; a dropped one is a glyph.
  final bool animate;

  final BorderRadius? radius;

  /// Inset between the tile edge and the artwork.
  ///
  /// Defaults to AppArtwork's proportional breathing room, which suits a line
  /// glyph. Pass [EdgeInsets.zero] for a catalogue card, where the artwork is a
  /// background-removed subject that should fill its square rather than float
  /// in the middle of one.
  final EdgeInsets? padding;

  final String? _name;
  final String? _imageUrl;
  final String? _animationUrl;
  final String? _accentColor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final base = ref.watch(apiClientProvider).baseUrl;
    final brightness = Theme.of(context).brightness;

    // Name before category. "Plumbing" and "Electrical" both sit under "Home
    // Repair", so resolving by category alone would hand every tile in the
    // group the same neutral tool glyph.
    final visual = ServiceVisuals.forNames([service?.name ?? _name, service?.category]);

    // A backend accent overrides the built-in palette, so a new category
    // arrives with its own colour rather than borrowing whichever one the
    // client-side table happened to hold.
    final accent = parseHexColor(service?.categoryAccentColor ?? _accentColor);
    final foreground = accent == null
        ? visual.accentFor(brightness)
        : (brightness == Brightness.light ? accent : Color.lerp(accent, Colors.white, 0.32)!);
    final background = accent == null
        ? visual.softFor(brightness)
        : accent.withValues(alpha: brightness == Brightness.light ? 0.12 : 0.22);

    return AppArtwork(
      fallbackIcon: visual.icon,
      imageUrl: resolveArtworkUrl(service?.artworkImage ?? _imageUrl, base),
      animationUrl: resolveArtworkUrl(service?.artworkAnimation ?? _animationUrl, base),
      size: size,
      radius: radius,
      padding: padding,
      background: background,
      foreground: foreground,
      animate: animate,
    );
  }
}

/// Artwork for a whole category, for the category rail and the search filters.
class CategoryArtwork extends ConsumerWidget {
  const CategoryArtwork({
    super.key,
    required this.category,
    this.size = 56,
    this.animate = false,
  });

  final ServiceCategory category;
  final double size;
  final bool animate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final base = ref.watch(apiClientProvider).baseUrl;
    final brightness = Theme.of(context).brightness;
    final visual = ServiceVisuals.forName(category.name);

    final accent = parseHexColor(category.accentColor);
    final foreground = accent == null
        ? visual.accentFor(brightness)
        : (brightness == Brightness.light ? accent : Color.lerp(accent, Colors.white, 0.32)!);
    final background = accent == null
        ? visual.softFor(brightness)
        : accent.withValues(alpha: brightness == Brightness.light ? 0.12 : 0.22);

    return AppArtwork(
      fallbackIcon: visual.icon,
      imageUrl: resolveArtworkUrl(category.imageUrl, base),
      animationUrl: resolveArtworkUrl(category.animationUrl, base),
      size: size,
      background: background,
      foreground: foreground,
      animate: animate,
    );
  }
}
