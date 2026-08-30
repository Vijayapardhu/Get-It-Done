import 'dart:async';
import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:vibration/vibration.dart';

import '../models/worker_models.dart';
import '../offers/offer_inbox.dart';

/// The offer, when the app is not on screen.
///
/// WORKER_APP_PLAN 4.2 and 7.1. The socket only exists while the app is
/// foregrounded, which is the minority of a shift. Every other minute, the
/// offer arrives as a high-priority FCM **data** message — not a notification
/// message — and this class is what turns it into something a worker in a
/// pocket notices in time to answer.
///
/// A data message is deliberate. A notification message is drawn by Android
/// itself, which can only render a title and a body; this offer has to become a
/// full-screen interrupt with a countdown ring, two 64dp buttons and a custom
/// sound, and only the app can draw that.
class OfferNotifications {
  OfferNotifications(this._plugin);

  final FlutterLocalNotificationsPlugin _plugin;

  /// A channel of its own, at `Importance.max`.
  ///
  /// Separate from the general channel so a worker can silence "your payout
  /// settled" at 9pm without silencing their income. It also means the sound
  /// and the full-screen behaviour are set once, by Android, at channel
  /// creation — changing them later needs a new channel id, which is why this
  /// one is versioned.
  static const offerChannelId = 'gid_job_offers_v1';
  static const generalChannelId = 'gid_worker_general';

  static const _offerNotificationId = 7001;

  Future<void> initialise({required void Function(String? payload) onTapped}) async {
    const android = AndroidInitializationSettings('@drawable/ic_stat_gid');
    const ios = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    await _plugin.initialize(
      settings: const InitializationSettings(android: android, iOS: ios),
      onDidReceiveNotificationResponse: (response) => onTapped(response.payload),
    );

    final android0 = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();

    await android0?.createNotificationChannel(const AndroidNotificationChannel(
      offerChannelId,
      'Job offers',
      description: 'A new job is being offered to you. You have seconds to answer.',
      importance: Importance.max,
      playSound: true,
      enableVibration: true,
      // Bypasses Do Not Disturb where the user has allowed it. A worker who has
      // gone on duty has asked to be interrupted; that is what the duty toggle
      // means.
      audioAttributesUsage: AudioAttributesUsage.alarm,
    ));

    await android0?.createNotificationChannel(const AndroidNotificationChannel(
      generalChannelId,
      'Updates',
      description: 'Payouts, reminders, and documents about to expire.',
      importance: Importance.defaultImportance,
    ));
  }

  /// Ask for what is needed, and nothing more.
  ///
  /// `requestFullScreenIntentPermission` is the Android 14 grant behind
  /// `USE_FULL_SCREEN_INTENT`. Without it the offer arrives as an ordinary
  /// heads-up notification — still useful, still answerable, just not
  /// impossible to miss — so a refusal degrades rather than breaks.
  Future<bool> requestPermissions() async {
    if (Platform.isIOS) {
      final ios = _plugin.resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin>();
      return await ios?.requestPermissions(alert: true, badge: true, sound: true) ?? false;
    }

    final android = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    final notifications = await android?.requestNotificationsPermission() ?? false;
    await android?.requestFullScreenIntentPermission();
    return notifications;
  }

  /// Draw the offer.
  ///
  /// `fullScreenIntent` is what wakes a locked screen. `timeoutAfter` matches
  /// the remaining window, so the notification removes itself rather than
  /// leaving a worker tapping a job that expired while their phone was in a
  /// pocket — the single most demoralising thing this app could do.
  Future<void> showOffer(JobOffer offer, Duration remaining) async {
    if (remaining <= Duration.zero) return;

    final details = AndroidNotificationDetails(
      offerChannelId,
      'Job offers',
      channelDescription: 'A new job is being offered to you.',
      importance: Importance.max,
      priority: Priority.max,
      category: AndroidNotificationCategory.call,
      fullScreenIntent: true,
      ongoing: true,
      autoCancel: false,
      timeoutAfter: remaining.inMilliseconds,
      // The two facts that decide it, in the two lines Android will show.
      ticker: 'New job offer',
    );

    await _plugin.show(
      id: _offerNotificationId,
      title: '${offer.serviceName}${offer.isEmergency ? ' — emergency' : ''}',
      body: _offerLine(offer),
      notificationDetails: NotificationDetails(
        android: details,
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentSound: true,
          interruptionLevel: InterruptionLevel.timeSensitive,
        ),
      ),
      payload: offer.offerId,
    );

    await _buzz();
  }

  /// Money first, then distance. In the two seconds a worker looks at a
  /// notification, those are the two facts that decide it.
  String _offerLine(JobOffer offer) {
    final parts = <String>['₹${offer.payout.round()}'];
    if (offer.distanceKm != null) parts.add('${offer.distanceKm!.toStringAsFixed(1)} km');
    if (offer.area != null && offer.area!.isNotEmpty) parts.add(offer.area!);
    return parts.join(' · ');
  }

  /// A pattern, not a single buzz.
  ///
  /// A phone in a trouser pocket against a leg, in a stairwell, next to a
  /// running drill, has to be felt rather than heard. Three long pulses is
  /// distinguishable from every other notification on the device.
  Future<void> _buzz() async {
    try {
      if (await Vibration.hasVibrator()) {
        await Vibration.vibrate(pattern: [0, 400, 200, 400, 200, 400], intensities: [0, 255, 0, 255, 0, 255]);
      }
    } catch (error) {
      debugPrint('[offers] vibration unavailable: $error');
    }
  }

  Future<void> dismissOffer() => _plugin.cancel(id: _offerNotificationId);
}

/// FCM plumbing, kept apart from the drawing above.
class OfferPush {
  OfferPush({required this.inbox, required this.notifications});

  final OfferInbox inbox;
  final OfferNotifications notifications;

  StreamSubscription<RemoteMessage>? _foreground;
  StreamSubscription<RemoteMessage>? _opened;

  /// Register the device and start listening.
  ///
  /// [registerToken] is the caller's business because it needs an authenticated
  /// client, and this runs before and after sign-in.
  Future<void> start({required Future<void> Function(String token) registerToken}) async {
    final messaging = FirebaseMessaging.instance;

    await messaging.requestPermission(alert: true, badge: true, sound: true);

    final token = await messaging.getToken();
    if (token != null) await registerToken(token);
    messaging.onTokenRefresh.listen(registerToken);

    _foreground = FirebaseMessaging.onMessage.listen(_handle);
    _opened = FirebaseMessaging.onMessageOpenedApp.listen(_handle);

    // A cold start from a tapped notification. The offer is in the payload, so
    // it renders before any network call — which on the connections this app
    // has to work over is the difference between answering in time and not.
    final initial = await messaging.getInitialMessage();
    if (initial != null) _handle(initial);
  }

  void _handle(RemoteMessage message) {
    if (message.data['type'] != 'job_offer') return;

    final offer = inbox.addFromPushData(message.data);
    if (offer == null) {
      // The payload did not parse, or the offer had already expired. Ask the
      // server rather than guessing: a push we could not read still means
      // something happened.
      unawaited(inbox.reconcile());
      return;
    }

    // Only draw a notification when the app is not already showing the offer.
    // Two countdowns for one job is worse than none.
    final foreground = WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    if (!foreground) {
      unawaited(notifications.showOffer(offer, offer.expiresAt.difference(DateTime.now())));
    }
  }

  Future<void> dispose() async {
    await _foreground?.cancel();
    await _opened?.cancel();
  }
}

/// The background isolate handler.
///
/// Must be a top-level function: Android spins up a fresh isolate for a message
/// that arrives with the app killed, and it can only look up a static entry
/// point. Nothing from the running app is available here — no providers, no
/// navigator, no open database — so this does the one thing it can do, which is
/// draw the notification. The cold start that follows a tap reconciles.
@pragma('vm:entry-point')
Future<void> handleBackgroundOffer(RemoteMessage message) async {
  if (message.data['type'] != 'job_offer') return;

  final plugin = FlutterLocalNotificationsPlugin();
  final notifications = OfferNotifications(plugin);
  await notifications.initialise(onTapped: (_) {});

  final raw = message.data['offer'];
  if (raw is! String) return;

  try {
    // Parsed by hand rather than through the model: this isolate has none of
    // the app's imports warmed, and the two fields the notification needs are
    // cheaper to read directly than to build an object for.
    final expiresAt = DateTime.tryParse(message.data['expiresAt'] ?? '');
    final remaining = expiresAt?.difference(DateTime.now()) ?? const Duration(seconds: 45);
    if (remaining <= Duration.zero) return;

    await plugin.show(
      id: 7001,
      title: 'New job offer',
      body: 'Tap to see it. You have ${remaining.inSeconds} seconds.',
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          OfferNotifications.offerChannelId,
          'Job offers',
          importance: Importance.max,
          priority: Priority.max,
          category: AndroidNotificationCategory.call,
          fullScreenIntent: true,
          timeoutAfter: remaining.inMilliseconds,
        ),
      ),
      payload: message.data['offerId'],
    );
  } catch (error) {
    debugPrint('[offers] background handler failed: $error');
  }
}

