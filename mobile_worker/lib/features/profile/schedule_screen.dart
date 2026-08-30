import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:intl/intl.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// When you work, and when you do not.
///
/// Before this, `workers.current_status` was three values and no calendar, so a
/// worker who forgot to go offline got a 2am drain unblock and matching had no
/// way to know they were asleep.
///
/// Local wall-clock times, in Asia/Kolkata: a worker thinks "I work eight to
/// six", not "I work 02:30Z to 12:30Z". A worker with no hours entered is
/// always available — the duty toggle stays the primary control, and this must
/// not silently un-match anyone who never opens it.
class ScheduleScreen extends ConsumerStatefulWidget {
  const ScheduleScreen({super.key});

  @override
  ConsumerState<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends ConsumerState<ScheduleScreen> {
  static const _dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  Map<int, ScheduleEntry>? _draft;
  bool _saving = false;

  Map<int, ScheduleEntry> _draftFrom(List<ScheduleEntry> entries) =>
      {for (final e in entries) e.weekday: e};

  Future<void> _save() async {
    final draft = _draft;
    if (draft == null) return;
    setState(() => _saving = true);
    try {
      await ref.read(workerApiProvider).saveSchedule(draft.values.toList());
      ref.invalidate(scheduleProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Saved. You will only be offered work in these hours.')),
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

  Future<void> _editDay(int weekday, ScheduleEntry? existing) async {
    final start = await showTimePicker(
      context: context,
      initialTime: _parse(existing?.startsAt ?? '08:00'),
      helpText: 'Start of ${_dayNames[weekday]}',
    );
    if (start == null || !mounted) return;

    final end = await showTimePicker(
      context: context,
      initialTime: _parse(existing?.endsAt ?? '18:00'),
      helpText: 'End of ${_dayNames[weekday]}',
    );
    if (end == null || !mounted) return;

    final startText = _format(start);
    final endText = _format(end);
    if (endText.compareTo(startText) <= 0) {
      // Overnight shifts are a real thing and this schema does not express one
      // (a single row cannot cross midnight). Say so rather than silently
      // storing something the CHECK constraint will reject.
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('The end has to be after the start. For a night shift, set it on both days.')),
      );
      return;
    }

    setState(() {
      _draft![weekday] = ScheduleEntry(weekday: weekday, startsAt: startText, endsAt: endText);
    });
  }

  static TimeOfDay _parse(String value) {
    final parts = value.split(':');
    return TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1]));
  }

  static String _format(TimeOfDay time) =>
      '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final schedule = ref.watch(scheduleProvider);
    final timeOff = ref.watch(timeOffProvider);
    final tokens = context.tokens;

    return Scaffold(
      appBar: AppBar(title: const Text('Working hours')),
      body: schedule.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Padding(
          padding: const EdgeInsets.all(Space.page),
          child: Text('Could not load your hours.\n$error'),
        ),
        data: (result) {
          _draft ??= _draftFrom(result.schedule);

          return ListView(
            padding: const EdgeInsets.fromLTRB(Space.page, Space.x4, Space.page, Space.x12),
            children: [
              if (_draft!.isEmpty)
                Container(
                  padding: const EdgeInsets.all(Space.x4),
                  decoration: BoxDecoration(color: tokens.surfaceBlue, borderRadius: Radii.rLg),
                  child: Text(
                    'You have not set any hours, so you can be offered work at any time you are online. '
                    'Set them if you would rather not be.',
                    style: context.text.bodyMedium,
                  ),
                ),
              const SizedBox(height: Space.x4),
              for (var day = 0; day < 7; day++)
                _DayRow(
                  name: _dayNames[day],
                  entry: _draft![day],
                  onEdit: () => _editDay(day, _draft![day]),
                  onClear: () => setState(() => _draft!.remove(day)),
                ),
              const SizedBox(height: Space.x6),
              SizedBox(
                height: WorkerSizes.button,
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          width: 22, height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.n0),
                        )
                      : const Text('Save my hours'),
                ),
              ),

              const SizedBox(height: Space.x8),
              Text(
                'TIME OFF',
                style: context.text.labelSmall?.copyWith(color: tokens.textTertiary, letterSpacing: 1.1),
              ),
              const SizedBox(height: Space.x2),
              timeOff.when(
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
                data: (list) => Column(
                  children: [
                    if (list.isEmpty)
                      Text('None booked.', style: context.text.bodyMedium),
                    for (final off in list)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text(off.reason ?? 'Time off'),
                        subtitle: Text(
                          '${DateFormat('d MMM').format(off.startsAt.toLocal())} – '
                          '${DateFormat('d MMM').format(off.endsAt.toLocal())}',
                        ),
                        trailing: IconButton(
                          icon: AppIcon(AppIcons.close, size: 20),
                          onPressed: () async {
                            await ref.read(workerApiProvider).removeTimeOff(off.id);
                            ref.invalidate(timeOffProvider);
                          },
                        ),
                      ),
                    const SizedBox(height: Space.x2),
                    OutlinedButton.icon(
                      onPressed: _addTimeOff,
                      icon: AppIcon(AppIcons.add, size: 20),
                      label: const Text('Book time off'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(WorkerSizes.button),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _addTimeOff() async {
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      helpText: 'When are you away?',
    );
    if (range == null || !mounted) return;

    try {
      await ref.read(workerApiProvider).addTimeOff(
            from: range.start,
            // Through the END of the last day, not its first second. Booking
            // "the 5th to the 7th" and being offered work on the morning of the
            // 7th is the bug this line exists to prevent.
            to: DateTime(range.end.year, range.end.month, range.end.day, 23, 59, 59),
          );
      ref.invalidate(timeOffProvider);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }
}

class _DayRow extends StatelessWidget {
  const _DayRow({
    required this.name,
    required this.entry,
    required this.onEdit,
    required this.onClear,
  });

  final String name;
  final ScheduleEntry? entry;
  final VoidCallback onEdit;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final working = entry != null;

    return ListTile(
      contentPadding: EdgeInsets.zero,
      onTap: onEdit,
      title: Text(name, style: context.text.titleMedium),
      subtitle: Text(
        working ? '${entry!.startsAt} – ${entry!.endsAt}' : 'Not working',
        style: context.text.bodyMedium?.copyWith(
          color: working ? tokens.textSecondary : tokens.textTertiary,
        ),
      ),
      trailing: working
          ? IconButton(icon: AppIcon(AppIcons.close, size: 20), onPressed: onClear)
          : AppIcon(AppIcons.add, size: 20, color: tokens.primary),
    );
  }
}
