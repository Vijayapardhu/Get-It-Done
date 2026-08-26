import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../core/models/models.dart';
import '../../core/models/payment_models.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import '../../core/ui/service_artwork.dart';

/// Pay for a booking.
///
/// The shape of this screen is dictated by one rule: the customer must never
/// be able to be charged twice, and must never be left having paid without the
/// booking knowing.
///
///  * The idempotency key is generated ONCE, when the screen opens. A retry
///    after a dropped response replays the original order rather than creating
///    a second one.
///  * The order is created up front, not on tap, so the amount on screen is
///    the amount the server will charge — not a client-side estimate that
///    might disagree.
///  * The gateway's response is verified SERVER-side. A success callback from
///    the SDK is not proof of payment; only the backend re-deriving the HMAC
///    with its secret is.
///  * If verification fails after a successful charge, the screen says the
///    money was taken and support will reconcile — it does not pretend the
///    payment failed, which would invite the customer to pay again.
class PaymentScreen extends ConsumerStatefulWidget {
  const PaymentScreen({
    super.key,
    required this.booking,
    this.onPaid,
  });

  final Booking booking;

  /// Called once the backend confirms settlement.
  final void Function(PaymentOrder order)? onPaid;

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

enum _Phase { preparing, ready, opening, verifying, paid, failed }

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  /// Fixed for the lifetime of this screen — see the class doc.
  final String _idempotencyKey = ApiClient.newIdempotencyKey();

  Razorpay? _razorpay;

  _Phase _phase = _Phase.preparing;
  PaymentIntent? _intent;
  String? _error;

  /// Set when the gateway charged the card but our verification did not
  /// complete. This is the one state where telling the customer "payment
  /// failed" would be actively harmful.
  bool _chargedButUnverified = false;

  @override
  void initState() {
    super.initState();
    _prepare();
  }

  /// Built on first use, not in initState.
  ///
  /// The Razorpay constructor immediately calls a platform channel, so
  /// creating it eagerly would throw on any surface without the native plugin
  /// — including widget tests — for a screen the user may never pay from.
  Razorpay _gateway() {
    return _razorpay ??= Razorpay()
      ..on(Razorpay.EVENT_PAYMENT_SUCCESS, _onGatewaySuccess)
      ..on(Razorpay.EVENT_PAYMENT_ERROR, _onGatewayError)
      ..on(Razorpay.EVENT_EXTERNAL_WALLET, _onExternalWallet);
  }

  @override
  void dispose() {
    _razorpay?.clear();
    super.dispose();
  }

  // ── Order ────────────────────────────────────────────────────────────────

  Future<void> _prepare() async {
    setState(() {
      _phase = _Phase.preparing;
      _error = null;
    });

    try {
      final intent = await ref.read(apiProvider).createPaymentOrder(
            bookingId: widget.booking.id,
            idempotencyKey: _idempotencyKey,
          );
      if (!mounted) return;

      // A replayed order that is already paid means the customer completed
      // this payment on another device, or before a crash. Do not offer to
      // charge them again.
      if (intent.order.isPaid) {
        setState(() {
          _intent = intent;
          _phase = _Phase.paid;
        });
        widget.onPaid?.call(intent.order);
        return;
      }

      setState(() {
        _intent = intent;
        _phase = _Phase.ready;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _phase = _Phase.failed;
        });
      }
    }
  }

  // ── Checkout ─────────────────────────────────────────────────────────────

  Future<void> _pay() async {
    final intent = _intent;
    if (intent == null) return;

    // An expired order's gateway id has been released. Get a fresh one rather
    // than opening a sheet that will reject the card.
    if (intent.order.isExpired) {
      await _prepare();
      return;
    }

    if (!intent.checkout.canOpenCheckout) {
      await _paySimulated();
      return;
    }

    setState(() {
      _phase = _Phase.opening;
      _error = null;
    });

    final user = ref.read(currentUserProvider);
    try {
      _gateway().open({
        'key': intent.checkout.keyId,
        'order_id': intent.checkout.providerOrderId,
        'amount': intent.checkout.amountInPaise,
        'currency': intent.checkout.currency,
        'name': 'GET IT DONE',
        'description': widget.booking.serviceName ?? 'Service booking',
        'timeout': 300,
        'prefill': {
          if (user?.phone != null) 'contact': user!.phone,
          if (user?.email != null) 'email': user!.email,
        },
        'theme': {'color': '#3B63F5'},
        'retry': {'enabled': true, 'max_count': 2},
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'We could not open the payment screen.';
          _phase = _Phase.failed;
        });
      }
    }
  }

  /// Dev-only path, taken when the backend reports no gateway is configured.
  ///
  /// The backend refuses to issue simulated orders in production, so this
  /// cannot settle real money. It exists so the rest of the flow can be built
  /// and reviewed without live credentials.
  Future<void> _paySimulated() async {
    setState(() => _phase = _Phase.verifying);
    await _verify(signature: 'sim', paymentId: 'pay_sim_${DateTime.now().millisecondsSinceEpoch}');
  }

  void _onGatewaySuccess(PaymentSuccessResponse response) {
    setState(() => _phase = _Phase.verifying);
    _verify(
      signature: response.signature ?? '',
      paymentId: response.paymentId ?? '',
      orderId: response.orderId,
    );
  }

  void _onGatewayError(PaymentFailureResponse response) {
    if (!mounted) return;
    setState(() {
      // Code 2 is the user dismissing the sheet. That is not a failure worth
      // shouting about — they simply changed their mind.
      _error = response.code == Razorpay.PAYMENT_CANCELLED
          ? null
          : (response.message?.trim().isNotEmpty == true
              ? response.message!.trim()
              : 'The payment did not go through.');
      _phase = _Phase.ready;
    });
  }

  void _onExternalWallet(ExternalWalletResponse response) {
    // The wallet app takes over; the outcome arrives as a webhook rather than
    // a callback, so the honest thing is to say so and let the customer leave.
    if (!mounted) return;
    setState(() {
      _phase = _Phase.verifying;
      _error = null;
    });
    _pollForSettlement();
  }

  // ── Verification ─────────────────────────────────────────────────────────

  Future<void> _verify({
    required String signature,
    required String paymentId,
    String? orderId,
  }) async {
    final intent = _intent;
    if (intent == null) return;

    try {
      final result = await ref.read(apiProvider).verifyPayment(
            paymentOrderId: intent.order.id,
            signature: signature,
            providerPaymentId: paymentId,
            providerOrderId: orderId ?? intent.checkout.providerOrderId,
          );
      if (!mounted) return;

      if (result.isSettled) {
        _onSettled(result.order);
        return;
      }

      // Verification came back negative on a charge the gateway said
      // succeeded. Do not invite a second payment.
      setState(() {
        _chargedButUnverified = true;
        _phase = _Phase.failed;
        _error = 'We could not confirm this payment automatically.';
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _chargedButUnverified = true;
        _phase = _Phase.failed;
        _error = e.message;
      });
      // The webhook is authoritative and arrives independently, so keep
      // checking — most of the time this resolves itself within seconds.
      _pollForSettlement();
    }
  }

  /// Wait for the webhook to settle the order.
  ///
  /// Used when the app cannot confirm the payment itself: an external wallet,
  /// or a verification call that failed after the card was charged.
  Future<void> _pollForSettlement() async {
    final intent = _intent;
    if (intent == null) return;

    for (var attempt = 0; attempt < 10; attempt++) {
      await Future<void>.delayed(const Duration(seconds: 3));
      if (!mounted) return;
      try {
        final refreshed = await ref.read(apiProvider).paymentOrder(intent.order.id);
        if (!mounted) return;
        if (refreshed.order.isPaid) {
          _onSettled(refreshed.order);
          return;
        }
      } on ApiException {
        // Keep waiting; a transient network failure is not a payment failure.
      }
    }
  }

  void _onSettled(PaymentOrder? order) {
    ref.invalidate(bookingsProvider);
    ref.invalidate(invoicesProvider);
    setState(() {
      _chargedButUnverified = false;
      _error = null;
      _phase = _Phase.paid;
    });
    if (order != null) widget.onPaid?.call(order);
  }

  // ── UI ───────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final busy = _phase == _Phase.preparing ||
        _phase == _Phase.opening ||
        _phase == _Phase.verifying;

    return PopScope(
      // Leaving mid-charge would strand the payment. The customer can still
      // back out before the sheet opens and after it settles.
      canPop: _phase != _Phase.verifying && _phase != _Phase.opening,
      child: Scaffold(
        appBar: AppBar(
          leading: AppIconButton(
            icon: AppIcons.close,
            onPressed: busy ? null : () => Navigator.of(context).maybePop(),
          ),
          title: const Text('Payment'),
        ),
        body: _phase == _Phase.paid ? _paidView(context) : _payView(context, t, busy),
      ),
    );
  }

  Widget _payView(BuildContext context, AppTokens t, bool busy) {
    final intent = _intent;

    return SafeArea(
      child: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(Space.x5, Space.x6, Space.x5, Space.x6),
              children: [
                Text('Amount due', style: context.text.bodySmall?.copyWith(color: t.textSecondary)),
                const SizedBox(height: Space.x1),
                if (intent == null)
                  const Skeleton(width: 160, height: 40)
                else
                  Text(
                    '₹${intent.order.amount.toStringAsFixed(2)}',
                    style: context.text.displaySmall?.copyWith(
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                const SizedBox(height: Space.x6),

                AppCard(
                  elevated: false,
                  padding: Space.cardInsetsLarge,
                  child: Row(
                    children: [
                      ServiceArtwork.raw(
                        name: widget.booking.serviceCategory ??
                            widget.booking.serviceName,
                        size: 44,
                      ),
                      const SizedBox(width: Space.x3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.booking.serviceName ?? 'Service',
                              style: context.text.titleMedium,
                            ),
                            if (widget.booking.address != null)
                              Text(
                                widget.booking.address!,
                                style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: Space.x4),

                // The welfare promise, stated before payment rather than only
                // on the receipt afterwards.
                AppFeatureBand(
                  padding: const EdgeInsets.all(Space.x4),
                  child: Row(
                    children: [
                      AppIconBadge(AppIcons.shield, size: 40),
                      const SizedBox(width: Space.x3),
                      Expanded(
                        child: Text(
                          'Part of this payment goes to the worker welfare fund, '
                          'and the rest to the worker and their cooperative.',
                          style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                        ),
                      ),
                    ],
                  ),
                ),

                if (intent != null && !intent.checkout.live) ...[
                  const SizedBox(height: Space.x4),
                  const AppBanner(
                    message: 'Test mode — no payment gateway is configured, so no money will move.',
                    tone: StateTone.warning,
                  ),
                ],

                if (_chargedButUnverified) ...[
                  const SizedBox(height: Space.x4),
                  AppBanner(
                    message: _phase == _Phase.failed
                        ? 'Your card may have been charged. Do not pay again — we are '
                            'confirming with the bank and will update this booking shortly.'
                        : 'Confirming your payment with the bank…',
                    tone: StateTone.warning,
                  ),
                ] else if (_error != null) ...[
                  const SizedBox(height: Space.x4),
                  AppBanner(message: _error!, tone: StateTone.error),
                ],
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(Space.x5, 0, Space.x5, Space.x6),
            child: Column(
              children: [
                AppButton(
                  label: switch (_phase) {
                    _Phase.preparing => 'Preparing…',
                    _Phase.opening => 'Opening…',
                    _Phase.verifying => 'Confirming…',
                    _ => intent == null
                        ? 'Try again'
                        : 'Pay ₹${intent.order.amount.toStringAsFixed(2)}',
                  },
                  size: AppButtonSize.large,
                  icon: AppIcons.secure,
                  loading: busy,
                  // Never offer a retry button once the card may have been
                  // charged — the resolution is reconciliation, not a re-pay.
                  onPressed: busy || _chargedButUnverified
                      ? null
                      : (intent == null ? _prepare : _pay),
                ),
                const SizedBox(height: Space.x3),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    AppIcon(AppIcons.secure, size: Sizes.iconXs, color: t.textTertiary),
                    const SizedBox(width: Space.x2),
                    Text(
                      'Payments are processed by Razorpay',
                      style: context.text.labelSmall?.copyWith(color: t.textTertiary),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _paidView(BuildContext context) {
    final t = context.tokens;
    final amount = _intent?.order.amount;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(Space.x5),
        child: Column(
          children: [
            const Spacer(),
            AppIconBadge(
              AppIcons.success,
              size: 88,
              iconSize: 40,
              background: t.successSoft,
              foreground: t.success,
            ),
            const SizedBox(height: Space.x6),
            Text('Payment received', style: context.text.headlineMedium),
            const SizedBox(height: Space.x2),
            Text(
              amount == null
                  ? 'Your booking is paid.'
                  : '₹${amount.toStringAsFixed(2)} paid. Your receipt is in Payments.',
              style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
              textAlign: TextAlign.center,
            ),
            const Spacer(),
            AppButton(
              label: 'Done',
              size: AppButtonSize.large,
              onPressed: () => Navigator.of(context).maybePop(),
            ),
          ],
        ),
      ),
    );
  }
}
