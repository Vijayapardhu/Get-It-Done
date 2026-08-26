/// Tolerant JSON readers.
///
/// The backend is not consistent about how it shapes responses, and rather than
/// let that leak into every model, it is absorbed here:
///
///  * **Casing is mixed.** `/auth`, `/services` and `/bookings` return
///    camelCase; `/addresses`, `/users/me` and `/services/discovery/*` return
///    snake_case. `/customer/dashboard` returns BOTH in the same object
///    (`scheduledAt` beside `service_name`). Every reader below accepts either
///    spelling, so a model declares the field once.
///
///  * **Numbers arrive as strings.** node-postgres returns `numeric` columns as
///    strings to preserve precision, so `base_price` is `"299.00"` and
///    `avg_rating` is `"5.0"` while `/services` returns `basePrice` as a real
///    number for the same underlying column.
///
///  * **Nulls are common** on optional joins (`worker_name`, `location`).
///
/// If the backend is ever normalised, this file shrinks — nothing else changes.
library;

typedef Json = Map<String, dynamic>;

/// snake_case variant of a camelCase key: `scheduledAt` -> `scheduled_at`.
String _toSnake(String key) =>
    key.replaceAllMapped(RegExp('[A-Z]'), (m) => '_${m[0]!.toLowerCase()}');

/// camelCase variant of a snake_case key: `scheduled_at` -> `scheduledAt`.
String _toCamel(String key) {
  final parts = key.split('_');
  if (parts.length == 1) return key;
  return parts.first +
      parts.skip(1).map((p) => p.isEmpty ? '' : p[0].toUpperCase() + p.substring(1)).join();
}

/// Look up [key] under either casing, plus any explicit [aliases].
///
/// Aliases exist because the same concept genuinely has different names across
/// endpoints — a worker id is `workerId` on a booking, `worker_id` on the
/// dashboard, and `id` on a nearby-worker result.
dynamic pick(Json? json, String key, {List<String> aliases = const []}) {
  if (json == null) return null;

  // Both casings are tried for the aliases too, not only the primary key.
  // Without that, whether `avg_rating` was found depended on whether someone
  // had written the alias as `avgRating` or `avg_rating` — so moving a name
  // from the primary position into the alias list silently stopped matching
  // the endpoint that sends the other casing.
  for (final candidate in [key, ...aliases]) {
    for (final form in [candidate, _toSnake(candidate), _toCamel(candidate)]) {
      if (json.containsKey(form) && json[form] != null) return json[form];
    }
  }
  return null;
}

String? asStringOrNull(dynamic value) {
  if (value == null) return null;
  if (value is String) return value.isEmpty ? null : value;
  return value.toString();
}

String asString(dynamic value, {String fallback = ''}) => asStringOrNull(value) ?? fallback;

/// Coerce to double, tolerating the numeric-as-string case.
double? asDoubleOrNull(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value.trim());
  return null;
}

double asDouble(dynamic value, {double fallback = 0}) => asDoubleOrNull(value) ?? fallback;

int? asIntOrNull(dynamic value) {
  if (value == null) return null;
  if (value is int) return value;
  if (value is num) return value.round();
  // "2" from a count(*), and "4.0" from a numeric that happens to be whole.
  if (value is String) return int.tryParse(value.trim()) ?? double.tryParse(value.trim())?.round();
  return null;
}

int asInt(dynamic value, {int fallback = 0}) => asIntOrNull(value) ?? fallback;

/// Postgres booleans survive JSON intact, but a `count(*) > 0` style flag can
/// arrive as 0/1 or "true".
bool asBool(dynamic value, {bool fallback = false}) {
  if (value == null) return fallback;
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) {
    final v = value.toLowerCase().trim();
    if (v == 'true' || v == 't' || v == '1' || v == 'yes') return true;
    if (v == 'false' || v == 'f' || v == '0' || v == 'no') return false;
  }
  return fallback;
}

/// Parse a timestamp, tolerating both ISO-8601 and the JS `toString()` form
/// (`"Wed Aug 26 2026 07:19:04 GMT+0530 (India Standard Time)"`) that
/// `/auth/me` returns for `lastLoginAt`.
DateTime? asDateOrNull(dynamic value) {
  if (value == null) return null;
  if (value is DateTime) return value;
  if (value is! String || value.isEmpty) return null;

  final iso = DateTime.tryParse(value);
  if (iso != null) return iso;

  // "Wed Aug 26 2026 07:19:04 GMT+0530 (...)" — strip the trailing zone label
  // and let the RFC-1123-ish remainder parse.
  final trimmed = value.replaceAll(RegExp(r'\s*\(.*\)$'), '');
  return DateTime.tryParse(trimmed) ?? _parseJsDateString(trimmed);
}

final _months = {
  'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
  'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12,
};

DateTime? _parseJsDateString(String value) {
  // "Wed Aug 26 2026 07:19:04 GMT+0530"
  final match = RegExp(
    r'^\w{3} (\w{3}) (\d{1,2}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT([+-])(\d{2})(\d{2})',
  ).firstMatch(value);
  if (match == null) return null;

  final month = _months[match.group(1)];
  if (month == null) return null;

  final local = DateTime.utc(
    int.parse(match.group(3)!),
    month,
    int.parse(match.group(2)!),
    int.parse(match.group(4)!),
    int.parse(match.group(5)!),
    int.parse(match.group(6)!),
  );

  final offset = Duration(
    hours: int.parse(match.group(8)!),
    minutes: int.parse(match.group(9)!),
  );

  // The stamp is local-to-that-offset, so subtract the offset to reach UTC.
  return match.group(7) == '+' ? local.subtract(offset) : local.add(offset);
}

/// A nested object, whatever the wrapper key's casing.
Json? asJson(dynamic value) => value is Map ? Map<String, dynamic>.from(value) : null;

/// A list of objects, returning empty rather than null so callers never guard.
List<Json> asJsonList(dynamic value) {
  if (value is! List) return const [];
  return value.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
}

List<String> asStringList(dynamic value) {
  if (value is! List) return const [];
  return value.map(asStringOrNull).whereType<String>().toList();
}

/// Map a list of raw objects through a parser, dropping any that fail.
///
/// One malformed row should degrade to a shorter list, not blank the screen —
/// this data comes from an admin-editable catalogue.
List<T> parseList<T>(dynamic value, T Function(Json) parse) {
  final result = <T>[];
  for (final item in asJsonList(value)) {
    try {
      result.add(parse(item));
    } catch (_) {
      // Skip the bad row; the rest of the list is still useful.
    }
  }
  return result;
}
