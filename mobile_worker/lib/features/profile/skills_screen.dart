import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// The trades you take.
///
/// This is not cosmetic: `findMatchingWorkers` reads `worker_skills` for the
/// certification sub-score, and hard-filters on it for anything that requires
/// certification — gas, electrical, childcare, eldercare. A worker who has not
/// listed a trade is scored as if they cannot do it.
class SkillsScreen extends ConsumerStatefulWidget {
  const SkillsScreen({super.key});

  @override
  ConsumerState<SkillsScreen> createState() => _SkillsScreenState();
}

class _SkillsScreenState extends ConsumerState<SkillsScreen> {
  Set<String>? _selected;
  bool _saving = false;

  Future<void> _save() async {
    if (_selected == null) return;
    setState(() => _saving = true);
    try {
      await ref.read(workerApiProvider).saveSkills(
            _selected!.map((id) => (serviceId: id, level: null)).toList(),
          );
      ref.invalidate(_skillsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Saved.')),
        );
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mine = ref.watch(_skillsProvider);
    final all = ref.watch(_servicesProvider);
    final tokens = context.tokens;

    return Scaffold(
      appBar: AppBar(title: const Text('Trades you take')),
      body: mine.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Padding(
          padding: const EdgeInsets.all(Space.page),
          child: Text('Could not load your trades.\n$error'),
        ),
        data: (skills) {
          _selected ??= skills.map((s) => s.serviceId).toSet();
          final verified = {for (final s in skills) s.serviceId: s.verified};

          return all.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => const Center(child: Text('Could not load the list of trades.')),
            data: (services) => ListView(
              padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
              children: [
                Container(
                  padding: const EdgeInsets.all(Space.x4),
                  decoration: BoxDecoration(color: tokens.surfaceBlue, borderRadius: Radii.rLg),
                  child: Text(
                    // The consequence, said once, at the top. Some trades
                    // cannot be dispatched to an uncertified worker at any
                    // score, and a worker wondering why they never get gas
                    // jobs deserves to be told here rather than never.
                    'Some trades need a certificate before you can be offered them. '
                    'Upload it under Documents and the cooperative will verify it.',
                    style: context.text.bodyMedium,
                  ),
                ),
                const SizedBox(height: Space.x4),
                for (final service in services)
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _selected!.contains(service.id),
                    title: Text(service.name),
                    subtitle: verified[service.id] == true
                        ? Row(
                            children: [
                              AppIcon(AppIcons.verified, size: Sizes.iconSm, color: tokens.success),
                              const SizedBox(width: Space.x1),
                              Text('Certificate verified', style: context.text.bodySmall),
                            ],
                          )
                        : Text(service.category, style: context.text.bodySmall),
                    onChanged: (on) => setState(() {
                      on == true ? _selected!.add(service.id) : _selected!.remove(service.id);
                    }),
                  ),
              ],
            ),
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(Space.page, 0, Space.page, Space.x4),
        child: SizedBox(
          height: WorkerSizes.button,
          child: FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    width: 22, height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.n0),
                  )
                : const Text('Save'),
          ),
        ),
      ),
    );
  }
}

final _skillsProvider = FutureProvider<List<WorkerSkill>>(
  (ref) => ref.watch(workerApiProvider).skills(),
);

final _servicesProvider = FutureProvider<List<Service>>(
  (ref) => ref.watch(sharedApiProvider).services(),
);
