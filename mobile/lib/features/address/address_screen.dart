import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/location/location_service.dart';
import '../../core/models/models.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';

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
      setState(() => _error =
          'We could not find this address on the map. Use your current location, '
          'or add a nearby landmark so we can locate it.');
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
                child: Text('or enter it', style: context.text.bodySmall?.copyWith(color: t.textTertiary)),
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
            AppBanner(message: _error!, tone: StateTone.error),
          ],

          const SizedBox(height: Space.x6),
          AppButton.primary(
            label: 'Save address',
            loading: _saving,
            onPressed: _saving ? null : _save,
          ),
        ],
      ),
    );
  }
}
