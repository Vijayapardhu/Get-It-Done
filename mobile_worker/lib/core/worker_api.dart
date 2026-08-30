import 'dart:io';

import 'package:gid_core/gid_core.dart';

import 'models/worker_models.dart';

/// The worker-only half of the API surface.
///
/// [GidApi] in `gid_core` already covers everything both apps share — auth,
/// notifications, device tokens, chat, support, languages, maps. This adds the
/// endpoints only a worker calls, on the same [ApiClient] and therefore behind
/// the same refresh queue.
///
/// Method names read as the thing the worker is doing, not as the HTTP verb.
class WorkerApi {
  WorkerApi(this._client);

  final ApiClient _client;

  ApiClient get client => _client;

  // ──────────────────────────────────────────────────────────── offers ──

  /// Every offer live for me right now, and the server's clock.
  ///
  /// Called on cold start, on socket reconnect, and whenever a push arrives
  /// with no socket. The socket is a delivery optimisation; this is the truth.
  Future<({List<JobOffer> offers, DateTime serverNow})> liveOffers() async {
    final json = await _client.get('/workers/me/offers');
    return (
      offers: parseList(pick(json, 'offers'), JobOffer.fromJson),
      serverNow: asDateOrNull(pick(json, 'serverNow')) ?? DateTime.now(),
    );
  }

  /// Take the job.
  ///
  /// Throws [ApiException] with `code == 'OFFER_EXPIRED'` when the window
  /// closed or another worker won the race. That is a specific, sayable thing —
  /// "this job went to someone else" — and it must not be shown as a generic
  /// failure, which reads as the app having lost the worker the job.
  Future<void> acceptOffer(String bookingId) => _client.post('/bookings/$bookingId/accept');

  Future<void> declineOffer(String bookingId, DeclineReason reason) =>
      _client.post('/bookings/$bookingId/reject', body: {'declineReason': reason.wire});

  // ─────────────────────────────────────────────────────────────── duty ──

  Future<DutyStatus> setDuty(DutyStatus status) async {
    final json = await _client.patch('/workers/me/availability', body: {'status': status.wire});
    final worker = asJson(pick(json, 'worker')) ?? const {};
    return DutyStatus.parse(asStringOrNull(pick(worker, 'currentStatus')) ?? status.wire);
  }

  Future<({List<ScheduleEntry> schedule, bool onShift})> schedule() async {
    final json = await _client.get('/workers/me/schedule');
    return (
      schedule: parseList(pick(json, 'schedule'), ScheduleEntry.fromJson),
      onShift: asBool(pick(json, 'onShift'), fallback: true),
    );
  }

  Future<List<ScheduleEntry>> saveSchedule(List<ScheduleEntry> entries) async {
    final json = await _client.put(
      '/workers/me/schedule',
      body: {'entries': entries.map((e) => e.toJson()).toList()},
    );
    return parseList(pick(json, 'schedule'), ScheduleEntry.fromJson);
  }

  Future<List<TimeOff>> timeOff() async {
    final json = await _client.get('/workers/me/time-off');
    return parseList(pick(json, 'timeOff'), TimeOff.fromJson);
  }

  Future<TimeOff> addTimeOff({required DateTime from, required DateTime to, String? reason}) async {
    final json = await _client.post('/workers/me/time-off', body: {
      'startsAt': from.toUtc().toIso8601String(),
      'endsAt': to.toUtc().toIso8601String(),
      if (reason != null && reason.isNotEmpty) 'reason': reason,
    });
    return TimeOff.fromJson(asJson(pick(json, 'timeOff')) ?? const {});
  }

  Future<void> removeTimeOff(String id) => _client.delete('/workers/me/time-off/$id');

  Future<OfferPreferences> preferences() async {
    final json = await _client.get('/workers/me/preferences');
    return OfferPreferences.fromJson(asJson(pick(json, 'preferences')) ?? const {});
  }

  Future<OfferPreferences> savePreferences({
    double? maxTravelKm,
    bool clearMaxTravel = false,
    bool? acceptEmergency,
    bool? autoOfflineAtShiftEnd,
  }) async {
    final json = await _client.put('/workers/me/preferences', body: {
      // An explicit null means "no ceiling"; omitting the key means "leave it".
      if (clearMaxTravel) 'maxTravelKm': null else if (maxTravelKm != null) 'maxTravelKm': maxTravelKm,
      if (acceptEmergency != null) 'acceptEmergency': acceptEmergency,
      if (autoOfflineAtShiftEnd != null) 'autoOfflineAtShiftEnd': autoOfflineAtShiftEnd,
    });
    return OfferPreferences.fromJson(asJson(pick(json, 'preferences')) ?? const {});
  }

  // ───────────────────────────────────────────────────────────── the job ──

  Future<List<WorkerJob>> upcomingJobs() async {
    final json = await _client.get('/worker/upcoming-jobs');
    return parseList(pick(json, 'jobs', aliases: ['upcomingJobs', 'bookings']), WorkerJob.fromJson);
  }

  Future<List<WorkerJob>> jobHistory({int limit = 50}) async {
    final json = await _client.get('/worker/jobs/history', query: {'limit': limit});
    return parseList(pick(json, 'jobs', aliases: ['history', 'bookings']), WorkerJob.fromJson);
  }

  Future<Json> dashboard() => _client.get('/worker');

  Future<WorkerJob> job(String bookingId) async {
    final json = await _client.get('/bookings/$bookingId');
    return WorkerJob.fromJson(asJson(pick(json, 'booking')) ?? json);
  }

  Future<NavigationAid> navigation(String bookingId) async {
    final json = await _client.post('/worker/navigate/$bookingId');
    return NavigationAid.fromJson(json);
  }

  Future<({List<OrderSibling> siblings, String? contactName, String? contactPhone})> orderContext(
    String bookingId,
  ) async {
    final json = await _client.get('/bookings/$bookingId/order-context');
    final order = asJson(pick(json, 'order'));
    return (
      siblings: parseList(pick(json, 'siblings'), OrderSibling.fromJson),
      contactName: order == null ? null : asStringOrNull(pick(order, 'contactName')),
      contactPhone: order == null ? null : asStringOrNull(pick(order, 'contactPhone')),
    );
  }

  Future<void> setEnRoute(String bookingId) =>
      _client.patch('/bookings/$bookingId/status', body: {'status': 'en_route'});

  /// Stamp arrival with a real fix.
  ///
  /// [isMocked] is sent honestly. The server refuses a mocked fix and flags the
  /// worker: arrival gates the start OTP, which gates the money, so accepting
  /// one is accepting a worker marking themselves at a door from their sofa.
  Future<({DateTime noShowEligibleAt, int waitMinutes})> markArrived(
    String bookingId, {
    required double latitude,
    required double longitude,
    double? accuracy,
    bool isMocked = false,
  }) async {
    final json = await _client.post('/bookings/$bookingId/arrived', body: {
      'latitude': latitude,
      'longitude': longitude,
      if (accuracy != null) 'accuracy': accuracy,
      'isMocked': isMocked,
    });
    return (
      noShowEligibleAt: asDateOrNull(pick(json, 'noShowEligibleAt')) ?? DateTime.now(),
      waitMinutes: asInt(pick(json, 'waitMinutes'), fallback: 10),
    );
  }

  Future<({double compensation, int waitedMinutes})> reportNoShow(String bookingId, {String? note}) async {
    final json = await _client.post('/bookings/$bookingId/no-show', body: {if (note != null) 'note': note});
    return (
      compensation: asDouble(pick(json, 'compensation')),
      waitedMinutes: asInt(pick(json, 'waitedMinutes')),
    );
  }

  /// The one thing that cannot be queued offline. Say so on the screen rather
  /// than failing oddly: it needs a live check against a hash only the server
  /// holds.
  Future<void> verifyStart(String bookingId, String otp) =>
      _client.post('/bookings/$bookingId/verify-start', body: {'otp': otp});

  Future<void> verifyComplete(String bookingId, String otp) =>
      _client.post('/bookings/$bookingId/verify-complete', body: {'otp': otp});

  Future<WorkClock> workClock(String bookingId, {required bool start}) async {
    final json = await _client.post(
      '/bookings/$bookingId/work-clock',
      body: {'event': start ? 'start' : 'finish'},
    );
    return WorkClock.fromJson(json);
  }

  Future<List<TimeExtension>> extensions(String bookingId) async {
    final json = await _client.get('/bookings/$bookingId/extensions');
    return parseList(pick(json, 'extensions'), TimeExtension.fromJson);
  }

  Future<TimeExtension> requestExtension(String bookingId, {required int minutes, String? note}) async {
    final json = await _client.post('/bookings/$bookingId/extensions', body: {
      'minutes': minutes,
      if (note != null && note.isNotEmpty) 'note': note,
    });
    return TimeExtension.fromJson(asJson(pick(json, 'extension')) ?? const {});
  }

  Future<void> cancelJob(String bookingId, {required String reasonCode, String? reason}) =>
      _client.post('/bookings/$bookingId/cancel', body: {
        'reasonCode': reasonCode,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      });

  Future<List<Json>> timeline(String bookingId) async {
    final json = await _client.get('/bookings/$bookingId/timeline');
    return asJsonList(pick(json, 'timeline'));
  }

  // ───────────────────────────────────────────────────────────── location ──

  /// Drain the queue of fixes accumulated since the last successful call.
  ///
  /// Batched rather than one-per-fix because the failure this exists for is a
  /// dead zone: a worker in a lift accumulates fixes, and one request that
  /// carries all of them is the difference between a trail and a gap.
  Future<void> pushLocations(List<Json> fixes, {String? bookingId}) => _client.post(
        '/workers/me/location/batch',
        body: {'fixes': fixes, if (bookingId != null) 'bookingId': bookingId},
      );

  // ───────────────────────────────────────────────────────────── the money ──

  Future<PayoutPreview> payoutPreview(String bookingId) async {
    final json = await _client.get('/bookings/$bookingId/payout-preview');
    return PayoutPreview.fromJson(json);
  }

  /// Calendar-aligned figures plus the seven-day strip, in the shape the
  /// Earnings screen renders. Deliberately NOT
  /// `/earnings/workers/me/earnings/summary`: that returns four ROLLING windows
  /// with no `today`, no job counts and no per-day series, which is three of
  /// the four things this screen is made of.
  Future<EarningsSummary> earningsSummary() async {
    final json = await _client.get('/workers/me/earnings/overview');
    return EarningsSummary.fromJson(json);
  }

  /// Note the doubled prefix: `earningsRouter` is mounted at `/earnings` and
  /// its own routes are spelled `/workers/me/earnings/...`, so the served path
  /// carries both.
  Future<List<LedgerEntry>> ledger({int limit = 50}) async {
    final json = await _client.get('/earnings/workers/me/earnings/ledger', query: {'limit': limit});
    return parseList(pick(json, 'ledger', aliases: ['entries']), LedgerEntry.fromJson);
  }

  Future<List<Json>> payouts() async {
    final json = await _client.get('/earnings/workers/me/payouts');
    return asJsonList(pick(json, 'payouts', aliases: ['settlements']));
  }

  Future<Json> payoutAccount() async {
    final json = await _client.get('/earnings/workers/me/payout-account');
    return asJson(pick(json, 'account', aliases: ['payoutAccount'])) ?? const {};
  }

  Future<void> savePayoutAccount({required String provider, required String accountReference}) =>
      _client.put('/earnings/workers/me/payout-account', body: {
        'provider': provider,
        'accountReference': accountReference,
      });

  // ───────────────────────────────────────────────────────── self, welfare ──

  Future<WorkerProfile> profile() async {
    final json = await _client.get('/workers/me');
    return WorkerProfile.fromJson(json);
  }

  Future<VerificationStatus> verificationStatus() async {
    final json = await _client.get('/workers/me/verification/status');
    return VerificationStatus.fromJson(json);
  }

  Future<void> submitForVerification() => _client.post('/workers/me/verification/submit');

  Future<WorkerStatistics> statistics() async {
    final json = await _client.get('/workers/me/statistics');
    return WorkerStatistics.fromJson(json);
  }

  Future<List<WorkerSkill>> skills() async {
    final json = await _client.get('/workers/me/skills');
    return parseList(pick(json, 'skills'), WorkerSkill.fromJson);
  }

  Future<void> saveSkills(List<({String serviceId, String? level})> skills) =>
      _client.put('/workers/me/skills', body: {
        'skills': skills
            .map((s) => {
                  'serviceId': s.serviceId,
                  if (s.level != null) 'certificationLevel': s.level,
                })
            .toList(),
      });

  Future<List<ServiceArea>> serviceAreas() async {
    final json = await _client.get('/workers/me/service-areas');
    return parseList(pick(json, 'serviceAreas'), ServiceArea.fromJson);
  }

  Future<void> saveServiceAreas(List<ServiceArea> areas) => _client.put(
        '/workers/me/service-areas',
        body: {
          'areas': areas.map((a) => {'serviceId': a.serviceId, 'radiusKm': a.radiusKm}).toList(),
        },
      );

  Future<List<ReviewReceived>> reviews() async {
    final json = await _client.get('/workers/me/reviews');
    return parseList(pick(json, 'reviews'), ReviewReceived.fromJson);
  }

  Future<WelfarePassport> welfare() async {
    final json = await _client.get('/welfare/workers/me');
    return WelfarePassport.fromJson(asJson(pick(json, 'welfare')) ?? const {});
  }

  Future<List<Json>> documents() async {
    final json = await _client.get('/documents/my');
    return asJsonList(pick(json, 'documents'));
  }

  /// Upload a profile photo through the presigned-URL flow and return the URL
  /// the worker record points at. The raw bytes never touch our servers.
  Future<String> uploadProfilePhoto(File file) => _client.uploadFile(file: file, type: 'avatar');

  Future<void> uploadDocument({
    required String type,
    required File file,
    String? extractedText,
  }) async {
    await _client.postMultipart(
      '/documents/upload',
      files: {'file': file.path},
      fields: {
        'type': type,
        if (extractedText != null) 'extractedText': extractedText,
      },
    );
  }

  Future<Json> onboard(Json body) => _client.post('/workers/me/onboarding', body: body);

  Future<WorkerProfile> updateProfile({String? address, int? experienceYears, String? photoUrl}) async {
    final json = await _client.patch('/workers/me', body: {
      if (address != null) 'address': address,
      if (experienceYears != null) 'experienceYears': experienceYears,
      if (photoUrl != null) 'profilePhotoUrl': photoUrl,
    });
    return WorkerProfile.fromJson(json);
  }

  // ───────────────────────────────────────────────────────────────── SOS ──

  /// The button that has to work.
  ///
  /// Position is optional because someone pressing this may not have a fresh
  /// fix; the server falls back to the last known cursor. It always returns a
  /// number to dial.
  Future<SosResult> sos({double? latitude, double? longitude, String? bookingId, String? note}) async {
    final json = await _client.post('/workers/me/sos', body: {
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
      if (bookingId != null) 'bookingId': bookingId,
      if (note != null && note.isNotEmpty) 'note': note,
    });
    return SosResult.fromJson(json);
  }

  Future<List<Json>> sosHistory() async {
    final json = await _client.get('/workers/me/sos');
    return asJsonList(pick(json, 'incidents'));
  }

  // ──────────────────────────────────────────────── blocked customers ──

  Future<List<BlockedCustomer>> blockedCustomers() async {
    final json = await _client.get('/workers/me/blocked-customers');
    return parseList(pick(json, 'blocked'), BlockedCustomer.fromJson);
  }

  Future<void> blockCustomer(String customerId, {String? reason}) => _client.post(
        '/workers/me/blocked-customers',
        body: {'customerId': customerId, if (reason != null && reason.isNotEmpty) 'reason': reason},
      );

  Future<void> unblockCustomer(String customerId) =>
      _client.delete('/workers/me/blocked-customers/$customerId');

  // ──────────────────────────────────────────────────── chat, support ──

  Future<List<Json>> chats() async {
    final json = await _client.get('/chats');
    return asJsonList(pick(json, 'chats'));
  }

  Future<Json> chatThread(String chatId) async {
    final json = await _client.get('/chats/$chatId');
    return asJson(pick(json, 'chat')) ?? const {};
  }

  Future<void> sendChatMessage(String chatId, String text) =>
      _client.post('/chats/$chatId/messages', body: {'text': text});

  Future<List<Json>> supportTickets() async {
    final json = await _client.get('/support/tickets');
    return asJsonList(pick(json, 'tickets'));
  }

  Future<Json> createSupportTicket({
    required String category,
    required String description,
    String? bookingId,
  }) async {
    final json = await _client.post('/support/tickets', body: {
      'category': category,
      'description': description,
      if (bookingId != null) 'bookingId': bookingId,
    });
    return asJson(pick(json, 'ticket')) ?? const {};
  }

  Future<Json> ticketDetail(String ticketId) async {
    final json = await _client.get('/support/tickets/$ticketId');
    return asJson(pick(json, 'ticket')) ?? const {};
  }

  Future<void> addTicketComment(String ticketId, String text) =>
      _client.post('/support/tickets/$ticketId/comments', body: {'text': text});

  Future<void> resolveTicket(String ticketId, String resolution) =>
      _client.post('/support/tickets/$ticketId/resolve', body: {'resolution': resolution});

  Future<List<Json>> statements({int? year, int? month}) async {
    final json = await _client.get('/payments/invoices', query: {
      if (year != null) 'year': year,
      if (month != null) 'month': month,
    });
    return asJsonList(pick(json, 'invoices'));
  }

  // ────────────────────────────────────────────────────────────── training ──

  Future<List<Json>> trainingModules() async {
    final json = await _client.get('/training/modules');
    return asJsonList(pick(json, 'modules'));
  }

  Future<Json> trainingQuiz(String moduleId) async {
    final json = await _client.get('/training/modules/$moduleId/quiz');
    return asJson(pick(json, 'quiz')) ?? const {};
  }

  Future<Json> submitQuiz({
    required String moduleId,
    required List<Json> answers,
    bool retake = false,
  }) async {
    final json = await _client.post('/training/modules/$moduleId/submit', body: {
      'answers': answers,
      'retake': retake,
    });
    return asJson(pick(json, 'result')) ?? const {};
  }
}
