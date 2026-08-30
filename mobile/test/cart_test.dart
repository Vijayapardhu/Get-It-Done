import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:getitdone_customer/core/cart/cart.dart';
import 'package:gid_core/gid_core.dart';

Service service(
  String id, {
  double price = 299,
  double? listPrice,
  double? ratePerMinute = 5,
  int minMinutes = 30,
  int maxMinutes = 240,
  int defaultMinutes = 60,
}) =>
    Service.fromJson({
      'id': id,
      'name': 'Service $id',
      'category': 'Home Repair',
      'basePrice': price,
      if (listPrice != null) 'listPrice': listPrice,
      if (ratePerMinute != null) 'pricePerMinute': ratePerMinute,
      'minMinutes': minMinutes,
      'maxMinutes': maxMinutes,
      'defaultMinutes': defaultMinutes,
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

    test('a service goes in once, at its default duration', () {
      cart().add(service('a', defaultMinutes: 90));

      expect(state().lines, hasLength(1));
      expect(state().minutesOf('a'), 90);
      expect(state().serviceCount, 1);
    });

    test('adding again REPLACES the time rather than extending it', () {
      // Tapping add twice means "book this", not "book twice as long". Silently
      // doubling someone's booking is how they end up paying for four hours
      // they never asked for.
      cart().add(service('a', defaultMinutes: 60));
      cart().add(service('a', defaultMinutes: 60));

      expect(state().lines, hasLength(1));
      expect(state().minutesOf('a'), 60);
    });

    test('minutes are clamped to the service bounds', () {
      cart().add(service('a', minMinutes: 30, maxMinutes: 120), minutes: 10);
      expect(state().minutesOf('a'), 30);

      cart().setMinutes('a', 600);
      expect(state().minutesOf('a'), 120);
    });

    test('the line total is rate times time', () {
      cart().add(service('a', ratePerMinute: 5), minutes: 90);
      expect(state().subtotal, 450);
    });

    test('subtotal adds across services', () {
      cart().add(service('a', ratePerMinute: 5), minutes: 60);
      cart().add(service('b', ratePerMinute: 8), minutes: 30);

      expect(state().subtotal, 300 + 240);
      expect(state().totalMinutes, 90);
      expect(state().serviceCount, 2);
    });

    test('a service with no rate falls back to its flat price', () {
      // Not every service will have been given a rate on day one, and one that
      // has not still has to be bookable.
      cart().add(service('a', price: 299, ratePerMinute: null));

      expect(state().lines.single.service.isTimed, isFalse);
      expect(state().subtotal, 299);
    });

    test('removing takes the service out entirely', () {
      cart().add(service('a'));
      cart().remove('a');

      expect(state().isEmpty, isTrue);
      expect(state().contains('a'), isFalse);
    });

    test('removing something that is not there changes nothing', () {
      cart().add(service('a'));
      cart().remove('nope');

      expect(state().minutesOf('a'), greaterThan(0));
      expect(state().lines, hasLength(1));
    });

    test('savings scale with the time booked', () {
      // The promotion discounts the RATE, so booking twice as long saves twice
      // as much.
      cart().add(
        service('a', price: 200, listPrice: 250, ratePerMinute: 4),
        minutes: 60,
      );

      expect(state().subtotal, 240);
      expect(state().savings, closeTo(60, 0.01));
    });

    test('a service with no promotion contributes no saving', () {
      cart().add(service('a', ratePerMinute: 5), minutes: 60);
      expect(state().savings, 0);
    });

    test('re-adding refreshes the stored service', () {
      cart().add(service('a', ratePerMinute: 5));
      cart().add(service('a', ratePerMinute: 8));

      expect(state().lines.single.service.pricePerMinute, 8);
    });
  });

  group('Service promotions', () {
    test('a list price above the charge is a discount', () {
      final s = service('a', price: 299, listPrice: 399, ratePerMinute: null);
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

  group('Service duration', () {
    test('priceFor clamps before multiplying', () {
      final s = service('a', ratePerMinute: 5, minMinutes: 30, maxMinutes: 120);

      expect(s.priceFor(60), 300);
      expect(s.priceFor(10), 150, reason: 'below the floor, priced at the floor');
      expect(s.priceFor(600), 600, reason: 'above the ceiling, priced at the ceiling');
    });

    test('a service with no rate ignores the duration', () {
      final s = service('a', price: 299, ratePerMinute: null);
      expect(s.priceFor(240), 299);
      expect(s.isTimed, isFalse);
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

  group('PlacedOrder', () {
    final json = {
      'order': {
        'id': 'o1',
        'mode': 'scheduled',
        'total': 764.64,
        'scheduledAt': '2026-08-28T10:00:00.000Z',
        'address': 'Flat 402',
        'bookingCount': 2,
      },
      'bookings': [
        {'id': 'b1', 'status': 'requested', 'serviceName': 'Plumbing', 'price': 352.82},
        {'id': 'b2', 'status': 'requested', 'serviceName': 'Electrical', 'price': 411.82},
      ],
      'otps': [
        {'bookingId': 'b1', 'startOtp': '111111', 'completionOtp': '222222'},
        {'bookingId': 'b2', 'startOtp': '333333', 'completionOtp': '444444'},
      ],
    };

    test('keeps the handshake codes', () {
      // The regression this exists for: the field was not parsed at all, and
      // the server issues these EXACTLY once — only hashes are kept — so the
      // codes were gone for good and the customer could not verify the worker
      // who turned up.
      final order = PlacedOrder.fromJson(json);
      expect(order.otps, hasLength(2));
      expect(order.otpsFor('b1')!.startOtp, '111111');
      expect(order.otpsFor('b2')!.completionOtp, '444444');
    });

    test('matches codes to bookings by id, never by position', () {
      // Reading the wrong pair to the wrong worker fails the check, and an
      // order's bookings and otps need not arrive in the same order.
      final shuffled = PlacedOrder.fromJson({
        ...json,
        'otps': [
          {'bookingId': 'b2', 'startOtp': '333333', 'completionOtp': '444444'},
          {'bookingId': 'b1', 'startOtp': '111111', 'completionOtp': '222222'},
        ],
      });
      expect(shuffled.otpsFor('b1')!.startOtp, '111111');
    });

    test('is null for a booking the server issued no codes for', () {
      expect(PlacedOrder.fromJson(json).otpsFor('nope'), isNull);
    });

    test('the total is the server figure, not a local sum', () {
      expect(PlacedOrder.fromJson(json).total, 764.64);
    });

    test('an order fetched later has no codes, and that is not an error', () {
      // GET /orders/:id cannot return them; the page must cope rather than
      // render a broken card.
      final fetched = PlacedOrder.fromJson({...json}..remove('otps'));
      expect(fetched.otps, isEmpty);
      expect(fetched.bookings, hasLength(2));
    });
  });

  group('Booking', () {
    test('carries the order it was placed in', () {
      final booking = Booking.fromJson(
        {'id': 'b1', 'status': 'requested', 'orderId': 'o1'},
      );
      expect(booking.orderId, 'o1');
    });

    test('has none when booked on its own', () {
      expect(Booking.fromJson({'id': 'b1', 'status': 'requested'}).orderId, isNull);
    });
  });
}
