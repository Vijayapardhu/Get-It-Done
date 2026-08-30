import 'package:dio/dio.dart';

import 'json.dart';

/// A failure the UI can act on.
///
/// The backend speaks two error dialects and the app should not care which:
///
///  * RFC-7807 for validation —
///    `{type, title, status, detail, code, details: {fieldErrors}}`
///  * a bare `{error: "Booking not found"}` for 401/403/404 and most handlers
///
/// Both land here. [code] is the stable identifier to branch on; [message] is
/// already safe to show a user.
class ApiException implements Exception {
  ApiException({
    required this.message,
    required this.statusCode,
    this.code,
    this.fieldErrors = const {},
    this.isNetwork = false,
  });

  final String message;

  /// 0 when the request never reached the server.
  final int statusCode;

  /// Stable machine code: `VALIDATION_ERROR`, `OTP_ATTEMPTS_EXCEEDED`,
  /// `INVALID_WEBHOOK_SIGNATURE`, `EMERGENCY_DUPLICATE`, …
  final String? code;

  /// Per-field validation messages, keyed by field name.
  final Map<String, List<String>> fieldErrors;

  /// No connection, DNS failure or timeout — worth offering a retry rather than
  /// telling the user they did something wrong.
  final bool isNetwork;

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNotFound => statusCode == 404;
  bool get isConflict => statusCode == 409;
  bool get isRateLimited => statusCode == 429;
  bool get isServer => statusCode >= 500;

  /// First message for [field], for inline form errors.
  String? fieldError(String field) {
    final errors = fieldErrors[field] ?? fieldErrors[_camel(field)] ?? fieldErrors[_snake(field)];
    return (errors == null || errors.isEmpty) ? null : errors.first;
  }

  static String _snake(String k) =>
      k.replaceAllMapped(RegExp('[A-Z]'), (m) => '_${m[0]!.toLowerCase()}');

  static String _camel(String k) {
    final parts = k.split('_');
    if (parts.length == 1) return k;
    return parts.first +
        parts.skip(1).map((p) => p.isEmpty ? '' : p[0].toUpperCase() + p.substring(1)).join();
  }

  /// Build from whatever Dio surfaced.
  factory ApiException.from(Object error) {
    if (error is ApiException) return error;
    if (error is! DioException) {
      return ApiException(message: 'Something went wrong. Please try again.', statusCode: 0);
    }

    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return ApiException(
          message: 'That took too long. Check your connection and try again.',
          statusCode: 0,
          code: 'TIMEOUT',
          isNetwork: true,
        );
      case DioExceptionType.connectionError:
      case DioExceptionType.unknown:
        return ApiException(
          message: "Can't reach GET IT DONE. Check your connection.",
          statusCode: 0,
          code: 'NETWORK',
          isNetwork: true,
        );
      case DioExceptionType.cancel:
        return ApiException(message: 'Request cancelled.', statusCode: 0, code: 'CANCELLED');
      case DioExceptionType.badCertificate:
        return ApiException(
          message: 'Could not establish a secure connection.',
          statusCode: 0,
          code: 'BAD_CERTIFICATE',
        );
      case DioExceptionType.badResponse:
        break;
      // Newer Dio versions add cases; treat anything unrecognised as a
      // transport problem rather than failing to compile on an upgrade.
      default:
        return ApiException(
          message: 'Something went wrong. Please try again.',
          statusCode: 0,
          isNetwork: true,
        );
    }

    final status = error.response?.statusCode ?? 0;
    final body = asJson(error.response?.data);

    if (body == null) {
      return ApiException(message: _defaultMessage(status), statusCode: status);
    }

    // RFC-7807 shape.
    final code = asStringOrNull(pick(body, 'code'));
    final detail = asStringOrNull(pick(body, 'detail'));

    // Bare `{error: "..."}` shape. Some handlers put a machine code in `error`
    // (OTP_NOT_ISSUED) and others put prose ("Booking not found"), so treat an
    // ALL_CAPS value as a code and anything else as the message.
    final bare = asStringOrNull(pick(body, 'error'));
    final bareIsCode = bare != null && RegExp(r'^[A-Z][A-Z0-9_]{2,}$').hasMatch(bare);

    final message = asStringOrNull(pick(body, 'message')) ??
        (bareIsCode ? _messageForCode(bare) : bare) ??
        detail ??
        _defaultMessage(status);

    return ApiException(
      message: message,
      statusCode: status,
      code: code ?? (bareIsCode ? bare : null),
      fieldErrors: _parseFieldErrors(body),
    );
  }

  static Map<String, List<String>> _parseFieldErrors(Json body) {
    final details = asJson(pick(body, 'details'));
    final fields = asJson(pick(details, 'fieldErrors'));
    if (fields == null) return const {};

    return {
      for (final entry in fields.entries) entry.key: asStringList(entry.value),
    };
  }

  /// Copy for codes the app needs to explain rather than echo.
  static String _messageForCode(String code) => switch (code) {
        'OTP_NOT_ISSUED' =>
          'No verification code has been issued yet. Ask for a new one.',
        'OTP_ATTEMPTS_EXCEEDED' =>
          'Too many incorrect codes. Request a new verification code.',
        'INVALID_OTP' => 'That code is not correct.',
        'EMERGENCY_DUPLICATE' =>
          'You already have a similar emergency request in progress.',
        'INVALID_PAYMENT_SIGNATURE' =>
          'We could not verify that payment. You have not been charged twice.',
        'VALIDATION_ERROR' => 'Please check the details you entered.',
        'NO_ADMIN_SCOPE' || 'OUT_OF_SCOPE' => 'You do not have access to that.',
        _ => 'Something went wrong. Please try again.',
      };

  static String _defaultMessage(int status) => switch (status) {
        400 => 'Please check the details you entered.',
        401 => 'Please sign in to continue.',
        403 => 'You do not have access to that.',
        404 => 'We could not find that.',
        409 => 'That conflicts with something already in progress.',
        429 => 'Too many attempts. Please wait a moment.',
        >= 500 => 'GET IT DONE is having trouble. Please try again shortly.',
        _ => 'Something went wrong. Please try again.',
      };

  @override
  String toString() => 'ApiException($statusCode${code == null ? '' : ' $code'}): $message';
}
