import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';

/// What the cooperative has, what it is waiting for, and what is about to lapse.
///
/// The failure this screen exists to prevent is specific: a worker whose
/// insurance expires silently stops being matched and never finds out why. So
/// expiry is shown as a countdown before it happens, in the same list as
/// everything else, rather than as a notification that can be swiped away.
class DocumentsScreen extends ConsumerWidget {
  const DocumentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final documents = ref.watch(_documentsProvider);
    final tokens = context.tokens;

    return Scaffold(
      appBar: AppBar(title: const Text('Documents')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_documentsProvider),
        child: documents.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ListView(
            padding: const EdgeInsets.all(Space.page),
            children: [Text('Could not load your documents.\n$error')],
          ),
          data: (list) => ListView(
            padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
            children: [
              if (list.isEmpty)
                Container(
                  padding: const EdgeInsets.all(Space.x4),
                  decoration: BoxDecoration(color: tokens.surfaceBlue, borderRadius: Radii.rLg),
                  child: Text(
                    'Nothing uploaded yet. You will need a photo ID, and a certificate for any '
                    'trade that requires one.',
                    style: context.text.bodyMedium,
                  ),
                ),
              for (final document in list) _DocumentRow(document: document),
              const SizedBox(height: Space.x6),
              OutlinedButton.icon(
                // The upload itself goes through the documents router's
                // presigned-URL flow, which needs a file picker and a camera.
                // Left as the one place this screen hands off rather than
                // half-implementing a scanner that produces unreadable photos.
                onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Ask your cooperative admin to help you upload, or use the web portal.'),
                  ),
                ),
                icon: AppIcon(AppIcons.upload, size: 20),
                label: const Text('Upload a document'),
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(WorkerSizes.button)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DocumentRow extends StatelessWidget {
  const _DocumentRow({required this.document});
  final Json document;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final status = asString(pick(document, 'status'), fallback: 'pending');
    final expiresAt = asDateOrNull(pick(document, 'expiresOn', aliases: ['expiresAt', 'expires_on']));
    final daysLeft = expiresAt?.difference(DateTime.now()).inDays;

    final (icon, colour, words) = switch (status) {
      'approved' => (AppIcons.success, tokens.success, 'Accepted'),
      'rejected' => (AppIcons.alertCircle, tokens.danger, 'Not accepted — upload it again'),
      'expired' => (AppIcons.alertCircle, tokens.danger, 'Expired'),
      _ => (AppIcons.loading, tokens.warning, 'Waiting to be checked'),
    };

    // The countdown, not the date. "Expires 14 Nov" needs arithmetic; "expires
    // in 12 days" needs none, and it is the version that gets acted on.
    final expiryWords = daysLeft == null
        ? null
        : daysLeft < 0
            ? 'Expired ${-daysLeft} days ago'
            : daysLeft <= 30
                ? 'Expires in $daysLeft days'
                : 'Valid until ${DateFormat('d MMM y').format(expiresAt!.toLocal())}';

    final urgent = daysLeft != null && daysLeft <= 30;

    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: AppIcon(icon, color: colour),
      title: Text(asString(pick(document, 'type'), fallback: 'Document')),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(words),
          if (expiryWords != null)
            Text(
              expiryWords,
              style: context.text.bodySmall?.copyWith(
                color: urgent ? tokens.danger : tokens.textTertiary,
                fontWeight: urgent ? FontWeight.w600 : null,
              ),
            ),
        ],
      ),
    );
  }
}

final _documentsProvider = FutureProvider<List<Json>>(
  (ref) => ref.watch(workerApiProvider).documents(),
);
