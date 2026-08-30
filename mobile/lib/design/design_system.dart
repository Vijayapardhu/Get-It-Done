/// The customer app's view of the design system.
///
/// Everything reusable moved to `package:gid_ui` when the worker app arrived.
/// What is left here is what has a customer noun in it and therefore has no
/// business in an app whose home screen is a duty toggle.
///
/// Screens keep importing this file rather than the package directly, so the
/// extraction changed where the tokens live and not how a screen asks for them.
library;

export 'package:gid_ui/gid_ui.dart';

export 'components/service_tile.dart';
export 'components/worker_card.dart';
