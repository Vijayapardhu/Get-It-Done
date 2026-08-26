/// GET IT DONE design system.
///
/// One import for every screen:
/// ```dart
/// import 'package:getitdone_customer/design/design_system.dart';
/// ```
///
/// Rules this system encodes, so they do not have to be remembered:
///
///  * Colour is resolved through `context.tokens`, never a raw hex. Dark mode
///    is then a single definition, not a search-and-replace.
///  * Every gap comes from [Space]; every corner from [Radii].
///  * Icons are named by role in [AppIcons], never by glyph at the call site.
///  * A service category has exactly one icon+tint pairing, in [ServiceVisuals].
///  * Not everything is a card. Reach for [Section] first, [AppCard] only when
///    content genuinely groups.
///  * Animation communicates change. Durations and curves come from [Motion].
library;

export 'components/app_artwork.dart';
export 'components/app_badges.dart';
export 'components/app_bottom_nav.dart';
export 'components/app_button.dart';
export 'components/app_input.dart';
export 'components/app_states.dart';
export 'components/app_surface.dart';
export 'components/service_tile.dart';
export 'components/worker_card.dart';
export 'icons/app_icons.dart';
export 'icons/service_icons.dart';
export 'tokens/money.dart';
export 'theme/app_theme.dart';
export 'tokens/colors.dart';
export 'tokens/motion.dart';
export 'tokens/spacing.dart';
export 'tokens/typography.dart';
