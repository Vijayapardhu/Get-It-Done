import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';

import '../icons/app_icons.dart';
import '../theme/app_theme.dart';
import '../tokens/motion.dart';
import '../tokens/spacing.dart';

/// Artwork for a service or category.
///
/// Three sources, most expressive first: a Lottie animation, a raster image
/// (PNG/WebP), then the built-in line glyph. The glyph is not a placeholder to
/// be embarrassed about — it is the guaranteed floor. Every screen renders
/// correctly with no network, no artwork configured, and no CDN, because the
/// fallback is bundled in the binary.
///
/// The rules that make this safe to scatter across every card:
///
///  * It NEVER shows a broken-image box or an error glyph. A failed download
///    falls through to the icon, because a card missing its picture should
///    look intentional rather than broken.
///  * It NEVER reflows. The box is a fixed [size] whatever the source, so a
///    late-arriving image cannot shift a list under the user's thumb.
///  * Relative URLs from the API (`/media/artwork/...`) are resolved against
///    the API host by the caller via [resolveUrl]; anything already absolute
///    is passed through.
class AppArtwork extends StatelessWidget {
  const AppArtwork({
    super.key,
    required this.fallbackIcon,
    this.imageUrl,
    this.animationUrl,
    this.size = 44,
    this.iconSize,
    this.background,
    this.foreground,
    this.radius,
    this.animate = true,
    this.padding,
  });

  /// Rendered when there is no artwork, or when fetching it fails.
  final AppIconData fallbackIcon;

  /// Absolute URL. Resolve relative API paths before passing them in.
  final String? imageUrl;
  final String? animationUrl;

  final double size;
  final double? iconSize;
  final Color? background;
  final Color? foreground;
  final BorderRadius? radius;

  /// Lottie files loop by default. Set false for a still frame — a grid of
  /// twelve looping animations is a battery drain and visually incoherent.
  final bool animate;

  /// Inset between the tile edge and the artwork. Illustrations usually want
  /// breathing room; a full-bleed photo wants none.
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    // `size: double.infinity` means "fill whatever box you are given" — a grid
    // cell, an aspect-ratio square. The glyph, the inset and the corner radius
    // are all proportional to the tile, so in that case they have to come from
    // the constraints instead; multiplying infinity by 0.18 is an infinite
    // padding and a layout assertion rather than a big tile.
    if (!size.isFinite) {
      return LayoutBuilder(
        builder: (context, constraints) => _paint(
          context,
          _edgeOf(constraints, MediaQuery.sizeOf(context)),
          expand: true,
        ),
      );
    }
    return _paint(context, size, expand: false);
  }

  /// The shorter finite edge of the box, which is what a square tile's
  /// proportions should key off.
  static double _edgeOf(BoxConstraints constraints, Size screen) {
    final width = constraints.hasBoundedWidth ? constraints.maxWidth : screen.width;
    final height = constraints.hasBoundedHeight ? constraints.maxHeight : screen.height;
    return width < height ? width : height;
  }

  Widget _paint(BuildContext context, double edge, {required bool expand}) {
    final t = context.tokens;
    final resolvedBackground = background ?? t.primarySoft;
    final resolvedForeground = foreground ?? t.primary;
    final resolvedRadius = radius ?? BorderRadius.circular(edge * 0.32);

    return Container(
      width: expand ? null : edge,
      height: expand ? null : edge,
      decoration: BoxDecoration(color: resolvedBackground, borderRadius: resolvedRadius),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: padding ?? EdgeInsets.all(edge * 0.18),
        child: _content(context, resolvedForeground, edge),
      ),
    );
  }

  Widget _content(BuildContext context, Color foreground, double edge) {
    final animation = animationUrl;
    if (animation != null && animation.isNotEmpty) {
      return Lottie.network(
        animation,
        animate: animate,
        fit: BoxFit.contain,
        // Lottie has no error callback that can rebuild, so the frame builder
        // carries the fallback for both the loading and the failed case.
        errorBuilder: (context, error, stack) => _image(context, foreground, edge),
        frameBuilder: (context, child, composition) {
          if (composition == null) return _image(context, foreground, edge);
          return child;
        },
      );
    }
    return _image(context, foreground, edge);
  }

  Widget _image(BuildContext context, Color foreground, double edge) {
    final image = imageUrl;
    if (image == null || image.isEmpty) return _glyph(foreground, edge);

    return CachedNetworkImage(
      imageUrl: image,
      fit: BoxFit.contain,
      // No spinner. A 44px tile with a spinner in it reads as broken; the
      // glyph is a complete, correct rendering that happens to be replaced.
      placeholder: (context, _) => _glyph(foreground, edge),
      errorWidget: (context, _, __) => _glyph(foreground, edge),
      fadeInDuration: Motion.base,
      // The tile is small and fixed; decoding at full resolution wastes
      // memory across a long list.
      memCacheWidth: (edge * MediaQuery.devicePixelRatioOf(context) * 2).round(),
    );
  }

  Widget _glyph(Color foreground, double edge) => Center(
        child: AppIcon(fallbackIcon, size: iconSize ?? edge * 0.5, color: foreground),
      );
}

/// Resolve an artwork path returned by the API.
///
/// The backend serves artwork from its own origin as `/media/artwork/<id>.png`,
/// so the app has to put the host back on. Anything already absolute — a CDN,
/// or artwork hosted by a cooperative — is left alone.
String? resolveArtworkUrl(String? path, String baseUrl) {
  if (path == null || path.isEmpty) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  final host = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
  final suffix = path.startsWith('/') ? path : '/$path';
  return '$host$suffix';
}

/// Parse `#3B63F5` into a [Color].
///
/// Returns null rather than throwing on anything malformed: an accent colour
/// is decoration, and bad reference data must not take a screen down.
Color? parseHexColor(String? value) {
  if (value == null) return null;
  final hex = value.startsWith('#') ? value.substring(1) : value;
  if (hex.length != 6 && hex.length != 8) return null;
  final parsed = int.tryParse(hex, radix: 16);
  if (parsed == null) return null;
  return Color(hex.length == 6 ? 0xFF000000 | parsed : parsed);
}

/// A larger piece of artwork for hero and empty-state use.
///
/// Same fallback discipline as [AppArtwork], but sized for a block rather than
/// a tile, and with no tinted container behind it.
class AppIllustration extends StatelessWidget {
  const AppIllustration({
    super.key,
    this.imageUrl,
    this.animationUrl,
    this.assetAnimation,
    this.fallbackIcon,
    this.height = 180,
    this.animate = true,
  });

  final String? imageUrl;
  final String? animationUrl;

  /// A bundled Lottie asset, for states that must work with no network at all
  /// — the offline empty state being the obvious one.
  final String? assetAnimation;

  final AppIconData? fallbackIcon;
  final double height;
  final bool animate;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    Widget fallback() {
      final icon = fallbackIcon;
      if (icon == null) return SizedBox(height: height);
      return Center(
        child: AppIcon(icon, size: height * 0.38, color: t.textTertiary),
      );
    }

    Widget child;
    final asset = assetAnimation;
    final network = animationUrl;
    final image = imageUrl;

    if (asset != null && asset.isNotEmpty) {
      child = Lottie.asset(
        asset,
        animate: animate,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stack) => fallback(),
      );
    } else if (network != null && network.isNotEmpty) {
      child = Lottie.network(
        network,
        animate: animate,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stack) => fallback(),
        frameBuilder: (context, c, composition) => composition == null ? fallback() : c,
      );
    } else if (image != null && image.isNotEmpty) {
      child = CachedNetworkImage(
        imageUrl: image,
        fit: BoxFit.contain,
        placeholder: (context, _) => fallback(),
        errorWidget: (context, _, __) => fallback(),
        fadeInDuration: Motion.base,
      );
    } else {
      child = fallback();
    }

    return SizedBox(
      height: height,
      width: double.infinity,
      child: Padding(padding: const EdgeInsets.all(Space.x2), child: child),
    );
  }
}
