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
///    silently gets shorter reads as a bug; a greyed-out cell reads as "not
///    that one" and tells you the day is filling up.
///
/// THE REDESIGN, and why
/// ---------------------
/// This screen used to be two flat rows of small chips under two small
/// headings — twenty-seven identical rounded rectangles, most of them digits.
/// It worked and it was miserable to use, for three reasons:
///
///  * Everything was the same size, so nothing said what to do first. The day
///    rail and the time chips had equal weight.
///  * The times were a single undifferentiated run from 07:00 to 20:00. Anyone
///    looking for "some time in the evening" had to read every one.
///  * Nothing was a symbol. On a phone held at arm's length in a shop, a wall
///    of numerals is the slowest possible way to say "morning".
///
/// So: the day rail is now a real strip of dated cards, the times are grouped
/// into morning / afternoon / evening behind a sun and a moon, the cells are
/// finger-sized rather than chip-sized, and the chosen slot is echoed in the
/// bottom bar so the confirm button is never a leap of faith.
class SlotPickerScreen extends StatefulWidget {
  const SlotPickerScreen({super.key, this.initial});

  final DateTime? initial;

  @override
  State<SlotPickerScreen> createState() => _SlotPickerScreenState();
}

/// A named part of the day, with the symbol that stands for it.
enum _PartOfDay {
  morning('Morning', AppIcons.morning, 7, 12),
  afternoon('Afternoon', AppIcons.afternoon, 12, 17),
  evening('Evening', AppIcons.evening, 17, 21);

  const _PartOfDay(this.label, this.icon, this.fromHour, this.toHour);

  final String label;
  final AppIconData icon;

  /// Half-open: [fromHour, toHour).
  final int fromHour;
  final int toHour;

  bool contains(DateTime slot) => slot.hour >= fromHour && slot.hour < toHour;
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

  /// Slots for one part of the day. Empty means the whole block is skipped —
  /// an "Evening" heading over nothing is worse than no heading.
  List<DateTime> _slotsIn(_PartOfDay part) =>
      _slots.where(part.contains).toList(growable: false);

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final selected = _selected;

    return Scaffold(
      appBar: AppBar(title: const Text('Pick a slot')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(0, Space.x4, 0, Space.x8),
        children: [
          _Heading(icon: AppIcons.calendar, title: 'Which day?'),
          const SizedBox(height: Space.x4),

          // Full-bleed, with the page inset applied to the list's own padding,
          // so a day card can sit half off the right edge. That overhang is
          // the affordance: it is what tells the customer the rail scrolls.
          SizedBox(
            height: 108,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: Space.pageInsets,
              itemCount: _days.length,
              separatorBuilder: (_, __) => const SizedBox(width: Space.x3),
              itemBuilder: (context, i) => _DayCard(
                day: _days[i],
                selected: _dateOnly(_days[i]) == _day,
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _day = _dateOnly(_days[i]));
                },
              ),
            ),
          ),

          const SizedBox(height: Space.x8),
          _Heading(icon: AppIcons.time, title: 'What time?'),
          const SizedBox(height: Space.x2),
          Padding(
            padding: Space.pageInsets,
            child: Text(
              'Earliest is two hours from now — enough for a worker to accept '
              'and travel.',
              style: context.text.bodySmall?.copyWith(
                color: t.textTertiary,
                height: 1.45,
              ),
            ),
          ),
          const SizedBox(height: Space.x5),

          if (_dayIsFull)
            Padding(
              padding: Space.pageInsets,
              child: AppBanner(
                message: 'No slots left today. Try tomorrow, or use "Get it '
                    'done now" on the home screen for the next available '
                    'worker.',
                tone: StateTone.warning,
                icon: AppIcons.evening,
              ),
            )
          else
            for (final part in _PartOfDay.values)
              if (_slotsIn(part).isNotEmpty)
                _PartBlock(
                  part: part,
                  slots: _slotsIn(part),
                  selected: _selected,
                  isBookable: _bookable,
                  onPick: (slot) {
                    HapticFeedback.selectionClick();
                    setState(() => _selected = slot);
                  },
                ),
        ],
      ),
      bottomNavigationBar: _ConfirmBar(
        selected: selected,
        onConfirm: selected == null ? null : () => Navigator.of(context).pop(selected),
      ),
    );
  }
}

/// A section heading with its symbol. Both questions on this screen get one,
/// so the eye can find "when" without reading.
class _Heading extends StatelessWidget {
  const _Heading({required this.icon, required this.title});

  final AppIconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: Space.pageInsets,
      child: Row(
        children: [
          AppIconBadge(icon, size: 34, iconSize: 18),
          const SizedBox(width: Space.x3),
          Text(title, style: context.text.titleLarge),
        ],
      ),
    );
  }
}

/// One part of the day: its symbol, its name, and its slots as a grid.
class _PartBlock extends StatelessWidget {
  const _PartBlock({
    required this.part,
    required this.slots,
    required this.selected,
    required this.isBookable,
    required this.onPick,
  });

  final _PartOfDay part;
  final List<DateTime> slots;
  final DateTime? selected;
  final bool Function(DateTime) isBookable;
  final ValueChanged<DateTime> onPick;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final free = slots.where(isBookable).length;

    return Padding(
      padding: const EdgeInsets.only(bottom: Space.x6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: Space.pageInsets,
            child: Row(
              children: [
                AppIcon(part.icon, size: Sizes.iconSm, color: t.textSecondary, bold: true),
                const SizedBox(width: Space.x2),
                Text(part.label, style: context.text.titleSmall),
                const Spacer(),
                // How many are actually left, not how many exist. On today's
                // date most of the morning is already gone, and saying so is
                // what stops the greyed-out cells reading as broken.
                Text(
                  free == 0 ? 'None left' : '$free free',
                  style: context.text.labelSmall?.copyWith(
                    color: free == 0 ? t.textTertiary : t.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: Space.x3),
          Padding(
            padding: Space.pageInsets,
            child: GridView.builder(
              padding: EdgeInsets.zero,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: slots.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: Space.x3,
                mainAxisSpacing: Space.x3,
                // A fixed height rather than an aspect ratio: the cell holds
                // one line of text at any accessibility scale, and 56 is the
                // touch target this screen is built around.
                mainAxisExtent: 56,
              ),
              itemBuilder: (context, i) => _SlotCell(
                slot: slots[i],
                enabled: isBookable(slots[i]),
                selected: selected == slots[i],
                onTap: () => onPick(slots[i]),
              ),
            ),
          ),
        ],
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

/// One day in the rail.
///
/// Reads top to bottom the way a calendar page does: weekday, then the number
/// large enough to be the thing you actually aim at, then the month. The old
/// chip put the date first in small text and the weekday under it, which is
/// backwards — nobody scans a week by month name.
class _DayCard extends StatelessWidget {
  const _DayCard({required this.day, required this.selected, required this.onTap});

  final DateTime day;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final now = clock.now();
    final today = DateTime(now.year, now.month, now.day);
    final delta = day.difference(today).inDays;
    final caption = delta == 0
        ? 'Today'
        : delta == 1
            ? 'Tomorrow'
            : _weekday(day.weekday);

    final foreground = selected ? t.textOnPrimary : t.textPrimary;

    return Semantics(
      button: true,
      selected: selected,
      label: '$caption, ${day.day} ${_month(day.month)}',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: Motion.fast,
          curve: Motion.curve,
          width: 88,
          padding: const EdgeInsets.symmetric(vertical: Space.x3),
          decoration: BoxDecoration(
            color: selected ? t.primary : t.surface,
            borderRadius: BorderRadius.circular(Radii.xl),
            border: Border.all(
              color: selected ? t.primary : t.border,
              width: selected ? 1.6 : 1,
            ),
            boxShadow: selected ? t.cardShadow : null,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                caption,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.labelSmall?.copyWith(
                  color: selected ? t.textOnPrimary : t.textTertiary,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '${day.day}',
                style: context.text.headlineSmall?.copyWith(
                  color: foreground,
                  fontWeight: FontWeight.w700,
                  height: 1.1,
                ),
              ),
              Text(
                _month(day.month),
                style: context.text.bodySmall?.copyWith(
                  color: selected ? t.textOnPrimary : t.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One bookable half hour.
///
/// Three states, and each has to be distinguishable at a glance: available
/// (white, bordered), chosen (filled, with a tick so the state survives being
/// photographed in greyscale or seen by someone who cannot separate the blue
/// from the grey), and gone (flat fill, no border, dimmed).
class _SlotCell extends StatelessWidget {
  const _SlotCell({
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

    final Color background = selected
        ? t.primary
        : enabled
            ? t.surface
            : t.surfaceAlt;
    final Color foreground = selected
        ? t.textOnPrimary
        : enabled
            ? t.textPrimary
            : t.textTertiary;

    return Semantics(
      button: true,
      enabled: enabled,
      selected: selected,
      label: '${formatClock(slot)}${enabled ? '' : ', unavailable'}',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: enabled ? onTap : null,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: Motion.fast,
          curve: Motion.curve,
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: Space.x2),
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(Radii.lg),
            border: Border.all(
              color: selected
                  ? t.primary
                  : enabled
                      ? t.border
                      : Colors.transparent,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (selected) ...[
                AppIcon(AppIcons.tick, size: 14, color: foreground, bold: true),
                const SizedBox(width: Space.x1),
              ],
              Flexible(
                child: Text(
                  formatClock(slot),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.titleSmall?.copyWith(
                    color: foreground,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The bottom bar: what was chosen, then the button.
///
/// The echo above the button is the point. "Confirm" on its own asks the
/// customer to trust that the cell they tapped three scrolls ago was the one
/// they meant; the line spells it out in the same words the cart will use.
class _ConfirmBar extends StatelessWidget {
  const _ConfirmBar({required this.selected, required this.onConfirm});

  final DateTime? selected;
  final VoidCallback? onConfirm;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final chosen = selected;

    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.border)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Space.x5),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedSize(
                duration: Motion.fast,
                curve: Motion.curve,
                child: chosen == null
                    ? const SizedBox(width: double.infinity)
                    : Padding(
                        padding: const EdgeInsets.only(bottom: Space.x4),
                        child: Row(
                          children: [
                            AppIcon(AppIcons.calendar,
                                size: Sizes.iconSm, color: t.primary, bold: true),
                            const SizedBox(width: Space.x2),
                            Expanded(
                              child: Text(
                                formatSlot(chosen),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: context.text.titleSmall,
                              ),
                            ),
                          ],
                        ),
                      ),
              ),
              AppButton.primary(
                label: chosen == null ? 'Pick a time' : 'Confirm this slot',
                icon: chosen == null ? null : AppIcons.tick,
                onPressed: onConfirm,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
