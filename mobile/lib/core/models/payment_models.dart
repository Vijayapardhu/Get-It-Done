import '../network/json.dart';

// ───────────────────────────────────────────────────────── payment orders ──

/// A payment order as the backend sees it.
///
/// [providerOrderId] is the gateway's own order id. Until the backend has
/// created one at Razorpay it is null and checkout cannot be opened — the app
/// must not paper over that, because a checkout without an order id silently
/// takes money against nothing.
class PaymentOrder {
  const PaymentOrder({
    required this.id,
    required this.bookingId,
    required this.amount,
    required this.status,
    this.currency = 'INR',
    this.provider = 'razorpay',
    this.providerOrderId,
    this.paidAt,
    this.expiresAt,
  });

  final String id;
  final String bookingId;
  final double amount;
  final String status;
  final String currency;
  final String provider;
  final String? providerOrderId;
  final DateTime? paidAt;
  final DateTime? expiresAt;

  bool get isPaid => status == 'paid';
  bool get isFailed => status == 'failed';
  bool get isPayable => status == 'created' || status == 'pending' || status == 'failed';

  /// Payment orders are held for 30 minutes server-side. A stale one is not an
  /// error — the app just asks for a fresh order rather than opening checkout
  /// against an id the gateway has already released.
  bool get isExpired {
    final at = expiresAt;
    return at != null && !isPaid && at.isBefore(DateTime.now());
  }

  factory PaymentOrder.fromJson(Json json) => PaymentOrder(
        id: asString(pick(json, 'id')),
        bookingId: asString(pick(json, 'bookingId')),
        amount: asDouble(pick(json, 'amount')),
        status: asString(pick(json, 'status'), fallback: 'created'),
        currency: asString(pick(json, 'currency'), fallback: 'INR'),
        provider: asString(pick(json, 'provider'), fallback: 'razorpay'),
        providerOrderId: asStringOrNull(pick(json, 'providerOrderId')),
        paidAt: asDateOrNull(pick(json, 'paidAt')),
        expiresAt: asDateOrNull(pick(json, 'expiresAt')),
      );
}

/// Everything needed to open the gateway's checkout sheet.
///
/// The backend assembles this so the app never has to know a gateway's
/// conventions — notably that Razorpay wants paise, not rupees.
class CheckoutSession {
  const CheckoutSession({
    required this.paymentOrderId,
    required this.amountInPaise,
    required this.amount,
    this.provider = 'razorpay',
    this.keyId,
    this.providerOrderId,
    this.currency = 'INR',
    this.live = false,
  });

  final String paymentOrderId;
  final int amountInPaise;
  final double amount;
  final String provider;

  /// The publishable key. The secret never leaves the server.
  final String? keyId;
  final String? providerOrderId;
  final String currency;

  /// False when the backend has no gateway credentials configured. The app
  /// then runs a clearly-labelled simulated flow instead of opening a checkout
  /// that cannot succeed.
  final bool live;

  bool get canOpenCheckout => live && keyId != null && providerOrderId != null;

  factory CheckoutSession.fromJson(Json json) => CheckoutSession(
        paymentOrderId: asString(pick(json, 'paymentOrderId')),
        amountInPaise: asInt(pick(json, 'amountInPaise')),
        amount: asDouble(pick(json, 'amount')),
        provider: asString(pick(json, 'provider'), fallback: 'razorpay'),
        keyId: asStringOrNull(pick(json, 'keyId')),
        providerOrderId: asStringOrNull(pick(json, 'providerOrderId')),
        currency: asString(pick(json, 'currency'), fallback: 'INR'),
        live: asBool(pick(json, 'live')),
      );
}

/// The pair returned by `POST /payments/orders`.
class PaymentIntent {
  const PaymentIntent({required this.order, required this.checkout, this.replay = false});

  final PaymentOrder order;
  final CheckoutSession checkout;
  final bool replay;

  factory PaymentIntent.fromJson(Json json) => PaymentIntent(
        order: PaymentOrder.fromJson(asJson(pick(json, 'order')) ?? const {}),
        checkout: CheckoutSession.fromJson(asJson(pick(json, 'checkout')) ?? const {}),
        replay: asBool(pick(json, 'replay')),
      );
}

/// Result of handing the gateway's response back to the backend for
/// verification. `captured` is false on a replay — the payment was already
/// settled, which is a success, not a failure.
class PaymentVerification {
  const PaymentVerification({
    required this.verified,
    this.captured = false,
    this.alreadyPaid = false,
    this.order,
  });

  final bool verified;
  final bool captured;
  final bool alreadyPaid;
  final PaymentOrder? order;

  bool get isSettled => verified && (captured || alreadyPaid);

  factory PaymentVerification.fromJson(Json json) {
    final order = asJson(pick(json, 'order'));
    return PaymentVerification(
      verified: asBool(pick(json, 'verified')),
      captured: asBool(pick(json, 'captured')),
      alreadyPaid: asBool(pick(json, 'alreadyPaid')),
      order: order == null ? null : PaymentOrder.fromJson(order),
    );
  }
}

// ─────────────────────────────────────────────────────────── fare estimate ──

/// The price breakdown from `POST /pricing/estimate`.
///
/// The backend freezes this same total onto the booking at creation, so what
/// is shown here is what will be charged.
class PriceBreakdown {
  const PriceBreakdown({
    required this.total,
    this.baseService = 0,
    this.travel = 0,
    this.emergency = 0,
    this.surge = 0,
    this.subtotal = 0,
    this.taxRate = 0,
    this.tax = 0,
    this.currency = 'INR',
  });

  final double total;
  final double baseService;
  final double travel;
  final double emergency;
  final double surge;
  final double subtotal;
  final double taxRate;
  final double tax;
  final String currency;

  factory PriceBreakdown.fromJson(Json json) {
    final e = asJson(pick(json, 'estimate')) ?? json;
    return PriceBreakdown(
      total: asDouble(pick(e, 'total')),
      baseService: asDouble(pick(e, 'baseService')),
      travel: asDouble(pick(e, 'travel')),
      emergency: asDouble(pick(e, 'emergency')),
      surge: asDouble(pick(e, 'surge')),
      subtotal: asDouble(pick(e, 'subtotal')),
      taxRate: asDouble(pick(e, 'taxRate')),
      tax: asDouble(pick(e, 'tax')),
      currency: asString(pick(e, 'currency'), fallback: 'INR'),
    );
  }
}
