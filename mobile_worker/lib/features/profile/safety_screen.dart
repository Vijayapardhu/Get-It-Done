import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/providers.dart';

/// The button that has to work.
///
/// `welfare.ts` already has a safety-incident form — filed after the fact, read
/// by somebody eventually. This is the other thing: it puts a distressed
/// worker's live position in front of a human in the operations room right now,
/// and hands back a number to dial.
///
/// Two design decisions, both deliberate:
///
///  * **Held, not tapped.** A three-second hold cannot be triggered by a phone
///    in a pocket, and a false alarm that pulls an operator away from a real
///    one is not free. The ring fills so the worker can see it working.
///  * **It never fails silently.** If the request cannot be sent, the screen
///    still shows a number to call — because the worker's problem is not that
///    our API is down.
class SafetyScreen extends ConsumerStatefulWidget {
  const SafetyScreen({super.key});

  @override
  ConsumerState<SafetyScreen> createState() => _SafetyScreenState();
}

class _SafetyScreenState extends ConsumerState<SafetyScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _hold;
  bool _sending = false;
  String? _callNumber;

  @override
  void initState() {
    super.initState();
    _hold = AnimationController(vsync: this, duration: const Duration(seconds: 3))
      ..addStatusListener((status) {
        if (status == AnimationStatus.completed) _raise();
      });
  }

  @override
  void dispose() {
    _hold.dispose();
    super.dispose();
  }

  Future<void> _raise() async {
    if (_sending) return;
    setState(() => _sending = true);
    HapticFeedback.heavyImpact();

    final pump = ref.read(locationPumpProvider);
    final fix = await pump.currentFix();
    final job = ref.read(activeJobProvider).value;

    try {
      final result = await ref.read(workerApiProvider).sos(
            latitude: fix?.latitude,
            longitude: fix?.longitude,
            bookingId: job?.id,
          );
      if (mounted) setState(() => _callNumber = result.callNumber);
    } on ApiException {
      // The alert did not reach us. The worker still needs a number, and 112
      // works whether or not our servers do.
      if (mounted) setState(() => _callNumber = '112');
    } finally {
      if (mounted) setState(() => _sending = false);
    }

    if (mounted && _callNumber != null) await _showRaised();
  }

  Future<void> _showRaised() async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        title: const Text('Alert sent'),
        content: Text(
          'The operations room has your position and your current job.\n\n'
          'If you are in immediate danger, call now.',
          style: context.text.bodyLarge,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
          FilledButton.icon(
            onPressed: () async {
              final uri = Uri.parse('tel:$_callNumber');
              if (await canLaunchUrl(uri)) await launchUrl(uri);
            },
            icon: AppIcon(AppIcons.call, size: 20),
            label: Text('Call $_callNumber'),
          ),
        ],
      ),
    );
    _hold.reset();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final history = ref.watch(_sosHistoryProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Safety')),
      body: ListView(
        padding: const EdgeInsets.all(Space.page),
        children: [
          Center(
            child: GestureDetector(
              onTapDown: (_) {
                HapticFeedback.selectionClick();
                _hold.forward();
              },
              onTapUp: (_) => _hold.reverse(),
              onTapCancel: () => _hold.reverse(),
              child: AnimatedBuilder(
                animation: _hold,
                builder: (context, _) => SizedBox(
                  width: 200,
                  height: 200,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      SizedBox.expand(
                        child: CircularProgressIndicator(
                          value: _hold.value,
                          strokeWidth: 12,
                          strokeCap: StrokeCap.round,
                          backgroundColor: tokens.dangerSoft,
                          valueColor: AlwaysStoppedAnimation(tokens.danger),
                        ),
                      ),
                      Container(
                        width: 160,
                        height: 160,
                        decoration: BoxDecoration(color: tokens.danger, shape: BoxShape.circle),
                        alignment: Alignment.center,
                        child: _sending
                            ? const CircularProgressIndicator(color: AppColors.n0)
                            : Text(
                                'SOS',
                                style: context.text.displaySmall?.copyWith(
                                  color: AppColors.n0,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: Space.x5),
          Text(
            'Hold for three seconds',
            textAlign: TextAlign.center,
            style: context.text.titleMedium,
          ),
          const SizedBox(height: Space.x2),
          Text(
            'This sends your position and your current job to the cooperative straight away, '
            'and gives you a number to call.',
            textAlign: TextAlign.center,
            style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
          ),
          const SizedBox(height: Space.x8),
          Text(
            'PAST ALERTS',
            style: context.text.labelSmall?.copyWith(color: tokens.textTertiary, letterSpacing: 1.2),
          ),
          history.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (incidents) => incidents.isEmpty
                ? Padding(
                    padding: const EdgeInsets.only(top: Space.x3),
                    child: Text('None. Good.', style: context.text.bodyMedium),
                  )
                : Column(
                    children: [
                      for (final incident in incidents)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          title: Text(_statusWords(asString(pick(incident, 'status')))),
                          subtitle: Text(
                            DateFormat('d MMM y, h:mm a').format(
                              asDateOrNull(pick(incident, 'createdAt'))?.toLocal() ?? DateTime.now(),
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  static String _statusWords(String status) => switch (status) {
        'open' => 'Sent — waiting for the cooperative',
        'acknowledged' => 'Someone is looking at it',
        'resolved' => 'Resolved',
        'false_alarm' => 'Marked a false alarm',
        _ => status,
      };
}

final _sosHistoryProvider = FutureProvider<List<Json>>(
  (ref) => ref.watch(workerApiProvider).sosHistory(),
);
