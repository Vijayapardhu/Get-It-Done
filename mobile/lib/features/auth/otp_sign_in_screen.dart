import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';

/// SMS code sign-in.
///
/// No longer the front door — Google and password sit ahead of it — but kept
/// because it is the only path that needs nothing remembered, and because it
/// doubles as sign-up: verifying a new number creates the account.
///
/// It depends on an SMS gateway being configured. When one is not, the backend
/// answers 503 and this screen says so plainly rather than leaving the user
/// waiting for a message that will never arrive.
class OtpSignInScreen extends ConsumerStatefulWidget {
  const OtpSignInScreen({super.key});

  @override
  ConsumerState<OtpSignInScreen> createState() => _OtpSignInScreenState();
}

enum _Step { phone, code }

class _OtpSignInScreenState extends ConsumerState<OtpSignInScreen> {
  final _phoneController = TextEditingController();
  final _nameController = TextEditingController();
  final _codeController = TextEditingController();
  final _codeFocus = FocusNode();

  _Step _step = _Step.phone;
  bool _busy = false;
  String? _error;

  /// Set when the gateway is unavailable, so the screen can offer the way back
  /// rather than a retry that cannot succeed.
  bool _smsUnavailable = false;

  /// Present only when the backend runs with OTP_ECHO_IN_RESPONSE, which
  /// env.ts refuses in production.
  String? _devOtp;

  /// The backend rate limits /auth to 60 requests per 15 minutes PER IP, and
  /// Indian carriers share NAT — one impatient user can lock out a whole cell.
  int _resendIn = 0;
  Timer? _resendTimer;

  @override
  void dispose() {
    _phoneController.dispose();
    _nameController.dispose();
    _codeController.dispose();
    _codeFocus.dispose();
    _resendTimer?.cancel();
    super.dispose();
  }

  String get _phone => _phoneController.text.replaceAll(RegExp(r'\D'), '');
  bool get _phoneValid => _phone.length == 10 && !_phone.startsWith(RegExp('[0-5]'));

  void _startResendCooldown() {
    _resendTimer?.cancel();
    setState(() => _resendIn = 30);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      setState(() => _resendIn--);
      if (_resendIn <= 0) timer.cancel();
    });
  }

  Future<void> _sendCode() async {
    if (!_phoneValid) {
      setState(() => _error = 'Enter a valid 10-digit mobile number.');
      return;
    }

    setState(() { _busy = true; _error = null; _smsUnavailable = false; });
    try {
      final devOtp = await ref.read(authControllerProvider.notifier).requestOtp(_phone);
      if (!mounted) return;
      setState(() { _step = _Step.code; _devOtp = devOtp; });
      _startResendCooldown();
      WidgetsBinding.instance.addPostFrameCallback((_) => _codeFocus.requestFocus());
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _smsUnavailable = e.code == 'SMS_UNAVAILABLE';
        _error = switch (e.code) {
          'SMS_UNAVAILABLE' =>
            'Text messages are not available right now. Use Google or a password instead.',
          'SMS_DELIVERY_FAILED' =>
            'We could not send a code to that number. Check it and try again.',
          _ when e.isRateLimited =>
            'Too many attempts from this network. Please wait a few minutes.',
          _ => e.message,
        };
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    final code = _codeController.text.replaceAll(RegExp(r'\D'), '');
    if (code.length != AppConfig.otpLength) {
      setState(() => _error = 'Enter the ${AppConfig.otpLength}-digit code.');
      return;
    }

    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(authControllerProvider.notifier).verifyOtp(
            phone: _phone,
            otp: code,
            // Only used when the number is new; the backend ignores it for an
            // existing account.
            name: _nameController.text.trim().isEmpty ? null : _nameController.text.trim(),
          );
      // The root gate replaces the whole stack on success.
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
      _codeController.clear();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () {
            if (_step == _Step.code) {
              setState(() { _step = _Step.phone; _error = null; });
            } else {
              Navigator.of(context).maybePop();
            }
          },
        ),
      ),
      body: SafeArea(
        child: GestureDetector(
          onTap: () => FocusScope.of(context).unfocus(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(Space.x5, Space.x4, Space.x5, Space.x8),
            children: [
              // Aligned, not bare: a ListView stretches its children across
              // the cross axis, which turns a fixed-size badge into a bar.
              const Align(
                alignment: Alignment.centerLeft,
                child: AppIconBadge(AppIcons.message, size: 60, iconSize: 30),
              ),
              const SizedBox(height: Space.x6),
              Text(
                _step == _Step.phone ? 'Sign in with\nyour phone' : 'Enter the code',
                style: context.text.displayLarge,
              ),
              const SizedBox(height: Space.x2),
              Text(
                _step == _Step.phone
                    ? 'We will text you a ${AppConfig.otpLength}-digit code. No password needed.'
                    : 'Sent to +91 $_phone.',
                style: context.text.bodyLarge?.copyWith(color: t.textSecondary),
              ),

              const SizedBox(height: Space.x8),

              if (_step == _Step.phone) ...[
                AppTextField(
                  label: 'Mobile number',
                  hint: '98765 43210',
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.next,
                  autofocus: true,
                  maxLength: 10,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  prefixIcon: AppIcons.call,
                  onChanged: (_) => setState(() => _error = null),
                ),
                const SizedBox(height: Space.x4),
                AppTextField(
                  label: 'Your name',
                  hint: 'Only needed the first time',
                  controller: _nameController,
                  textInputAction: TextInputAction.done,
                  prefixIcon: AppIcons.user,
                  onSubmitted: (_) => _sendCode(),
                ),
              ] else ...[
                AppTextField(
                  label: 'Verification code',
                  hint: '••••••',
                  controller: _codeController,
                  focusNode: _codeFocus,
                  keyboardType: TextInputType.number,
                  maxLength: AppConfig.otpLength,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  onChanged: (value) {
                    setState(() => _error = null);
                    // Submit on the last digit; nobody wants to reach for a
                    // button after typing a code.
                    if (value.length == AppConfig.otpLength && !_busy) _verify();
                  },
                ),
                const SizedBox(height: Space.x4),
                Row(
                  children: [
                    Text(
                      "Didn't get it?",
                      style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                    ),
                    const SizedBox(width: Space.x2),
                    if (_resendIn > 0)
                      Text(
                        'Resend in ${_resendIn}s',
                        style: context.text.labelMedium?.copyWith(color: t.textTertiary),
                      )
                    else
                      GestureDetector(
                        onTap: _busy ? null : _sendCode,
                        child: Text(
                          'Resend code',
                          style: context.text.labelMedium?.copyWith(
                            color: t.primary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                  ],
                ),
                if (_devOtp != null) ...[
                  const SizedBox(height: Space.x4),
                  AppBanner(
                    message: 'Development build — your code is $_devOtp.',
                    tone: StateTone.warning,
                    actionLabel: 'Fill',
                    onAction: () {
                      _codeController.text = _devOtp!;
                      _verify();
                    },
                  ),
                ],
              ],

              if (_error != null) ...[
                const SizedBox(height: Space.x4),
                AppBanner(message: _error!, tone: StateTone.error),
              ],

              const SizedBox(height: Space.x6),
              // A retry cannot fix an unconfigured gateway, so send them back
              // to the options that work instead of offering one.
              if (_smsUnavailable)
                AppButton.primary(
                  label: 'Use Google or a password',
                  icon: AppIcons.chevronLeft,
                  onPressed: () => Navigator.of(context).maybePop(),
                )
              else
                AppButton.primary(
                  label: _step == _Step.phone ? 'Send code' : 'Verify and continue',
                  loading: _busy,
                  trailingIcon: AppIcons.chevronRight,
                  onPressed: _busy ? null : (_step == _Step.phone ? _sendCode : _verify),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
