import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/gid_api.dart';
import '../cart/checkout.dart';
import '../models/models.dart';
import '../network/api_exception.dart';
import '../providers.dart';
import 'address_format.dart';
import 'location_service.dart';

/// Where the phone says it is, turned into something a worker could find.
///
/// Resolved once when the app opens rather than on demand, so the home header
/// can offer "your current location" as a real, named place instead of a button
/// that makes the user wait to find out whether it works.
class DetectedLocation {
  const DetectedLocation({
    required this.latitude,
    required this.longitude,
    required this.address,
  });

  final double latitude;
  final double longitude;

  /// The full formatted address from Google, e.g.
  /// "29-5-35, 1st Line, Mogalrajapuram, Vijayawada, Andhra Pradesh 520010,
  /// India". Shown short in the header, in full in the picker.
  final String address;

  String get shortAddress => shortenAddress(address);
}

/// Why we could not say where the phone is, in terms the user can act on.
class LocationUnavailable {
  const LocationUnavailable(this.message, {this.canRetry = true, this.needsSettings = false});

  final String message;
  final bool canRetry;
  final bool needsSettings;
}

/// The outcome of asking the phone where it is: a place, or a reason.
///
/// One object rather than two providers, because the underlying call prompts
/// for permission -- resolving "where am I" and "why not" separately would run
/// that dance twice and show the user two dialogs for one question.
class LocationOutcome {
  const LocationOutcome({this.place, this.problem});

  final DetectedLocation? place;
  final LocationUnavailable? problem;

  bool get hasPlace => place != null;
}

/// The device's position, resolved when the app opens.
///
/// Never throws and never leaves the header waiting: an app that cannot see
/// your GPS is not broken, it just has one fewer shortcut to offer, and the
/// saved addresses still work.
final currentLocationProvider = FutureProvider<LocationOutcome>((ref) async {
  final result = await ref.watch(locationServiceProvider).current();

  if (result is LocationDenied) {
    return LocationOutcome(
      problem: LocationUnavailable(
        result.message,
        canRetry: result.canRetry,
        needsSettings: result.failure == LocationFailure.deniedForever,
      ),
    );
  }

  final fix = result as LocationSuccess;

  try {
    final place = await ref.watch(apiProvider).reverseGeocode(
          latitude: fix.latitude,
          longitude: fix.longitude,
        );
    return LocationOutcome(
      place: DetectedLocation(
        latitude: fix.latitude,
        longitude: fix.longitude,
        // The coordinates are what dispatch actually uses; without a readable
        // address we still know where they are, we just cannot name it.
        address: place?.formattedAddress ?? 'Your current location',
      ),
    );
  } on ApiException {
    return LocationOutcome(
      place: DetectedLocation(
        latitude: fix.latitude,
        longitude: fix.longitude,
        address: 'Your current location',
      ),
    );
  }
});

/// The saved address that stands for "where I am now".
///
/// One row, reused. Picking the current location repeatedly would otherwise
/// leave a trail of near-identical saved addresses, and the list of places a
/// customer books to is meant to be short enough to read.
const currentLocationLabel = 'Current location';

/// Save the detected position as an address and return it, so the rest of the
/// app -- checkout, orders, worker matching -- can treat it like any other.
Future<SavedAddress> saveDetectedLocation(
  GidApi api,
  DetectedLocation detected,
  List<SavedAddress> existing,
) async {
  final previous =
      existing.where((address) => address.name == currentLocationLabel).firstOrNull;

  if (previous != null) {
    return api.updateAddress(
      previous.id,
      address: detected.address,
      latitude: detected.latitude,
      longitude: detected.longitude,
    );
  }

  return api.createAddress(
    name: currentLocationLabel,
    address: detected.address,
    latitude: detected.latitude,
    longitude: detected.longitude,
  );
}

/// Resolve the phone's position when the app opens, and adopt it if the
/// customer has nowhere saved yet.
///
/// Watched by the home header, which is what makes the location request happen
/// on open rather than on the first tap. Two separate jobs, deliberately kept
/// in one place:
///
///  * It warms [currentLocationProvider], so by the time someone opens the
///    picker the address is already there instead of spinning.
///  * On a first run -- a new account, or a demo build handed to someone -- it
///    turns "Set your location" into the place they are actually standing.
///
/// It does NOT touch an existing choice. Someone who has saved Home and Office
/// picked those on purpose, and silently replacing them with wherever the phone
/// happens to be is how an app books a plumber to the wrong house.
final locationBootstrapProvider = FutureProvider<void>((ref) async {
  // read, not watch: this provider invalidates the address list below, and
  // watching what you invalidate is a loop.
  //
  // A failure here is not worth reporting and must not propagate: this runs
  // unprompted at launch, so an error state would be an error nobody asked
  // for, attached to nothing the customer did. The header keeps saying "Set
  // your location", which is honest and one tap from the picker.
  final List<SavedAddress> addresses;
  try {
    addresses = await ref.read(addressesProvider.future);
  } catch (_) {
    return;
  }
  if (addresses.isNotEmpty) return;

  final outcome = await ref.watch(currentLocationProvider.future);
  final place = outcome.place;
  if (place == null) return;

  try {
    final saved = await saveDetectedLocation(ref.read(apiProvider), place, addresses);
    ref.invalidate(addressesProvider);
    ref.read(checkoutProvider.notifier).setAddress(saved.id);
  } on ApiException {
    // The header falls back to "Set your location", which is honest and one
    // tap from the picker. Nothing to announce.
  }
});
