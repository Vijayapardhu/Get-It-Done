import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/cart/cart.dart';
import '../../core/ui/service_artwork.dart';
import '../../design/design_system.dart';

/// The cart.
///
/// Deliberately plain for now: it lists what has been added, lets it be
/// changed, and shows what the catalogue says it costs. The scheduled and
/// recurring checkout flows are the next piece of work, and the button at the
/// bottom says so rather than pretending.
///
/// The subtotal here is the catalogue's arithmetic and is labelled as such.
/// What is actually charged is quoted and frozen by the backend at booking
/// time — a client that computes its own total is a client that can be edited
/// to compute a smaller one.
class CartScreen extends ConsumerWidget {
  const CartScreen({super.key, required this.onCheckout});

  /// Called with the cart's contents once a checkout flow exists.
  final VoidCallback? onCheckout;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My cart')),
      body: cart.isEmpty
          ? AppStateView.empty(
              title: 'Your cart is empty',
              message: 'Add a service from the home screen and it will show up here.',
              icon: AppIcons.bookings,
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(Space.x5, Space.x5, Space.x5, Space.x10),
              children: [
                Text('Review booking', style: context.text.headlineSmall),
                const SizedBox(height: Space.x4),
                for (final line in cart.lines) ...[
                  _CartRow(line: line),
                  const SizedBox(height: Space.x3),
                ],
                const SizedBox(height: Space.x4),
                _Totals(cart: cart),
              ],
            ),
      bottomNavigationBar: cart.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(Space.x5),
                child: AppButton.primary(
                  label: 'Choose a slot',
                  onPressed: onCheckout,
                ),
              ),
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
          ServiceArtwork(service: line.service, size: 48),
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
                  formatRupees(line.service.basePrice),
                  style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                ),
              ],
            ),
          ),
          _Stepper(
            quantity: line.quantity,
            onAdd: () => cart.add(line.service),
            onRemove: () => cart.remove(line.service.id),
          ),
        ],
      ),
    );
  }
}

/// Quantity control. The minus turns into a bin at one, so removing a line
/// takes the same tap as decrementing it rather than hiding behind a swipe.
class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.quantity,
    required this.onAdd,
    required this.onRemove,
  });

  final int quantity;
  final VoidCallback onAdd;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Container(
      decoration: BoxDecoration(
        color: t.primarySoft,
        borderRadius: BorderRadius.circular(Radii.md),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _StepButton(
            icon: quantity > 1 ? AppIcons.remove : AppIcons.delete,
            onTap: onRemove,
          ),
          SizedBox(
            width: 24,
            child: Text(
              '$quantity',
              textAlign: TextAlign.center,
              style: context.text.labelLarge?.copyWith(
                color: t.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          _StepButton(icon: AppIcons.add, onTap: onAdd),
        ],
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({required this.icon, required this.onTap});

  final List<List<dynamic>> icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 36,
        height: 36,
        child: Center(child: AppIcon(icon, size: 16, color: t.primary, bold: true)),
      ),
    );
  }
}

class _Totals extends StatelessWidget {
  const _Totals({required this.cart});

  final Cart cart;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return AppCard(
      elevated: false,
      child: Column(
        children: [
          _Row(label: 'Services (${cart.itemCount})', value: formatRupees(cart.subtotal)),
          if (cart.savings > 0) ...[
            const SizedBox(height: Space.x2),
            _Row(
              label: 'Promotional saving',
              value: '-${formatRupees(cart.savings)}',
              tint: t.success,
            ),
          ],
          const SizedBox(height: Space.x3),
          Divider(color: t.border, height: 1),
          const SizedBox(height: Space.x3),
          Text(
            'Taxes and any visit charge are calculated by the server when you '
            'confirm, and that quote is what you pay.',
            style: context.text.bodySmall?.copyWith(color: t.textTertiary),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value, this.tint});

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
        Text(
          value,
          style: context.text.titleSmall?.copyWith(color: tint),
        ),
      ],
    );
  }
}
