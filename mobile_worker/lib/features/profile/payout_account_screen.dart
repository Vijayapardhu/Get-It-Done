import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';

import '../../core/providers.dart';

class PayoutAccountScreen extends ConsumerStatefulWidget {
  const PayoutAccountScreen({super.key});

  @override
  ConsumerState<PayoutAccountScreen> createState() =>
      _PayoutAccountScreenState();
}

class _PayoutAccountScreenState extends ConsumerState<PayoutAccountScreen> {
  late final TextEditingController _accountRefController;
  late final TextEditingController _accountHolderController;
  late final TextEditingController _ifscCodeController;
  String _provider = 'upi';
  bool _submitting = false;
  bool _loaded = false;
  String? _accountRefError;
  String? _accountHolderError;

  @override
  void dispose() {
    _accountRefController.dispose();
    _accountHolderController.dispose();
    _ifscCodeController.dispose();
    super.dispose();
  }

  void _initControllers(Json account) {
    if (_loaded) return;
    final currentProvider = asStringOrNull(pick(account, 'provider'));
    final accountRef = asStringOrNull(pick(account, 'accountReference'));
    final accountHolder = asStringOrNull(pick(account, 'accountHolder'));
    final ifscCode = asStringOrNull(pick(account, 'ifscCode'));

    _provider = currentProvider ?? 'upi';
    _accountRefController = TextEditingController(text: accountRef ?? '');
    _accountHolderController = TextEditingController(text: accountHolder ?? '');
    _ifscCodeController = TextEditingController(text: ifscCode ?? '');
    _loaded = true;
  }

  Future<void> _save() async {
    setState(() {
      _accountRefError = _accountRefController.text.trim().isEmpty ? 'This field is required' : null;
      _accountHolderError = _accountHolderController.text.trim().isEmpty ? 'This field is required' : null;
    });
    if (_accountRefError != null || _accountHolderError != null) return;

    setState(() => _submitting = true);

    try {
      await ref.read(workerApiProvider).savePayoutAccount(
            provider: _provider,
            accountHolder: _accountHolderController.text.trim(),
            accountReference: _accountRefController.text.trim(),
            ifscCode: _provider == 'bank' ? _ifscCodeController.text.trim() : null,
          );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Payout account saved.')),
        );
        Navigator.pop(context);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not save payout account.')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final accountFuture = ref.watch(
      FutureProvider<Json>((ref) => ref.read(workerApiProvider).payoutAccount()),
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Payout Account')),
      body: accountFuture.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Could not load payout account.'),
              const SizedBox(height: Space.x3),
              FilledButton(
                onPressed: () => ref.invalidate(payoutsProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (account) {
          _initControllers(account);

          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              Space.page,
              Space.x4,
              Space.page,
              Space.x12,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.all(Space.x4),
                  decoration: BoxDecoration(
                    color: tokens.surfaceAlt,
                    borderRadius: Radii.rLg,
                  ),
                  child: Row(
                    children: [
                      AppIcon(
                        AppIcons.wallet,
                        size: Sizes.iconMd,
                        color: tokens.primary,
                        bold: true,
                      ),
                      const SizedBox(width: Space.x3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Payout method',
                              style: context.text.titleMedium,
                            ),
                            Text(
                              'Earnings are sent to this account.',
                              style: context.text.bodySmall?.copyWith(
                                color: tokens.textTertiary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: Space.x5),
                Text('Provider', style: context.text.titleMedium),
                const SizedBox(height: Space.x3),
                AppSegmented(
                  options: const [
                    (value: 'upi', label: 'UPI'),
                    (value: 'bank', label: 'Bank'),
                  ],
                  value: _provider,
                  onChanged: (v) => setState(() => _provider = v),
                ),
                const SizedBox(height: Space.x5),
                AppTextField(
                  label: 'Account holder name',
                  controller: _accountHolderController,
                  hint: 'Full name on the account',
                  textInputAction: TextInputAction.next,
                  error: _accountHolderError,
                  onChanged: (_) => setState(() => _accountHolderError = null),
                ),
                const SizedBox(height: Space.x4),
                AppTextField(
                  label: _provider == 'upi' ? 'UPI ID' : 'Account number',
                  controller: _accountRefController,
                  hint: _provider == 'upi' ? 'name@upi' : 'Enter account number',
                  keyboardType: _provider == 'upi'
                      ? TextInputType.emailAddress
                      : TextInputType.number,
                  textInputAction: _provider == 'upi' ? TextInputAction.done : TextInputAction.next,
                  error: _accountRefError,
                  onChanged: (_) => setState(() => _accountRefError = null),
                ),
                if (_provider == 'bank') ...[
                  const SizedBox(height: Space.x4),
                  AppTextField(
                    label: 'IFSC code',
                    controller: _ifscCodeController,
                    hint: 'e.g. SBIN0001234',
                    textInputAction: TextInputAction.done,
                    onChanged: (_) => setState(() => _accountRefError = null),
                  ),
                ],
                const SizedBox(height: Space.x8),
                AppButton.primary(
                  label: 'Save payout account',
                  loading: _submitting,
                  onPressed: _save,
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}