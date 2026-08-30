import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/location/location_service.dart';
import 'package:gid_core/gid_core.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import 'location_picker_screen.dart';

/// Saved addresses.
///
/// Coordinates are not optional here even though the backend column is
/// nullable: matching is a PostGIS radius search, so an address without a
/// location can be saved but never dispatched against. This screen therefore
/// always resolves one — from the device, or by geocoding what was typed —
/// and says so plainly when it cannot.
class AddressListScreen extends ConsumerWidget {
  const AddressListScreen({super.key, this.onPick});

  /// When set, the screen acts as a picker and pops with the chosen address.
  final ValueChanged<SavedAddress>? onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final addresses = ref.watch(addressesProvider);
    final t = context.tokens;

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(onPick == null ? 'Saved addresses' : 'Choose address'),
      ),
      body: addresses.when(
        loading: () => const Padding(
          padding: Space.pageInsets,
          child: Column(children: [
            SkeletonCard(lines: 1, hasAvatar: false),
            SizedBox(height: Space.x3),
            SkeletonCard(lines: 1, hasAvatar: false),
          ]),
        ),
        error: (error, _) => AppStateView.error(
          message: ApiException.from(error).message,
          onAction: () => ref.invalidate(addressesProvider),
        ),
        data: (list) => ListView(
          padding: const EdgeInsets.all(Space.x5),
          children: [
            if (list.isEmpty)
              const AppStateView.empty(
                title: 'No addresses yet',
                message: 'Add the place where you need the service.',
                icon: AppIcons.location,
              )
            else
              for (final address in list) ...[
                _AddressCard(
                  address: address,
                  onTap: onPick == null
                      ? null
                      : () {
                          onPick!(address);
                          Navigator.of(context).maybePop();
                        },
                  onDelete: () => _confirmDelete(context, ref, address),
                ),
                const SizedBox(height: Space.x3),
              ],
            const SizedBox(height: Space.x3),
            AppButton.secondary(
              label: 'Add a new address',
              icon: AppIcons.add,
              onPressed: () async {
                final created = await Navigator.of(context).push<SavedAddress>(
                  MaterialPageRoute(builder: (_) => const AddAddressScreen()),
                );
                if (created != null && onPick != null) {
                  onPick!(created);
                  if (context.mounted) Navigator.of(context).maybePop();
                }
              },
            ),
            const SizedBox(height: Space.x4),
            Row(
              children: [
                AppIcon(AppIcons.info, size: Sizes.iconXs, color: t.textTertiary),
                const SizedBox(width: Space.x2),
                Expanded(
                  child: Text(
                    'We only use your address to dispatch a worker to you.',
                    style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref, SavedAddress address) async {
    // Resolved before the dialog await, so `context` is never used across it.
    final messenger = ScaffoldMessenger.of(context);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove this address?'),
        content: Text(address.address),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text('Remove', style: TextStyle(color: context.tokens.danger)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ref.read(apiProvider).deleteAddress(address.id);
      ref.invalidate(addressesProvider);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _AddressCard extends StatelessWidget {
  const _AddressCard({required this.address, this.onTap, required this.onDelete});

  final SavedAddress address;
  final VoidCallback? onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return AppCard(
      onTap: onTap,
      padding: Space.cardInsetsLarge,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppIconBadge(_iconFor(address.name), size: 44),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(child: Text(address.name, style: context.text.titleMedium)),
                    if (address.isDefault) ...[
                      const SizedBox(width: Space.x2),
                      const AppBadge('Default', tone: BadgeTone.primary, dense: true),
                    ],
                  ],
                ),
                const SizedBox(height: Space.x1),
                Text(
                  address.address,
                  style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                ),
                // A saved address with no coordinates cannot be matched against,
                // so say so rather than letting the booking fail later.
                if (!address.hasCoordinates) ...[
                  const SizedBox(height: Space.x2),
                  const AppBadge(
                    'No location saved',
                    tone: BadgeTone.warning,
                    dense: true,
                  ),
                ],
              ],
            ),
          ),
          AppIconButton(
            icon: AppIcons.delete,
            size: 36,
            iconSize: Sizes.iconSm,
            foreground: t.textTertiary,
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }

  static AppIconData _iconFor(String name) {
    final n = name.toLowerCase();
    if (n.contains('home') || n.contains('house')) return AppIcons.home_;
    if (n.contains('office') || n.contains('work')) return AppIcons.work;
    return AppIcons.building;
  }
}

/// Add an address, resolving coordinates as it goes.
class AddAddressScreen extends ConsumerStatefulWidget {
  const AddAddressScreen({super.key});

  @override
  ConsumerState<AddAddressScreen> createState() => _AddAddressScreenState();
}

class _AddAddressScreenState extends ConsumerState<AddAddressScreen> {
  final _labelController = TextEditingController(text: 'Home');
  final _addressController = TextEditingController();
  final _instructionsController = TextEditingController();

  double? _latitude;
  double? _longitude;
  bool _isDefault = true;

  bool _locating = false;
  bool _geocoding = false;
  bool _saving = false;
  String? _error;
  String? _locationNote;
  Timer? _geocodeDebounce;

  @override
  void initState() {
    super.initState();
    // Straight to the map. Someone who tapped "add an address" is answering
    // "where?", and the map answers it in one tap where the form takes twelve.
    // Backing out of the picker leaves them on the form, which still works.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _pickOnMap();
    });
  }

  @override
  void dispose() {
    _labelController.dispose();
    _addressController.dispose();
    _instructionsController.dispose();
    _geocodeDebounce?.cancel();
    super.dispose();
  }

  bool get _hasCoordinates => _latitude != null && _longitude != null;

  /// Fill the form from the device's position.
  Future<void> _useCurrentLocation() async {
    setState(() { _locating = true; _error = null; });

    final result = await ref.read(locationServiceProvider).current();

    if (!mounted) return;
    switch (result) {
      case LocationDenied(:final message, :final canRetry, :final failure):
        setState(() {
          _locating = false;
          _error = message;
          // Nothing to retry into when it is blocked at OS level.
          _locationNote = canRetry ? null : 'Open settings to allow location.';
        });
        if (failure == LocationFailure.deniedForever) {
          await ref.read(locationServiceProvider).openSettings();
        }

      case LocationSuccess(:final latitude, :final longitude):
        setState(() {
          _latitude = latitude;
          _longitude = longitude;
        });

        // Turn the fix into something a worker can read.
        try {
          final place = await ref.read(apiProvider).reverseGeocode(
                latitude: latitude,
                longitude: longitude,
              );
          if (!mounted) return;
          if (place != null) {
            _addressController.text = place.formattedAddress;
            setState(() => _locationNote = 'Located from your device');
          } else {
            setState(() => _locationNote = 'Location saved. Add a landmark below.');
          }
        } on ApiException {
          // The coordinates are the part that matters for dispatch; a failed
          // reverse geocode just means the user types the address themselves.
          if (mounted) {
            setState(() => _locationNote = 'Location saved. Please type the address.');
          }
        } finally {
          if (mounted) setState(() => _locating = false);
        }
    }
  }

  /// Resolve typed text to coordinates, debounced.
  void _onAddressChanged(String value) {
    setState(() { _error = null; });
    _geocodeDebounce?.cancel();
    if (value.trim().length < 8) return;

    _geocodeDebounce = Timer(const Duration(milliseconds: 700), () async {
      if (!mounted) return;
      setState(() => _geocoding = true);
      try {
        final results = await ref.read(apiProvider).geocode(value.trim());
        if (!mounted) return;
        final match = results.where((r) => r.hasCoordinates).firstOrNull;
        if (match != null) {
          setState(() {
            _latitude = match.latitude;
            _longitude = match.longitude;
            _locationNote = 'Matched to ${match.shortLabel}';
          });
        }
      } on ApiException {
        // Silent: the user is still typing, and an error banner mid-sentence
        // is noise. The save button surfaces the real problem.
      } finally {
        if (mounted) setState(() => _geocoding = false);
      }
    });
  }

  /// Open the map, and take whatever comes back.
  ///
  /// The picker returns null when the user backs out, which is a decision, not
  /// a failure -- the form keeps whatever it already had.
  Future<void> _pickOnMap() async {
    final picked = await Navigator.of(context).push<GeoPlace>(
      MaterialPageRoute(
        builder: (_) => LocationPickerScreen(
          initial: _hasCoordinates
              ? GeoPlace(
                  formattedAddress: _addressController.text.trim(),
                  latitude: _latitude,
                  longitude: _longitude,
                )
              : null,
        ),
      ),
    );

    if (picked == null || !mounted) return;

    setState(() {
      _latitude = picked.latitude;
      _longitude = picked.longitude;
      _addressController.text = picked.formattedAddress;
      _locationNote = 'Pinned on the map';
      _error = null;
    });
  }

  Future<void> _save() async {
    final label = _labelController.text.trim();
    final address = _addressController.text.trim();

    if (label.isEmpty) {
      setState(() => _error = 'Give this address a name, like Home or Office.');
      return;
    }
    if (address.length < 5) {
      setState(() => _error = 'Enter the full address.');
      return;
    }
    if (!_hasCoordinates) {
      // Not a formatting complaint. Matching is a geographic query, so an
      // address with no point on the map cannot reach any worker at all — it
      // would be accepted here and fail silently at checkout. The banner below
      // offers the map directly rather than asking the customer to guess which
      // wording we would recognise.
      setState(() => _error =
          'Put a pin on the map so we know where to send someone. Typing the '
          'address is not enough on its own — two streets share a name more '
          'often than you would think.');
      return;
    }

    setState(() { _saving = true; _error = null; });
    try {
      final created = await ref.read(apiProvider).createAddress(
            name: label,
            address: address,
            latitude: _latitude,
            longitude: _longitude,
            isDefault: _isDefault,
            instructions: _instructionsController.text.trim(),
          );
      ref.invalidate(addressesProvider);
      if (mounted) Navigator.of(context).pop(created);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Add address'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(Space.x5),
        children: [
          _MapPreview(
            address: _addressController.text.trim(),
            latitude: _latitude,
            longitude: _longitude,
            onTap: _pickOnMap,
          ),
          const SizedBox(height: Space.x4),

          AppButton(
            label: 'Use my current location',
            variant: AppButtonVariant.soft,
            icon: AppIcons.locationPin,
            loading: _locating,
            onPressed: _locating ? null : _useCurrentLocation,
          ),
          const SizedBox(height: Space.x5),

          Row(
            children: [
              Expanded(child: Divider(color: t.border)),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Space.x3),
                child: Text('and add the details', style: context.text.bodySmall?.copyWith(color: t.textTertiary)),
              ),
              Expanded(child: Divider(color: t.border)),
            ],
          ),
          const SizedBox(height: Space.x5),

          AppTextField(
            label: 'Address',
            hint: 'Flat, building, street, area',
            controller: _addressController,
            maxLines: 3,
            prefixIcon: AppIcons.location,
            onChanged: _onAddressChanged,
            suffix: _geocoding
                ? const SizedBox(
                    width: Sizes.iconSm,
                    height: Sizes.iconSm,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : _hasCoordinates
                    ? AppIcon(AppIcons.verified, size: Sizes.iconSm, color: t.success, bold: true)
                    : null,
          ),

          if (_locationNote != null) ...[
            const SizedBox(height: Space.x2),
            Row(
              children: [
                AppIcon(
                  _hasCoordinates ? AppIcons.verified : AppIcons.info,
                  size: Sizes.iconXs,
                  color: _hasCoordinates ? t.success : t.textTertiary,
                ),
                const SizedBox(width: Space.x1),
                Expanded(
                  child: Text(
                    _locationNote!,
                    style: context.text.bodySmall?.copyWith(
                      color: _hasCoordinates ? t.success : t.textTertiary,
                    ),
                  ),
                ),
              ],
            ),
          ],

          const SizedBox(height: Space.x5),
          Text('Save as', style: context.text.titleMedium),
          const SizedBox(height: Space.x2),
          Wrap(
            spacing: Space.x2,
            children: [
              for (final label in ['Home', 'Office', 'Other'])
                GestureDetector(
                  onTap: () => setState(() => _labelController.text = label),
                  child: AppBadge(
                    label,
                    tone: _labelController.text == label ? BadgeTone.primary : BadgeTone.neutral,
                  ),
                ),
            ],
          ),
          const SizedBox(height: Space.x3),
          AppTextField(controller: _labelController, hint: 'Label'),

          const SizedBox(height: Space.x5),
          AppTextField(
            label: 'Directions for the worker',
            hint: 'e.g. Second gate, ask for the blue door',
            controller: _instructionsController,
            maxLines: 2,
            maxLength: 200,
            prefixIcon: AppIcons.navigate,
          ),

          const SizedBox(height: Space.x4),
          AppSelectableRow(
            title: 'Make this my default address',
            icon: AppIcons.verified,
            selected: _isDefault,
            onTap: () => setState(() => _isDefault = !_isDefault),
          ),

          if (_error != null) ...[
            const SizedBox(height: Space.x4),
            AppBanner(
              message: _error!,
              tone: StateTone.error,
              // The one error on this screen with an obvious next action gets
              // the button that performs it.
              actionLabel: _hasCoordinates ? null : 'Open the map',
              onAction: _hasCoordinates ? null : _pickOnMap,
            ),
          ],

          const SizedBox(height: Space.x6),
          AppButton.primary(
            // The label names what is missing rather than failing after the
            // tap. A disabled button with no explanation is the worse half of
            // this trade; this one still works, and still explains.
            label: _hasCoordinates ? 'Save address' : 'Set the location on the map',
            icon: _hasCoordinates ? null : AppIcons.location,
            loading: _saving,
            onPressed: _saving ? null : (_hasCoordinates ? _save : _pickOnMap),
          ),
        ],
      ),
    );
  }
}

/// A still map of the chosen spot, and the way back to change it.
///
/// A picture rather than a live map: this is a confirmation that the pin landed
/// somewhere sensible, and an interactive map here would compete with the form
/// for the same scroll gesture.
class _MapPreview extends ConsumerWidget {
  const _MapPreview({
    required this.address,
    required this.latitude,
    required this.longitude,
    required this.onTap,
  });

  final String address;
  final double? latitude;
  final double? longitude;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final located = latitude != null && longitude != null;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: Space.cardInsetsLarge,
        decoration: BoxDecoration(
          color: located ? t.primarySoft : t.surfaceAlt,
          borderRadius: BorderRadius.circular(Radii.xl),
          border: Border.all(color: located ? t.primary.withValues(alpha: 0.3) : t.border),
        ),
        child: Row(
          children: [
            AppIconBadge(AppIcons.location, size: 44),
            const SizedBox(width: Space.x3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    located ? 'Pinned on the map' : 'Set the location on a map',
                    style: context.text.titleSmall,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    located && address.isNotEmpty
                        ? address
                        : 'A worker needs the building, not just the street.',
                    style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: Space.x2),
            AppIcon(AppIcons.chevronRight, size: 18, color: t.textTertiary),
          ],
        ),
      ),
    );
  }
}
