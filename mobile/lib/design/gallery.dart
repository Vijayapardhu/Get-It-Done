import 'package:flutter/material.dart';

import 'design_system.dart';

/// Living style guide.
///
/// Every token and component rendered on one scroll, in both themes. This is
/// how the system stays honest: a component that only looks right on the screen
/// it was built for is obvious here, and a dark-mode regression is caught by
/// flipping one switch instead of navigating forty screens.
///
/// Ships in debug builds only — see the guard in main.dart.
class DesignGallery extends StatefulWidget {
  const DesignGallery({super.key, required this.onToggleTheme, required this.themeMode});

  final VoidCallback onToggleTheme;
  final ThemeMode themeMode;

  @override
  State<DesignGallery> createState() => _DesignGalleryState();
}

class _DesignGalleryState extends State<DesignGallery> {
  int _navIndex = 0;
  bool _loading = false;
  String _segment = 'now';
  int _selectedTile = 0;
  int _selectedRow = 0;
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Design System'),
        actions: [
          AppIconButton(
            icon: context.isDark ? AppIcons.lightMode : AppIcons.darkMode,
            onPressed: widget.onToggleTheme,
            tooltip: 'Toggle theme',
          ),
          const SizedBox(width: Space.x2),
        ],
      ),
      floatingActionButton: EmergencyFab(onPressed: () => _showEmergencySheet(context)),
      bottomNavigationBar: AppBottomNav(
        currentIndex: _navIndex,
        onTap: (i) => setState(() => _navIndex = i),
        items: const [
          AppNavItem(icon: AppIcons.home, label: 'Home'),
          AppNavItem(icon: AppIcons.bookings, label: 'Bookings'),
          AppNavItem(icon: AppIcons.notifications, label: 'Alerts', badgeCount: 3),
          AppNavItem(icon: AppIcons.profile, label: 'Profile'),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: Space.x20),
        children: [
          // ── Colour ──────────────────────────────────────────────────────
          const SizedBox(height: Space.x4),
          Section(
            eyebrow: 'Foundation',
            title: 'Colour',
            subtitle: 'Blue as a scale, not one flat value.',
            child: Padding(
              padding: Space.pageInsets,
              child: Wrap(
                spacing: Space.x2,
                runSpacing: Space.x2,
                children: [
                  _Swatch('blue50', AppColors.blue50),
                  _Swatch('blue100', AppColors.blue100),
                  _Swatch('blue300', AppColors.blue300),
                  _Swatch('blue500', AppColors.blue500, label: 'primary'),
                  _Swatch('blue600', AppColors.blue600),
                  _Swatch('blue900', AppColors.blue900),
                  _Swatch('success', AppColors.success),
                  _Swatch('warning', AppColors.warning),
                  _Swatch('danger', AppColors.danger),
                ],
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          // ── Type ────────────────────────────────────────────────────────
          Section(
            eyebrow: 'Foundation',
            title: 'Typography',
            subtitle: 'Plus Jakarta Sans · Noto for Telugu and Hindi.',
            child: Padding(
              padding: Space.pageInsets,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Display 32', style: context.text.displayLarge),
                  const SizedBox(height: Space.x2),
                  Text('Heading 26', style: context.text.headlineMedium),
                  const SizedBox(height: Space.x2),
                  Text('Title 18', style: context.text.titleLarge),
                  const SizedBox(height: Space.x2),
                  Text('Body 15 — the quick brown fox jumps over the lazy dog.', style: context.text.bodyMedium),
                  const SizedBox(height: Space.x2),
                  Text('Caption 13 — supporting detail.', style: context.text.bodySmall),
                  const SizedBox(height: Space.x3),
                  Text('మీకు ఏమి సహాయం కావాలి?', style: context.text.headlineSmall),
                  Text('आपको किस चीज़ में मदद चाहिए?', style: context.text.headlineSmall),
                ],
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          // ── Buttons ─────────────────────────────────────────────────────
          Section(
            eyebrow: 'Components',
            title: 'Buttons',
            child: Padding(
              padding: Space.pageInsets,
              child: Column(
                children: [
                  AppButton.primary(label: 'Confirm booking', onPressed: () {}, icon: AppIcons.success),
                  const SizedBox(height: Space.x3),
                  AppButton.secondary(label: 'Add another address', onPressed: () {}, icon: AppIcons.add),
                  const SizedBox(height: Space.x3),
                  AppButton(
                    label: 'Soft action',
                    variant: AppButtonVariant.soft,
                    onPressed: () {},
                  ),
                  const SizedBox(height: Space.x3),
                  AppButton(
                    label: 'Cancel booking',
                    variant: AppButtonVariant.danger,
                    onPressed: () {},
                  ),
                  const SizedBox(height: Space.x3),
                  AppButton.primary(
                    label: 'Loading',
                    loading: _loading,
                    onPressed: () async {
                      setState(() => _loading = true);
                      await Future<void>.delayed(const Duration(seconds: 2));
                      if (mounted) setState(() => _loading = false);
                    },
                  ),
                  const SizedBox(height: Space.x3),
                  const AppButton.primary(label: 'Disabled', onPressed: null),
                  const SizedBox(height: Space.x2),
                  AppButton.tertiary(label: 'Not now', onPressed: () {}),
                ],
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          // ── Inputs ──────────────────────────────────────────────────────
          Section(
            eyebrow: 'Components',
            title: 'Inputs',
            child: Padding(
              padding: Space.pageInsets,
              child: Column(
                children: [
                  AppSearchField(controller: _searchController),
                  const SizedBox(height: Space.x4),
                  const AppTextField(
                    label: 'Phone number',
                    hint: '98765 43210',
                    prefixIcon: AppIcons.call,
                    helper: "We'll send a verification code.",
                    keyboardType: TextInputType.phone,
                  ),
                  const SizedBox(height: Space.x4),
                  const AppTextField(
                    label: 'Address',
                    hint: 'Flat, building, street',
                    prefixIcon: AppIcons.location,
                    error: 'Please enter a complete address',
                  ),
                  const SizedBox(height: Space.x4),
                  AppSegmented<String>(
                    value: _segment,
                    onChanged: (v) => setState(() => _segment = v),
                    options: const [
                      (value: 'now', label: 'Book now'),
                      (value: 'later', label: 'Schedule'),
                    ],
                  ),
                  const SizedBox(height: Space.x4),
                  AppSelectableRow(
                    title: 'Home',
                    subtitle: '12, Example Street, Benz Circle, Vijayawada',
                    icon: AppIcons.home_,
                    selected: _selectedRow == 0,
                    onTap: () => setState(() => _selectedRow = 0),
                  ),
                  const SizedBox(height: Space.x3),
                  AppSelectableRow(
                    title: 'Office',
                    subtitle: 'Tower B, Gannavaram',
                    icon: AppIcons.work,
                    selected: _selectedRow == 1,
                    onTap: () => setState(() => _selectedRow = 1),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          // ── Step indicator ──────────────────────────────────────────────
          Section(
            eyebrow: 'Components',
            title: 'Booking journey',
            child: Padding(
              padding: Space.pageInsets,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const StepIndicator(step: 2, total: 6),
                  const SizedBox(height: Space.x5),
                  Text('Where should we send\nyour worker?', style: context.text.displayMedium),
                ],
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          // ── Services ────────────────────────────────────────────────────
          Section(
            eyebrow: 'Components',
            title: 'Popular services',
            actionLabel: 'See all',
            onAction: () {},
            child: SizedBox(
              height: 108,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: Space.pageInsets,
                children: const [
                  ServiceChip(name: 'Plumbing'),
                  SizedBox(width: Space.x2),
                  ServiceChip(name: 'Electrical'),
                  SizedBox(width: Space.x2),
                  ServiceChip(name: 'Cleaning'),
                  SizedBox(width: Space.x2),
                  ServiceChip(name: 'Painting'),
                  SizedBox(width: Space.x2),
                  ServiceChip(name: 'Carpentry'),
                  SizedBox(width: Space.x2),
                  ServiceChip(name: 'Pest Control'),
                ],
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          Section(
            eyebrow: 'Components',
            title: 'Service tiles',
            child: Padding(
              padding: Space.pageInsets,
              child: ServiceGrid(
                children: [
                  ServiceTile(
                    name: 'Plumbing',
                    description: 'Repairs & fixes',
                    selected: _selectedTile == 0,
                    onTap: () => setState(() => _selectedTile = 0),
                  ),
                  ServiceTile(
                    name: 'Electrical',
                    description: 'Wiring & lights',
                    selected: _selectedTile == 1,
                    onTap: () => setState(() => _selectedTile = 1),
                  ),
                  ServiceTile(
                    name: 'Deep Cleaning',
                    description: 'Home & kitchen',
                    selected: _selectedTile == 2,
                    onTap: () => setState(() => _selectedTile = 2),
                  ),
                  ServiceTile(
                    name: 'Painting',
                    description: 'Interior & exterior',
                    selected: _selectedTile == 3,
                    onTap: () => setState(() => _selectedTile = 3),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          // ── Trust ───────────────────────────────────────────────────────
          Section(
            eyebrow: 'Trust',
            title: 'Workers near you',
            subtitle: 'Verified members of local cooperative societies.',
            child: Padding(
              padding: Space.pageInsets,
              child: Column(
                children: [
                  const WorkerCard(
                    name: 'Ravi Kumar',
                    verified: true,
                    cooperativeName: 'Vijayawada Labour Cooperative Society',
                    rating: 4.9,
                    reviewCount: 1240,
                    completedJobs: 1240,
                    distanceKm: 1.8,
                    skills: ['Plumbing', 'Pipe Repair', 'Fitting', 'Drainage', 'Tanks'],
                  ),
                  const SizedBox(height: Space.x3),
                  AppCard(
                    padding: Space.cardInsetsLarge,
                    child: Column(
                      children: const [
                        TrustRow(label: 'Identity verified', verified: true, detail: 'Aadhaar · verified by society'),
                        TrustRow(label: 'Skill certified', verified: true, detail: '3 active certifications'),
                        TrustRow(label: 'Insured', verified: true, detail: 'Active until Mar 2027'),
                        TrustRow(label: 'Safety training', verified: false, detail: 'Scheduled'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          // ── Badges ──────────────────────────────────────────────────────
          Section(
            eyebrow: 'Components',
            title: 'Status',
            child: Padding(
              padding: Space.pageInsets,
              child: Wrap(
                spacing: Space.x2,
                runSpacing: Space.x2,
                children: const [
                  BookingStatusBadge('matching'),
                  BookingStatusBadge('en_route'),
                  BookingStatusBadge('started'),
                  BookingStatusBadge('completed'),
                  BookingStatusBadge('cancelled'),
                  VerifiedBadge(),
                  AppBadge('Emergency', tone: BadgeTone.danger, icon: AppIcons.emergency),
                  AppBadge('2% welfare fund', tone: BadgeTone.primary, icon: AppIcons.shield),
                ],
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          // ── Feature band ────────────────────────────────────────────────
          Padding(
            padding: Space.pageInsets,
            child: AppFeatureBand(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppIconBadge(AppIcons.cooperative, size: 56, iconSize: 28),
                  const SizedBox(height: Space.x4),
                  Text('Every booking funds\nworker welfare', style: context.text.headlineMedium),
                  const SizedBox(height: Space.x2),
                  Text(
                    '2% of every job goes to insurance and training for the '
                    'cooperative members who serve you.',
                    style: context.text.bodyMedium?.copyWith(color: t.textSecondary),
                  ),
                  const SizedBox(height: Space.x5),
                  AppButton(
                    label: 'How it works',
                    variant: AppButtonVariant.soft,
                    size: AppButtonSize.medium,
                    expand: false,
                    trailingIcon: AppIcons.chevronRight,
                    onPressed: () {},
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          // ── Banners ─────────────────────────────────────────────────────
          Section(
            eyebrow: 'Components',
            title: 'Banners',
            child: Padding(
              padding: Space.pageInsets,
              child: Column(
                children: [
                  const AppBanner(message: 'Your plumber is 8 minutes away.', tone: StateTone.neutral),
                  const SizedBox(height: Space.x2),
                  AppBanner(
                    message: 'Payment could not be verified.',
                    tone: StateTone.error,
                    actionLabel: 'Retry',
                    onAction: () {},
                  ),
                  const SizedBox(height: Space.x2),
                  const AppBanner(message: "You're offline. Reconnecting…", tone: StateTone.warning),
                ],
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          // ── Loading ─────────────────────────────────────────────────────
          Section(
            eyebrow: 'Components',
            title: 'Loading',
            child: Padding(
              padding: Space.pageInsets,
              child: Column(
                children: const [
                  SkeletonCard(),
                  SizedBox(height: Space.x3),
                  SkeletonCard(lines: 1),
                ],
              ),
            ),
          ),

          const SizedBox(height: Space.section),

          // ── States ──────────────────────────────────────────────────────
          Section(
            eyebrow: 'Components',
            title: 'Empty & error',
            child: Column(
              children: [
                AppStateView.empty(
                  title: 'Nothing here yet',
                  message: 'Your bookings will appear here once you book your first service.',
                  icon: AppIcons.bookings,
                  actionLabel: 'Browse services',
                  onAction: () {},
                ),
                AppStateView.offline(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showEmergencySheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        final t = context.tokens;
        return Padding(
          padding: const EdgeInsets.fromLTRB(Space.x5, Space.x2, Space.x5, Space.x8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AppIconBadge(
                    AppIcons.emergency,
                    size: 44,
                    background: t.dangerSoft,
                    foreground: t.danger,
                  ),
                  const SizedBox(width: Space.x3),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Emergency', style: context.text.headlineSmall),
                        Text(
                          'We prioritise and dispatch immediately.',
                          style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Space.x6),
              Text('What happened?', style: context.text.titleLarge),
              const SizedBox(height: Space.x3),
              AppSelectableRow(
                title: 'Water leak',
                icon: AppIcons.location,
                selected: true,
                onTap: () {},
              ),
              const SizedBox(height: Space.x2),
              AppSelectableRow(
                title: 'Electrical fault',
                icon: AppIcons.flash,
                selected: false,
                onTap: () {},
              ),
              const SizedBox(height: Space.x2),
              AppSelectableRow(
                title: 'Lockout',
                icon: AppIcons.secure,
                selected: false,
                onTap: () {},
              ),
              const SizedBox(height: Space.x6),
              AppButton(
                label: 'Request emergency help',
                variant: AppButtonVariant.danger,
                icon: AppIcons.emergency,
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Swatch extends StatelessWidget {
  const _Swatch(this.name, this.color, {this.label});

  final String name;
  final Color color;
  final String? label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 72,
          height: 56,
          decoration: BoxDecoration(
            color: color,
            borderRadius: Radii.rMd,
            border: Border.all(color: context.tokens.border),
          ),
        ),
        const SizedBox(height: Space.x1),
        Text(name, style: context.text.labelMedium),
        if (label != null)
          Text(label!, style: context.text.bodySmall?.copyWith(color: context.tokens.textTertiary)),
      ],
    );
  }
}
