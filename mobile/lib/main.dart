import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'core/config/server_config.dart';
import 'core/config/theme_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Awaited rather than loaded lazily: the first thing the app does is restore
  // the session, and a request that goes to the build default and is then
  // re-sent somewhere else has already leaked a token to the wrong host.
  await ServerStore.load();

  // Read before the first frame, so someone who chose dark never watches the
  // app paint light and then snap.
  await ThemeStore.load();

  runApp(const ProviderScope(child: GetItDoneApp()));
}
