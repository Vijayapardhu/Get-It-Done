import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../address/address_screen.dart';
import '../../design/design_system.dart';
import '../../core/ui/service_artwork.dart';

/// The booking journey.
///
/// Four steps, each with one job: where, when, what's wrong, confirm. Every
/// step is a small step indicator, a large question, simple choices and one
/// primary action — never a form.
///
/// Two things here are load-bearing and easy to get wrong:
///
///  1. The idempotency key is generated when this screen OPENS, not when the
///     confirm button is tapped. A double-tap, or a retry after a dropped
///     response, then replays the original booking rather than creating a
///     second one.
///  2. POST /bookings returns the start and completion OTPs exactly ONCE. They
///     are handed straight to the caller before any navigation happens.
class BookServiceScreen extends ConsumerStatefulWidget {
  const BookServiceScreen({
    super.key,
    required this.service,
    required this.onBooked,
  });

  final Service service;
  final void Function(BookingCreated result) onBooked;

  @override
  ConsumerState<BookServiceScreen> createState() => _BookServiceScreenState();
}

class _BookServiceScreenState extends ConsumerState<BookServiceScreen> {
  /// Fixed for the lifetime of this screen — see the class doc.
  final String _idempotencyKey = ApiClient.newIdempotencyKey();

  final _descriptionController = TextEditingController();
  final _pageController = PageController();

  int _step = 0;
  static const _totalSteps = 4;

  SavedAddress? _address;
  bool _scheduleLater = false;
  DateTime? _scheduledAt;

  FareEstimate? _estimate;
  bool _loadingEstimate = false;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _descriptionController.dispose();
    _pageController.dispose();
    super.dispose();
  }

  void _goTo(int step) {
    setState(() {
      _step = step;
      _error = null;
    });
    _pageController.animateToPage(step, duration: Motion.slow, curve: Motion.curveEmphasis);
  }

  void _next() {
    if (_step == 0 && _address == null) {
      setState(() => _error = 'Choose where the worker should come.');
      return;
    }
    if (_step == _totalSteps - 2) _loadEstimate();
    if (_step < _totalSteps - 1) _goTo(_step + 1);
  }

  void _back() {
    if (_step == 0) {
      Navigator.of(context).maybePop();
      return;
    }
    _goTo(_step - 1);
  }

  /// Fetch the fare before the confirm step, so the customer never sees a price
  /// for the first time on the invoice.
  Future<void> _loadEstimate() async {
    final address = _address;
    if (address == null || !address.hasCoordinates) return;

    setState(() { _loadingEstimate = true; _error = null; });
    try {
      final estimate = await ref.read(apiProvider).estimate(
            serviceId: widget.service.id,
            latitude: address.latitude!,
            longitude: address.longitude!,
            scheduledAt: _scheduledAt,
          );
      if (mounted) setState(() => _estimate = estimate);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loadingEstimate = false);
    }
  }

  Future<void> _confirm() async {
    final address = _address;
    if (address == null || !address.hasCoordinates) {
      setState(() => _error = 'That address has no location saved. Pick another.');
      return;
    }

    setState(() { _submitting = true; _error = null; });
    try {
      final result = await ref.read(apiProvider).createBooking(
            serviceId: widget.service.id,
            latitude: address.latitude!,
            longitude: address.longitude!,
            address: address.address,
            idempotencyKey: _idempotencyKey,
            description: _descriptionController.text.trim(),
            scheduledAt: _scheduledAt,
          );

      // The dashboard now has an active booking.
      ref.invalidate(dashboardProvider);
      ref.invalidate(bookingsProvider);

      if (mounted) widget.onBooked(result);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.x3, Space.x2, Space.x5, 0),
              child: Row(
                children: [
                  AppIconButton(icon: AppIcons.chevronLeft, onPressed: _back),
                  const SizedBox(width: Space.x2),
                  Expanded(child: StepIndicator(step: _step + 1, total: _totalSteps)),
                ],
              ),
            ),
            Expanded(
              child: PageView(
                controller: _pageController,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _AddressStep(
                    selected: _address,
                    onSelect: (a) => setState(() { _address = a; _error = null; }),
                  ),
                  _ScheduleStep(
                    scheduleLater: _scheduleLater,
                    scheduledAt: _scheduledAt,
                    onChanged: (later, at) => setState(() {
                      _scheduleLater = later;
                      _scheduledAt = at;
                    }),
                  ),
                  _DetailsStep(
                    service: widget.service,
                    controller: _descriptionController,
                  ),
                  _ConfirmStep(
                    service: widget.service,
                    address: _address,
                    scheduledAt: _scheduledAt,
                    estimate: _estimate,
                    loading: _loadingEstimate,
                    onRetryEstimate: _loadEstimate,
                  ),
                ],
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(Space.x5, 0, Space.x5, Space.x3),
                child: AppBanner(message: _error!, tone: StateTone.error),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.x5, 0, Space.x5, Space.x5),
              child: _step == _totalSteps - 1
                  ? AppButton.primary(
                      label: 'Confirm booking',
                      loading: _submitting,
                      icon: AppIcons.success,
                      // Blocked until the fare is known: confirming a price the
                      // customer has not seen is how disputes start.
                      onPressed: _estimate == null || _submitting ? null : _confirm,
                    )
                  : AppButton.primary(
                      label: 'Continue',
                      trailingIcon: AppIcons.chevronRight,
                      onPressed: _next,
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────── step 1 ──

class _AddressStep extends ConsumerWidget {
  const _AddressStep({required this.selected, required this.onSelect});

  final SavedAddress? selected;
  final ValueChanged<SavedAddress> onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final addresses = ref.watch(addressesProvider);

    return ListView(
      padding: const EdgeInsets.fromLTRB(Space.x5, Space.x6, Space.x5, Space.x5),
      children: [
        Text('Where should we send\nyour worker?', style: context.text.displayLarge),
        const SizedBox(height: Space.x8),
        addresses.when(
          loading: () => const Column(
            children: [SkeletonCard(lines: 1, hasAvatar: false), SizedBox(height: Space.x3), SkeletonCard(lines: 1, hasAvatar: false)],
          ),
          error: (error, _) => AppBanner(
            message: ApiException.from(error).message,
            tone: StateTone.error,
            actionLabel: 'Retry',
            onAction: () => ref.invalidate(addressesProvider),
          ),
          data: (list) {
            if (list.isEmpty) {
              return AppStateView.empty(
                title: 'No saved addresses',
                message: 'Add the address where you need the service.',
                icon: AppIcons.location,
                actionLabel: 'Add address',
                onAction: () => _addAddress(context, onSelect),
              );
            }
            // Auto-select the default on first build so the common case is one
            // tap on Continue rather than two.
            if (selected == null) {
              final preferred = list.firstWhere((a) => a.isDefault, orElse: () => list.first);
              WidgetsBinding.instance.addPostFrameCallback((_) => onSelect(preferred));
            }
            return Column(
              children: [
                for (final address in list) ...[
                  AppSelectableRow(
                    title: address.name,
                    subtitle: address.address,
                    icon: _iconFor(address.name),
                    selected: selected?.id == address.id,
                    onTap: () => onSelect(address),
                  ),
                  const SizedBox(height: Space.x3),
                ],
                AppButton.secondary(
                  label: 'Add another address',
                  icon: AppIcons.add,
                  onPressed: () => _addAddress(context, onSelect),
                ),
              ],
            );
          },
        ),
      ],
    );
  }

  /// Push the address form and select whatever comes back, so the customer
  /// lands straight back on Continue rather than having to pick again.
  static Future<void> _addAddress(BuildContext context, ValueChanged<SavedAddress> onSelect) async {
    final created = await Navigator.of(context).push<SavedAddress>(
      MaterialPageRoute(builder: (_) => const AddAddressScreen()),
    );
    if (created != null) onSelect(created);
  }

  static AppIconData _iconFor(String name) {
    final n = name.toLowerCase();
    if (n.contains('home') || n.contains('house')) return AppIcons.home_;
    if (n.contains('office') || n.contains('work')) return AppIcons.work;
    return AppIcons.building;
  }
}

// ────────────────────────────────────────────────────────────── step 2 ──

class _ScheduleStep extends StatelessWidget {
  const _ScheduleStep({
    required this.scheduleLater,
    required this.scheduledAt,
    required this.onChanged,
  });

  final bool scheduleLater;
  final DateTime? scheduledAt;
  final void Function(bool later, DateTime? at) onChanged;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return ListView(
      padding: const EdgeInsets.fromLTRB(Space.x5, Space.x6, Space.x5, Space.x5),
      children: [
        Text('When do you\nneed it?', style: context.text.displayLarge),
        const SizedBox(height: Space.x8),
        AppSegmented<bool>(
          value: scheduleLater,
          onChanged: (later) => onChanged(later, later ? scheduledAt : null),
          options: const [
            (value: false, label: 'As soon as possible'),
            (value: true, label: 'Schedule'),
          ],
        ),
        const SizedBox(height: Space.x6),
        if (!scheduleLater)
          AppCard(
            padding: Space.cardInsetsLarge,
            child: Row(
              children: [
                AppIconBadge(AppIcons.flash, size: 44),
                const SizedBox(width: Space.x3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Right away', style: context.text.titleMedium),
                      Text(
                        'We match you with the nearest available verified worker.',
                        style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          )
        else
          _SlotPicker(
            selected: scheduledAt,
            onSelect: (at) => onChanged(true, at),
          ),
      ],
    );
  }
}

class _SlotPicker extends StatelessWidget {
  const _SlotPicker({required this.selected, required this.onSelect});

  final DateTime? selected;
  final ValueChanged<DateTime> onSelect;

  @override
  Widget build(BuildContext context) {
    // Next eight two-hour slots inside working hours, starting at least an hour
    // out so a worker has time to travel.
    final now = DateTime.now();
    final slots = <DateTime>[];
    var cursor = DateTime(now.year, now.month, now.day, now.hour + 2);
    while (slots.length < 8) {
      if (cursor.hour >= 8 && cursor.hour <= 18) slots.add(cursor);
      cursor = cursor.add(const Duration(hours: 2));
    }

    return Column(
      children: [
        for (final slot in slots) ...[
          AppSelectableRow(
            title: _dayLabel(slot, now),
            subtitle: '${_hour(slot)} – ${_hour(slot.add(const Duration(hours: 2)))}',
            icon: AppIcons.time,
            selected: selected == slot,
            onTap: () => onSelect(slot),
          ),
          const SizedBox(height: Space.x2),
        ],
      ],
    );
  }

  static String _dayLabel(DateTime slot, DateTime now) {
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(slot.year, slot.month, slot.day);
    final diff = day.difference(today).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Tomorrow';
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return '${names[slot.weekday - 1]} ${slot.day}';
  }

  static String _hour(DateTime at) {
    final h = at.hour % 12 == 0 ? 12 : at.hour % 12;
    return '$h ${at.hour < 12 ? 'AM' : 'PM'}';
  }
}

// ────────────────────────────────────────────────────────────── step 3 ──

class _DetailsStep extends StatelessWidget {
  const _DetailsStep({required this.service, required this.controller});

  final Service service;
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return ListView(
      padding: const EdgeInsets.fromLTRB(Space.x5, Space.x6, Space.x5, Space.x5),
      children: [
        Text('Tell us what\nis wrong', style: context.text.displayLarge),
        const SizedBox(height: Space.x2),
        Text(
          'Optional, but it helps the worker arrive with the right tools.',
          style: context.text.bodyLarge?.copyWith(color: t.textSecondary),
        ),
        const SizedBox(height: Space.x6),
        AppTextField(
          hint: 'e.g. Kitchen tap has been dripping for two days',
          controller: controller,
          maxLines: 4,
          maxLength: 500,
        ),
        const SizedBox(height: Space.x4),
        AppBanner(
          message: 'You can add photos once a worker is assigned.',
          tone: StateTone.neutral,
          icon: AppIcons.camera,
        ),
      ],
    );
  }
}

// ────────────────────────────────────────────────────────────── step 4 ──

class _ConfirmStep extends StatelessWidget {
  const _ConfirmStep({
    required this.service,
    required this.address,
    required this.scheduledAt,
    required this.estimate,
    required this.loading,
    required this.onRetryEstimate,
  });

  final Service service;
  final SavedAddress? address;
  final DateTime? scheduledAt;
  final FareEstimate? estimate;
  final bool loading;
  final VoidCallback onRetryEstimate;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return ListView(
      padding: const EdgeInsets.fromLTRB(Space.x5, Space.x6, Space.x5, Space.x5),
      children: [
        Text('Review and\nconfirm', style: context.text.displayLarge),
        const SizedBox(height: Space.x6),

        AppCard(
          padding: Space.cardInsetsLarge,
          child: Column(
            children: [
              Row(
                children: [
                  ServiceArtwork(service: service, size: 48),
                  const SizedBox(width: Space.x3),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(service.name, style: context.text.titleLarge),
                        Text(
                          service.category,
                          style: context.text.bodySmall?.copyWith(color: t.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const Divider(height: Space.x6),
              _SummaryRow(
                icon: AppIcons.location,
                label: address?.name ?? 'Address',
                value: address?.address ?? '—',
              ),
              const SizedBox(height: Space.x3),
              _SummaryRow(
                icon: AppIcons.time,
                label: 'When',
                value: scheduledAt == null ? 'As soon as possible' : _formatSlot(scheduledAt!),
              ),
            ],
          ),
        ),

        const SizedBox(height: Space.x4),

        // The full fare breakdown, not just a total. Showing travel and tax as
        // separate lines is the transparency story, and it prevents most
        // "why was I charged this?" support tickets.
        if (loading)
          const SkeletonCard(lines: 3, hasAvatar: false)
        else if (estimate == null)
          AppBanner(
            message: 'Could not calculate the fare.',
            tone: StateTone.error,
            actionLabel: 'Retry',
            onAction: onRetryEstimate,
          )
        else
          AppCard(
            padding: Space.cardInsetsLarge,
            child: Column(
              children: [
                _PriceRow(label: service.name, amount: estimate!.baseService),
                if (estimate!.travel > 0) ...[
                  const SizedBox(height: Space.x2),
                  _PriceRow(label: 'Travel', amount: estimate!.travel),
                ],
                if (estimate!.surge > 0) ...[
                  const SizedBox(height: Space.x2),
                  _PriceRow(label: 'High demand', amount: estimate!.surge),
                ],
                if (estimate!.emergency > 0) ...[
                  const SizedBox(height: Space.x2),
                  _PriceRow(label: 'Emergency priority', amount: estimate!.emergency),
                ],
                const SizedBox(height: Space.x2),
                _PriceRow(
                  label: 'Tax (${(estimate!.taxRate * 100).round()}%)',
                  amount: estimate!.tax,
                ),
                const Divider(height: Space.x6),
                _PriceRow(label: 'Total', amount: estimate!.total, emphasis: true),
              ],
            ),
          ),

        const SizedBox(height: Space.x4),
        Row(
          children: [
            AppIcon(AppIcons.shield, size: Sizes.iconSm, color: t.success, bold: true),
            const SizedBox(width: Space.x2),
            Expanded(
              child: Text(
                'You only pay after the work is done and you confirm it.',
                style: context.text.bodySmall?.copyWith(color: t.textSecondary),
              ),
            ),
          ],
        ),
      ],
    );
  }

  static String _formatSlot(DateTime at) {
    final h = at.hour % 12 == 0 ? 12 : at.hour % 12;
    return '${at.day}/${at.month} at $h ${at.hour < 12 ? 'AM' : 'PM'}';
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.icon, required this.label, required this.value});

  final AppIconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppIcon(icon, size: Sizes.iconSm, color: t.textTertiary),
        const SizedBox(width: Space.x3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: context.text.labelMedium?.copyWith(color: t.textTertiary)),
              Text(value, style: context.text.bodyMedium),
            ],
          ),
        ),
      ],
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({required this.label, required this.amount, this.emphasis = false});

  final String label;
  final double amount;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final style = emphasis
        ? context.text.titleLarge
        : context.text.bodyMedium?.copyWith(color: t.textSecondary);

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Flexible(child: Text(label, style: style, maxLines: 1, overflow: TextOverflow.ellipsis)),
        Text(
          '₹${amount.toStringAsFixed(2)}',
          style: (emphasis ? context.text.titleLarge : context.text.bodyMedium)?.copyWith(
            color: emphasis ? t.textPrimary : t.textSecondary,
            fontWeight: emphasis ? FontWeight.w700 : FontWeight.w500,
            // Tabular so the rupee columns line up.
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}
