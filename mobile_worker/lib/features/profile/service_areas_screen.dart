import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// How far you will travel, per trade.
///
/// Per-trade rather than one number, because the answer genuinely differs: a
/// worker will cross the city for a day's painting and not for a twenty-minute
/// tap washer. `findMatchingWorkers` enforces this radius as a hard filter, so
/// this screen is the difference between being offered a job and not.
class ServiceAreasScreen extends ConsumerStatefulWidget {
  const ServiceAreasScreen({super.key});

  @override
  ConsumerState<ServiceAreasScreen> createState() => _ServiceAreasScreenState();
}

class _ServiceAreasScreenState extends ConsumerState<ServiceAreasScreen> {
  Map<String, ServiceArea>? _draft;
  bool _saving = false;

  Future<void> _save() async {
    if (_draft == null) return;
    setState(() => _saving = true);
    try {
      await ref.read(workerApiProvider).saveServiceAreas(_draft!.values.toList());
      ref.invalidate(_areasProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved.')));
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
    final areas = ref.watch(_areasProvider);
    final tokens = context.tokens;

    return Scaffold(
      appBar: AppBar(title: const Text('Where you work')),
      body: areas.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Padding(
          padding: const EdgeInsets.all(Space.page),
          child: Text('Could not load your areas.\n$error'),
        ),
        data: (list) {
          _draft ??= {for (final a in list) a.serviceId: a};

          if (_draft!.isEmpty) {
            return Padding(
              padding: const EdgeInsets.all(Space.page),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  AppIcon(AppIcons.location, size: 48, color: tokens.textTertiary),
                  const SizedBox(height: Space.x4),
                  Text('Add a trade first', style: context.text.titleMedium),
                  const SizedBox(height: Space.x2),
                  Text(
                    'Your travel distance is set per trade, so there is nothing to set until you '
                    'have picked at least one.',
                    textAlign: TextAlign.center,
                    style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
                  ),
                ],
              ),
            );
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
            children: [
              for (final area in _draft!.values)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.x4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(child: Text(area.serviceName, style: context.text.titleMedium)),
                          Text(
                            '${area.radiusKm.round()} km',
                            style: context.text.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                              fontFeatures: const [FontFeature.tabularFigures()],
                            ),
                          ),
                        ],
                      ),
                      Slider(
                        value: area.radiusKm.clamp(1, 50),
                        min: 1,
                        max: 50,
                        divisions: 49,
                        onChanged: (v) => setState(() {
                          _draft![area.serviceId] = ServiceArea(
                            serviceId: area.serviceId,
                            serviceName: area.serviceName,
                            radiusKm: v,
                          );
                        }),
                      ),
                    ],
                  ),
                ),
            ],
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

final _areasProvider = FutureProvider<List<ServiceArea>>(
  (ref) => ref.watch(workerApiProvider).serviceAreas(),
);
