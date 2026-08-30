import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:gid_core/gid_core.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// The queue that lets a worker in a lift press "Started".
///
/// WORKER_APP_PLAN 7.3. Every lifecycle transition is written to disk BEFORE
/// the request goes out, with its idempotency key generated at press time. Then
/// the UI shows the optimistic state with a small "queued" mark and gets on
/// with the job. A worker in a basement, a stairwell or a village must never be
/// blocked by a spinner over something they have already done.
///
/// Three rules this encodes:
///
///  * **Order is preserved per booking.** "Started" must not overtake "on my
///    way", or the server rejects a transition that was perfectly legal in the
///    order the worker performed it.
///  * **The key is generated at press time, not at send time.** That is what
///    makes a retry after a dropped connection a replay rather than a second
///    action. `ApiClient.newIdempotencyKey()` exists for exactly this shape.
///  * **OTP verification is never queued.** It needs a live check against a
///    hash only the server holds. The screen says so plainly rather than
///    failing oddly — see `verifyStart` in WorkerApi.
class ActionQueue {
  ActionQueue({required ApiClient client, Database? database, Connectivity? connectivity})
      : _client = client,
        _database = database,
        _connectivity = connectivity ?? Connectivity();

  final ApiClient _client;
  final Connectivity _connectivity;
  Database? _database;

  StreamSubscription<void>? _connectivitySub;
  bool _draining = false;

  final _pending = ValueNotifier<int>(0);

  /// How many actions are waiting. The shell shows this in a persistent banner:
  /// a worker must be able to see that the app is holding something for them,
  /// or the optimistic UI is indistinguishable from a lie.
  ValueListenable<int> get pendingCount => _pending;

  static const _table = 'queued_actions';

  Future<Database> _open() async {
    if (_database != null) return _database!;
    final dir = await getDatabasesPath();
    _database = await openDatabase(
      p.join(dir, 'gid_worker_queue.db'),
      version: 1,
      onCreate: (db, _) => db.execute('''
        create table $_table (
          id            integer primary key autoincrement,
          booking_id    text    not null,
          method        text    not null,
          path          text    not null,
          body          text,
          idempotency   text    not null,
          created_at    integer not null,
          attempts      integer not null default 0,
          last_error    text
        )
      '''),
    );
    return _database!;
  }

  /// Start listening for a connection coming back.
  Future<void> start() async {
    await _refreshCount();
    _connectivitySub = _connectivity.onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online) unawaited(drain());
    });
    unawaited(drain());
  }

  /// Enqueue an action and try to send it immediately.
  ///
  /// Returns as soon as the row is on disk. The caller does NOT await the
  /// network: the whole point is that the worker's next tap is not gated on a
  /// radio that may be in a basement.
  Future<void> enqueue({
    required String bookingId,
    required String method,
    required String path,
    Map<String, dynamic>? body,
  }) async {
    final db = await _open();
    await db.insert(_table, {
      'booking_id': bookingId,
      'method': method,
      'path': path,
      'body': body == null ? null : jsonEncode(body),
      // Generated HERE, at press time. Generating it in the sender would make
      // every retry a new action.
      'idempotency': ApiClient.newIdempotencyKey(),
      'created_at': DateTime.now().millisecondsSinceEpoch,
    });
    await _refreshCount();
    unawaited(drain());
  }

  /// Send everything waiting, oldest first, stopping at the first failure.
  ///
  /// Stopping matters. If "on my way" cannot be delivered, sending "started"
  /// behind it produces a transition the server refuses and a job that looks
  /// stuck to the customer. The queue is ordered because the work was.
  Future<void> drain() async {
    if (_draining) return;
    _draining = true;
    try {
      final db = await _open();
      while (true) {
        final rows = await db.query(_table, orderBy: 'id asc', limit: 1);
        if (rows.isEmpty) break;

        final row = rows.first;
        final id = row['id'] as int;
        final attempts = row['attempts'] as int;

        try {
          await _send(row);
          await db.delete(_table, where: 'id = ?', whereArgs: [id]);
        } on ApiException catch (error) {
          if (error.isNetwork) {
            // Still offline. Leave everything exactly where it is and wait for
            // connectivity rather than burning attempts against a dead radio.
            break;
          }

          // A 409 usually means the server already has this transition -- the
          // request landed and the response did not. That is a success from the
          // worker's point of view, and retrying it forever would wedge the
          // queue behind an action that can never succeed.
          if (error.isConflict || error.isNotFound || error.statusCode == 403) {
            debugPrint('[queue] dropping ${row['method']} ${row['path']}: ${error.message}');
            await db.delete(_table, where: 'id = ?', whereArgs: [id]);
            continue;
          }

          // Anything else: back off, and give up after enough tries so one
          // poisoned row cannot hold a whole shift's actions hostage.
          if (attempts + 1 >= _maxAttempts) {
            debugPrint('[queue] giving up on ${row['path']} after $_maxAttempts attempts');
            await db.delete(_table, where: 'id = ?', whereArgs: [id]);
            continue;
          }
          await db.update(
            _table,
            {'attempts': attempts + 1, 'last_error': error.message},
            where: 'id = ?',
            whereArgs: [id],
          );
          await Future<void>.delayed(_backoff(attempts + 1));
        }
      }
    } finally {
      _draining = false;
      await _refreshCount();
    }
  }

  static const _maxAttempts = 6;

  /// Exponential, capped. A worker's phone reconnecting on a train should not
  /// hammer the API on every cell handover.
  Duration _backoff(int attempt) =>
      Duration(seconds: (1 << (attempt - 1)).clamp(1, 60));

  Future<void> _send(Map<String, Object?> row) {
    final method = row['method'] as String;
    final path = row['path'] as String;
    final raw = row['body'] as String?;
    final body = raw == null ? null : jsonDecode(raw);
    final headers = {'idempotency-key': row['idempotency'] as String};

    return switch (method) {
      'POST' => _client.post(path, body: body, headers: headers),
      'PATCH' => _client.patch(path, body: body),
      'PUT' => _client.put(path, body: body),
      _ => _client.post(path, body: body, headers: headers),
    };
  }

  /// Actions still queued for one booking, so the job screen can mark exactly
  /// which step is pending rather than showing a global "syncing" state.
  Future<int> pendingFor(String bookingId) async {
    final db = await _open();
    final result = await db.rawQuery(
      'select count(*) as c from $_table where booking_id = ?',
      [bookingId],
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }

  Future<void> _refreshCount() async {
    final db = await _open();
    final result = await db.rawQuery('select count(*) as c from $_table');
    _pending.value = Sqflite.firstIntValue(result) ?? 0;
  }

  Future<void> dispose() async {
    await _connectivitySub?.cancel();
    await _database?.close();
    _database = null;
    _pending.dispose();
  }
}
