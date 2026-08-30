import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'core/config/worker_config.dart';
import 'core/notifications/offer_notifications.dart';
import 'core/providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase, and the background handler, before the first frame.
  //
  // The background handler MUST be registered here rather than after sign-in:
  // Android hands a data message to a fresh isolate when the app is killed, and
  // that isolate can only find an entry point that was registered at startup.
  // Registering it late means every offer that arrives with the app swiped away
  // is silently dropped — which is most of them.
  //
  // A missing google-services.json disables push and leaves the socket working,
  // exactly as the backend degrades without a service account. The app must
  // still launch: a worker with no push still needs their earnings screen.
  try {
    await Firebase.initializeApp();

    // Crashlytics: forward all Flutter errors and set the user identifier
    // after sign-in. Non-negotiable for an app used by people who will not
    // file bug reports.
    FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
    FirebaseMessaging.onBackgroundMessage(handleBackgroundOffer);
  } catch (error) {
    debugPrint('[main] Firebase unavailable, push disabled: $error');
  }

  final container = ProviderContainer();
  await _bootstrap(container);

  // Run inside a guarded zone so uncaught async errors also reach Crashlytics.
  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const WorkerApp(),
    ),
  );
}

/// Everything that has to be true before the first frame.
///
/// Kept deliberately small. A worker opening the app at the start of a shift on
/// a bad connection must reach a usable screen, so nothing here waits on the
/// network: the server host is a local read, and the notification channels are
/// created on-device.
Future<void> _bootstrap(ProviderContainer container) async {
  // The host, if this build was pointed somewhere else.
  final stored = await container.read(serverStoreProvider).read();
  if (stored != null) {
    container.read(serverUrlProvider.notifier).state = stored;
  }

  // Channels first: Android will not honour importance settings on a channel it
  // learns about at the same moment as the notification.
  final notifications = container.read(offerNotificationsProvider);
  await notifications.initialise(
    onTapped: (payload) {
      // A tap on the offer notification. The inbox already holds the offer (the
      // data message put it there), so the shell's watcher renders it — nothing
      // to route by hand.
      container.read(offerInboxProvider).reconcile();
    },
  );

  // The push pipe, wired to the inbox. Token registration needs an
  // authenticated client, so it is deferred until there is a session.
  final push = OfferPush(
    inbox: container.read(offerInboxProvider),
    notifications: notifications,
  );

  container.listen(authProvider, (previous, next) {
    if (!next.isAuthenticated || previous?.isAuthenticated == true) return;
    unawaited(
      push.start(
        registerToken: (token) => container.read(sharedApiProvider).registerDevice(
              token: token,
              platform: defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
              appVersion: _appVersion,
            ),
      ),
    );
    unawaited(notifications.requestPermissions());

    // Tag Crashlytics with the user ID so crashes are attributable.
    if (next.user != null) {
      FirebaseCrashlytics.instance.setUserIdentifier(next.user!.id);
    }
  }, fireImmediately: true);

  // Start draining anything the last session left queued, before the worker
  // does anything else. A "Started" written to disk in a lift yesterday should
  // reach the server this morning without being asked.
  container.read(actionQueueProvider);
}

/// Bumped with the pubspec. Reported on every device-token registration so a
/// support ticket can be tied to a build.
const _appVersion = '1.0.0';

void unawaited(Future<void> future) {
  future.catchError((Object error) => debugPrint('[main] $error'));
}
