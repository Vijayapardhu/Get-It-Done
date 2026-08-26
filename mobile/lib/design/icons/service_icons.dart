import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';

import '../tokens/colors.dart';

/// Icon + accent pairing for each service category.
///
/// The backend's `/services` returns a free-text `category`, so this maps a
/// normalised slug onto a glyph and a tint. Keeping the pairing in one table is
/// what stops "Plumbing" being blue on the home grid and teal on the booking
/// screen.
///
/// Tints are muted on purpose. Saturated category colours turn the home grid
/// into a toy; these read as a considered palette that happens to be varied.
@immutable
class ServiceVisual {
  const ServiceVisual({
    required this.icon,
    required this.accent,
    required this.accentSoft,
  });

  final List<List<dynamic>> icon;

  /// For the glyph itself and any emphasis stroke.
  final Color accent;

  /// Tile background.
  final Color accentSoft;

  /// Dark mode cannot use the light soft tint — it is far too bright against
  /// navy. Blend the accent into the dark surface instead.
  Color softFor(Brightness brightness) {
    if (brightness == Brightness.light) return accentSoft;
    return Color.alphaBlend(accent.withValues(alpha: 0.18), AppColors.darkSurface);
  }

  /// The glyph needs lifting in dark mode or it disappears into the tile.
  Color accentFor(Brightness brightness) {
    if (brightness == Brightness.light) return accent;
    return Color.lerp(accent, Colors.white, 0.32)!;
  }
}

abstract final class ServiceVisuals {
  static const plumbing = ServiceVisual(
    icon: HugeIcons.strokeRoundedWrench01,
    accent: AppColors.servicePlumbing,
    accentSoft: AppColors.servicePlumbingSoft,
  );

  static const electrical = ServiceVisual(
    icon: HugeIcons.strokeRoundedPlug01,
    accent: AppColors.serviceElectrical,
    accentSoft: AppColors.serviceElectricalSoft,
  );

  static const cleaning = ServiceVisual(
    icon: HugeIcons.strokeRoundedCleaningBucket,
    accent: AppColors.serviceCleaning,
    accentSoft: AppColors.serviceCleaningSoft,
  );

  static const painting = ServiceVisual(
    icon: HugeIcons.strokeRoundedPaintBrush01,
    accent: AppColors.servicePainting,
    accentSoft: AppColors.servicePaintingSoft,
  );

  static const carpentry = ServiceVisual(
    icon: HugeIcons.strokeRoundedTools,
    accent: AppColors.serviceCarpentry,
    accentSoft: AppColors.serviceCarpentrySoft,
  );

  static const appliance = ServiceVisual(
    icon: HugeIcons.strokeRoundedWashingMachine,
    accent: AppColors.serviceAppliance,
    accentSoft: AppColors.serviceApplianceSoft,
  );

  static const climate = ServiceVisual(
    icon: HugeIcons.strokeRoundedFan01,
    accent: AppColors.serviceAppliance,
    accentSoft: AppColors.serviceApplianceSoft,
  );

  static const pest = ServiceVisual(
    icon: HugeIcons.strokeRoundedBug01,
    accent: AppColors.servicePest,
    accentSoft: AppColors.servicePestSoft,
  );

  static const other = ServiceVisual(
    icon: HugeIcons.strokeRoundedTools,
    accent: AppColors.serviceOther,
    accentSoft: AppColors.serviceOtherSoft,
  );

  /// Keyword → visual. Matched as substrings because the catalogue is
  /// admin-editable free text ("AC Repair & Service", "Deep Cleaning"), so exact
  /// keys would miss constantly. Order matters: more specific keys first.
  static const _byKeyword = <String, ServiceVisual>{
    'plumb': plumbing,
    'pipe': plumbing,
    'tap': plumbing,
    'water': plumbing,
    'electric': electrical,
    'wiring': electrical,
    'switch': electrical,
    'light': electrical,
    'clean': cleaning,
    'housekeep': cleaning,
    'sanit': cleaning,
    'paint': painting,
    'carpent': carpentry,
    'wood': carpentry,
    'furniture': carpentry,
    'appliance': appliance,
    'washing': appliance,
    'refriger': appliance,
    'fridge': appliance,
    'air condition': climate,
    'ac ': climate,
    'cooling': climate,
    'pest': pest,
    'termite': pest,
  };

  /// Resolve a service or category name to its visual, falling back to a
  /// neutral tool icon rather than rendering nothing.
  static ServiceVisual forName(String? name) {
    if (name == null || name.trim().isEmpty) return other;
    final needle = '${name.toLowerCase().trim()} ';
    for (final entry in _byKeyword.entries) {
      if (needle.contains(entry.key)) return entry.value;
    }
    return other;
  }
}
