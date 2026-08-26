import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:getitdone_customer/core/cart/cart.dart';
import 'package:getitdone_customer/core/models/models.dart';
import 'package:getitdone_customer/core/network/json.dart';

Service service(String id, {double price = 299, double? listPrice}) => Service.fromJson({
      'id': id,
      'name': 'Service $id',
      'category': 'Home Repair',
      'basePrice': price,
      if (listPrice != null) 'listPrice': listPrice,
    });

void main() {
  group('Cart', () {
    late ProviderContainer container;
    CartController cart() => container.read(cartProvider.notifier);
    Cart state() => container.read(cartProvider);

    setUp(() => container = ProviderContainer());
    tearDown(() => container.dispose());

    test('starts empty', () {
      expect(state().isEmpty, isTrue);
      expect(state().serviceCount, 0);
      expect(state().subtotal, 0);
    });

    test('adding the same service raises its quantity rather than duplicating it',
        () {
      cart().add(service('a'));
      cart().add(service('a'));

      // One line, quantity two — not two lines. The bar says "1 service",
      // because the customer picked one service.
      expect(state().lines, hasLength(1));
      expect(state().quantityOf('a'), 2);
      expect(state().serviceCount, 1);
      expect(state().itemCount, 2);
    });

    test('subtotal multiplies price by quantity across lines', () {
      cart().add(service('a', price: 299));
      cart().add(service('a', price: 299));
      cart().add(service('b', price: 499));

      expect(state().subtotal, 299 * 2 + 499);
    });

    test('removing the last of a line drops the line', () {
      cart().add(service('a'));
      cart().remove('a');

      expect(state().isEmpty, isTrue);
      expect(state().contains('a'), isFalse);
    });

    test('removing one of several leaves the rest', () {
      cart().add(service('a'));
      cart().add(service('a'));
      cart().remove('a');

      expect(state().quantityOf('a'), 1);
    });

    test('removeAll drops the line whatever its quantity', () {
      cart().add(service('a'));
      cart().add(service('a'));
      cart().add(service('b'));
      cart().removeAll('a');

      expect(state().contains('a'), isFalse);
      expect(state().contains('b'), isTrue);
    });

    test('removing something that is not there changes nothing', () {
      cart().add(service('a'));
      cart().remove('nope');

      expect(state().quantityOf('a'), 1);
      expect(state().lines, hasLength(1));
    });

    test('savings count only real promotions', () {
      // A line with no list price contributes nothing to the saving, rather
      // than counting its own price as a discount against itself.
      cart().add(service('a', price: 299));
      expect(state().savings, 0);

      cart().add(service('b', price: 200, listPrice: 250));
      expect(state().savings, 50);
    });

    test('re-adding refreshes the stored service', () {
      // The cart holds the Service it was handed. Adding again after a
      // catalogue refresh should carry the newer price rather than keeping a
      // stale copy the customer would then be quoted against.
      cart().add(service('a', price: 299));
      cart().add(service('a', price: 349));

      expect(state().lines.single.service.basePrice, 349);
      expect(state().quantityOf('a'), 2);
    });
  });

  group('Service promotions', () {
    test('a list price above the charge is a discount', () {
      final s = service('a', price: 299, listPrice: 399);
      expect(s.hasDiscount, isTrue);
      expect(s.discountPercent, 25);
    });

    test('a list price at or below the charge is not a discount', () {
      // Reference data gets edited. "Save 0%" and "save -10%" are worse than
      // showing no badge at all.
      expect(service('a', price: 299, listPrice: 299).hasDiscount, isFalse);
      expect(service('a', price: 299, listPrice: 200).hasDiscount, isFalse);
      expect(service('a', price: 299).hasDiscount, isFalse);
      expect(service('a', price: 299).discountPercent, isNull);
    });
  });

  group('pick', () {
    test('finds an alias in either casing', () {
      // The regression this exists for: `avgRating` was moved from the primary
      // key into the alias list, and silently stopped matching the discovery
      // endpoint's `avg_rating`, because only the primary key had its casing
      // expanded.
      expect(pick(const {'avg_rating': 5}, 'ratingAverage', aliases: ['avgRating']), 5);
      expect(pick(const {'avgRating': 5}, 'ratingAverage', aliases: ['avg_rating']), 5);
    });

    test('the primary key still wins over an alias', () {
      expect(
        pick(const {'ratingAverage': 1, 'avg_rating': 9}, 'ratingAverage',
            aliases: ['avgRating']),
        1,
      );
    });
  });

  group('Service rating', () {
    test('reads the catalogue shape', () {
      final s = Service.fromJson({
        'id': 'a',
        'name': 'Plumbing',
        'category': 'Home Repair',
        'basePrice': 299,
        'ratingAverage': 4.7,
        'ratingCount': 7,
      });
      expect(s.rating, 4.7);
      expect(s.reviewCount, 7);
    });

    test('is null when nothing has been reviewed, so no stars are drawn', () {
      final s = Service.fromJson({
        'id': 'a',
        'name': 'Plumbing',
        'category': 'Home Repair',
        'basePrice': 299,
        'ratingAverage': null,
        'ratingCount': 0,
      });
      expect(s.rating, isNull);
    });
  });
}
