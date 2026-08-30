import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import 'local_notifications.dart';

/// Firebase Cloud Messaging: the half of push that survives the app being
/// closed.
///
/// [LocalNotifications] draws a notification while the app is alive, driven by
/// the socket. That covers a phone in the user's hand and nothing else. FCM is
/// what reaches a device whose app has been swiped away — which is exactly when
/// "your worker has arrived" needs to land.
///
/// Division of labour, so a user never sees the same thing twice:
///   * app closed / backgrounded — Android draws the FCM `notification` block
///     itself, before Dart is even running.
///   * app in the foreground — Android suppresses that, and [onMessage] hands
///     it to [LocalNotifications] so the shade still shows something.
///
/// Failure here is never fatal. A device with no Play Services, a revoked key
/// or an offline first launch simply gets no push; the socket, the Alerts tab
/// and the notification rows all still work.

/// Must be a top-level function: the background isolate has no access to
/// closures from the app's own isolate, and Flutter asserts on anything else.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  // Deliberately empty. The FCM `notification` block already causes Android to
  // draw the notification without Dart running, so re-drawing it here would
  // show the user two of everything.
  await Firebase.initializeApp();
}

class PushMessaging {
  PushMessaging(this._ref);

  final Ref _ref;
  bool _started = false;

  /// Wire up FCM. Safe to call more than once.
  ///
  /// Returns false when push is unavailable — no Firebase config, no Play
  /// Services, permission denied — so the caller can stay quiet rather than
  /// promising notifications that will not arrive.
  Future<bool> start() async {
    if (_started || kIsWeb) return _started;

    try {
      await Firebase.initializeApp();
    } catch (error, stack) {
      // Missing google-services.json, or a build without the gradle plugin.
      debugPrint('FCM unavailable: Firebase failed to initialise: $error\n$stack');
      return false;
    }

    final messaging = FirebaseMessaging.instance;

    // Android 13+ and iOS both gate notifications behind a runtime grant.
    final settings = await messaging.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      debugPrint('FCM: notification permission denied');
      return false;
    }

    // iOS will not issue an FCM token until APNs has handed one over.
    if (Platform.isIOS) {
      await messaging.getAPNSToken();
    }

    await _syncToken(await messaging.getToken());

    // Tokens rotate — on reinstall, on restore to a new device, or when
    // Firebase decides to. Without this the server keeps pushing to a dead
    // token and the user silently stops receiving anything.
    messaging.onTokenRefresh.listen(_syncToken);

    // Foreground: Android suppresses its own notification, so draw one.
    FirebaseMessaging.onMessage.listen((message) {
      final notification = message.notification;
      if (notification == null) return;

      _ref.read(localNotificationsProvider).show(
            id: message.messageId ?? DateTime.now().toIso8601String(),
            title: notification.title ?? 'GET IT DONE',
            body: notification.body ?? '',
            payload: message.data['type'] as String?,
          );

      // The Alerts tab badge counts unread rows from the API, so it has to be
      // refetched or the phone buzzes while the tab still reads zero.
      _ref.invalidate(notificationsProvider);
    });

    // Tapping a notification that opened the app: refresh so the tab is
    // already current when the user arrives at it.
    FirebaseMessaging.onMessageOpenedApp.listen((_) {
      _ref.invalidate(notificationsProvider);
    });

    _started = true;
    return true;
  }

  Future<void> _syncToken(String? token) async {
    if (token == null || token.isEmpty) return;
    try {
      await _ref.read(apiProvider).registerDevice(
            token: token,
            platform: Platform.isIOS ? 'ios' : 'android',
          );
    } catch (error) {
      // A failed registration must not block startup. The next launch retries,
      // and until then the socket still delivers to a live app.
      debugPrint('FCM: could not register device token: $error');
    }
  }
}

final pushMessagingProvider = Provider<PushMessaging>(PushMessaging.new);
