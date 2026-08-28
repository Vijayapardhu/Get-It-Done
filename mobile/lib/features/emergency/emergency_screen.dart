import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/location/location_service.dart';
import '../../core/models/models.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import '../auth/account_gate.dart';

/// Emergency dispatch.
///
/// Deliberately NOT the four-step booking journey. In an emergency the user is
/// standing in water or smelling gas — every screen they have to read is a
/// screen too many. This is one screen: we take the location automatically,
/// ask one optional question, and dispatch.
///
/// The backend path is different too: `POST /emergency/bookings` suppresses
/// duplicates within ten minutes and escalates on a timer, so a panicked
/// double-tap does not create two dispatches.
class EmergencyScreen extends ConsumerStatefulWidget {
  const EmergencyScreen({
    super.key,
    required this.service,
    required this.onDispatched,
  });

  final Service service;
  final void Function(BookingCreated result) onDispatched;

  @override
  ConsumerState<EmergencyScreen> createState() => _EmergencyScreenState();
}

class _EmergencyScreenState extends ConsumerState<EmergencyScreen> {
  final _description = TextEditingController();

  LocationResult? _location;
  bool _locating = true;

  /// Falls back to a saved address when GPS is refused or unavailable —
  /// "we couldn't get your location" must never be the end of an emergency.
  SavedAddress? _fallbackAddress;

  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _locate();
  }

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    setState(() => _locating = true);
    // Shorter than the normal booking timeout: waiting twelve seconds for a
    // precise fix is not acceptable here. A rough position dispatched now
    // beats an exact one dispatched later.
    final result = await ref
        .read(locationServiceProvider)
        .current(timeout: const Duration(seconds: 6));
    if (!mounted) return;
    setState(() {
      _location = result;
      _locating = false;
    });

    if (result is LocationDenied) {
      // Pre-select the default saved address so the primary button is live
      // the moment the user looks at it.
      final addresses = await ref.read(addressesProvider.future).catchError(
            (_) => <SavedAddress>[],
          );
      if (!mounted || addresses.isEmpty) return;
      setState(() {
        _fallbackAddress = addresses.firstWhere(
          (a) => a.isDefault,
          orElse: () => addresses.first,
        );
      });
    }
  }

  ({double lat, double lng, String address})? get _dispatchPoint {
    final location = _location;
    if (location is LocationSuccess) {
      return (
        lat: location.latitude,
        lng: location.longitude,
        address: 'Current location',
      );
    }
    final saved = _fallbackAddress;
    if (saved?.latitude != null && saved?.longitude != null) {
      return (lat: saved!.latitude!, lng: saved.longitude!, address: saved.address);
    }
    return null;
  }

  Future<void> _dispatch() async {
    final point = _dispatchPoint;
    if (point == null || _submitting) return;

    // Emergency dispatch sends a real person to a real address at a
    // surcharge. There is no version of that which works anonymously.
    if (!await requireAccount(context, ref, action: 'send help to your address')) return;
    if (!mounted) return;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final result = await ref.read(apiProvider).createEmergencyBooking(
            serviceId: widget.service.id,
            latitude: point.lat,
            longitude: point.lng,
            address: point.address,
            description: _description.text.trim(),
          );
      ref.invalidate(bookingsProvider);
      if (!mounted) return;
      widget.onDispatched(result);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final point = _dispatchPoint;

    return Scaffold(
      // The whole screen carries the emergency tone, not just one button.
      // If the user is on this screen by mistake, it should be obvious.
      backgroundColor: t.dangerSoft,
      appBar: AppBar(
        backgroundColor: t.dangerSoft,
        leading: AppIconButton(
          icon: AppIcons.close,
          onPressed: _submitting ? null : () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Emergency'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(Space.x5, Space.x4, Space.x5, Space.x8),
          children: [
            Row(
              children: [
                AppIconBadge(
                  AppIcons.emergency,
                  size: 56,
                  iconSize: Sizes.iconLg,
                  background: t.danger,
                  foreground: t.textOnPrimary,
                ),
                const SizedBox(width: Space.x4),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.service.name, style: context.text.headlineSmall),
                      Text(
                        'Dispatched immediately to the nearest available worker.',
                        style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: Space.x6),

            // ── Where ─────────────────────────────────────────────────────
            AppCard(
              elevated: false,
              padding: Space.cardInsetsLarge,
              child: Row(
                children: [
                  AppIconBadge(AppIcons.locationPin, size: 40),
                  const SizedBox(width: Space.x3),
                  Expanded(child: _locationLine(context)),
                  if (_locating)
                    const SizedBox(
                      width: Sizes.iconSm,
                      height: Sizes.iconSm,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  else if (_location is LocationDenied)
                    AppButton.secondary(
                      label: _fallbackAddress == null ? 'Retry' : 'Change',
                      size: AppButtonSize.small,
                      expand: false,
                      onPressed: _fallbackAddress == null ? _locate : _pickAddress,
                    ),
                ],
              ),
            ),

            const SizedBox(height: Space.x4),

            // ── What ──────────────────────────────────────────────────────
            AppTextField(
              controller: _description,
              label: 'What is happening?',
              hint: 'Optional — helps the worker arrive prepared',
              maxLines: 3,
            ),

            if (_error != null) ...[
              const SizedBox(height: Space.x4),
              AppBanner(message: _error!, tone: StateTone.error),
            ],

            const SizedBox(height: Space.x6),

            AppButton(
              label: 'Dispatch now',
              variant: AppButtonVariant.danger,
              size: AppButtonSize.large,
              icon: AppIcons.flash,
              loading: _submitting,
              onPressed: point == null || _submitting ? null : _dispatch,
            ),

            const SizedBox(height: Space.x4),

            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppIcon(AppIcons.info, size: Sizes.iconXs, color: t.textTertiary),
                const SizedBox(width: Space.x2),
                Expanded(
                  child: Text(
                    'Emergency bookings carry a priority charge. If nobody accepts within '
                    'a few minutes we escalate to a wider radius automatically.',
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

  Widget _locationLine(BuildContext context) {
    final t = context.tokens;
    final location = _location;

    if (_locating) {
      return Text('Finding your location…', style: context.text.titleMedium);
    }

    if (location is LocationSuccess) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Your current location', style: context.text.titleMedium),
          Text(
            'Accurate to about ${(location.accuracy ?? 50).round()} m',
            style: context.text.bodySmall?.copyWith(color: t.textTertiary),
          ),
        ],
      );
    }

    final saved = _fallbackAddress;
    if (saved != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(saved.name, style: context.text.titleMedium),
          Text(
            saved.address,
            style: context.text.bodySmall?.copyWith(color: t.textTertiary),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      );
    }

    return Text(
      location is LocationDenied ? location.message : 'Location unavailable',
      style: context.text.bodySmall?.copyWith(color: t.danger),
    );
  }

  Future<void> _pickAddress() async {
    final addresses = await ref.read(addressesProvider.future).catchError(
          (_) => <SavedAddress>[],
        );
    if (!mounted || addresses.isEmpty) return;

    final picked = await showModalBottomSheet<SavedAddress>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Space.x5),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Where are you?', style: context.text.titleLarge),
              const SizedBox(height: Space.x4),
              for (final address in addresses) ...[
                AppSelectableRow(
                  title: address.name,
                  subtitle: address.address,
                  icon: AppIcons.locationPin,
                  selected: address.id == _fallbackAddress?.id,
                  onTap: () => Navigator.of(sheetContext).pop(address),
                ),
                const SizedBox(height: Space.x2),
              ],
            ],
          ),
        ),
      ),
    );

    if (picked != null && mounted) setState(() => _fallbackAddress = picked);
  }
}
