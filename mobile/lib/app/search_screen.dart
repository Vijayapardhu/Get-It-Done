import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:gid_core/gid_core.dart';
import '../core/providers.dart';
import '../design/design_system.dart';
import '../features/home/service_grid.dart';

/// Service discovery.
///
/// Two modes on one screen. Empty, it is a browsable catalogue grouped by
/// trade; with a query, it is a flat ranked list of the same tiles.
///
/// The tiles are the home screen's, from [ServiceCatalogueGrid] — three
/// across, same artwork, same price line. This screen used to draw its own
/// full-width rows, which meant the service someone recognised by its picture
/// on the home screen arrived here as an unfamiliar horizontal card at the
/// exact moment they were scanning for it.
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
    // Debounce so typing "plumbing" is one filter pass, not eight.
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 220), () {
      if (mounted) setState(() => _query = value.trim());
    });
  }

  void _clear() {
    _controller.clear();
    setState(() => _query = '');
  }

  /// Ranked, not merely filtered.
  ///
  /// A name that STARTS with the query is what the user meant; a description
  /// that happens to contain it is a maybe. Sorting by where the match landed
  /// puts "Painting" above "Waterproofing" for the query "paint", which plain
  /// `contains` filtering leaves to alphabetical chance.
  List<Service> _rank(List<Service> all) {
    if (_query.isEmpty) return all;
    final q = _query.toLowerCase();

    int scoreOf(Service s) {
      final name = s.name.toLowerCase();
      if (name.startsWith(q)) return 0;
      if (name.contains(q)) return 1;
      if (s.category.toLowerCase().contains(q)) return 2;
      if ((s.description ?? '').toLowerCase().contains(q)) return 3;
      return 99;
    }

    final scored = <({int score, Service service})>[
      for (final s in all)
        if (scoreOf(s) < 99) (score: scoreOf(s), service: s),
    ]..sort((a, b) => a.score.compareTo(b.score));

    return [for (final entry in scored) entry.service];
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final services = ref.watch(servicesProvider);

    return Scaffold(
      backgroundColor: t.pageBackground,
      body: services.when(
        loading: () => _shell(const [
          SliverPadding(
            padding: EdgeInsets.fromLTRB(Space.x5, Space.x4, Space.x5, 0),
            sliver: SliverToBoxAdapter(child: SkeletonCard(lines: 2)),
          ),
        ]),
        error: (_, __) => _shell([
          SliverFillRemaining(
            hasScrollBody: false,
            child: AppStateView.error(
              message: 'We could not load the service catalogue.',
              onAction: () => ref.invalidate(servicesProvider),
            ),
          ),
        ]),
        data: (all) {
          final matches = _rank(all);

          if (matches.isEmpty) {
            return _shell([
              SliverFillRemaining(
                hasScrollBody: false,
                child: AppStateView.empty(
                  title: 'No match',
                  message: 'Nothing matches "$_query". Try a plainer word — '
                      '"tap", "wiring", "clean".',
                  icon: AppIcons.search,
                ),
              ),
            ]);
          }

          return _shell(
            _query.isEmpty ? _browseSlivers(matches) : _resultSlivers(matches),
          );
        },
      ),
    );
  }

  Widget _shell(List<Widget> slivers) => _Shell(
        controller: _controller,
        query: _query,
        onChanged: _onChanged,
        onClear: _clear,
        slivers: slivers,
      );

  /// Browsing: grouped under trade headings, same as the home catalogue.
  List<Widget> _browseSlivers(List<Service> all) {
    final grouped = <String, List<Service>>{};
    for (final service in all) {
      grouped.putIfAbsent(service.category, () => <Service>[]).add(service);
    }

    return [
      for (final entry in grouped.entries) ...[
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(Space.x5, Space.x5, Space.x5, Space.x3),
          sliver: SliverToBoxAdapter(
            child: _GroupHeading(title: entry.key, count: entry.value.length),
          ),
        ),
        SliverPadding(
          padding: ServiceCatalogueGrid.insets,
          // A box grid inside an adapter rather than a SliverGrid: the grid's
          // cell height is measured from the text scale by LayoutBuilder, and
          // there is no lazy building to lose — the whole catalogue is a few
          // dozen services and a search returns fewer.
          sliver: SliverToBoxAdapter(
            child: ServiceCatalogueGrid(
              services: entry.value,
              onOpenService: widget.onOpenService,
            ),
          ),
        ),
      ],
      const SliverPadding(padding: EdgeInsets.only(bottom: Space.x10)),
    ];
  }

  /// Searching: one ranked list, with a count so the user knows what they got.
  List<Widget> _resultSlivers(List<Service> matches) => [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(Space.x5, Space.x5, Space.x5, Space.x3),
          sliver: SliverToBoxAdapter(
            child: _GroupHeading(
              title: matches.length == 1 ? '1 result' : '${matches.length} results',
              count: null,
            ),
          ),
        ),
        SliverPadding(
          padding: ServiceCatalogueGrid.insets,
          sliver: SliverToBoxAdapter(
            child: ServiceCatalogueGrid(
              services: matches,
              onOpenService: widget.onOpenService,
            ),
          ),
        ),
        const SliverPadding(padding: EdgeInsets.only(bottom: Space.x10)),
      ];
}

/// The scroll view, with the search bar floating over it.
///
/// A pinned sliver rather than a fixed row above the list, so content scrolls
/// UNDER it instead of starting below it. That is what makes it read as an
/// overlay: the list runs to the top of the screen and the bar sits on top, on
/// its own ground, rather than as a second rectangle stacked under the app bar
/// boxing the content into whatever is left.
class _Shell extends StatelessWidget {
  const _Shell({
    required this.controller,
    required this.query,
    required this.onChanged,
    required this.onClear,
    required this.slivers,
  });

  final TextEditingController controller;
  final String query;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;
  final List<Widget> slivers;

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      // Scrolling the list puts the keyboard away; the bar stays.
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      slivers: [
        SliverPersistentHeader(
          pinned: true,
          delegate: _SearchHeader(
            controller: controller,
            query: query,
            onChanged: onChanged,
            onClear: onClear,
            topPadding: MediaQuery.paddingOf(context).top,
          ),
        ),
        ...slivers,
      ],
    );
  }
}

class _SearchHeader extends SliverPersistentHeaderDelegate {
  _SearchHeader({
    required this.controller,
    required this.query,
    required this.onChanged,
    required this.onClear,
    required this.topPadding,
  });

  final TextEditingController controller;
  final String query;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  /// The status bar. Read once by the parent rather than from this delegate's
  /// own context, because min/maxExtent are asked for outside a build and have
  /// to agree with what build() actually paints — a mismatch is the classic
  /// pinned-header layout assertion.
  final double topPadding;

  /// Air above and below the bar. The old layout gave it a tight gap and it sat
  /// wedged between the title and the first card.
  static const _vertical = Space.x4;

  double get _height => topPadding + Sizes.inputHeight + _vertical * 2;

  @override
  double get minExtent => _height;

  @override
  double get maxExtent => _height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final t = context.tokens;

    return Stack(
      fit: StackFit.expand,
      children: [
        // Slightly translucent once something is behind it, so a card sliding
        // under is suggested rather than hidden — the cue that says there is
        // more above.
        Container(
          color: overlapsContent
              ? t.pageBackground.withValues(alpha: 0.94)
              : t.pageBackground,
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(Space.x4, topPadding + _vertical, Space.x5, _vertical),
          child: Row(
            children: [
              AppIconButton(
                icon: AppIcons.chevronLeft,
                onPressed: () => Navigator.of(context).maybePop(),
              ),
              const SizedBox(width: Space.x2),
              Expanded(
                child: AppSearchField(
                  hint: 'Search for a service',
                  controller: controller,
                  autofocus: true,
                  onChanged: onChanged,
                  trailing: query.isEmpty
                      ? null
                      : AppIconButton(
                          icon: AppIcons.close,
                          size: 32,
                          iconSize: Sizes.iconSm,
                          onPressed: onClear,
                        ),
                ),
              ),
            ],
          ),
        ),
        // A hairline only once content is behind the bar. At rest it would be
        // a line under nothing.
        if (overlapsContent)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(height: 1, color: t.border),
          ),
      ],
    );
  }

  @override
  bool shouldRebuild(_SearchHeader oldDelegate) =>
      oldDelegate.query != query ||
      oldDelegate.topPadding != topPadding ||
      oldDelegate.controller != controller;
}

class _GroupHeading extends StatelessWidget {
  const _GroupHeading({required this.title, required this.count});

  final String title;

  /// Null on the results heading, which already counts itself.
  final int? count;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(title, style: context.text.titleMedium),
        if (count != null) ...[
          const SizedBox(width: Space.x2),
          Text('$count', style: context.text.bodySmall?.copyWith(color: t.textTertiary)),
        ],
      ],
    );
  }
}

/// One service, as a card rather than a row.
///
/// The old row put a 48px tile, three columns of text and a price against each
/// other on one line; at any real name length the price wrapped into the
/// description and the whole thing read as a settings list. This gives the
/// artwork a proper square, the text room for two lines, and the price its own
/// line with the add control beside it — so nothing competes for horizontal
/// space it does not have.
