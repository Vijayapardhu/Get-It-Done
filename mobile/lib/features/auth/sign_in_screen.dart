import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import 'otp_sign_in_screen.dart';

/// Sign in.
///
/// Google first, then a password. Google is the shortest path for most people
/// — nothing to remember, nothing to type on a phone keyboard — and it is the
/// only option that works today without an SMS gateway.
///
/// The password field takes an email address OR a phone number in one input.
/// People do not reliably remember which they signed up with, and making them
/// pick a tab before typing gets that choice wrong half the time; the backend
/// resolves whichever it is.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordFocus = FocusNode();

  bool _busy = false;
  bool _googleBusy = false;
  bool _demoBusy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  String get _identifier => _identifierController.text.trim();

  /// Loose on purpose. The backend is the authority on whether an account
  /// exists; the app only blocks input that is obviously not either kind of
  /// identifier, so it never rejects a valid one it failed to anticipate.
  bool get _identifierLooksValid {
    if (_identifier.length < 6) return false;
    if (_identifier.contains('@')) return _identifier.contains('.');
    return _identifier.replaceAll(RegExp(r'\D'), '').length >= 8;
  }

  Future<void> _signInWithGoogle() async {
    setState(() { _googleBusy = true; _error = null; });
    try {
      // A false return means the user dismissed the account picker. That is a
      // choice, not a failure, so nothing is shown.
      await ref.read(authControllerProvider.notifier).signInWithGoogle();
    } on GoogleSignInFailure catch (e) {
      if (mounted) setState(() => _error = e.message);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _googleBusy = false);
    }
  }

  Future<void> _signInAsDemo() async {
    setState(() { _demoBusy = true; _error = null; });
    try {
      await ref.read(authControllerProvider.notifier).signInAsDemo();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        // 404 means the server has demo login off. The button is only drawn
        // when the config said otherwise, so this is a config that changed
        // under us — say that rather than showing a bare "not found".
        _error = e.statusCode == 404
            ? 'The demo account is not available on this server.'
            : e.message;
      });
    } finally {
      if (mounted) setState(() => _demoBusy = false);
    }
  }

  Future<void> _signInWithPassword() async {
    if (!_identifierLooksValid) {
      setState(() => _error = 'Enter the email address or phone number you signed up with.');
      return;
    }
    if (_passwordController.text.isEmpty) {
      setState(() => _error = 'Enter your password.');
      return;
    }

    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(authControllerProvider.notifier).signInWithPassword(
            identifier: _identifier,
            password: _passwordController.text,
          );
      // The root gate redirects on the auth state change.
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        // The backend deliberately returns one message for "no such account"
        // and "wrong password" so neither can be used to enumerate accounts.
        // Say something useful without undoing that.
        _error = e.statusCode == 401
            ? 'That email or phone and password do not match. If you signed up '
                'with Google, use the button above.'
            : e.message;
      });
      _passwordController.clear();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final anyBusy = _busy || _googleBusy || _demoBusy;

    return Scaffold(
      body: SafeArea(
        child: GestureDetector(
          onTap: () => FocusScope.of(context).unfocus(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(Space.x5, Space.x8, Space.x5, Space.x8),
            children: [
              // Aligned, not bare: a ListView stretches its children across
              // the cross axis, which turns a fixed-size badge into a bar.
              const Align(
                alignment: Alignment.centerLeft,
                child: AppIconBadge(AppIcons.cooperative, size: 60, iconSize: 30),
              ),
              const SizedBox(height: Space.x6),
              Text('Welcome to\nGET IT DONE', style: context.text.displayLarge),
              const SizedBox(height: Space.x2),
              Text(
                'Verified workers from local cooperative societies, at your door.',
                style: context.text.bodyLarge?.copyWith(color: t.textSecondary),
              ),

              const SizedBox(height: Space.x8),

              // ── Google, first and primary ────────────────────────────
              if (ref.watch(effectiveConfigProvider).googleSignInEnabled) ...[
                AppButton.primary(
                  label: 'Continue with Google',
                  icon: AppIcons.user,
                  loading: _googleBusy,
                  onPressed: anyBusy ? null : _signInWithGoogle,
                ),
                const SizedBox(height: Space.x5),
                Row(
                  children: [
                    Expanded(child: Divider(color: t.border)),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: Space.x3),
                      child: Text(
                        'or use a password',
                        style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                      ),
                    ),
                    Expanded(child: Divider(color: t.border)),
                  ],
                ),
                const SizedBox(height: Space.x5),
              ],

              // ── Password: one field for email or phone ───────────────
              AppTextField(
                label: 'Email or phone',
                hint: 'you@example.com or 98765 43210',
                controller: _identifierController,
                // Plain text, not emailAddress: the field takes either, and an
                // email keyboard makes typing a phone number needlessly awkward.
                keyboardType: TextInputType.text,
                textInputAction: TextInputAction.next,
                prefixIcon: AppIcons.user,
                onChanged: (_) => setState(() => _error = null),
                onSubmitted: (_) => _passwordFocus.requestFocus(),
              ),
              const SizedBox(height: Space.x4),
              AppTextField(
                label: 'Password',
                hint: 'Your password',
                controller: _passwordController,
                focusNode: _passwordFocus,
                obscureText: _obscure,
                textInputAction: TextInputAction.done,
                prefixIcon: AppIcons.secure,
                onChanged: (_) => setState(() => _error = null),
                onSubmitted: (_) => _signInWithPassword(),
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

              if (_error != null) ...[
                const SizedBox(height: Space.x4),
                AppBanner(message: _error!, tone: StateTone.error),
              ],

              const SizedBox(height: Space.x5),
              AppButton(
                label: 'Sign in',
                // Secondary when Google is on screen, so there is exactly one
                // primary action. Primary when it is the only way in.
                variant: ref.watch(effectiveConfigProvider).googleSignInEnabled
                    ? AppButtonVariant.secondary
                    : AppButtonVariant.primary,
                loading: _busy,
                onPressed: anyBusy ? null : _signInWithPassword,
              ),

              const SizedBox(height: Space.x5),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'New here?',
                    style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
                  ),
                  const SizedBox(width: Space.x2),
                  GestureDetector(
                    onTap: anyBusy
                        ? null
                        : () => Navigator.of(context).push(
                              MaterialPageRoute<void>(builder: (_) => const RegisterScreen()),
                            ),
                    child: Text(
                      'Create an account',
                      style: context.text.labelLarge?.copyWith(
                        color: t.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: Space.x4),
              Center(
                child: AppButton.tertiary(
                  label: 'Sign in with an SMS code instead',
                  onPressed: anyBusy
                      ? null
                      : () => Navigator.of(context).push(
                            MaterialPageRoute<void>(builder: (_) => const OtpSignInScreen()),
                          ),
                ),
              ),

              // ── Demo account ─────────────────────────────────────────
              // Drawn only when the SERVER says it has one, so a build that
              // happens to contain this code shows nothing against a real
              // deployment. Set apart in its own panel rather than sitting in
              // the list of sign-in options: it is not a way to sign in, it is
              // a way to look around, and someone with a real account should
              // never reach for it by mistake.
              if (ref.watch(effectiveConfigProvider).demoSignInEnabled) ...[
                const SizedBox(height: Space.x6),
                Container(
                  padding: const EdgeInsets.all(Space.x4),
                  decoration: BoxDecoration(
                    color: t.surfaceAlt,
                    borderRadius: BorderRadius.circular(Radii.xl),
                    border: Border.all(color: t.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Just looking around?', style: context.text.titleSmall),
                      const SizedBox(height: Space.x1),
                      Text(
                        'Open a shared demo account with sample bookings and '
                        'invoices. Anything you do in it is visible to anyone '
                        'else trying the demo.',
                        style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                      ),
                      const SizedBox(height: Space.x3),
                      AppButton(
                        label: 'Explore the demo',
                        variant: AppButtonVariant.secondary,
                        loading: _demoBusy,
                        onPressed: anyBusy ? null : _signInAsDemo,
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: Space.x6),
              Text(
                'By continuing you agree to our Terms and Privacy Policy.',
                textAlign: TextAlign.center,
                style: context.text.bodySmall?.copyWith(color: t.textTertiary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Create an account with an email address or a phone number.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

enum _IdentifierKind { email, phone }

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _nameController = TextEditingController();
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();

  /// The backend requires exactly one of email or phone, so this is a real
  /// choice rather than a free-text field like sign-in.
  _IdentifierKind _kind = _IdentifierKind.email;

  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _identifierController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  String get _identifier => _identifierController.text.trim();
  String get _digits => _identifier.replaceAll(RegExp(r'\D'), '');

  String? _validate() {
    if (_nameController.text.trim().length < 2) return 'Enter your name.';

    if (_kind == _IdentifierKind.email) {
      if (!_identifier.contains('@') || !_identifier.contains('.')) {
        return 'Enter a valid email address.';
      }
    } else if (_digits.length != 10 || _digits.startsWith(RegExp('[0-5]'))) {
      return 'Enter a valid 10-digit mobile number.';
    }

    // Mirrors the backend's passwordSchema (min 8). Checking here saves a round
    // trip and gives a clearer message than a field error.
    if (_passwordController.text.length < 8) {
      return 'Use at least 8 characters for your password.';
    }
    return null;
  }

  Future<void> _submit() async {
    final problem = _validate();
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }

    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(authControllerProvider.notifier).registerWithPassword(
            name: _nameController.text.trim(),
            password: _passwordController.text,
            email: _kind == _IdentifierKind.email ? _identifier : null,
            phone: _kind == _IdentifierKind.phone ? _digits : null,
          );
      // The root gate takes over; this screen is popped with the whole stack.
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.code == 'ACCOUNT_EXISTS'
            ? '${e.message} Sign in instead.'
            : e.fieldError('password') ?? e.fieldError('email') ?? e.message;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final isEmail = _kind == _IdentifierKind.email;

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
            padding: const EdgeInsets.fromLTRB(Space.x5, Space.x4, Space.x5, Space.x8),
            children: [
              Text('Create your\naccount', style: context.text.displayLarge),
              const SizedBox(height: Space.x2),
              Text(
                'One account books any service in your area.',
                style: context.text.bodyLarge?.copyWith(color: t.textSecondary),
              ),

              const SizedBox(height: Space.x8),

              AppTextField(
                label: 'Your name',
                hint: 'Pardhu',
                controller: _nameController,
                textInputAction: TextInputAction.next,
                prefixIcon: AppIcons.user,
                onChanged: (_) => setState(() => _error = null),
              ),

              const SizedBox(height: Space.x5),
              AppSegmented<_IdentifierKind>(
                value: _kind,
                onChanged: (kind) => setState(() {
                  _kind = kind;
                  // The previous value is the wrong kind of thing now.
                  _identifierController.clear();
                  _error = null;
                }),
                options: const [
                  (value: _IdentifierKind.email, label: 'Email'),
                  (value: _IdentifierKind.phone, label: 'Phone'),
                ],
              ),
              const SizedBox(height: Space.x4),

              AppTextField(
                label: isEmail ? 'Email address' : 'Mobile number',
                hint: isEmail ? 'you@example.com' : '98765 43210',
                controller: _identifierController,
                keyboardType: isEmail ? TextInputType.emailAddress : TextInputType.phone,
                textInputAction: TextInputAction.next,
                maxLength: isEmail ? null : 10,
                inputFormatters: isEmail ? null : [FilteringTextInputFormatter.digitsOnly],
                prefixIcon: isEmail ? AppIcons.message : AppIcons.call,
                onChanged: (_) => setState(() => _error = null),
              ),

              const SizedBox(height: Space.x4),
              AppTextField(
                label: 'Password',
                hint: 'At least 8 characters',
                controller: _passwordController,
                obscureText: _obscure,
                textInputAction: TextInputAction.done,
                prefixIcon: AppIcons.secure,
                onChanged: (_) => setState(() => _error = null),
                onSubmitted: (_) => _submit(),
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

              if (_error != null) ...[
                const SizedBox(height: Space.x4),
                AppBanner(message: _error!, tone: StateTone.error),
              ],

              const SizedBox(height: Space.x6),
              AppButton.primary(
                label: 'Create account',
                loading: _busy,
                onPressed: _busy ? null : _submit,
              ),

              const SizedBox(height: Space.x4),
              Row(
                children: [
                  AppIcon(AppIcons.shield, size: Sizes.iconXs, color: t.textTertiary),
                  const SizedBox(width: Space.x2),
                  Expanded(
                    child: Text(
                      'We only use your contact details to reach you about your bookings.',
                      style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
