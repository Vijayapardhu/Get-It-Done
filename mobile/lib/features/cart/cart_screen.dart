import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/cart/cart.dart';
import '../../core/cart/checkout.dart';
import '../../core/models/models.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/ui/service_artwork.dart';
import '../../design/design_system.dart';
import '../address/address_picker.dart';
import 'slot_picker_screen.dart';

/// The cart, and checkout.
///
/// Three ways to have the work done, chosen at the top because the choice
/// changes what else the screen has to ask for: instant needs nothing but an
/// address, scheduled needs a slot, recurring needs a slot and the days to
/// repeat on.
///
/// Every figure here is the catalogue's arithmetic and is labelled as an
/// estimate. The server quotes and freezes each booking's price when the order
/// is placed, and that quote is what is charged — a client that computes its
/// own total is a client that can be edited to compute a smaller one.
class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key, required this.onPlaced});

  /// Called with the placed order so the shell can show a confirmation.
  final ValueChanged<PlacedOrder> onPlaced;

  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  bool _placing = false;
  String? _error;

  /// Fixed for the life of this screen.
  ///
  /// The server requires it, and it is what makes a retry after a timeout safe:
  /// the same key replays the original order instead of booking a second set of
  /// workers. Regenerating it per attempt would defeat the whole mechanism.
  final String _idempotencyKey =
      'order-${DateTime.now().microsecondsSinceEpoch}-${identityHashCode(DateTime.now())}';

  Future<void> _pickSlot() async {
    final checkout = ref.read(checkoutProvider);
    final picked = await Navigator.of(context).push<DateTime>(
      MaterialPageRoute(builder: (_) => SlotPickerScreen(initial: checkout.scheduledAt)),
    );
    if (picked != null) ref.read(checkoutProvider.notifier).setSlot(picked);
  }

  Future<void> _place(List<SavedAddress> addresses) async {
    final cart = ref.read(cartProvider);
    final checkout = ref.read(checkoutProvider);

    final address = addresses.where((a) => a.id == checkout.addressId).firstOrNull;
    if (address == null) {
      setState(() => _error = 'Choose where the work should happen.');
      return;
    }
    if (address.latitude == null || address.longitude == null) {
      // Matching is a geographic query; an address with no coordinates cannot
      // reach any worker, and failing here is clearer than an empty match.
      setState(() => _error =
          'That address has no location saved. Edit it and set the map pin, so '
          'we can find workers near it.');
      return;
    }

    setState(() { _placing = true; _error = null; });

    try {
      final order = await ref.read(apiProvider).createOrder(
            lines: [
              for (final line in cart.lines)
                (serviceId: line.service.id, minutes: line.minutes),
            ],
            mode: checkout.mode.wire,
            latitude: address.latitude!,
            longitude: address.longitude!,
            address: address.address,
            addressId: address.id,
            scheduledAt: checkout.scheduledAt,
            description: checkout.notes,
            idempotencyKey: _idempotencyKey,
          );

      // Before anything else. The server issued these once and keeps only
      // hashes; a navigation that happened first and then failed would take
      // them with it.
      await ref.read(otpStoreProvider).saveAll({
        for (final entry in order.otps) entry.bookingId: entry.pair,
      });

      ref.read(cartProvider.notifier).clear();
      ref.read(checkoutProvider.notifier).reset();
      ref.invalidate(dashboardProvider);
      ref.invalidate(bookingsProvider);

      if (mounted) widget.onPlaced(order);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _placing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final cart = ref.watch(cartProvider);
    final checkout = ref.watch(checkoutProvider);
    final addresses = ref.watch(addressesProvider);

    // A cart can sit open for hours; a slot chosen this morning may now be in
    // the past.
    ref.read(checkoutProvider.notifier).dropStaleSlot();

    addresses.whenData((list) {
      ref.read(checkoutProvider.notifier).ensureAddress(list);
    });

    if (cart.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('My cart')),
        body: AppStateView.empty(
          title: 'Your cart is empty',
          message: 'Add a service from the home screen and it will show up here.',
          icon: AppIcons.bookings,
        ),
      );
    }

    final list = addresses.maybeWhen(
      data: (value) => value,
      orElse: () => const <SavedAddress>[],
    );
    final selected = list.where((a) => a.id == checkout.addressId).firstOrNull;

    return Scaffold(
      appBar: AppBar(title: const Text('My cart')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Space.x5, Space.x4, Space.x5, Space.x10),
        children: [
          AppSegmented<CheckoutMode>(
            value: checkout.mode,
            onChanged: ref.read(checkoutProvider.notifier).setMode,
            options: [
              for (final mode in CheckoutMode.values) (value: mode, label: mode.label),
            ],
          ),
          const SizedBox(height: Space.x3),
          Text(
            switch (checkout.mode) {
              CheckoutMode.instant =>
                'Matched with the nearest available worker for each service.',
              CheckoutMode.scheduled =>
                'Held for the day and time you choose.',
              CheckoutMode.recurring =>
                'The same slot, repeating every week, until you stop it.',
            },
            style: context.text.bodySmall?.copyWith(color: t.textSecondary),
          ),

          const SizedBox(height: Space.x6),
          _SectionHeading(
            title: 'Review',
            trailing: cart.serviceCount == 1 ? '1 service' : '${cart.serviceCount} services',
          ),
          for (final line in cart.lines) ...[
            _CartRow(line: line),
            const SizedBox(height: Space.x2),
          ],

          // One service, one worker, for the time booked. Said plainly where
          // more than one trade is involved, because that is two people at the
          // door rather than one doing both.
          if (cart.serviceCount > 1) ...[
            const SizedBox(height: Space.x2),
            AppBanner(
              message: 'Each service is a separate visit, so ${cart.serviceCount} '
                  'workers will be assigned.',
              tone: StateTone.neutral,
            ),
          ],

          const SizedBox(height: Space.x6),
          _SectionHeading(title: 'Booking details'),
          AppCard(
            elevated: false,
            padding: const EdgeInsets.symmetric(vertical: Space.x1),
            child: Column(
              children: [
                if (checkout.needsSlot)
                  _DetailRow(
                    icon: AppIcons.bookings,
                    label: checkout.mode == CheckoutMode.recurring
                        ? 'First visit'
                        : 'Scheduled for',
                    value: checkout.scheduledAt == null
                        ? 'Choose a day and time'
                        : formatSlot(checkout.scheduledAt!),
                    missing: checkout.scheduledAt == null,
                    onTap: _pickSlot,
                  ),
                _DetailRow(
                  icon: AppIcons.location,
                  // Prefilled from the home header. The customer chose this
                  // once; the job here is to show it and offer a change, not to
                  // ask the same question twice.
                  label: 'Where',
                  value: selected?.address ?? 'Choose an address',
                  missing: selected == null,
                  onTap: () => showAddressPicker(context, ref),
                ),
              ],
            ),
          ),

          if (checkout.needsDays) ...[
            const SizedBox(height: Space.x6),
            _SectionHeading(title: 'Repeat on'),
            _DayPicker(
              selected: checkout.days,
              onToggle: ref.read(checkoutProvider.notifier).toggleDay,
            ),
          ],

          const SizedBox(height: Space.x6),
          _SectionHeading(title: 'Bill'),
          _Bill(cart: cart),

          if (_error != null) ...[
            const SizedBox(height: Space.x4),
            AppBanner(message: _error!, tone: StateTone.error),
          ],
        ],
      ),
      bottomNavigationBar: _PlaceBar(
        cart: cart,
        ready: checkout.isComplete && selected != null,
        placing: _placing,
        label: switch (checkout.mode) {
          CheckoutMode.instant => 'Find workers now',
          CheckoutMode.scheduled => 'Confirm booking',
          CheckoutMode.recurring => 'Start recurring plan',
        },
        onPlace: () => _place(list),
      ),
    );
  }

}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.title, this.trailing});

  final String title;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.x3),
      child: Row(
        children: [
          Expanded(child: Text(title, style: context.text.titleLarge)),
          if (trailing != null)
            Text(
              trailing!,
              style: context.text.bodySmall?.copyWith(color: t.textSecondary),
            ),
        ],
      ),
    );
  }
}

class _CartRow extends ConsumerWidget {
  const _CartRow({required this.line});

  final CartLine line;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final cart = ref.read(cartProvider.notifier);

    return AppCard(
      elevated: false,
      padding: const EdgeInsets.all(Space.x3),
      child: Row(
        children: [
          ServiceArtwork(service: line.service, size: 48, padding: EdgeInsets.zero),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  line.service.name,
                  style: context.text.titleSmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  line.service.isTimed
                      ? '${formatMinutes(line.minutes)}  ·  ${formatRupees(line.lineTotal)}'
                      : formatRupees(line.lineTotal),
                  style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                ),
              ],
            ),
          ),
          if (line.service.isTimed)
            _DurationStepper(line: line)
          else
            _RemoveButton(onTap: () => cart.remove(line.service.id)),
        ],
      ),
    );
  }
}

/// How long this service is booked for.
///
/// Steps in half hours, because that is how people buy someone's time and a
/// per-minute control would be absurd to operate with a thumb. The bounds come
/// from the service, so a deep clean cannot be booked for ten minutes and a
/// mis-tap cannot book a worker for a day.
///
/// At the minimum the down button becomes a bin: the way out of a service you
/// no longer want is the same control, rather than a swipe nobody discovers.
class _DurationStepper extends ConsumerWidget {
  const _DurationStepper({required this.line});

  final CartLine line;

  static const _step = 30;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final cart = ref.read(cartProvider.notifier);
    final service = line.service;

    final atFloor = line.minutes <= service.minMinutes;
    final atCeiling = line.minutes >= service.maxMinutes;

    return Container(
      decoration: BoxDecoration(
        color: t.primarySoft,
        borderRadius: BorderRadius.circular(Radii.md),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _StepButton(
            icon: atFloor ? AppIcons.delete : AppIcons.remove,
            semanticLabel: atFloor ? 'Remove from cart' : 'Half an hour less',
            onTap: () => atFloor
                ? cart.remove(service.id)
                : cart.setMinutes(service.id, line.minutes - _step),
          ),
          SizedBox(
            width: 58,
            child: Text(
              formatMinutes(line.minutes),
              textAlign: TextAlign.center,
              style: context.text.labelMedium?.copyWith(
                color: t.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          _StepButton(
            icon: AppIcons.add,
            semanticLabel: 'Half an hour more',
            // Disabled rather than hidden at the ceiling, so the control keeps
            // its shape and the limit is visible instead of mysterious.
            enabled: !atCeiling,
            onTap: () => cart.setMinutes(service.id, line.minutes + _step),
          ),
        ],
      ),
    );
  }
}

/// For a service still on a flat price, where there is no duration to adjust.
class _RemoveButton extends StatelessWidget {
  const _RemoveButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Container(
      decoration: BoxDecoration(
        color: t.primarySoft,
        borderRadius: BorderRadius.circular(Radii.md),
      ),
      child: _StepButton(
        icon: AppIcons.delete,
        semanticLabel: 'Remove from cart',
        onTap: onTap,
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({
    required this.icon,
    required this.semanticLabel,
    required this.onTap,
    this.enabled = true,
  });

  final AppIconData icon;
  final String semanticLabel;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Semantics(
      button: true,
      enabled: enabled,
      label: semanticLabel,
      child: GestureDetector(
        onTap: enabled ? onTap : null,
        behavior: HitTestBehavior.opaque,
        child: SizedBox(
          width: 36,
          height: 36,
          child: Center(
            child: AppIcon(
              icon,
              size: 16,
              color: enabled ? t.primary : t.textTertiary,
              bold: true,
            ),
          ),
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.missing,
    this.onTap,
  });

  final AppIconData icon;
  final String label;
  final String value;

  /// Not yet chosen. Rendered in the primary colour rather than as body text,
  /// so the two things standing between the customer and a booking are the two
  /// things that stand out.
  final bool missing;

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x4),
        child: Row(
          children: [
            AppIcon(icon, size: Sizes.iconMd, color: t.textTertiary),
            const SizedBox(width: Space.x4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    value,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.bodyMedium?.copyWith(
                      color: missing ? t.primary : t.textPrimary,
                      fontWeight: missing ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            if (onTap != null) ...[
              const SizedBox(width: Space.x2),
              AppIcon(AppIcons.chevronRight, size: Sizes.iconSm, color: t.textTertiary),
            ],
          ],
        ),
      ),
    );
  }
}

class _DayPicker extends StatelessWidget {
  const _DayPicker({required this.selected, required this.onToggle});

  final Set<int> selected;
  final ValueChanged<int> onToggle;

  static const _labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  static const _names = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  ];

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        for (var day = 1; day <= 7; day++)
          Semantics(
            button: true,
            selected: selected.contains(day),
            label: _names[day - 1],
            child: GestureDetector(
              onTap: () => onToggle(day),
              behavior: HitTestBehavior.opaque,
              child: AnimatedContainer(
                duration: Motion.fast,
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: selected.contains(day) ? t.primary : t.surface,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: selected.contains(day) ? t.primary : t.border,
                  ),
                ),
                alignment: Alignment.center,
                child: Text(
                  _labels[day - 1],
                  style: context.text.labelLarge?.copyWith(
                    color: selected.contains(day) ? t.textOnPrimary : t.textSecondary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _Bill extends StatelessWidget {
  const _Bill({required this.cart});

  final Cart cart;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return AppCard(
      elevated: false,
      child: Column(
        children: [
          _BillRow(
            label: cart.serviceCount == 1
                ? '1 visit · ${formatMinutes(cart.totalMinutes)}'
                : '${cart.serviceCount} visits · ${formatMinutes(cart.totalMinutes)}',
            value: formatRupees(cart.subtotal),
          ),
          if (cart.savings > 0) ...[
            const SizedBox(height: Space.x2),
            _BillRow(
              label: 'Promotional saving',
              value: '-${formatRupees(cart.savings)}',
              tint: t.success,
            ),
          ],
          const SizedBox(height: Space.x3),
          Divider(color: t.border, height: 1),
          const SizedBox(height: Space.x3),
          Text(
            'Taxes, any visit charge and the cooperative and welfare shares are '
            'calculated by the server when you confirm. That quote is what you '
            'pay, and the full split is on the invoice.',
            style: context.text.bodySmall?.copyWith(color: t.textTertiary, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _BillRow extends StatelessWidget {
  const _BillRow({required this.label, required this.value, this.tint});

  final String label;
  final String value;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
          ),
        ),
        Text(value, style: context.text.titleSmall?.copyWith(color: tint)),
      ],
    );
  }
}

class _PlaceBar extends StatelessWidget {
  const _PlaceBar({
    required this.cart,
    required this.ready,
    required this.placing,
    required this.label,
    required this.onPlace,
  });

  final Cart cart;
  final bool ready;
  final bool placing;
  final String label;
  final VoidCallback onPlace;

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
          padding: const EdgeInsets.all(Space.x4),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      formatRupees(cart.subtotal),
                      style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      'before taxes',
                      style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: Space.x4),
              AppButton.primary(
                label: label,
                expand: false,
                loading: placing,
                onPressed: ready && !placing ? onPlace : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
