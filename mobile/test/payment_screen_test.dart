import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:getitdone_customer/core/api/gid_api.dart';
import 'package:getitdone_customer/core/models/models.dart';
import 'package:getitdone_customer/core/models/payment_models.dart';
import 'package:getitdone_customer/core/network/api_exception.dart';
import 'package:getitdone_customer/core/providers.dart';
import 'package:getitdone_customer/design/design_system.dart';
import 'package:getitdone_customer/features/payment/payment_screen.dart';

/// Guards on the payment screen's money-handling behaviour.
///
/// These are the rules that must not regress: a customer is never invited to
/// pay twice, and a charge we could not confirm is never reported as a failure.
class _StubApi implements GidApi {
  _StubApi({this.intent, this.createError});

  final PaymentIntent? intent;
  final ApiException? createError;

  int createCalls = 0;
  final idempotencyKeys = <String>[];

  @override
  Future<PaymentIntent> createPaymentOrder({
    required String bookingId,
    required String idempotencyKey,
    String provider = 'razorpay',
  }) async {
    createCalls++;
    idempotencyKeys.add(idempotencyKey);
    final error = createError;
    if (error != null) throw error;
    return intent!;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

PaymentIntent _intent({String status = 'created', double amount = 352.82}) => PaymentIntent(
      order: PaymentOrder.fromJson({
        'id': 'po1',
        'bookingId': 'b9',
        'amount': amount,
        'status': status,
        'providerOrderId': 'order_test_1',
      }),
      checkout: CheckoutSession.fromJson({
        'paymentOrderId': 'po1',
        'amountInPaise': (amount * 100).round(),
        'amount': amount,
        'keyId': 'rzp_test_key',
        'providerOrderId': 'order_test_1',
        'live': true,
      }),
    );

final _booking = Booking.fromJson(const {
  'id': 'b9',
  'status': 'completed',
  'service_name': 'Plumbing repair',
});

Future<void> _pumpScreen(WidgetTester tester, GidApi api) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [apiProvider.overrideWithValue(api)],
    child: MaterialApp(
      theme: AppTheme.light(null),
      home: PaymentScreen(booking: _booking),
    ),
  ));
  await tester.pump(const Duration(milliseconds: 400));
}

AppButton _button(WidgetTester tester, String startsWith) => tester.widget<AppButton>(
      find.byWidgetPredicate((w) => w is AppButton && w.label.startsWith(startsWith)),
    );

void main() {
  testWidgets('the pay button is tappable once the order is ready', (tester) async {
    await _pumpScreen(tester, _StubApi(intent: _intent()));

    final button = _button(tester, 'Pay');
    expect(button.loading, isFalse);
    expect(button.onPressed, isNotNull);
    expect(find.text('Pay ₹352.82'), findsOneWidget);
  });

  testWidgets('the amount shown is the server amount, not a local estimate', (tester) async {
    // The booking says nothing about price here; the screen must render what
    // the payment order came back with.
    await _pumpScreen(tester, _StubApi(intent: _intent(amount: 1042.5)));

    expect(find.text('₹1042.50'), findsOneWidget);
    expect(find.text('Pay ₹1042.50'), findsOneWidget);
  });

  testWidgets('an already-paid order never offers to charge again', (tester) async {
    await _pumpScreen(tester, _StubApi(intent: _intent(status: 'paid')));

    expect(find.text('Payment received'), findsOneWidget);
    expect(
      find.byWidgetPredicate((w) => w is AppButton && w.label.startsWith('Pay ₹')),
      findsNothing,
      reason: 'a paid booking must not present a pay button',
    );
  });

  testWidgets('the order is created once, with one idempotency key', (tester) async {
    final api = _StubApi(intent: _intent());
    await _pumpScreen(tester, api);

    // Rebuilds must not create a second order.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(api.createCalls, 1);
    expect(api.idempotencyKeys.toSet(), hasLength(1));
    expect(api.idempotencyKeys.single.length, greaterThanOrEqualTo(16));
  });

  testWidgets('a failed order offers a retry rather than a dead end', (tester) async {
    final api = _StubApi(createError: ApiException(message: 'The service is unavailable.', statusCode: 503));
    await _pumpScreen(tester, api);

    expect(find.text('The service is unavailable.'), findsOneWidget);
    final button = _button(tester, 'Try again');
    expect(button.onPressed, isNotNull);
  });
}
