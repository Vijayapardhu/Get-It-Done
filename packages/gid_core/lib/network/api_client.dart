import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import '../storage/token_store.dart';
import 'api_exception.dart';
import 'json.dart';

/// HTTP client for the GET IT DONE API.
///
/// The important part is the refresh queue. Access tokens are short-lived and
/// the backend ROTATES the refresh token on use, so the naive
/// "on 401, call /auth/refresh" interceptor is actively harmful: five parallel
/// requests expiring together fire five refreshes, the first invalidates the
/// token the other four are holding, and the user is signed out in the middle
/// of a booking. Here the first 401 refreshes while everyone else waits on the
/// same future, then all of them replay.
class ApiClient {
  ApiClient({required this.tokenStore, Dio? dio, String? baseUrl})
      : _dio = dio ?? Dio() {
    _dio.options = _dio.options.copyWith(
      baseUrl: baseUrl ?? AppConfig.apiBaseUrl,
      connectTimeout: AppConfig.connectTimeout,
      receiveTimeout: AppConfig.receiveTimeout,
      sendTimeout: AppConfig.sendTimeout,
      headers: {'content-type': 'application/json'},
      // Never throw on status: errors are normalised in one place below.
      validateStatus: (_) => true,
    );

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: _onRequest,
      onError: _onError,
    ));

    if (kDebugMode) {
      _dio.interceptors.add(LogInterceptor(
        requestBody: false,
        responseBody: false,
        // Never log headers: they carry the bearer token.
        requestHeader: false,
        responseHeader: false,
        logPrint: (o) => debugPrint('[api] $o'),
      ));
    }
  }

  final Dio _dio;
  final TokenStore tokenStore;

  /// For endpoints handed to the platform rather than fetched — the
  /// invoice PDF streams binary and is opened in a browser.
  String get baseUrl => _dio.options.baseUrl;

  /// In-flight refresh, shared by every request that 401s while it runs.
  Future<String?>? _refreshing;

  /// Called when refresh fails — the session is unrecoverable and the app
  /// should return to sign-in.
  VoidCallback? onSessionExpired;

  Future<void> _onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    // `skipAuth` marks the endpoints that must NOT carry a stale bearer token:
    // login, register, refresh.
    if (options.extra['skipAuth'] != true) {
      final token = await tokenStore.accessToken;
      if (token != null) options.headers['authorization'] = 'Bearer $token';
    }
    options.headers['x-request-id'] ??= _requestId();
    handler.next(options);
  }

  Future<void> _onError(DioException error, ErrorInterceptorHandler handler) async {
    handler.next(error);
  }

  static final _random = Random();

  /// Correlates a client request with the backend's audit log, which reads
  /// `x-request-id` on every route.
  String _requestId() {
    const chars = 'abcdef0123456789';
    return List.generate(24, (_) => chars[_random.nextInt(chars.length)]).join();
  }

  /// Idempotency key for POST /bookings, which requires 16–128 characters.
  ///
  /// Generate this when the user opens the confirm sheet, not when they tap:
  /// a double-tap or a retry after a dropped connection then reuses the key and
  /// the backend replays the original response instead of creating a second
  /// booking.
  static String newIdempotencyKey() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final suffix = List.generate(24, (_) => chars[_random.nextInt(chars.length)]).join();
    return 'gid-${DateTime.now().millisecondsSinceEpoch}-$suffix';
  }

  Future<Json> get(String path, {Map<String, dynamic>? query, bool auth = true}) =>
      _send('GET', path, query: query, auth: auth);

  Future<Json> post(String path, {Object? body, Map<String, dynamic>? query, Map<String, String>? headers, bool auth = true}) =>
      _send('POST', path, body: body, query: query, headers: headers, auth: auth);

  Future<Json> postMultipart(String path, {
    required Map<String, String> files,
    required Map<String, String> fields,
    bool auth = true,
  }) async {
    late Response<dynamic> response;
    final formData = FormData.fromMap({
      ...fields,
      ...files.map((key, path) => MapEntry(key, MultipartFile.fromFileSync(path))),
    });
    try {
      response = await _dio.post(
        path,
        data: formData,
        options: Options(
          extra: {'skipAuth': !auth},
          headers: {'content-type': 'multipart/form-data'},
        ),
      );
    } on DioException catch (e) {
      throw ApiException.from(e);
    }

    final status = response.statusCode ?? 0;
    if (status == 401 && auth) {
      final refreshed = await _refreshOnce();
      if (refreshed != null) {
        return postMultipart(path, files: files, fields: fields, auth: auth);
      }
      onSessionExpired?.call();
    }
    if (status >= 400) {
      throw ApiException.from(DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      ));
    }
    return asJson(response.data) ?? {'data': response.data};
  }

  Future<Json> patch(String path, {Object? body, bool auth = true}) =>
      _send('PATCH', path, body: body, auth: auth);

  Future<Json> put(String path, {Object? body, bool auth = true}) =>
      _send('PUT', path, body: body, auth: auth);

  Future<Json> delete(String path, {Object? body, bool auth = true}) =>
      _send('DELETE', path, body: body, auth: auth);

  /// Fetch a binary body (the invoice PDF) with the bearer token attached.
  ///
  /// The PDF route is behind `requireAuth`, so handing the URL to the system
  /// browser would return 401 — it has to be downloaded through this client
  /// and written to a file the platform can open.
  Future<List<int>> getBytes(String path) async {
    late Response<List<int>> response;
    try {
      response = await _dio.get<List<int>>(
        path,
        options: Options(responseType: ResponseType.bytes),
      );
    } on DioException catch (e) {
      throw ApiException.from(e);
    }

    if ((response.statusCode ?? 0) == 401) {
      final refreshed = await _refreshOnce();
      if (refreshed == null) {
        onSessionExpired?.call();
      } else {
        response = await _dio.get<List<int>>(
          path,
          options: Options(responseType: ResponseType.bytes),
        );
      }
    }

    if ((response.statusCode ?? 0) >= 400 || response.data == null) {
      throw ApiException.from(DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      ));
    }
    return response.data!;
  }

  Future<Json> _send(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    Map<String, String>? headers,
    bool auth = true,
    bool isRetry = false,
  }) async {
    late Response<dynamic> response;
    try {
      response = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(
          method: method,
          headers: headers,
          extra: {'skipAuth': !auth},
        ),
      );
    } on DioException catch (e) {
      throw ApiException.from(e);
    }

    final status = response.statusCode ?? 0;

    if (status == 401 && auth && !isRetry) {
      final refreshed = await _refreshOnce();
      if (refreshed != null) {
        // Replay exactly once. A second 401 after a successful refresh means
        // the endpoint is genuinely forbidden, not that the token was stale.
        return _send(method, path, body: body, query: query, headers: headers, auth: auth, isRetry: true);
      }
      onSessionExpired?.call();
    }

    if (status >= 400) {
      throw ApiException.from(DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      ));
    }

    // 204 and other empty bodies are success, not a parse failure.
    if (response.data == null || (response.data is String && (response.data as String).isEmpty)) {
      return const {};
    }
    return asJson(response.data) ?? {'data': response.data};
  }

  /// Refresh at most once concurrently. Returns the new access token, or null
  /// if the session cannot be recovered.
  Future<String?> _refreshOnce() {
    // Someone is already refreshing — wait for their result rather than
    // starting a second rotation that would invalidate theirs.
    final inFlight = _refreshing;
    if (inFlight != null) return inFlight;

    final future = _doRefresh().whenComplete(() => _refreshing = null);
    _refreshing = future;
    return future;
  }

  Future<String?> _doRefresh() async {
    final refreshToken = await tokenStore.refreshToken;
    if (refreshToken == null) return null;

    try {
      final response = await _dio.post<dynamic>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(extra: {'skipAuth': true}),
      );

      if ((response.statusCode ?? 0) >= 400) {
        await tokenStore.clear();
        return null;
      }

      final body = asJson(response.data);
      final access = asStringOrNull(pick(body, 'accessToken'));
      // The backend rotates: the response carries a NEW refresh token and the
      // old one is revoked. Persisting both is not optional.
      final refresh = asStringOrNull(pick(body, 'refreshToken')) ?? refreshToken;

      if (access == null) {
        await tokenStore.clear();
        return null;
      }

      await tokenStore.save(accessToken: access, refreshToken: refresh);
      return access;
    } on DioException catch (e) {
      // A network blip must NOT sign the user out — only an explicit rejection
      // from the server does.
      final isNetwork = e.type != DioExceptionType.badResponse;
      if (!isNetwork) await tokenStore.clear();
      return null;
    } on SocketException {
      return null;
    }
  }

  /// Upload a file through the backend's presigned-URL flow.
  ///
  /// The backend issues a short-lived PUT URL (S3/minio), the bytes go straight
  /// there — never through our own servers — and a final `complete` call returns
  /// the canonical `fileUrl`. The PUT goes to a full external URL, so it uses a
  /// throwaway Dio with no base URL and no auth header.
  Future<String> uploadFile({
    required File file,
    required String type,
    String? filename,
  }) async {
    final name = filename ?? file.path.split(Platform.pathSeparator).last;
    final contentType = _contentTypeFor(name);

    final prepared = await post(
      '/files/upload-url',
      body: {
        'type': type,
        'filename': name,
        'contentType': contentType,
      },
    );
    final uploadUrl = asStringOrNull(pick(prepared, 'uploadUrl'));
    final fileKey = asStringOrNull(pick(prepared, 'fileKey'));
    if (uploadUrl == null || fileKey == null) {
      throw ApiException(message: 'Could not start the upload.', statusCode: 0);
    }

    final bytes = await file.readAsBytes();
    try {
      final uploader = Dio();
      await uploader.put<List<int>>(
        uploadUrl,
        data: Stream.fromIterable([bytes]),
        options: Options(
          headers: {'content-type': contentType},
          // The presigned URL authorises the request; no extra headers.
          sendTimeout: AppConfig.sendTimeout,
        ),
      );
    } on DioException catch (e) {
      throw ApiException.from(e);
    }

    final completed = await post('/files/$fileKey/complete');
    final fileUrl = asStringOrNull(pick(completed, 'fileUrl'));
    if (fileUrl == null) {
      throw ApiException(message: 'Upload did not finish.', statusCode: 0);
    }
    return fileUrl;
  }

  static String _contentTypeFor(String filename) {
    final ext = filename.split('.').last.toLowerCase();
    return switch (ext) {
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'webp' => 'image/webp',
      'gif' => 'image/gif',
      'pdf' => 'application/pdf',
      _ => 'application/octet-stream',
    };
  }

  void close() => _dio.close(force: true);
}
