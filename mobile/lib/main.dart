import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'core/notifications/push_messaging.dart';
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

  // Must be registered before runApp: Flutter looks the handler up when a
  // message arrives with the app killed, and a registration that happens later
  // in the widget tree is not there yet when that isolate spins up.
  FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);

  runApp(const ProviderScope(child: GetItDoneApp()));
}
