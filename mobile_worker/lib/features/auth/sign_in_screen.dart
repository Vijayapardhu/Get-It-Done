import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/providers.dart';

/// Sign in, or make an account.
///
/// One screen with two modes rather than two routes: a worker who taps "sign
/// in" and discovers they never finished registering should not lose what they
/// typed on the way to the other screen.
///
/// Email and password, or Google. There is no SMS provider on this platform
/// (`SMS_PROVIDER=console`, and OTP sign-in was deliberately removed), so phone
/// sign-in is not available to offer — that is a live product question in
/// WORKER_APP_PLAN 9, and until it is answered the honest thing is to make this
/// path as short as possible rather than to pretend.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key, this.startOnRegister = false});
  final bool startOnRegister;

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _identifier = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  late bool _registering = widget.startOnRegister;
  bool _busy = false;
  bool _obscure = true;
  String? _failure;

  @override
  void dispose() {
    _name.dispose();
    _identifier.dispose();
    _phone.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _failure = null;
    });

    try {
      final auth = ref.read(authProvider.notifier);
      if (_registering) {
        await auth.register(
          name: _name.text.trim(),
          email: _identifier.text.trim(),
          phone: _phone.text.trim(),
          password: _password.text,
        );
      } else {
        await auth.signIn(identifier: _identifier.text.trim(), password: _password.text);
      }
      if (mounted) context.go('/today');
    } on ApiException catch (error) {
      setState(() {
        _busy = false;
        _failure = error.isNetwork
            ? 'No connection. Check your network and try again.'
            : error.message;
      });
    }
  }

  Future<void> _signInWithGoogle() async {
    setState(() {
      _busy = true;
      _failure = null;
    });

    try {
      final google = GoogleSignIn(scopes: ['email']);
      final account = await google.signIn();
      if (account == null) {
        // User cancelled the Google sign-in flow.
        setState(() => _busy = false);
        return;
      }
      final auth = await account.authentication;
      final idToken = auth.idToken;
      if (idToken == null) {
        setState(() {
          _busy = false;
          _failure = 'Google sign-in failed. Please try again.';
        });
        return;
      }
      await ref.read(authProvider.notifier).signInWithGoogle(idToken);
      if (mounted) context.go('/today');
    } catch (error) {
      setState(() {
        _busy = false;
        _failure = 'Google sign-in failed. Check your connection and try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    return Scaffold(
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(Space.page, Space.x8, Space.page, Space.x8),
            children: [
              Image.asset('assets/brand/mark.png', height: 56),
              const SizedBox(height: Space.x6),
              Text(
                _registering ? 'Start earning with the cooperative' : 'Welcome back',
                style: context.text.headlineSmall,
              ),
              const SizedBox(height: Space.x2),
              Text(
                _registering
                    ? 'You will need an ID and a bank account. It takes about ten minutes.'
                    : 'Sign in to see your jobs and your earnings.',
                style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
              ),
              const SizedBox(height: Space.x8),

              if (_registering) ...[
                _field(
                  controller: _name,
                  label: 'Your full name',
                  validator: (v) => (v == null || v.trim().length < 2) ? 'Tell us your name' : null,
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: Space.x4),
              ],

              _field(
                controller: _identifier,
                label: 'Email',
                keyboardType: TextInputType.emailAddress,
                validator: (v) =>
                    (v == null || !v.contains('@')) ? 'Enter the email you signed up with' : null,
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: Space.x4),

              if (_registering) ...[
                _field(
                  controller: _phone,
                  label: 'Phone number',
                  keyboardType: TextInputType.phone,
                  validator: (v) =>
                      (v == null || v.trim().length < 10) ? 'We need a number the customer can ring' : null,
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: Space.x4),
              ],

              _field(
                controller: _password,
                label: 'Password',
                obscure: _obscure,
                suffix: IconButton(
                  onPressed: () => setState(() => _obscure = !_obscure),
                  icon: AppIcon(_obscure ? AppIcons.showPassword : AppIcons.hidePassword, size: 20),
                ),
                validator: (v) => (v == null || v.length < 8) ? 'At least 8 characters' : null,
                textInputAction: _registering ? TextInputAction.next : TextInputAction.done,
              ),

              if (_registering) ...[
                const SizedBox(height: Space.x4),
                _field(
                  controller: _confirm,
                  label: 'Type your password again',
                  obscure: _obscure,
                  onChanged: (_) => setState(() {}),
                  validator: (v) => v != _password.text ? 'The two do not match' : null,
                  textInputAction: TextInputAction.done,
                ),
                if (_confirm.text.isNotEmpty && _confirm.text == _password.text)
                  Padding(
                    padding: const EdgeInsets.only(top: Space.x2),
                    child: Row(
                      children: [
                        AppIcon(AppIcons.success, size: Sizes.iconSm, color: tokens.success),
                        const SizedBox(width: Space.x1),
                        Text('Passwords match', style: context.text.bodySmall?.copyWith(color: tokens.success)),
                      ],
                    ),
                  ),
              ],

              if (_failure != null) ...[
                const SizedBox(height: Space.x4),
                Container(
                  padding: const EdgeInsets.all(Space.x3),
                  decoration: BoxDecoration(color: tokens.dangerSoft, borderRadius: Radii.rMd),
                  child: Text(_failure!, style: context.text.bodyMedium?.copyWith(color: tokens.danger)),
                ),
              ],

              const SizedBox(height: Space.x6),
              SizedBox(
                height: WorkerSizes.button,
                child: FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(
                          width: 22, height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.n0),
                        )
                      : Text(_registering ? 'Create my account' : 'Sign in'),
                ),
              ),

              // Google Sign-In — only shown on the sign-in (not register) page.
              if (!_registering) ...[
                const SizedBox(height: Space.x4),
                Row(
                  children: [
                    const Expanded(child: Divider()),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: Space.x3),
                      child: Text('or', style: context.text.bodySmall?.copyWith(color: tokens.textTertiary)),
                    ),
                    const Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: Space.x4),
                SizedBox(
                  height: WorkerSizes.button,
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : _signInWithGoogle,
                    icon: const Icon(Icons.g_mobiledata, size: 24),
                    label: const Text('Sign in with Google'),
                  ),
                ),
              ],

              const SizedBox(height: Space.x4),
              TextButton(
                onPressed: _busy
                    ? null
                    : () => setState(() {
                          _registering = !_registering;
                          _failure = null;
                        }),
                child: Text(_registering ? 'I already have an account' : 'I am new here'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field({
    required TextEditingController controller,
    required String label,
    String? Function(String?)? validator,
    TextInputType? keyboardType,
    bool obscure = false,
    Widget? suffix,
    void Function(String)? onChanged,
    TextInputAction? textInputAction,
  }) {
    return TextFormField(
      controller: controller,
      validator: validator,
      keyboardType: keyboardType,
      obscureText: obscure,
      onChanged: onChanged,
      textInputAction: textInputAction,
      decoration: InputDecoration(labelText: label, suffixIcon: suffix),
    );
  }
}
