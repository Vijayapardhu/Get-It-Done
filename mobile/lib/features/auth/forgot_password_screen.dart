import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';

/// Reset a forgotten password.
///
/// Two steps on one screen rather than two screens: ask for the address, then
/// take the code from the email and the new password. Keeping them together
/// means the user never loses the thread by backing out of a second screen,
/// and someone who already has a code can skip straight to the second half.
///
/// The first step's response is deliberately the same whether or not the
/// address has an account — the backend says "if the email exists" and this
/// screen must not be more specific, or it becomes a way to test which
/// addresses are registered.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, this.email});

  /// Carried over from the sign-in form, so the address is not typed twice.
  final String? email;

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

enum _Stage { request, reset }

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  late final _emailController = TextEditingController(text: widget.email ?? '');
  final _tokenController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordFocus = FocusNode();

  _Stage _stage = _Stage.request;
  bool _busy = false;
  bool _obscure = true;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    _emailController.dispose();
    _tokenController.dispose();
    _passwordController.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  String get _email => _emailController.text.trim();

  Future<void> _sendLink() async {
    if (!_email.contains('@') || !_email.split('@').last.contains('.')) {
      setState(() => _error = 'Enter a valid email address.');
      return;
    }

    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(apiProvider).forgotPassword(_email);
      if (!mounted) return;
      setState(() {
        _stage = _Stage.reset;
        _notice = 'If $_email has an account, a reset code is on its way. '
            'Enter it below with your new password.';
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reset() async {
    final token = _tokenController.text.trim();
    if (token.length < 32) {
      setState(() => _error = 'Paste the whole code from the email.');
      return;
    }
    if (_passwordController.text.length < 8) {
      setState(() => _error = 'Use at least 8 characters for your new password.');
      return;
    }

    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(apiProvider).resetPassword(
            token: token,
            password: _passwordController.text,
          );
      if (!mounted) return;
      // Looked up BEFORE the pop. Afterwards this element is on its way out of
      // the tree, and the confirmation would be the thing most likely to go
      // missing at the one moment the user needs to see it.
      final messenger = ScaffoldMessenger.of(context);
      Navigator.of(context).pop();
      // The sign-in screen is underneath, with the email still in its field.
      messenger.showSnackBar(
        const SnackBar(content: Text('Password changed. Sign in with it now.')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        // A reset token lasts an hour, and "invalid" and "expired" are the same
        // 400. Naming both saves the user re-reading an old email.
        _error = e.statusCode == 400
            ? 'That code is not valid any more. Codes expire after an hour — '
                'request a new one.'
            : e.message;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final requesting = _stage == _Stage.request;

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: GestureDetector(
          onTap: () => FocusScope.of(context).unfocus(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(Space.x5, Space.x2, Space.x5, Space.x8),
            children: [
              const AppIllustration(
                assetAnimation: 'assets/lottie/secure.json',
                height: 150,
              ),
              const SizedBox(height: Space.x4),

              Text(
                requesting ? 'Reset your password' : 'Set a new password',
                textAlign: TextAlign.center,
                style: context.text.displayLarge,
              ),
              const SizedBox(height: Space.x2),
              Text(
                requesting
                    ? 'We will email a reset code to the address on your account.'
                    : 'Paste the code from the email and choose a new password.',
                textAlign: TextAlign.center,
                style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
              ),

              const SizedBox(height: Space.x6),

              AppTextField(
                label: 'Email address',
                hint: 'you@example.com',
                controller: _emailController,
                enabled: requesting,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.done,
                prefixIcon: AppIcons.email,
                inputFormatters: [FilteringTextInputFormatter.deny(RegExp(r'\s'))],
                onChanged: (_) => setState(() => _error = null),
                onSubmitted: (_) => _sendLink(),
              ),

              if (!requesting) ...[
                const SizedBox(height: Space.x4),
                AppTextField(
                  label: 'Reset code',
                  hint: 'Paste it from the email',
                  controller: _tokenController,
                  textInputAction: TextInputAction.next,
                  prefixIcon: AppIcons.secure,
                  inputFormatters: [FilteringTextInputFormatter.deny(RegExp(r'\s'))],
                  onChanged: (_) => setState(() => _error = null),
                  onSubmitted: (_) => _passwordFocus.requestFocus(),
                ),
                const SizedBox(height: Space.x4),
                AppTextField(
                  label: 'New password',
                  hint: 'At least 8 characters',
                  controller: _passwordController,
                  focusNode: _passwordFocus,
                  obscureText: _obscure,
                  textInputAction: TextInputAction.done,
                  prefixIcon: AppIcons.password,
                  onChanged: (_) => setState(() => _error = null),
                  onSubmitted: (_) => _reset(),
                  suffix: GestureDetector(
                    onTap: () => setState(() => _obscure = !_obscure),
                    behavior: HitTestBehavior.opaque,
                    child: Padding(
                      padding: const EdgeInsets.all(Space.x2),
                      child: AppIcon(
                        _obscure ? AppIcons.showPassword : AppIcons.hidePassword,
                        size: Sizes.iconSm,
                        color: t.textTertiary,
                      ),
                    ),
                  ),
                ),
              ],

              if (_notice != null) ...[
                const SizedBox(height: Space.x4),
                AppBanner(message: _notice!, tone: StateTone.neutral),
              ],
              if (_error != null) ...[
                const SizedBox(height: Space.x4),
                AppBanner(message: _error!, tone: StateTone.error),
              ],

              const SizedBox(height: Space.x6),
              AppButton.primary(
                label: requesting ? 'Send reset code' : 'Change password',
                loading: _busy,
                onPressed: _busy ? null : (requesting ? _sendLink : _reset),
              ),

              const SizedBox(height: Space.x3),
              Center(
                child: AppButton.tertiary(
                  // Both directions, because either half can be the one the
                  // user actually needs: someone who kept an old email already
                  // has a code, and someone whose code expired needs to go back
                  // and ask for another.
                  label: requesting ? 'I already have a code' : 'Send another code',
                  onPressed: _busy
                      ? null
                      : () => setState(() {
                            _error = null;
                            if (requesting) {
                              _stage = _Stage.reset;
                              _notice = null;
                            } else {
                              _stage = _Stage.request;
                              _notice = null;
                              _tokenController.clear();
                            }
                          }),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
