import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:gid_core/gid_core.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';
import 'forgot_password_screen.dart';

/// Sign in.
///
/// One way in, in one column: email, password, and — if the deployment has
/// Google configured — Google underneath as an alternative rather than as a
/// competing headline.
///
/// The order is deliberate. Google used to sit first and primary, which put
/// the fastest path at the top but made the form beneath it look like the
/// fallback for people who had failed at something. Most returning customers
/// here signed up with a password, and asking them to scan past a button they
/// will never press is a worse trade than one extra scroll for Google users.
///
/// SMS sign-in is gone entirely — not hidden behind a flag, removed. The
/// endpoints, this screen's link to it and the capability flag went together;
/// see the note in the backend's config route.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordFocus = FocusNode();

  bool _busy = false;
  bool _googleBusy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  String get _email => _emailController.text.trim();

  /// Loose on purpose. The server is the authority on whether an account
  /// exists; this only blocks input that is obviously not an address, so it
  /// can never reject a valid one it failed to anticipate.
  bool get _emailLooksValid =>
      _email.length > 4 && _email.contains('@') && _email.split('@').last.contains('.');

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

  Future<void> _signIn() async {
    if (!_emailLooksValid) {
      setState(() => _error = 'Enter the email address you signed up with.');
      return;
    }
    if (_passwordController.text.isEmpty) {
      setState(() => _error = 'Enter your password.');
      return;
    }

    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(authControllerProvider.notifier).signInWithPassword(
            identifier: _email,
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
            ? 'That email and password do not match. If you signed up with '
                'Google, use the button below.'
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
    final anyBusy = _busy || _googleBusy;
    final googleEnabled = ref.watch(effectiveConfigProvider).googleSignInEnabled;

    return Scaffold(
      body: SafeArea(
        child: GestureDetector(
          onTap: () => FocusScope.of(context).unfocus(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(Space.x5, Space.x4, Space.x5, Space.x8),
            children: [
              // The screen's one picture, and it is doing a job: a pin settles
              // on an address, workers circle it, the job is ticked off. That
              // is the whole product, told before anyone has typed anything.
              const AppIllustration(
                assetAnimation: 'assets/lottie/sign_in.json',
                height: 190,
              ),
              const SizedBox(height: Space.x5),

              Text(
                'Welcome back',
                textAlign: TextAlign.center,
                style: context.text.displayLarge,
              ),
              const SizedBox(height: Space.x2),
              Text(
                'Sign in to book verified help from a local cooperative.',
                textAlign: TextAlign.center,
                style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
              ),

              const SizedBox(height: Space.x6),

              AppTextField(
                label: 'Email',
                hint: 'you@example.com',
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                prefixIcon: AppIcons.email,
                inputFormatters: [
                  // A space in an email address is always a mistake, and phone
                  // keyboards put one right under the thumb.
                  FilteringTextInputFormatter.deny(RegExp(r'\s')),
                ],
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
                prefixIcon: AppIcons.password,
                onChanged: (_) => setState(() => _error = null),
                onSubmitted: (_) => _signIn(),
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

              // Directly under the field it belongs to, right-aligned, where
              // the eye already is after typing a password that did not work.
              Align(
                alignment: Alignment.centerRight,
                child: AppButton.tertiary(
                  label: 'Forgot password?',
                  size: AppButtonSize.small,
                  onPressed: anyBusy
                      ? null
                      : () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => ForgotPasswordScreen(email: _email),
                            ),
                          ),
                ),
              ),

              if (_error != null) ...[
                const SizedBox(height: Space.x2),
                AppBanner(message: _error!, tone: StateTone.error),
              ],

              const SizedBox(height: Space.x4),
              AppButton.primary(
                label: 'Sign in',
                loading: _busy,
                onPressed: anyBusy ? null : _signIn,
              ),

              if (googleEnabled) ...[
                const SizedBox(height: Space.x5),
                _OrDivider(label: 'or'),
                const SizedBox(height: Space.x5),
                AppButton(
                  label: 'Continue with Google',
                  // White, not brand blue. Google's mark has fixed colours and
                  // its blue arc vanishes on ours — the button has to supply
                  // the surface the logo was drawn for. It is also what their
                  // sign-in guidelines ask for, and users are trained to look
                  // for exactly this: a Google button wearing somebody else's
                  // icon is the shape a phishing page takes.
                  variant: AppButtonVariant.surface,
                  leading: Image.asset(
                    'assets/brand/google_g.png',
                    filterQuality: FilterQuality.medium,
                  ),
                  loading: _googleBusy,
                  onPressed: anyBusy ? null : _signInWithGoogle,
                ),
              ],

              const SizedBox(height: Space.x6),
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
                      'Create account',
                      style: context.text.labelLarge?.copyWith(
                        color: t.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),

              // Skipping is offered plainly rather than buried, because the
              // catalogue is the reason to open this app and nobody should
              // have to hand over an email address to find out what a plumber
              // costs. Everything that belongs to a person stays behind the
              // account; see AccountGate.
              const SizedBox(height: Space.x3),
              Center(
                child: AppButton.tertiary(
                  label: 'Browse without signing in',
                  trailingIcon: AppIcons.chevronRight,
                  onPressed: anyBusy
                      ? null
                      : () => ref.read(authControllerProvider.notifier).continueAsGuest(),
                ),
              ),

              const SizedBox(height: Space.x5),
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

/// A hairline with a word in it.
class _OrDivider extends StatelessWidget {
  const _OrDivider({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Row(
      children: [
        Expanded(child: Divider(color: t.border)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.x3),
          child: Text(
            label,
            style: context.text.bodySmall?.copyWith(color: t.textTertiary),
          ),
        ),
        Expanded(child: Divider(color: t.border)),
      ],
    );
  }
}

/// Create an account: name, email, phone, password. All four required.
///
/// Both identifiers, not one. The form used to make the user pick email OR
/// phone, and every account created that way was missing whichever one the
/// next situation needed — a receipt with nowhere to go, a worker at the door
/// with no number to call, a password reset that could not be delivered
/// because the account had no email address at all.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();

  final _emailFocus = FocusNode();
  final _phoneFocus = FocusNode();
  final _passwordFocus = FocusNode();
  final _confirmFocus = FocusNode();

  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    _emailFocus.dispose();
    _phoneFocus.dispose();
    _passwordFocus.dispose();
    _confirmFocus.dispose();
    super.dispose();
  }

  String get _email => _emailController.text.trim();
  String get _phone => _phoneController.text.replaceAll(RegExp(r'\D'), '');

  String? _validate() {
    if (_nameController.text.trim().length < 2) return 'Enter your name.';
    if (!_email.contains('@') || !_email.split('@').last.contains('.')) {
      return 'Enter a valid email address.';
    }
    // Indian mobile numbers are ten digits and never start below 6.
    if (_phone.length != 10 || _phone.startsWith(RegExp('[0-5]'))) {
      return 'Enter a valid 10-digit mobile number.';
    }
    // Mirrors the backend's passwordSchema (min 8). Checking here saves a round
    // trip and gives a clearer message than a field error.
    if (_passwordController.text.length < 8) {
      return 'Use at least 8 characters for your password.';
    }
    // The password is set once here and next needed days later, on a screen
    // that cannot tell a typo from a forgotten password. Typing it twice is the
    // only chance to catch the typo while the intended password is still known.
    if (_confirmController.text != _passwordController.text) {
      return 'Both passwords must match.';
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

    // Both captured before the await. Afterwards this widget may be gone, and
    // reading them off a defunct context is the classic use_build_context
    // crash.
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final tokens = context.tokens;
    final firstName = _nameController.text.trim().split(RegExp(r'\s+')).first;

    try {
      await ref.read(authControllerProvider.notifier).registerWithPassword(
            name: _nameController.text.trim(),
            email: _email,
            phone: _phone,
            password: _passwordController.text,
          );
      if (!mounted) return;

      // Authenticating rebuilds the root from SignInScreen to AppShell, but
      // this screen was PUSHED over that root and a rebuild does not pop a
      // route. Without this the account is created, home is built directly
      // underneath, and the person is left looking at the form they just
      // submitted with no indication anything worked. Pop back to the root and
      // they land on home.
      navigator.popUntil((route) => route.isFirst);
      messenger.showSnackBar(_welcomeSnackBar(tokens, firstName));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.code == 'ACCOUNT_EXISTS'
            ? '${e.message} Sign in instead.'
            : e.fieldError('password') ??
                e.fieldError('email') ??
                e.fieldError('phone') ??
                e.message;
      });
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
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: GestureDetector(
          onTap: () => FocusScope.of(context).unfocus(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(Space.x5, Space.x2, Space.x5, Space.x8),
            children: [
              // Answers the question the form provokes — "why do you want both
              // my email and my number?" — before it is asked.
              const AppIllustration(
                assetAnimation: 'assets/lottie/secure.json',
                height: 150,
              ),
              const SizedBox(height: Space.x4),

              Text(
                'Create your account',
                textAlign: TextAlign.center,
                style: context.text.displayLarge,
              ),
              const SizedBox(height: Space.x2),
              Text(
                'One account books any service in your area.',
                textAlign: TextAlign.center,
                style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
              ),

              const SizedBox(height: Space.x6),

              AppTextField(
                label: 'Your name',
                hint: 'Pardhu',
                controller: _nameController,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                prefixIcon: AppIcons.user,
                onChanged: (_) => setState(() => _error = null),
                onSubmitted: (_) => _emailFocus.requestFocus(),
              ),

              const SizedBox(height: Space.x4),
              AppTextField(
                label: 'Email address',
                hint: 'you@example.com',
                controller: _emailController,
                focusNode: _emailFocus,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                prefixIcon: AppIcons.email,
                helper: 'Receipts and password resets go here.',
                inputFormatters: [FilteringTextInputFormatter.deny(RegExp(r'\s'))],
                onChanged: (_) => setState(() => _error = null),
                onSubmitted: (_) => _phoneFocus.requestFocus(),
              ),

              const SizedBox(height: Space.x4),
              AppTextField(
                label: 'Mobile number',
                hint: '98765 43210',
                controller: _phoneController,
                focusNode: _phoneFocus,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                maxLength: 10,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                prefixIcon: AppIcons.call,
                helper: 'How the worker reaches you at the door.',
                onChanged: (_) => setState(() => _error = null),
                onSubmitted: (_) => _passwordFocus.requestFocus(),
              ),

              const SizedBox(height: Space.x4),
              AppTextField(
                label: 'Password',
                hint: 'At least 8 characters',
                controller: _passwordController,
                focusNode: _passwordFocus,
                obscureText: _obscure,
                textInputAction: TextInputAction.next,
                prefixIcon: AppIcons.password,
                onChanged: (_) => setState(() => _error = null),
                onSubmitted: (_) => _confirmFocus.requestFocus(),
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

              const SizedBox(height: Space.x4),
              AppTextField(
                label: 'Confirm password',
                hint: 'Type it once more',
                controller: _confirmController,
                focusNode: _confirmFocus,
                // Shares _obscure with the field above: revealing one and not
                // the other is how someone "confirms" a password against a row
                // of dots they cannot read.
                obscureText: _obscure,
                textInputAction: TextInputAction.done,
                prefixIcon: AppIcons.password,
                helper: 'So a typo now does not become a locked account later.',
                onChanged: (_) => setState(() => _error = null),
                onSubmitted: (_) => _submit(),
                // A live tick rather than a message on submit: the answer is
                // known as they type, and saying so there costs no screen.
                suffix: _confirmController.text.isNotEmpty &&
                        _confirmController.text == _passwordController.text
                    ? Padding(
                        padding: const EdgeInsets.all(Space.x2),
                        child: AppIcon(
                          AppIcons.success,
                          size: Sizes.iconSm,
                          color: t.success,
                        ),
                      )
                    : null,
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

/// The confirmation that the account exists, shown on home.
///
/// It has to outlive the screen that triggers it: the register route is popped
/// in the same frame, so anything drawn inside that route goes with it. A
/// SnackBar belongs to the root ScaffoldMessenger, which sits above the
/// Navigator and survives the pop — the person watches the form give way to
/// home and the confirmation is already there.
SnackBar _welcomeSnackBar(AppTokens tokens, String firstName) {
  return SnackBar(
    backgroundColor: tokens.success,
    behavior: SnackBarBehavior.floating,
    duration: const Duration(seconds: 4),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
    content: Row(
      children: [
        const AppIcon(AppIcons.success, size: Sizes.iconSm, color: Colors.white),
        const SizedBox(width: Space.x3),
        Expanded(
          child: Text(
            // The name makes it read as "this account is yours" rather than as
            // a system message about a record having been written.
            firstName.isEmpty
                ? 'Your account is ready.'
                : 'Welcome, $firstName. Your account is ready.',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ),
  );
}
