import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';

/// Phone-first sign-in.
///
/// One screen, two steps: enter a number, then the code. Phone-first because
/// it is the only onboarding that works for this audience — a customer booking
/// a plumber will not remember a password, and the same call signs in an
/// existing user or creates a new account.
///
/// NOTE: the backend currently logs the OTP to its server console instead of
/// sending an SMS. Until an SMS provider is wired, a real user cannot receive
/// the code. In debug the code is surfaced on screen so the flow is testable.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

enum _Step { phone, code }

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _phoneController = TextEditingController();
  final _nameController = TextEditingController();
  final _codeController = TextEditingController();
  final _codeFocus = FocusNode();

  _Step _step = _Step.phone;
  bool _busy = false;
  String? _error;

  /// Resend cooldown, so a user cannot hammer the endpoint (the backend rate
  /// limits /auth to 60 requests per 15 minutes PER IP, and Indian carriers
  /// share NAT — one impatient user can lock out a whole cell).
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

    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(authControllerProvider.notifier).requestOtp(_phone);
      if (!mounted) return;
      setState(() => _step = _Step.code);
      _startResendCooldown();
      // Focus the code field so the keyboard stays up through the transition.
      WidgetsBinding.instance.addPostFrameCallback((_) => _codeFocus.requestFocus());
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.isRateLimited
          ? 'Too many attempts from this network. Please wait a few minutes.'
          : e.message);
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
            // Sent only when provided; the backend creates the account on first
            // verification and ignores it afterwards.
            name: _nameController.text.trim().isEmpty ? null : _nameController.text.trim(),
          );
      // The router redirects on the auth state change; nothing to do here.
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
      body: SafeArea(
        child: GestureDetector(
          onTap: () => FocusScope.of(context).unfocus(),
          child: Padding(
            padding: const EdgeInsets.all(Space.x5),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_step == _Step.code)
                  AppIconButton(
                    icon: AppIcons.chevronLeft,
                    onPressed: () => setState(() {
                      _step = _Step.phone;
                      _error = null;
                    }),
                  )
                else
                  const SizedBox(height: Sizes.tapTargetMin),

                const SizedBox(height: Space.x6),

                AppIconBadge(
                  _step == _Step.phone ? AppIcons.cooperative : AppIcons.message,
                  size: 60,
                  iconSize: 30,
                ),
                const SizedBox(height: Space.x6),

                Text(
                  _step == _Step.phone ? 'Welcome to\nGET IT DONE' : 'Enter the code',
                  style: context.text.displayLarge,
                ),
                const SizedBox(height: Space.x2),
                Text(
                  _step == _Step.phone
                      ? 'Verified workers from local cooperative societies, at your door.'
                      : 'We sent a ${AppConfig.otpLength}-digit code to +91 $_phone.',
                  style: context.text.bodyLarge?.copyWith(color: t.textSecondary),
                ),

                const SizedBox(height: Space.x8),

                if (_step == _Step.phone) ..._phoneStep(t) else ..._codeStep(t),

                if (_error != null) ...[
                  const SizedBox(height: Space.x4),
                  AppBanner(message: _error!, tone: StateTone.error),
                ],

                const Spacer(),

                AppButton.primary(
                  label: _step == _Step.phone ? 'Continue' : 'Verify and continue',
                  loading: _busy,
                  onPressed: _busy ? null : (_step == _Step.phone ? _sendCode : _verify),
                  trailingIcon: AppIcons.chevronRight,
                ),

                const SizedBox(height: Space.x4),
                Text(
                  'By continuing you agree to our Terms and Privacy Policy.',
                  textAlign: TextAlign.center,
                  style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _phoneStep(AppTokens t) => [
        AppTextField(
          label: 'Mobile number',
          hint: '98765 43210',
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.done,
          autofocus: true,
          maxLength: 10,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          prefixIcon: AppIcons.call,
          helper: "We'll send a verification code.",
          onChanged: (_) => setState(() => _error = null),
          onSubmitted: (_) => _sendCode(),
        ),
        const SizedBox(height: Space.x4),
        AppTextField(
          label: 'Your name',
          hint: 'Only needed the first time',
          controller: _nameController,
          textInputAction: TextInputAction.done,
          prefixIcon: AppIcons.user,
        ),
      ];

  List<Widget> _codeStep(AppTokens t) => [
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
            // Submit as soon as the code is complete: nobody wants to reach for
            // a button after typing the last digit.
            if (value.length == AppConfig.otpLength && !_busy) _verify();
          },
        ),
        const SizedBox(height: Space.x4),
        Row(
          children: [
            Text("Didn't get it?", style: context.text.bodySmall?.copyWith(color: t.textSecondary)),
            const SizedBox(width: Space.x2),
            if (_resendIn > 0)
              Text('Resend in ${_resendIn}s', style: context.text.labelMedium?.copyWith(color: t.textTertiary))
            else
              GestureDetector(
                onTap: _busy ? null : _sendCode,
                child: Text(
                  'Resend code',
                  style: context.text.labelMedium?.copyWith(color: t.primary, fontWeight: FontWeight.w700),
                ),
              ),
          ],
        ),
        if (AppConfig.isDebug) ...[
          const SizedBox(height: Space.x4),
          const AppBanner(
            message: 'Development build: SMS delivery is not wired yet. '
                'The code is printed in the backend console.',
            tone: StateTone.warning,
          ),
        ],
      ];
}
