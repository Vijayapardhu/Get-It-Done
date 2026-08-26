import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../design/design_system.dart';

/// Pick a date and a start time.
///
/// Two rules do most of the work here:
///
///  * A slot in the past is not offered. Today's list starts from the next
///    whole slot after now plus the lead time, so a customer cannot book 09:00
///    at six in the evening and then wonder why nobody came.
///  * Unavailable slots are shown, disabled, rather than removed. A grid that
///    silently gets shorter reads as a bug; a greyed-out row reads as "not
///    that one" and tells you the day is filling up.
class SlotPickerScreen extends StatefulWidget {
  const SlotPickerScreen({super.key, this.initial});

  final DateTime? initial;

  @override
  State<SlotPickerScreen> createState() => _SlotPickerScreenState();
}

class _SlotPickerScreenState extends State<SlotPickerScreen> {
  /// How soon the earliest slot can be. A worker has to be matched, accept and
  /// travel; offering "in five minutes" as a scheduled slot promises something
  /// the dispatch cannot keep.
  static const _leadTime = Duration(hours: 2);

  static const _firstHour = 7;
  static const _lastHour = 20;
  static const _daysAhead = 7;

  late DateTime _day;
  DateTime? _selected;

  @override
  void initState() {
    super.initState();
    final now = clock.now();
    final initial = widget.initial;
    _selected = initial != null && initial.isAfter(now) ? initial : null;
    _day = _dateOnly(_selected ?? now);
  }

  static DateTime _dateOnly(DateTime at) => DateTime(at.year, at.month, at.day);

  List<DateTime> get _days {
    final today = _dateOnly(clock.now());
    return [for (var i = 0; i < _daysAhead; i++) today.add(Duration(days: i))];
  }

  /// Every half hour in the working day, whether or not it is still bookable.
  List<DateTime> get _slots {
    final slots = <DateTime>[];
    for (var hour = _firstHour; hour <= _lastHour; hour++) {
      slots.add(DateTime(_day.year, _day.month, _day.day, hour));
      if (hour != _lastHour) {
        slots.add(DateTime(_day.year, _day.month, _day.day, hour, 30));
      }
    }
    return slots;
  }

  bool _bookable(DateTime slot) => slot.isAfter(clock.now().add(_leadTime));

  /// True when nothing is left today, which is worth saying out loud rather
  /// than showing a grid of fourteen dead buttons.
  bool get _dayIsFull => !_slots.any(_bookable);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pick a slot')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Space.x5, Space.x4, Space.x5, Space.x10),
        children: [
          Text('Which day?', style: context.text.titleMedium),
          const SizedBox(height: Space.x3),
          SizedBox(
            height: 76,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _days.length,
              separatorBuilder: (_, __) => const SizedBox(width: Space.x2),
              itemBuilder: (context, i) => _DayChip(
                day: _days[i],
                selected: _dateOnly(_days[i]) == _day,
                onTap: () => setState(() => _day = _dateOnly(_days[i])),
              ),
            ),
          ),

          const SizedBox(height: Space.x6),
          Text('What time?', style: context.text.titleMedium),
          const SizedBox(height: Space.x3),

          if (_dayIsFull)
            AppBanner(
              message: 'No slots left today. Try tomorrow, or use "Get it done '
                  'now" on the home screen for the next available worker.',
              tone: StateTone.warning,
            )
          else
            Wrap(
              spacing: Space.x2,
              runSpacing: Space.x2,
              children: [
                for (final slot in _slots)
                  _SlotChip(
                    slot: slot,
                    enabled: _bookable(slot),
                    selected: _selected == slot,
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() => _selected = slot);
                    },
                  ),
              ],
            ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Space.x5),
          child: AppButton.primary(
            label: _selected == null
                ? 'Pick a time'
                : 'Confirm ${formatSlot(_selected!)}',
            onPressed: _selected == null
                ? null
                : () => Navigator.of(context).pop(_selected),
          ),
        ),
      ),
    );
  }
}

/// "Thu 28 Aug, 10:00 AM" — the shape used wherever a chosen slot is shown
/// back to the customer, so the cart and the confirmation agree.
String formatSlot(DateTime at) {
  final local = at.toLocal();
  return '${_weekday(local.weekday)} ${local.day} ${_month(local.month)}, ${formatClock(local)}';
}

String formatClock(DateTime at) {
  final hour = at.hour % 12 == 0 ? 12 : at.hour % 12;
  final minute = at.minute.toString().padLeft(2, '0');
  return '$hour:$minute ${at.hour < 12 ? 'AM' : 'PM'}';
}

String _weekday(int weekday) =>
    const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday - 1];

String _month(int month) => const [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ][month - 1];

class _DayChip extends StatelessWidget {
  const _DayChip({required this.day, required this.selected, required this.onTap});

  final DateTime day;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final today = DateTime(clock.now().year, clock.now().month, clock.now().day);
    final delta = day.difference(today).inDays;
    final caption = delta == 0 ? 'Today' : delta == 1 ? 'Tomorrow' : _weekday(day.weekday);

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: Motion.fast,
        width: 76,
        padding: const EdgeInsets.symmetric(vertical: Space.x3),
        decoration: BoxDecoration(
          color: selected ? t.primary : t.surface,
          borderRadius: BorderRadius.circular(Radii.lg),
          border: Border.all(color: selected ? t.primary : t.border),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '${day.day} ${_month(day.month)}',
              style: context.text.titleSmall?.copyWith(
                color: selected ? t.textOnPrimary : t.textPrimary,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              caption,
              style: context.text.bodySmall?.copyWith(
                color: selected ? t.textOnPrimary : t.textTertiary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SlotChip extends StatelessWidget {
  const _SlotChip({
    required this.slot,
    required this.enabled,
    required this.selected,
    required this.onTap,
  });

  final DateTime slot;
  final bool enabled;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Semantics(
      button: true,
      enabled: enabled,
      selected: selected,
      label: '${formatClock(slot)}${enabled ? '' : ', unavailable'}',
      child: GestureDetector(
        onTap: enabled ? onTap : null,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: Motion.fast,
          width: 104,
          padding: const EdgeInsets.symmetric(vertical: Space.x3),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected
                ? t.primary
                : enabled
                    ? t.surface
                    : t.surfaceAlt,
            borderRadius: BorderRadius.circular(Radii.md),
            border: Border.all(
              color: selected ? t.primary : t.border,
            ),
          ),
          child: Text(
            formatClock(slot),
            style: context.text.bodyMedium?.copyWith(
              color: selected
                  ? t.textOnPrimary
                  : enabled
                      ? t.textPrimary
                      : t.textTertiary,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}
