/// Rupee formatting, in one place.
///
/// Six screens had grown their own `'₹${amount.toStringAsFixed(0)}'`, and they
/// disagreed: the catalogue rounded to whole rupees while an invoice showed
/// paise, so the same number could appear as ₹299 on one screen and ₹299.00 on
/// the next. Which is right depends on what the number IS, so that choice is
/// the argument rather than the call site's habit.
library;

/// A price or total for display.
///
/// Whole rupees by default, because a catalogue full of `.00` is noise. Pass
/// [paise] where the exact figure is the point — a bill line, an invoice, an
/// amount actually charged — since rounding money a customer is being asked to
/// pay is how a total stops adding up.
String formatRupees(num amount, {bool paise = false}) {
  final value = amount.abs();
  final digits = paise || _hasPaise(value) ? 2 : 0;
  final sign = amount < 0 ? '-' : '';
  return '$sign₹${_group(value.toStringAsFixed(digits))}';
}

/// True when rounding to whole rupees would hide something.
///
/// A catalogue price of 299 shows as ₹299, but 26.26 must not show as ₹26 just
/// because the caller did not think to ask for paise.
bool _hasPaise(num value) => (value * 100).round() % 100 != 0;

/// Indian digit grouping: 1,00,000 rather than 100,000.
///
/// The last three digits group together, then pairs. A customer reading
/// ₹1,00,000 knows immediately it is a lakh; ₹100,000 makes them count.
String _group(String fixed) {
  final parts = fixed.split('.');
  final whole = parts[0];
  final fraction = parts.length > 1 ? '.${parts[1]}' : '';

  if (whole.length <= 3) return '$whole$fraction';

  final last3 = whole.substring(whole.length - 3);
  var rest = whole.substring(0, whole.length - 3);

  final groups = <String>[];
  while (rest.length > 2) {
    groups.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) groups.insert(0, rest);

  return '${groups.join(',')},$last3$fraction';
}
