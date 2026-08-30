import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/cart/checkout.dart';
import '../../core/location/current_location.dart';
import '../../core/location/location_service.dart';
import 'package:gid_core/gid_core.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import '../auth/account_gate.dart';
import 'address_screen.dart';

/// Choose where the work should happen.
///
/// One sheet, shared by the home header and the cart, writing to one place —
/// [checkoutProvider]. That is the point: the customer picks an address once,
/// on the home screen, and checkout does not ask again. It shows what was
/// chosen with a way to change it, which is a different thing from an empty
/// field asking the same question twice.
Future<void> showAddressPicker(BuildContext context, WidgetRef ref) async {
  // Addresses live on the account. A guest has nowhere to save one, so the
  // question to answer first is not "which address" but "whose".
  if (!await requireAccount(context, ref, action: 'save an address')) return;
  if (!context.mounted) return;

  final messenger = ScaffoldMessenger.of(context);

  // Loading the saved list must not be able to kill the tap. This await used
  // to be bare, so a backend that answered anything other than 200 -- a 404
  // from a deployment without the route, a 500, a dropped connection -- threw
  // out of this function with nobody to catch it. The sheet never opened and
  // nothing was said, so the button read as dead: the one failure mode that
  // gives the customer no way to tell a broken app from a mis-tap.
  final List<SavedAddress> addresses;
  try {
    addresses = await ref.read(addressesProvider.future);
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(
      content: Text(e.statusCode == 404
          ? 'Saved addresses are not available on this server yet.'
          : e.message),
    ));
    return;
  } catch (_) {
    messenger.showSnackBar(const SnackBar(
      content: Text('We could not load your saved addresses. Try again.'),
    ));
    return;
  }

  if (!context.mounted) return;

  final picked = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheetContext) => _AddressSheet(addresses: addresses),
  );

  if (picked == null) return;

  if (picked == _AddressSheet.useCurrent) {
    if (!context.mounted) return;
    await _useCurrentLocation(context, ref, addresses);
    return;
  }

  if (picked == _AddressSheet.addNew) {
    if (!context.mounted) return;
    final created = await Navigator.of(context).push<SavedAddress>(
      MaterialPageRoute(builder: (_) => const AddAddressScreen()),
    );
    ref.invalidate(addressesProvider);
    if (created != null) ref.read(checkoutProvider.notifier).setAddress(created.id);
    return;
  }

  ref.read(checkoutProvider.notifier).setAddress(picked);
}

/// Save the detected position as an address, then select it.
///
/// Saving rather than holding it in memory is deliberate: every other part of
/// the app — checkout, the order payload, worker matching — takes an address
/// id, and inventing a second kind of location that only the header understood
/// would mean touching all of them.
Future<void> _useCurrentLocation(
  BuildContext context,
  WidgetRef ref,
  List<SavedAddress> existing,
) async {
  final messenger = ScaffoldMessenger.of(context);
  final outcome = await ref.read(currentLocationProvider.future);
  final detected = outcome.place;

  if (detected == null) {
    messenger.showSnackBar(SnackBar(
      content: Text(outcome.problem?.message ?? 'We could not find your location.'),
    ));
    return;
  }

  try {
    final saved = await saveDetectedLocation(ref.read(apiProvider), detected, existing);
    ref.invalidate(addressesProvider);
    ref.read(checkoutProvider.notifier).setAddress(saved.id);
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.message)));
  }
}

class _AddressSheet extends ConsumerWidget {
  const _AddressSheet({required this.addresses});

  static const addNew = '__add__';
  static const useCurrent = '__current__';

  final List<SavedAddress> addresses;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final selected = ref.watch(checkoutProvider).addressId;
    final location = ref.watch(currentLocationProvider);

    return SafeArea(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.x5, 0, Space.x5, Space.x3),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Where should we come?', style: context.text.titleLarge),
              ),
            ),

            // Offered first, because it is the answer most of the time and the
            // one that needs no typing. It shows the address actually detected
            // rather than the words "current location", so choosing it is not a
            // guess about where the phone thinks you are.
            location.when(
              loading: () => ListTile(
                leading: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2, color: t.primary),
                ),
                title: Text('Finding your location…', style: context.text.titleSmall),
              ),
              // A failure here is already reported by the outcome below; an
              // error state on top of it would say the same thing twice.
              error: (_, __) => const SizedBox.shrink(),
              data: (outcome) => _CurrentLocationTile(outcome: outcome),
            ),

            const Divider(height: Space.x5),

            if (addresses.isEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(Space.x5, 0, Space.x5, Space.x4),
                child: Text(
                  'No saved addresses yet. Add one so we can find workers near you.',
                  style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
                ),
              ),

            for (final address in addresses)
              ListTile(
                leading: AppIcon(
                  address.isDefault ? AppIcons.home : AppIcons.location,
                  color: address.id == selected ? t.primary : t.textTertiary,
                ),
                title: Text(address.name),
                subtitle: Text(
                  address.address,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: address.id == selected
                    ? AppIcon(AppIcons.tick, color: t.primary, bold: true)
                    : null,
                onTap: () => Navigator.of(context).pop(address.id),
              ),

            ListTile(
              leading: AppIcon(AppIcons.add, color: t.primary, bold: true),
              title: Text(
                'Add a new address',
                style: context.text.titleSmall?.copyWith(color: t.primary),
              ),
              onTap: () => Navigator.of(context).pop(addNew),
            ),
            const SizedBox(height: Space.x4),
          ],
        ),
      ),
    );
  }
}

/// The current-location row in its three states: found, refusable, blocked.
///
/// Each one offers the recovery that actually applies. "Try again" on a
/// permanently denied permission is a button that cannot work.
class _CurrentLocationTile extends ConsumerWidget {
  const _CurrentLocationTile({required this.outcome});

  final LocationOutcome outcome;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final place = outcome.place;

    if (place != null) {
      return ListTile(
        leading: AppIcon(AppIcons.location, color: t.primary, bold: true),
        title: Text(
          'Use my current location',
          style: context.text.titleSmall?.copyWith(color: t.primary),
        ),
        subtitle: Text(place.address, maxLines: 2, overflow: TextOverflow.ellipsis),
        onTap: () => Navigator.of(context).pop(_AddressSheet.useCurrent),
      );
    }

    final problem = outcome.problem;
    if (problem == null) return const SizedBox.shrink();

    return ListTile(
      leading: AppIcon(AppIcons.location, color: t.textTertiary),
      title: Text(
        'Use my current location',
        style: context.text.titleSmall?.copyWith(color: t.textTertiary),
      ),
      subtitle: Text(problem.message, maxLines: 3),
      trailing: problem.needsSettings
          ? AppIcon(AppIcons.settings, size: 18, color: t.textTertiary)
          : AppIcon(AppIcons.refresh, size: 18, color: t.textTertiary),
      onTap: problem.needsSettings
          ? () {
              Navigator.of(context).pop();
              ref.read(locationServiceProvider).openSettings();
            }
          // Asking again is worth a tap: the common case is a user who
          // dismissed the permission dialog and has now read why it is wanted.
          : () => ref.invalidate(currentLocationProvider),
    );
  }
}
