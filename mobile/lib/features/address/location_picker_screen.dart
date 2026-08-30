import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'package:gid_core/gid_core.dart';
import '../../core/location/current_location.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';

/// Pick the exact spot on a map.
///
/// Typing an address gets you to a street; a worker needs the building. This is
/// the screen that closes that gap, and it is the one place in the app where
/// the map is the interface rather than an illustration.
///
/// The pin does not move — the map does. A draggable marker means aiming at a
/// small target with the thumb that is covering it; a fixed centre pin with the
/// map sliding underneath keeps the target under the eye instead of under the
/// hand, which is why every delivery app converged on it.
///
/// Returns the confirmed [GeoPlace] to the caller, or null if the user backs
/// out — so the screen that opened it decides what to do with the answer.
class LocationPickerScreen extends ConsumerStatefulWidget {
  const LocationPickerScreen({super.key, this.initial});

  /// Where to open. Falls back to the device's position, then to a wide view of
  /// the city, so the map is never staring at the middle of the ocean.
  final GeoPlace? initial;

  @override
  ConsumerState<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

/// Vijayawada. Only ever seen if the device has no position and no address was
/// passed in — better than the (0, 0) island the SDK defaults to.
const _fallbackCentre = LatLng(16.5062, 80.6480);

class _LocationPickerScreenState extends ConsumerState<LocationPickerScreen> {
  GoogleMapController? _map;
  final _searchController = TextEditingController();
  final _searchFocus = FocusNode();

  LatLng? _centre;

  /// The address under the pin. Null while it is being resolved, which is what
  /// the shimmering line at the bottom is for.
  GeoPlace? _resolved;
  bool _resolving = false;

  Timer? _settle;
  Timer? _typing;
  List<PlacePrediction> _predictions = const [];

  /// A search came back with nothing. Held separately from an empty
  /// [_predictions], which is also the state before anyone has typed — the
  /// difference is whether "no place matches that" is worth saying.
  bool _noMatches = false;
  bool _searching = false;

  /// Groups this search's keystrokes with the details lookup that ends it, so
  /// Google bills one session rather than one request per letter.
  String _sessionToken = ApiClient.newIdempotencyKey();

  @override
  void initState() {
    super.initState();
    final initial = widget.initial;
    if (initial != null && initial.hasCoordinates) {
      _centre = LatLng(initial.latitude!, initial.longitude!);
      _resolved = initial;
    }
    _searchFocus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _settle?.cancel();
    _typing?.cancel();
    _searchController.dispose();
    _searchFocus.dispose();
    _map?.dispose();
    super.dispose();
  }

  /// Where to open the map, once we know anything at all.
  Future<LatLng> _openingCentre() async {
    final existing = _centre;
    if (existing != null) return existing;

    final outcome = await ref.read(currentLocationProvider.future);
    final place = outcome.place;
    if (place == null) return _fallbackCentre;
    return LatLng(place.latitude, place.longitude);
  }

  /// The map stopped moving: name what is under the pin.
  ///
  /// Debounced, because onCameraMove fires continuously during a drag and each
  /// one would be a geocode. The user does not need the address of every point
  /// they scrolled past — only the one they stopped on.
  void _onCameraIdle() {
    _settle?.cancel();
    _settle = Timer(const Duration(milliseconds: 350), _resolveCentre);
  }

  Future<void> _resolveCentre() async {
    final centre = _centre;
    if (centre == null || !mounted) return;

    setState(() => _resolving = true);
    try {
      final place = await ref.read(apiProvider).reverseGeocode(
            latitude: centre.latitude,
            longitude: centre.longitude,
          );
      if (!mounted) return;
      setState(() {
        _resolved = place ??
            GeoPlace(
              formattedAddress: 'Dropped pin',
              latitude: centre.latitude,
              longitude: centre.longitude,
            );
        _resolving = false;
      });
    } on ApiException {
      if (!mounted) return;
      // The coordinates are what dispatch uses and we have them. Losing the
      // name is a smaller loss than refusing to let the user confirm.
      setState(() {
        _resolved = GeoPlace(
          formattedAddress: 'Dropped pin',
          latitude: centre.latitude,
          longitude: centre.longitude,
        );
        _resolving = false;
      });
    }
  }

  void _onSearchChanged(String value) {
    _typing?.cancel();
    final query = value.trim();

    if (query.length < 3) {
      setState(() { _predictions = const []; _searching = false; _noMatches = false; });
      return;
    }

    setState(() { _searching = true; _noMatches = false; });
    _typing = Timer(const Duration(milliseconds: 300), () async {
      try {
        final results = await ref.read(apiProvider).autocompleteAddress(
              query,
              latitude: _centre?.latitude,
              longitude: _centre?.longitude,
              sessionToken: _sessionToken,
            );
        if (!mounted) return;
        setState(() {
          _predictions = results;
          _searching = false;
          _noMatches = results.isEmpty;
        });
      } on ApiException {
        if (!mounted) return;
        // A failed lookup is not "no such place" — saying so would send the
        // user hunting for a different spelling of an address that exists.
        setState(() { _predictions = const []; _searching = false; _noMatches = false; });
      }
    });
  }

  Future<void> _choosePrediction(PlacePrediction prediction) async {
    _searchFocus.unfocus();
    setState(() {
      _predictions = const [];
      _searching = false;
      _noMatches = false;
      _resolving = true;
    });

    try {
      final place = await ref.read(apiProvider).placeDetails(prediction.placeId);
      // The session ends with the details call it paid for; the next search
      // starts a new one.
      _sessionToken = ApiClient.newIdempotencyKey();

      if (!mounted) return;
      if (place == null || !place.hasCoordinates) {
        setState(() => _resolving = false);
        return;
      }

      _searchController.text = place.shortLabel;
      final target = LatLng(place.latitude!, place.longitude!);
      setState(() { _centre = target; _resolved = place; _resolving = false; });
      await _map?.animateCamera(CameraUpdate.newLatLngZoom(target, 17));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _resolving = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _goToCurrentLocation() async {
    final outcome = await ref.read(currentLocationProvider.future);
    final place = outcome.place;

    if (!mounted) return;
    if (place == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(outcome.problem?.message ?? 'We could not find your location.'),
      ));
      return;
    }

    final target = LatLng(place.latitude, place.longitude);
    setState(() => _centre = target);
    await _map?.animateCamera(CameraUpdate.newLatLngZoom(target, 17));
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    // Shown because there is something to show, not because a field happens
    // to hold focus. Gating on focus meant the list vanished the instant the
    // keyboard was dismissed — including on devices that drop focus while a
    // request is in flight — and, when the node was not attached to anything
    // at all, meant it never appeared once.
    final query = _searchController.text.trim();
    final showingPredictions =
        query.length >= 3 && (_searching || _predictions.isNotEmpty || _noMatches);

    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Confirm your location'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.x5, 0, Space.x5, Space.x4),
            child: AppSearchField(
              hint: 'Search locality, area or landmark',
              controller: _searchController,
              // Attached, so unfocusing after a pick actually dismisses the
              // keyboard. Whether the list SHOWS no longer depends on it.
              focusNode: _searchFocus,
              onChanged: _onSearchChanged,
              trailing: _searchController.text.isEmpty
                  ? null
                  : AppIconButton(
                      icon: AppIcons.close,
                      size: 32,
                      iconSize: Sizes.iconSm,
                      onPressed: () {
                        _searchController.clear();
                        setState(() {
                          _predictions = const [];
                          _searching = false;
                          _noMatches = false;
                        });
                      },
                    ),
            ),
          ),

          Expanded(
            child: Stack(
              children: [
                Positioned.fill(child: _buildMap()),

                // The pin. Fixed dead centre, offset up by half its height so
                // its point — not its middle — marks the spot.
                const Positioned.fill(child: IgnorePointer(child: _CentrePin())),

                Positioned(
                  right: Space.x4,
                  top: Space.x4,
                  child: _MapButton(
                    icon: AppIcons.location,
                    tooltip: 'Go to my current location',
                    onTap: _goToCurrentLocation,
                  ),
                ),

                // Suggestions cover the map while typing. A list that pushed
                // the map down would resize it on every keystroke.
                if (showingPredictions)
                  Positioned.fill(
                    child: _PredictionList(
                      predictions: _predictions,
                      searching: _searching,
                      onSelect: _choosePrediction,
                    ),
                  ),
              ],
            ),
          ),

          _ConfirmPanel(
            place: _resolved,
            resolving: _resolving,
            onConfirm: _resolved == null
                ? null
                : () => Navigator.of(context).pop<GeoPlace>(_resolved),
          ),
        ],
      ),
    );
  }

  Widget _buildMap() {
    return FutureBuilder<LatLng>(
      future: _openingCentre(),
      builder: (context, snapshot) {
        final centre = snapshot.data;
        if (centre == null) {
          return Container(
            color: context.tokens.surfaceAlt,
            alignment: Alignment.center,
            child: CircularProgressIndicator(color: context.tokens.primary),
          );
        }

        return GoogleMap(
          initialCameraPosition: CameraPosition(target: centre, zoom: 17),
          onMapCreated: (controller) {
            _map = controller;
            _centre ??= centre;
            // Name the opening position too, so the panel is filled in before
            // the user touches anything.
            if (_resolved == null) _resolveCentre();
          },
          onCameraMove: (position) => _centre = position.target,
          onCameraIdle: _onCameraIdle,
          // The blue dot and its accuracy circle, drawn by the SDK. The button
          // that flies to it is ours, above — the SDK's own sits where the
          // panel would cover it.
          myLocationEnabled: true,
          myLocationButtonEnabled: false,
          zoomControlsEnabled: false,
          mapToolbarEnabled: false,
        );
      },
    );
  }
}

/// The pin the map moves under.
class _CentrePin extends StatelessWidget {
  const _CentrePin();

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: Space.x3, vertical: Space.x2),
            decoration: BoxDecoration(
              color: t.textPrimary,
              borderRadius: BorderRadius.circular(Radii.md),
            ),
            child: Text(
              'Set this as your location',
              style: context.text.labelSmall?.copyWith(
                color: t.surface,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          // The tail of the callout.
          CustomPaint(size: const Size(12, 6), painter: _TailPainter(color: t.textPrimary)),
          const SizedBox(height: Space.x1),
          AppIcon(AppIcons.location, size: 36, color: t.primary, bold: true),
          // Offsets the pin so its point lands on the map centre rather than
          // its middle. Without this, every address is off by half a pin.
          const SizedBox(height: 36),
        ],
      ),
    );
  }
}

class _TailPainter extends CustomPainter {
  const _TailPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
  }

  @override
  bool shouldRepaint(_TailPainter oldDelegate) => oldDelegate.color != color;
}

class _MapButton extends StatelessWidget {
  const _MapButton({required this.icon, required this.tooltip, required this.onTap});

  final AppIconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(Radii.md),
            boxShadow: t.cardShadow,
          ),
          alignment: Alignment.center,
          child: AppIcon(icon, size: 20, color: t.primary, bold: true),
        ),
      ),
    );
  }
}

class _PredictionList extends StatelessWidget {
  const _PredictionList({
    required this.predictions,
    required this.searching,
    required this.onSelect,
  });

  final List<PlacePrediction> predictions;
  final bool searching;
  final ValueChanged<PlacePrediction> onSelect;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Container(
      color: t.surface,
      child: searching && predictions.isEmpty
          ? const Padding(
              padding: Space.pageInsets,
              child: SkeletonCard(lines: 3, hasAvatar: false),
            )
          : predictions.isEmpty
              ? Padding(
                  padding: Space.pageInsets,
                  child: Text(
                    'No place matches that. Try a landmark, or move the pin on the map.',
                    style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: Space.x2),
                  itemCount: predictions.length,
                  separatorBuilder: (_, __) => Divider(height: 1, color: t.border),
                  itemBuilder: (context, i) {
                    final prediction = predictions[i];
                    return ListTile(
                      leading: AppIcon(AppIcons.location, size: 20, color: t.textTertiary),
                      title: Text(
                        prediction.primary,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.titleSmall,
                      ),
                      subtitle: prediction.secondary.isEmpty
                          ? null
                          : Text(
                              prediction.secondary,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                            ),
                      onTap: () => onSelect(prediction),
                    );
                  },
                ),
    );
  }
}

/// What is under the pin, and the button that accepts it.
class _ConfirmPanel extends StatelessWidget {
  const _ConfirmPanel({
    required this.place,
    required this.resolving,
    required this.onConfirm,
  });

  final GeoPlace? place;
  final bool resolving;
  final VoidCallback? onConfirm;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.x5, Space.x4, Space.x5, Space.x4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppIconBadge(AppIcons.location, size: 40),
                  const SizedBox(width: Space.x3),
                  Expanded(
                    child: resolving || place == null
                        ? const SkeletonCard(lines: 2, hasAvatar: false)
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                shortenAddress(place!.formattedAddress, parts: 1),
                                style: context.text.titleMedium,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                place!.formattedAddress,
                                style: context.text.bodySmall
                                    ?.copyWith(color: t.textSecondary),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                  ),
                ],
              ),
              const SizedBox(height: Space.x4),
              AppButton.primary(
                label: 'Confirm location',
                onPressed: onConfirm,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
