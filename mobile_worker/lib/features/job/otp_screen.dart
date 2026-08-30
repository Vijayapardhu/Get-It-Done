import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// The handshake.
///
/// The customer holds two six-digit codes; the worker types one to start and
/// one to finish, and the second one settles the booking. That makes this the
/// screen where money changes hands, and it has two properties nothing else in
/// the app has:
///
///  * **It cannot be queued.** The code is checked against a hash only the
///    server holds, and there is no honest optimistic state for "was that the
///    right code?". The screen says so plainly rather than failing oddly in a
///    lift — a worker who understands why it needs signal will step outside; a
///    worker shown a generic error will assume the app is broken.
///  * **Failed attempts are limited.** The backend counts them and locks the
///    code, so this screen has to make the digits easy to enter correctly the
///    first time: one large field, big digits, an on-screen keypad that does
///    not fight the system keyboard.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key, required this.job, required this.start});

  final WorkerJob job;

  /// True for the start code, false for the completion code.
  final bool start;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  String _code = '';
  bool _checking = false;
  String? _error;

  void _press(String digit) {
    if (_code.length >= 6 || _checking) return;
    HapticFeedback.selectionClick();
    setState(() {
      _code += digit;
      _error = null;
    });
    if (_code.length == 6) _submit();
  }

  void _backspace() {
    if (_code.isEmpty || _checking) return;
    HapticFeedback.selectionClick();
    setState(() {
      _code = _code.substring(0, _code.length - 1);
      _error = null;
    });
  }

  Future<void> _submit() async {
    setState(() => _checking = true);
    final api = ref.read(workerApiProvider);

    try {
      if (widget.start) {
        await api.verifyStart(widget.job.id, _code);
      } else {
        await api.verifyComplete(widget.job.id, _code);
      }
      HapticFeedback.heavyImpact();
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      HapticFeedback.vibrate();
      setState(() {
        _checking = false;
        _code = '';
        _error = error.isNetwork
            // Named for what it is, and what to do about it. This is the one
            // step that genuinely needs a connection.
            ? 'No connection. This code has to be checked with the server — step outside and try again.'
            : error.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    return Scaffold(
      appBar: AppBar(title: Text(widget.start ? 'Start the job' : 'Finish the job')),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(Space.page),
              child: Column(
                children: [
                  Text(
                    widget.start
                        ? 'Ask ${widget.job.contactName ?? 'the customer'} for the start code'
                        : 'Ask ${widget.job.contactName ?? 'the customer'} for the finish code',
                    textAlign: TextAlign.center,
                    style: context.text.titleLarge,
                  ),
                  const SizedBox(height: Space.x2),
                  Text(
                    // Whose code it is and why, in one line. Workers get asked
                    // this at the door and need an answer.
                    'They have it in their app. It proves you were both here.',
                    textAlign: TextAlign.center,
                    style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
                  ),
                ],
              ),
            ),
            _Digits(code: _code, error: _error != null, checking: _checking),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Space.page, vertical: Space.x3),
                child: Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: context.text.bodyMedium?.copyWith(color: tokens.danger),
                ),
              ),
            const Spacer(),
            _Keypad(onDigit: _press, onBackspace: _backspace, enabled: !_checking),
            const SizedBox(height: Space.x4),
          ],
        ),
      ),
    );
  }
}

class _Digits extends StatelessWidget {
  const _Digits({required this.code, required this.error, required this.checking});
  final String code;
  final bool error;
  final bool checking;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < 6; i++)
          Container(
            width: 44,
            height: 60,
            margin: const EdgeInsets.symmetric(horizontal: Space.x1),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: tokens.surfaceAlt,
              borderRadius: Radii.rMd,
              border: Border.all(
                color: error
                    ? tokens.danger
                    : i == code.length && !checking
                        ? tokens.primary
                        : tokens.border,
                width: i == code.length && !checking ? 2 : 1,
              ),
            ),
            child: Text(
              i < code.length ? code[i] : '',
              // Latin digits, always. Telugu and Devanagari numerals are
              // correct in prose and wrong here: the code the customer is
              // reading aloud from their screen is in Latin digits.
              style: context.text.headlineMedium?.copyWith(
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
      ],
    );
  }
}

/// A keypad of the app's own.
///
/// Not the system numeric keyboard: that one is half the screen, puts the
/// digits where the OS wants them, and on a cheap device with a cracked
/// digitiser it is genuinely hard to hit. These are 72dp targets in a fixed
/// layout that a worker learns the shape of after two jobs.
class _Keypad extends StatelessWidget {
  const _Keypad({required this.onDigit, required this.onBackspace, required this.enabled});

  final void Function(String) onDigit;
  final VoidCallback onBackspace;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    Widget key(String label, {VoidCallback? onTap, AppIconData? icon}) => Expanded(
          child: Padding(
            padding: const EdgeInsets.all(Space.x1),
            child: SizedBox(
              height: 72,
              child: TextButton(
                onPressed: enabled ? (onTap ?? () => onDigit(label)) : null,
                style: TextButton.styleFrom(
                  shape: const RoundedRectangleBorder(borderRadius: Radii.rLg),
                  backgroundColor: context.tokens.surfaceAlt,
                ),
                child: icon != null
                    ? AppIcon(icon, size: Sizes.iconLg)
                    : Text(
                        label,
                        style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
                      ),
              ),
            ),
          ),
        );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.page),
      child: Column(
        children: [
          Row(children: [key('1'), key('2'), key('3')]),
          Row(children: [key('4'), key('5'), key('6')]),
          Row(children: [key('7'), key('8'), key('9')]),
          Row(children: [
            const Expanded(child: SizedBox()),
            key('0'),
            key('', onTap: onBackspace, icon: AppIcons.backspace),
          ]),
        ],
      ),
    );
  }
}
