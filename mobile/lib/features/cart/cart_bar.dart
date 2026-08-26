import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/cart/cart.dart';
import '../../design/design_system.dart';

/// The bar that appears above the navigation once anything is in the cart.
///
/// It sits at app level rather than on the home screen, so a customer who adds
/// two services and then wanders into Bookings can still see what they were in
/// the middle of. A cart that disappears when you change tab is a cart people
/// forget they have.
///
/// It takes no height at all when the cart is empty, so nothing below it moves
/// except when there is genuinely something to say.
class CartBar extends ConsumerWidget {
  const CartBar({super.key, required this.onOpenCart});

  final VoidCallback onOpenCart;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final cart = ref.watch(cartProvider);

    return AnimatedSize(
      duration: Motion.base,
      curve: Motion.curve,
      alignment: Alignment.bottomCenter,
      child: cart.isEmpty
          ? const SizedBox(width: double.infinity)
          : Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(Space.x4, Space.x3, Space.x4, Space.x3),
              decoration: BoxDecoration(
                color: t.surface,
                border: Border(top: BorderSide(color: t.border)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          cart.serviceCount == 1
                              ? '1 service'
                              : '${cart.serviceCount} services',
                          style: context.text.titleSmall,
                        ),
                        const SizedBox(height: 1),
                        Row(
                          children: [
                            Text(
                              formatRupees(cart.subtotal),
                              style: context.text.bodySmall?.copyWith(
                                color: t.textSecondary,
                              ),
                            ),
                            // "+ taxes" rather than a total, because this bar
                            // has not asked the backend to quote anything yet.
                            // Showing a confident final figure here and a
                            // different one at checkout is how a customer stops
                            // trusting both.
                            Text(
                              ' + taxes',
                              style: context.text.bodySmall?.copyWith(
                                color: t.textTertiary,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: Space.x3),
                  AppButton.primary(
                    label: 'Go to cart',
                    trailingIcon: AppIcons.chevronRight,
                    size: AppButtonSize.medium,
                    expand: false,
                    onPressed: onOpenCart,
                  ),
                ],
              ),
            ),
    );
  }
}
