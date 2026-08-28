import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/json.dart';
import '../providers.dart';
import '../realtime/realtime_service.dart';

/// System notifications for events that arrive over the socket.
///
/// This is the half of "push notifications" that can be built without a
/// Firebase project. The backend writes every booking update to `notifications`
/// and now emits it on `notification:new`; while the app is running — in the
/// foreground or backgrounded but alive — that event becomes a real system
/// notification here.
///
/// What it deliberately does NOT do is reach a device whose app has been
/// killed. That needs FCM, a Firebase project, and a service account key on the
/// server, none of which this deployment has. The gap is worth naming rather
/// than papering over: a customer who swipes the app away will still see the
/// update in the Alerts tab, but their phone will not buzz.
class LocalNotifications {
  LocalNotifications({FlutterLocalNotificationsPlugin? plugin})
      : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;

  /// One channel for everything about a booking.
  ///
  /// Android lets the user silence a channel, so splitting "worker assigned"
  /// from "job complete" would let someone mute half a job's progress and be
  /// surprised by the other half. One channel, one decision.
  static const _channelId = 'gid_bookings';

  bool _ready = false;

  /// Notification ids must be 32-bit signed on Android. The server's ids are
  /// UUIDs, so the string hash is folded into range — a collision only means a
  /// newer notification replaces an older one, which is the harmless direction.
  static int _idFor(String key) => key.hashCode & 0x7fffffff;

  Future<void> initialize() async {
    if (_ready || kIsWeb) return;

    await _plugin.initialize(
      settings: const InitializationSettings(
        // The launcher icon rather than a dedicated silhouette. Android tints
        // and masks the small icon, so a full-colour launcher renders as a
        // white blob — acceptable for now, and honest about it: a proper
        // monochrome `ic_stat_gid` drawable is the correct fix.
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          // Asked for at the moment the first notification matters, not on
          // first launch before the user knows what the app is for.
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
    );

    _ready = true;
  }

  /// Ask for permission, returning whether we have it.
  ///
  /// Android 13 requires POST_NOTIFICATIONS at runtime; below that the grant is
  /// implicit. iOS always asks.
  Future<bool> requestPermission() async {
    if (kIsWeb) return false;
    await initialize();

    if (Platform.isAndroid) {
      final android = _plugin.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      return await android?.requestNotificationsPermission() ?? false;
    }

    if (Platform.isIOS) {
      final ios = _plugin.resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin>();
      return await ios?.requestPermissions(alert: true, badge: true, sound: true) ?? false;
    }

    return false;
  }

  Future<void> show({
    required String id,
    required String title,
    required String body,
    String? payload,
  }) async {
    if (kIsWeb) return;
    await initialize();

    await _plugin.show(
      id: _idFor(id),
      title: title,
      body: body,
      payload: payload,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          'Booking updates',
          channelDescription:
              'When a worker is assigned, sets off, arrives or finishes the job.',
          // High rather than max: these matter, but none of them is an alarm.
          // Max would take over the screen for "job complete".
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
    );
  }
}

final localNotificationsProvider = Provider<LocalNotifications>((ref) {
  return LocalNotifications();
});

/// Turns socket notifications into system notifications, for as long as the app
/// is alive.
///
/// Watched once at the top of the widget tree rather than per screen: a
/// notification about a booking has to arrive whichever tab the user is on, and
/// a provider that only runs while the Alerts tab is open would deliver
/// precisely nothing.
final notificationBridgeProvider = Provider<void>((ref) {
  final realtime = ref.watch(realtimeServiceProvider);
  final notifier = ref.watch(localNotificationsProvider);

  final subscription = realtime.notifications.listen((json) {
    final title = asStringOrNull(pick(json, 'title'));
    final body = asStringOrNull(pick(json, 'body'));

    // A notification with no words is not worth waking a phone for.
    if (title == null && body == null) return;

    notifier.show(
      id: asStringOrNull(pick(json, 'id')) ?? DateTime.now().toIso8601String(),
      title: title ?? 'GET IT DONE',
      body: body ?? '',
      payload: asStringOrNull(pick(json, 'type')),
    );

    // The badge on the Alerts tab counts unread rows from the API, so the
    // count has to be refetched — otherwise the phone buzzes and the tab still
    // reads zero.
    ref.invalidate(notificationsProvider);
  });

  ref.onDispose(subscription.cancel);
});
