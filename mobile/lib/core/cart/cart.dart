import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';

/// One line in the cart: a service and how many of it.
class CartLine {
  const CartLine({required this.service, this.quantity = 1});

  final Service service;
  final int quantity;

  double get lineTotal => service.basePrice * quantity;

  /// What this line would have cost at the pre-promotion price, for the
  /// "you saved" figure. Falls back to the charged price where there is no
  /// promotion, so the saving across a mixed cart is the sum of real savings.
  double get lineListTotal => (service.listPrice ?? service.basePrice) * quantity;

  CartLine copyWith({int? quantity}) =>
      CartLine(service: service, quantity: quantity ?? this.quantity);
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

  /// Distinct services, not units: the bar says "2 services", and a customer
  /// who wants two hours of one service has picked one service.
  int get serviceCount => lines.length;

  int get itemCount => lines.fold(0, (sum, line) => sum + line.quantity);

  double get subtotal => lines.fold(0, (sum, line) => sum + line.lineTotal);

  double get listSubtotal => lines.fold(0, (sum, line) => sum + line.lineListTotal);

  double get savings => (listSubtotal - subtotal).clamp(0, double.infinity);

  int quantityOf(String serviceId) {
    for (final line in lines) {
      if (line.service.id == serviceId) return line.quantity;
    }
    return 0;
  }

  bool contains(String serviceId) => quantityOf(serviceId) > 0;
}

class CartController extends Notifier<Cart> {
  @override
  Cart build() => const Cart();

  /// Add one of [service], or raise its quantity if it is already in the cart.
  void add(Service service) {
    final lines = [...state.lines];
    final index = lines.indexWhere((line) => line.service.id == service.id);

    if (index == -1) {
      // Keep the freshly-fetched Service rather than an older copy: it carries
      // the current price and artwork.
      lines.add(CartLine(service: service));
    } else {
      lines[index] = CartLine(
        service: service,
        quantity: lines[index].quantity + 1,
      );
    }

    state = Cart(lines: lines);
  }

  /// Remove one. The line disappears at zero rather than lingering empty.
  void remove(String serviceId) {
    final lines = <CartLine>[];
    for (final line in state.lines) {
      if (line.service.id != serviceId) {
        lines.add(line);
        continue;
      }
      if (line.quantity > 1) lines.add(line.copyWith(quantity: line.quantity - 1));
    }
    state = Cart(lines: lines);
  }

  /// Remove the line outright, whatever its quantity — the bin icon, not the
  /// minus button.
  void removeAll(String serviceId) {
    state = Cart(
      lines: state.lines.where((line) => line.service.id != serviceId).toList(),
    );
  }

  void clear() => state = const Cart();
}

final cartProvider = NotifierProvider<CartController, Cart>(CartController.new);
