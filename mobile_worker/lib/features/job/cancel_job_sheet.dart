import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';

import '../../core/providers.dart';

enum CancelReason {
  tooFar('too_far', 'Too far away'),
  unsafe('unsafe', 'Safety concern'),
  personal('personal', 'Personal emergency'),
  other('other', 'Other reason');

  const CancelReason(this.wire, this.label);
  final String wire;
  final String label;
}

class CancelJobSheet extends ConsumerStatefulWidget {
  const CancelJobSheet({super.key, required this.bookingId});

  final String bookingId;

  static Future<bool?> show(BuildContext context, {required String bookingId}) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => CancelJobSheet(bookingId: bookingId),
    );
  }

  @override
  ConsumerState<CancelJobSheet> createState() => _CancelJobSheetState();
}

class _CancelJobSheetState extends ConsumerState<CancelJobSheet> {
  CancelReason? _selectedReason;
  final _otherController = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _otherController.dispose();
    super.dispose();
  }

  bool get _canSubmit => _selectedReason != null;

  Future<void> _confirmAndCancel() async {
    if (!_canSubmit || _submitting) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel this job?'),
        content: const Text(
          'This action cannot be undone. The customer will be notified.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep job'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cancel job'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _submitting = true);

    try {
      final reason = _selectedReason == CancelReason.other
          ? _otherController.text.trim()
          : null;

      await ref.read(workerApiProvider).cancelJob(
            widget.bookingId,
            reasonCode: _selectedReason!.wire,
            reason: reason,
          );

      if (mounted) Navigator.pop(context, true);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not cancel job.')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        Space.x5,
        Space.x4,
        Space.x5,
        MediaQuery.of(context).viewInsets.bottom + Space.x5,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Reason for cancelling',
            style: context.text.titleLarge,
          ),
          const SizedBox(height: Space.x4),
          for (final reason in CancelReason.values)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.x2),
              child: AppSelectableRow(
                title: reason.label,
                selected: _selectedReason == reason,
                onTap: () => setState(() => _selectedReason = reason),
                icon: switch (reason) {
                  CancelReason.tooFar => AppIcons.location,
                  CancelReason.unsafe => AppIcons.shield,
                  CancelReason.personal => AppIcons.user,
                  CancelReason.other => AppIcons.edit,
                },
              ),
            ),
          if (_selectedReason == CancelReason.other) ...[
            const SizedBox(height: Space.x3),
            AppTextField(
              label: 'Tell us more (optional)',
              hint: 'What happened?',
              controller: _otherController,
              maxLines: 3,
              maxLength: 280,
            ),
          ],
          const SizedBox(height: Space.x5),
          AppButton(
            label: 'Confirm cancellation',
            loading: _submitting,
            onPressed: _canSubmit ? _confirmAndCancel : null,
            variant: AppButtonVariant.danger,
          ),
          const SizedBox(height: Space.x2),
          AppButton.tertiary(
            label: 'Keep job',
            onPressed: () => Navigator.pop(context, false),
          ),
        ],
      ),
    );
  }
}
