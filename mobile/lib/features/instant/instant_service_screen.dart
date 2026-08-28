import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/cart/cart.dart';
import '../../core/cart/checkout.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import '../home/service_grid.dart';

/// "Get Instant Service" — what do you need, right now?
///
/// A screen rather than a sheet, because this is the start of a booking and it
/// asks a real question. The scheduled path browses a catalogue and builds a
/// cart; this one does not. Somebody with a leak spreading across the floor
/// wants to name the trade and be done, so the screen is one list, one tap, and
/// straight to confirming.
///
/// Instant is NOT the emergency path. Emergency has its own screen, its own
/// endpoint and its own surcharge; this is ordinary work, matched to whoever is
/// free now instead of held for a slot. Blurring the two would quietly charge
/// emergency rates for a dripping tap.
class InstantServiceScreen extends ConsumerWidget {
  const InstantServiceScreen({
    super.key,
    required this.onContinue,
    required this.onEmergency,
  });

  /// Called once a service is chosen and the cart holds it.
  final VoidCallback onContinue;

  /// Escalate to the emergency path.
  ///
  /// It lives here because this is where somebody in a hurry already is, and
  /// it is the only doorway to it — but it is deliberately a quiet link rather
  /// than a button competing with the list, because emergency costs more and
  /// nobody should reach it by aiming at something else.
  final VoidCallback onEmergency;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final services = ref.watch(servicesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Get it done now')),
      body: services.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(Space.x5),
          child: SkeletonCard(lines: 3),
        ),
        error: (error, _) => Padding(
          padding: const EdgeInsets.all(Space.x5),
          child: AppBanner(
            message: 'Could not load services.',
            tone: StateTone.error,
            actionLabel: 'Retry',
            onAction: () => ref.invalidate(servicesProvider),
          ),
        ),
        data: (list) => ListView(
          padding: const EdgeInsets.fromLTRB(Space.x5, Space.x4, Space.x5, Space.x10),
          children: [
            Row(
              children: [
                AppIcon(AppIcons.flash, size: Sizes.iconMd, color: t.warning, bold: true),
                const SizedBox(width: Space.x2),
                Expanded(
                  child: Text('What do you need?', style: context.text.headlineSmall),
                ),
              ],
            ),
            const SizedBox(height: Space.x2),
            Text(
              'We will match you with the nearest available worker instead of '
              'holding a slot. You will see the price before you confirm.',
              style: context.text.bodyMedium?.copyWith(
                color: t.textSecondary,
                height: 1.5,
              ),
            ),
            const SizedBox(height: Space.x6),

            // The same three-across grid as home and search, with no Add
            // button on the tiles: instant books ONE job, so a tap here is
            // the choice itself rather than a step towards a basket.
            ServiceCatalogueGrid(
              services: list,
              showAdd: false,
              emptyMessage: 'The catalogue for your area is still being set up.',
              onOpenService: (service) {
                HapticFeedback.selectionClick();

                // One service, at its default duration. Instant is a single
                // job by definition: someone who needs a plumber now is not
                // also assembling a shopping list.
                ref.read(cartProvider.notifier)
                  ..clear()
                  ..add(service);

                ref.read(checkoutProvider.notifier).setMode(CheckoutMode.instant);
                onContinue();
              },
            ),

            const SizedBox(height: Space.x6),
            Center(
              child: AppButton.tertiary(
                label: 'This is an emergency',
                icon: AppIcons.emergency,
                onPressed: onEmergency,
              ),
            ),
            const SizedBox(height: Space.x2),
            Text(
              'Emergency dispatch is faster and costs more. Use it for a burst '
              'pipe, a live wire or anything unsafe.',
              textAlign: TextAlign.center,
              style: context.text.bodySmall?.copyWith(color: t.textTertiary),
            ),
          ],
        ),
      ),
    );
  }
}
