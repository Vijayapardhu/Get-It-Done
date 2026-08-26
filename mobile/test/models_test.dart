import 'package:flutter_test/flutter_test.dart';
import 'package:getitdone_customer/core/models/models.dart';
import 'package:getitdone_customer/core/network/json.dart';

/// Parsing tests built from responses captured off the running backend.
///
/// The payloads below are verbatim: the mixed casing, the numeric strings and
/// the JS date format are all real, not hypotheticals. If the backend is ever
/// normalised these still pass — that is the point of the tolerant readers.
void main() {
  group('json helpers', () {
    test('pick finds a key under either casing', () {
      expect(pick({'scheduledAt': 'x'}, 'scheduledAt'), 'x');
      expect(pick({'scheduled_at': 'x'}, 'scheduledAt'), 'x');
      expect(pick({'serviceName': 'x'}, 'service_name'), 'x');
      expect(pick({'service_name': 'x'}, 'serviceName'), 'x');
    });

    test('pick skips nulls so a later alias can win', () {
      expect(pick({'workerId': null, 'worker_id': 'w1'}, 'workerId'), 'w1');
    });

    test('coerces the numeric-as-string values node-postgres returns', () {
      // /services/discovery/search sends these as strings.
      expect(asDouble('299.00'), 299.0);
      expect(asDouble('5.0'), 5.0);
      expect(asInt('2'), 2);
      // A numeric that happens to be whole still arrives with a decimal.
      expect(asInt('4.0'), 4);
      expect(asDouble(299), 299.0);
    });

    test('degrades rather than throwing on junk', () {
      expect(asDoubleOrNull('not a number'), isNull);
      expect(asInt(null, fallback: 7), 7);
      expect(asString(null, fallback: '—'), '—');
      expect(asJsonList('not a list'), isEmpty);
    });

    test('parses ISO dates', () {
      final at = asDateOrNull('2026-08-26T01:49:17.588Z');
      expect(at, isNotNull);
      expect(at!.toUtc().year, 2026);
      expect(at.toUtc().month, 8);
    });

    test('parses the JS toString date /auth/me returns for lastLoginAt', () {
      // Real value observed on the wire.
      final at = asDateOrNull('Wed Aug 26 2026 07:19:04 GMT+0530 (India Standard Time)');
      expect(at, isNotNull, reason: 'lastLoginAt is not ISO-8601');
      // 07:19 IST is 01:49 UTC.
      expect(at!.toUtc().hour, 1);
      expect(at.toUtc().minute, 49);
    });

    test('parseList drops a malformed row instead of failing the whole list', () {
      final parsed = parseList<String>(
        [
          {'name': 'ok'},
          {'name': null},
          {'name': 'also ok'},
        ],
        (json) {
          final name = asStringOrNull(pick(json, 'name'));
          if (name == null) throw StateError('bad row');
          return name;
        },
      );
      expect(parsed, ['ok', 'also ok']);
    });
  });

  group('Service', () {
    test('parses the camelCase /services shape', () {
      final service = Service.fromJson({
        'id': '00000000-0000-0000-0000-000000000202',
        'name': 'Electrical',
        'category': 'Home Repair',
        'description': 'Switches, wiring, power failures and fixtures',
        'basePrice': 349,
        'emergencySupported': true,
        'createdAt': '2026-08-23T14:12:38.671Z',
      });

      expect(service.name, 'Electrical');
      expect(service.basePrice, 349.0);
      expect(service.emergencySupported, isTrue);
    });

    test('parses the snake_case /services/discovery/search shape', () {
      final service = Service.fromJson({
        'id': '00000000-0000-0000-0000-000000000201',
        'name': 'Plumbing',
        'category': 'Home Repair',
        'description': 'Leak fixes, pipe repairs, taps and fittings',
        'base_price': '299.00',
        'emergency_supported': true,
        'available_workers': '2',
        'avg_rating': '5.0',
        'review_count': '6',
        'distanceKm': 1.0097545262899998,
      });

      // Same concept, different wire shape — the model should not care.
      expect(service.name, 'Plumbing');
      expect(service.basePrice, 299.0);
      expect(service.availableWorkers, 2);
      expect(service.rating, 5.0);
      expect(service.reviewCount, 6);
      expect(service.distanceKm, closeTo(1.01, 0.01));
      expect(service.hasWorkers, isTrue);
    });

    test('reads min_distance_km from the nearby endpoint', () {
      final service = Service.fromJson({
        'id': 'x',
        'name': 'Plumbing',
        'base_price': '299.00',
        'min_distance_km': 2.5,
      });
      expect(service.distanceKm, 2.5);
    });
  });

  group('AuthSession', () {
    test('parses the login response', () {
      final session = AuthSession.fromJson({
        'accessToken': 'header.payload.signature',
        'refreshToken': 'refresh-token-value',
        'expiresIn': '15m',
        'user': {
          'id': '54c9da21-6553-4dc7-a31c-734e204a6907',
          'name': 'Probe User',
          'phone': null,
          'email': 'probe@example.com',
          'role': 'customer',
          'language': 'en',
          'status': 'active',
          'preferredLanguage': 'te',
          'avatarUrl': null,
        },
      });

      expect(session.accessToken, isNotEmpty);
      expect(session.user.name, 'Probe User');
      expect(session.user.isCustomer, isTrue);
      // preferredLanguage wins over language: it is what the user actually set.
      expect(session.user.language, 'te');
      expect(session.user.shortName, 'Probe');
    });

    test('parses the snake_case /users/me shape too', () {
      final user = AppUser.fromJson({
        'id': 'u1',
        'name': 'Probe User',
        'display_name': null,
        'role': 'customer',
        'preferred_language': 'hi',
        'avatar_url': null,
        'last_login_at': '2026-08-26T01:49:04.000Z',
      });
      expect(user.language, 'hi');
      expect(user.name, 'Probe User');
    });
  });

  group('Booking', () {
    test('parses the create-booking response including the one-shot OTPs', () {
      final created = BookingCreated.fromJson({
        'booking': {
          'id': '2eb635e6-6183-4cd0-822f-19d9340602f6',
          'customerId': '54c9da21-6553-4dc7-a31c-734e204a6907',
          'workerId': '00000000-0000-0000-0000-000000000602',
          'serviceId': '00000000-0000-0000-0000-000000000202',
          'status': 'assigned',
          'scheduledAt': null,
          'isEmergency': false,
          'address': 'Benz Circle, Vijayawada',
          'description': 'Shape probe',
          'price': null,
          'createdAt': '2026-08-26T01:49:17.588Z',
        },
        'recommendedWorker': {
          'workerId': '00000000-0000-0000-0000-000000000602',
          'name': 'Sita Devi',
          'distanceKm': 1.0097545262899998,
          'rating': 4.6,
          'jobsToday': 0,
          'hasCertification': false,
          'isAvailable': true,
          'currentStatus': 'available',
          'score': 91.1,
          'reasons': ['1.0 km away', 'available now', '4.6 rating', '0 jobs today'],
        },
        'alternatives': [],
        'otps': {'startOtp': '937980', 'completionOtp': '509337'},
      });

      expect(created.booking.status, 'assigned');
      expect(created.booking.isActive, isTrue);
      expect(created.booking.isTrackable, isTrue);
      expect(created.recommendedWorker?.name, 'Sita Devi');
      expect(created.recommendedWorker?.reasons.length, 4);

      // The codes come back exactly once; losing them here loses them forever.
      expect(created.otps?.startOtp, '937980');
      expect(created.otps?.completionOtp, '509337');
    });

    test('parses the mixed-casing dashboard row', () {
      // /customer/dashboard returns camelCase and snake_case in ONE object.
      final booking = Booking.fromJson({
        'id': 'b1',
        'status': 'en_route',
        'scheduledAt': null,
        'address': 'Benz Circle, Vijayawada',
        'isEmergency': false,
        'service_name': 'Electrical',
        'category': 'Home Repair',
        'worker_id': 'w1',
        'worker_name': 'Sita Devi',
        'worker_phone': '9876543210',
      });

      expect(booking.serviceName, 'Electrical');
      expect(booking.serviceCategory, 'Home Repair');
      expect(booking.workerName, 'Sita Devi');
      expect(booking.workerPhone, '9876543210');
      expect(booking.isTrackable, isTrue);
    });

    test('classifies lifecycle states correctly', () {
      Booking at(String status) => Booking.fromJson({'id': 'b', 'status': status});

      expect(at('requested').isActive, isTrue);
      expect(at('completed').isActive, isFalse);
      expect(at('cancelled').isActive, isFalse);
      expect(at('refunded').isActive, isFalse);

      expect(at('en_route').awaitsStartOtp, isTrue);
      expect(at('accepted').awaitsStartOtp, isTrue);
      expect(at('started').awaitsStartOtp, isFalse);
      expect(at('started').awaitsCompletionOtp, isTrue);
    });
  });

  group('FareEstimate', () {
    test('unwraps the estimate envelope', () {
      final estimate = FareEstimate.fromJson({
        'estimate': {
          'baseService': 349,
          'travel': 20,
          'emergency': 0,
          'surge': 0,
          'subtotal': 369,
          'taxRate': 0.18,
          'tax': 66.42,
          'total': 435.42,
          'currency': 'INR',
        },
      });

      expect(estimate.baseService, 349);
      expect(estimate.total, closeTo(435.42, 0.01));
      // The parts must reconcile, or the breakdown shown to the customer lies.
      expect(
        estimate.subtotal + estimate.tax,
        closeTo(estimate.total, 0.01),
      );
    });
  });

  group('CustomerDashboard', () {
    test('finds the active booking among upcoming ones', () {
      final dashboard = CustomerDashboard.fromJson({
        'upcomingBookings': [
          {'id': 'b1', 'status': 'completed'},
          {'id': 'b2', 'status': 'en_route', 'service_name': 'Plumbing'},
        ],
        'recentBookings': [],
        'favorites': [],
        'notifications': [],
      });

      expect(dashboard.activeBooking?.id, 'b2');
    });

    test('tolerates an entirely empty dashboard', () {
      final dashboard = CustomerDashboard.fromJson({});
      expect(dashboard.activeBooking, isNull);
      expect(dashboard.upcoming, isEmpty);
    });
  });

  group('TrustGraph', () {
    test('flattens the nested trust response', () {
      final trust = TrustGraph.fromJson({
        'worker': {
          'id': 'w1',
          'name': 'Ravi Kumar',
          'experienceYears': 8,
          'memberSince': '2024-01-15T00:00:00.000Z',
        },
        'verification': {'status': 'verified'},
        'cooperative': {'name': 'Vijayawada LCS', 'federation': 'AP Federation'},
        'skills': [
          {'serviceId': 's1', 'serviceName': 'Plumbing'},
          {'serviceId': 's2', 'serviceName': 'Pipe Repair'},
        ],
        'certifications': {'active': 3, 'expired': 0},
        'welfare': {'activeInsurancePolicies': 1, 'completedTrainings': 2},
        'safety': {'totalIncidents': 0, 'incidentsLast12Months': 0},
        'performance': {
          'averageRating': 4.9,
          'reviewCount': 1240,
          'completedJobs': 1240,
          'completionRate': 98.5,
        },
        'badges': ['identity_verified', 'society_member', 'certified_skills', 'insured'],
      });

      expect(trust.name, 'Ravi Kumar');
      expect(trust.isVerified, isTrue);
      expect(trust.cooperativeName, 'Vijayawada LCS');
      expect(trust.skills, ['Plumbing', 'Pipe Repair']);
      expect(trust.rating, 4.9);
      expect(trust.activeCertifications, 3);
      expect(trust.hasBadge('insured'), isTrue);
      expect(trust.hasBadge('top_rated'), isFalse);
    });

    test('handles an unverified worker with no society', () {
      final trust = TrustGraph.fromJson({
        'worker': {'id': 'w2', 'name': 'New Worker'},
        'verification': {'status': 'pending'},
        'cooperative': null,
        'badges': [],
      });

      expect(trust.isVerified, isFalse);
      expect(trust.cooperativeName, isNull);
      expect(trust.activeCertifications, 0);
      expect(trust.skills, isEmpty);
    });
  });
}
