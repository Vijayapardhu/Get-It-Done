import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/cart/checkout.dart';
import '../../core/models/models.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import 'address_screen.dart';

/// Choose where the work should happen.
///
/// One sheet, shared by the home header and the cart, writing to one place —
/// [checkoutProvider]. That is the point: the customer picks an address once,
/// on the home screen, and checkout does not ask again. It shows what was
/// chosen with a way to change it, which is a different thing from an empty
/// field asking the same question twice.
Future<void> showAddressPicker(BuildContext context, WidgetRef ref) async {
  final addresses = await ref.read(addressesProvider.future);

  if (!context.mounted) return;

  final picked = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheetContext) => _AddressSheet(addresses: addresses),
  );

  if (picked == null) return;

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

class _AddressSheet extends ConsumerWidget {
  const _AddressSheet({required this.addresses});

  static const addNew = '__add__';

  final List<SavedAddress> addresses;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final selected = ref.watch(checkoutProvider).addressId;

    return SafeArea(
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
    );
  }
}
