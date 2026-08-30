import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

/// Wraps [FlutterForegroundTask] to keep the location pump alive when the
/// worker app is backgrounded on Android.
///
/// On iOS the foreground service is a no-op: iOS allows timer-based background
/// execution for a limited time, and the reconcile-on-resume path handles the
/// rest. On Android, the foreground notification is what tells the OS "this
/// process is actively doing work the user cares about" — without it, the
/// timer-based location pump is killed ~30s after the worker switches apps.
///
/// The service does NOT fetch locations itself. It simply keeps the process
/// alive so the existing [LocationPump] timer continues to fire.
class LocationForegroundService {
  LocationForegroundService();

  bool _running = false;
  bool get isRunning => _running;

  /// Show the foreground notification. Call when the worker goes on duty.
  ///
  /// Returns immediately if the service is already running. On platforms other
  /// than Android, this is a no-op.
  Future<void> start() async {
    if (_running) return;
    if (defaultTargetPlatform != TargetPlatform.android) {
      _running = true;
      return;
    }

    try {
      // Check and request notification permission for Android 13+
      final permission = await FlutterForegroundTask.checkNotificationPermission();
      if (permission != NotificationPermission.granted) {
        final granted = await FlutterForegroundTask.requestNotificationPermission();
        if (granted != NotificationPermission.granted) {
          debugPrint('[LocationService] notification permission denied');
          return;
        }
      }

      // Request exact alarms permission for Android 12+
      await FlutterForegroundTask.requestIgnoreBatteryOptimization();

      await FlutterForegroundTask.startService(
        serviceId: 777,
        notificationTitle: 'GET IT DONE',
        notificationText: 'Tracking your location for active jobs',
        notificationIcon: null,
      );
      _running = true;
    } catch (error) {
      debugPrint('[LocationService] failed to start: $error');
    }
  }

  /// Remove the foreground notification. Call when the worker goes off duty.
  ///
  /// On platforms other than Android, this is a no-op.
  Future<void> stop() async {
    if (!_running) return;
    if (defaultTargetPlatform != TargetPlatform.android) {
      _running = false;
      return;
    }

    try {
      await FlutterForegroundTask.stopService();
    } catch (error) {
      debugPrint('[LocationService] failed to stop: $error');
    }
    _running = false;
  }
}