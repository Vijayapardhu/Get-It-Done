import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/models.dart';
import '../core/providers.dart';
import '../design/design_system.dart';
import '../core/ui/service_artwork.dart';

/// Service discovery.
///
/// Falls back to the plain catalogue when there is no location, because a
/// customer who declined the location prompt should still be able to browse —
/// discovery results carry distance and worker availability, but the catalogue
/// is the more important thing to never hide.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key, required this.onOpenService});

  final ValueChanged<Service> onOpenService;

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();
  String _query = '';
  Timer? _debounce;

  @override
  void dispose() {
    _controller.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onChanged(String value) {
    // Debounce so typing "plumbing" is one request, not eight.
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 280), () {
      if (mounted) setState(() => _query = value.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(serviceCategoriesProvider);
    final services = ref.watch(servicesProvider);

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Find a service'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.x5, 0, Space.x5, Space.x4),
            child: AppSearchField(
              controller: _controller,
              autofocus: true,
              onChanged: _onChanged,
              trailing: _query.isEmpty
                  ? null
                  : AppIconButton(
                      icon: AppIcons.close,
                      size: 32,
                      iconSize: Sizes.iconSm,
                      onPressed: () {
                        _controller.clear();
                        setState(() => _query = '');
                      },
                    ),
            ),
          ),
          Expanded(
            child: services.when(
              loading: () => const Padding(
                padding: Space.pageInsets,
                child: Column(children: [SkeletonCard(hasAvatar: false), SizedBox(height: Space.x3), SkeletonCard(hasAvatar: false)]),
              ),
              error: (_, __) => AppStateView.error(
                message: 'We could not load the service catalogue.',
                onAction: () => ref.invalidate(servicesProvider),
              ),
              data: (all) {
                final matches = _query.isEmpty
                    ? all
                    : all
                        .where((s) =>
                            s.name.toLowerCase().contains(_query.toLowerCase()) ||
                            s.category.toLowerCase().contains(_query.toLowerCase()) ||
                            (s.description ?? '').toLowerCase().contains(_query.toLowerCase()))
                        .toList();

                if (matches.isEmpty) {
                  return AppStateView.empty(
                    title: 'No match',
                    message: 'We could not find a service for "$_query". '
                        'Try a different word, like "tap" or "wiring".',
                    icon: AppIcons.search,
                  );
                }

                // Searching flattens to a result list; browsing keeps the
                // category grouping, which is easier to scan.
                if (_query.isNotEmpty) {
                  return ListView(
                    padding: const EdgeInsets.fromLTRB(Space.x5, 0, Space.x5, Space.x10),
                    children: [
                      for (final service in matches) ...[
                        _ServiceRow(service: service, onTap: () => widget.onOpenService(service)),
                        const SizedBox(height: Space.x3),
                      ],
                    ],
                  );
                }

                return categories.maybeWhen(
                  data: (groups) => ListView(
                    padding: const EdgeInsets.only(bottom: Space.x10),
                    children: [
                      for (final group in groups) ...[
                        Section(
                          title: group.name,
                          child: Padding(
                            padding: Space.pageInsets,
                            child: ServiceGrid(
                              children: [
                                for (final service in group.services)
                                  ServiceTile(
                                    name: service.name,
                                    description: service.description,
                                    category: service.category,
                                    artwork: ServiceArtwork(service: service, size: 52),
                                    onTap: () => widget.onOpenService(service),
                                  ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: Space.section),
                      ],
                    ],
                  ),
                  orElse: () => ListView(
                    padding: const EdgeInsets.fromLTRB(Space.x5, 0, Space.x5, Space.x10),
                    children: [
                      for (final service in matches) ...[
                        _ServiceRow(service: service, onTap: () => widget.onOpenService(service)),
                        const SizedBox(height: Space.x3),
                      ],
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ServiceRow extends StatelessWidget {
  const _ServiceRow({required this.service, required this.onTap});

  final Service service;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(Space.x3),
      child: Row(
        children: [
          ServiceArtwork(service: service, size: 48),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        service.name,
                        style: context.text.titleMedium,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (service.emergencySupported) ...[
                      const SizedBox(width: Space.x2),
                      AppBadge('24×7', tone: BadgeTone.danger, dense: true),
                    ],
                  ],
                ),
                if (service.description != null)
                  Text(
                    service.description!,
                    style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
              ],
            ),
          ),
          const SizedBox(width: Space.x2),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                'from ₹${service.basePrice.toStringAsFixed(0)}',
                style: context.text.labelMedium?.copyWith(color: t.textPrimary),
              ),
              if (service.availableWorkers != null)
                Text(
                  '${service.availableWorkers} nearby',
                  style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
