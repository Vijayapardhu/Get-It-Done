import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';

/// One line in the cart: a service, and how long it is booked for.
///
/// Not a quantity. Wanting two hours of cleaning is wanting ONE worker for two
/// hours, not two workers for an hour each — a different job, a different
/// price, and a different number of people at the door. So a service appears
/// once and the customer changes the time.
class CartLine {
  CartLine({required this.service, int? minutes})
      : minutes = service.clampMinutes(minutes ?? service.defaultMinutes);

  final Service service;

  /// Always within the service's own bounds; the constructor clamps.
  final int minutes;

  double get lineTotal => service.priceFor(minutes);

  /// What this line would have cost at the pre-promotion price, for the
  /// "you saved" figure. Falls back to the charged price where there is no
  /// promotion, so the saving across a mixed cart is the sum of real savings.
  double get lineListTotal {
    final list = service.listPrice;
    if (list == null || !service.isTimed) return list ?? lineTotal;
    // The promotion is a discount on the rate, so it scales with the time.
    return (list / service.basePrice) * lineTotal;
  }

  CartLine copyWith({int? minutes}) =>
      CartLine(service: service, minutes: minutes ?? this.minutes);
}

/// The cart's contents.
///
/// Prices are carried on the [Service] each line holds, and are the catalogue's
/// prices — the app's arithmetic here is for DISPLAY only. What is actually
/// charged is quoted and frozen by the backend at booking time, because a
/// client that computes its own total is a client that can be edited to compute
/// a smaller one.
class Cart {
  const Cart({this.lines = const []});

  final List<CartLine> lines;

  bool get isEmpty => lines.isEmpty;
  bool get isNotEmpty => lines.isNotEmpty;

  int get serviceCount => lines.length;

  /// Total time booked across the cart, for the summary line.
  int get totalMinutes => lines.fold(0, (sum, line) => sum + line.minutes);

  double get subtotal => lines.fold(0, (sum, line) => sum + line.lineTotal);

  double get listSubtotal => lines.fold(0, (sum, line) => sum + line.lineListTotal);

  double get savings => (listSubtotal - subtotal).clamp(0, double.infinity);

  /// Minutes booked for one service, or zero if it is not in the cart.
  int minutesOf(String serviceId) {
    for (final line in lines) {
      if (line.service.id == serviceId) return line.minutes;
    }
    return 0;
  }

  bool contains(String serviceId) => minutesOf(serviceId) > 0;
}

class CartController extends Notifier<Cart> {
  @override
  Cart build() => const Cart();

  /// Put [service] in the cart, for [minutes] or its default.
  ///
  /// A service already there has its time REPLACED rather than extended:
  /// adding again from the catalogue means "book this", and silently doubling
  /// someone's booking because they tapped twice is how a customer ends up
  /// paying for four hours they did not ask for.
  void add(Service service, {int? minutes}) {
    final lines = [...state.lines];
    final index = lines.indexWhere((line) => line.service.id == service.id);
    // Keep the freshly-fetched Service rather than an older copy: it carries
    // the current rate, bounds and artwork.
    final line = CartLine(service: service, minutes: minutes);

    if (index == -1) {
      lines.add(line);
    } else {
      lines[index] = line;
    }

    state = Cart(lines: lines);
  }

  /// Change how long a service is booked for. Clamped by [CartLine].
  void setMinutes(String serviceId, int minutes) {
    state = Cart(
      lines: [
        for (final line in state.lines)
          if (line.service.id == serviceId) line.copyWith(minutes: minutes) else line,
      ],
    );
  }

  /// Take a service out of the cart.
  void remove(String serviceId) {
    state = Cart(
      lines: state.lines.where((line) => line.service.id != serviceId).toList(),
    );
  }

  void clear() => state = const Cart();
}

final cartProvider = NotifierProvider<CartController, Cart>(CartController.new);
