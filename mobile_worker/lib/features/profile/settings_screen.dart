import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';

import '../../core/config/worker_config.dart';
import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// Language, and what the app is allowed to offer you.
///
/// No theme section. The app is light, always — see `WorkerApp.build`. A setting
/// that only ever has one answer is a row a worker has to read past.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    final prefs = ref.watch(offerPreferencesProvider);
    final tokens = context.tokens;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
        children: [
          _Heading('Language'),
          for (final l in supportedWorkerLocales)
            RadioListTile<String>(
              contentPadding: EdgeInsets.zero,
              value: l.languageCode,
              groupValue: locale?.languageCode,
              title: Text(workerLanguageNames[l.languageCode]!),
              onChanged: (code) async {
                if (code == null) return;
                await ref.read(localeProvider.notifier).set(code);
                // Also told to the server, so notifications and emails arrive
                // in the same language as the app.
                await ref.read(sharedApiProvider).setPreferredLanguage(code).catchError((_) {});
              },
            ),

          const SizedBox(height: Space.x4),
          _Heading('What you get offered'),
          prefs.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => const Text('Could not load your preferences.'),
            data: (p) => _Preferences(prefs: p),
          ),

          const SizedBox(height: Space.x4),
          _Heading('Notifications'),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: AppIcon(AppIcons.work),
            title: const Text('Job offers'),
            // Deliberately not a switch. It is the reason the app is installed,
            // and a worker who silenced it would simply stop being matched with
            // no explanation. Going quiet is what the duty toggle is for.
            subtitle: Text(
              'Always on while you are online. Use the duty toggle to stop being offered work.',
              style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
            ),
            trailing: AppIcon(AppIcons.password, color: tokens.textTertiary),
          ),
        ],
      ),
    );
  }
}

class _Preferences extends ConsumerStatefulWidget {
  const _Preferences({required this.prefs});
  final OfferPreferences prefs;

  @override
  ConsumerState<_Preferences> createState() => _PreferencesState();
}

class _PreferencesState extends ConsumerState<_Preferences> {
  late double _maxTravel = widget.prefs.maxTravelKm ?? 0;
  late bool _emergency = widget.prefs.acceptEmergency;
  late bool _autoOffline = widget.prefs.autoOfflineAtShiftEnd;

  Future<void> _save() async {
    try {
      await ref.read(workerApiProvider).savePreferences(
            maxTravelKm: _maxTravel == 0 ? null : _maxTravel,
            clearMaxTravel: _maxTravel == 0,
            acceptEmergency: _emergency,
            autoOfflineAtShiftEnd: _autoOffline,
          );
      ref.invalidate(offerPreferencesProvider);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _maxTravel == 0 ? 'No travel limit' : 'At most ${_maxTravel.round()} km',
          style: context.text.titleMedium,
        ),
        Slider(
          value: _maxTravel,
          min: 0,
          max: 50,
          divisions: 50,
          label: _maxTravel == 0 ? 'No limit' : '${_maxTravel.round()} km',
          onChanged: (v) => setState(() => _maxTravel = v),
          onChangeEnd: (_) => _save(),
        ),
        Text(
          // Both halves of the trade-off, so the number is a choice rather
          // than a guess.
          'A smaller limit means fewer offers, but no long journeys for small jobs.',
          style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
        ),
        const SizedBox(height: Space.x3),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: _emergency,
          title: const Text('Emergency jobs'),
          subtitle: Text(
            'Urgent work that interrupts whatever you are doing. Usually paid more.',
            style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
          ),
          onChanged: (v) {
            setState(() => _emergency = v);
            _save();
          },
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: _autoOffline,
          title: const Text('Go offline at the end of my shift'),
          subtitle: Text(
            'So you are not offered a job at 2am because you forgot.',
            style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
          ),
          onChanged: (v) {
            setState(() => _autoOffline = v);
            _save();
          },
        ),
      ],
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: Space.x2),
        child: Text(
          text.toUpperCase(),
          style: context.text.labelSmall
              ?.copyWith(color: context.tokens.textTertiary, letterSpacing: 1.1),
        ),
      );
}
