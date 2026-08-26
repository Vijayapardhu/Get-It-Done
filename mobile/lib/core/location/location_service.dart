import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

/// Device location.
///
/// Every failure mode is modelled explicitly rather than collapsed into null,
/// because they need different recovery: a denied prompt can be re-asked, a
/// permanently denied one needs Settings, and disabled services need the OS
/// location toggle. Showing "couldn't get location, try again" for all three
/// leaves the user stuck.
enum LocationFailure {
  /// The OS location toggle is off.
  servicesDisabled,

  /// Denied this time; asking again is allowed.
  denied,

  /// "Don't ask again" — only Settings can undo it.
  deniedForever,

  /// Timed out or the fix failed.
  unavailable,
}

sealed class LocationResult {
  const LocationResult();
}

class LocationSuccess extends LocationResult {
  const LocationSuccess({required this.latitude, required this.longitude, this.accuracy});

  final double latitude;
  final double longitude;
  final double? accuracy;
}

class LocationDenied extends LocationResult {
  const LocationDenied(this.failure);

  final LocationFailure failure;

  /// Copy that tells the user what to actually do.
  String get message => switch (failure) {
        LocationFailure.servicesDisabled =>
          'Location is switched off on your device. Turn it on to find workers near you.',
        LocationFailure.denied =>
          'We need your location to find verified workers nearby.',
        LocationFailure.deniedForever =>
          'Location access is blocked. Enable it for GET IT DONE in your device settings.',
        LocationFailure.unavailable =>
          "We couldn't get your location. You can enter your address instead.",
      };

  /// Whether offering a retry is worthwhile, or Settings is the only route.
  bool get canRetry => failure != LocationFailure.deniedForever;
}

class LocationService {
  /// Request a fix, handling the permission dance.
  ///
  /// Never throws: the caller always gets a [LocationResult] it can render.
  Future<LocationResult> current({Duration timeout = const Duration(seconds: 12)}) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        return const LocationDenied(LocationFailure.servicesDisabled);
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.deniedForever) {
        return const LocationDenied(LocationFailure.deniedForever);
      }
      if (permission == LocationPermission.denied) {
        return const LocationDenied(LocationFailure.denied);
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          // `medium` is deliberate: a booking address does not need GPS-grade
          // precision, and `high` costs battery and several extra seconds
          // indoors — which is exactly where someone books a plumber.
          accuracy: LocationAccuracy.medium,
          timeLimit: timeout,
        ),
      );

      return LocationSuccess(
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      );
    } catch (_) {
      return const LocationDenied(LocationFailure.unavailable);
    }
  }

  /// Last known fix — instant, possibly stale. Good for painting a map while
  /// the real fix resolves.
  Future<LocationResult> lastKnown() async {
    try {
      final position = await Geolocator.getLastKnownPosition();
      if (position == null) return const LocationDenied(LocationFailure.unavailable);
      return LocationSuccess(latitude: position.latitude, longitude: position.longitude);
    } catch (_) {
      return const LocationDenied(LocationFailure.unavailable);
    }
  }

  Future<void> openSettings() => Geolocator.openAppSettings();
  Future<void> openLocationSettings() => Geolocator.openLocationSettings();
}

final locationServiceProvider = Provider<LocationService>((ref) => LocationService());
