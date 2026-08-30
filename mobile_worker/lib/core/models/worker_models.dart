import 'package:gid_core/gid_core.dart';

/// The worker app's own nouns.
///
/// The shared models in `gid_core` describe things both apps see — a booking, a
/// service, a notification. These describe things only a worker has: an offer
/// with a deadline, a duty status, a payout split, a shift.

// ─────────────────────────────────────────────────────────── the offer ──

/// A job being offered to this worker, with the server's deadline on it.
///
/// [expiresAt] is a server timestamp and is the only thing the countdown is
/// rendered against. Never start a local `Duration(seconds: 45)` on receipt:
/// that is wrong by the network latency plus whatever this phone's clock says,
/// and being wrong here costs the worker a job. See `ServerClock`.
class JobOffer {
  const JobOffer({
    required this.offerId,
    required this.bookingId,
    required this.orderId,
    required this.serviceId,
    required this.serviceName,
    required this.category,
    required this.scheduledAt,
    required this.durationMinutes,
    required this.isEmergency,
    required this.area,
    required this.distanceKm,
    required this.etaMinutes,
    required this.payout,
    required this.customerTotal,
    required this.expiresAt,
    required this.serverNow,
    required this.attempt,
  });

  final String offerId;
  final String bookingId;
  final String? orderId;
  final String serviceId;
  final String serviceName;
  final String? category;
  final DateTime? scheduledAt;
  final int? durationMinutes;
  final bool isEmergency;

  /// Area name only. The exact address is disclosed on acceptance, and the
  /// backend deliberately does not send it before that.
  final String? area;

  final double? distanceKm;
  final int? etaMinutes;

  /// What the worker takes home. NOT the customer's price.
  final double payout;

  /// The customer's inclusive total, so the split is checkable rather than
  /// asserted.
  final double customerTotal;

  final DateTime expiresAt;

  /// The server's clock when this was sent. The difference between it and the
  /// device clock at receipt is the skew every countdown is corrected by.
  final DateTime serverNow;

  final int attempt;

  factory JobOffer.fromJson(Json json) {
    final service = asJson(pick(json, 'service')) ?? const {};
    return JobOffer(
      offerId: asString(pick(json, 'offerId')),
      bookingId: asString(pick(json, 'bookingId')),
      orderId: asStringOrNull(pick(json, 'orderId')),
      serviceId: asString(pick(service, 'id')),
      serviceName: asString(pick(service, 'name')),
      category: asStringOrNull(pick(service, 'category')),
      scheduledAt: asDateOrNull(pick(json, 'scheduledAt')),
      durationMinutes: asIntOrNull(pick(json, 'durationMinutes')),
      isEmergency: asBool(pick(json, 'isEmergency')),
      area: asStringOrNull(pick(json, 'area')),
      distanceKm: asDoubleOrNull(pick(json, 'distanceKm')),
      etaMinutes: asIntOrNull(pick(json, 'etaMinutes')),
      payout: asDouble(pick(json, 'payout')),
      customerTotal: asDouble(pick(json, 'customerTotal')),
      expiresAt: asDateOrNull(pick(json, 'expiresAt')) ?? DateTime.now(),
      serverNow: asDateOrNull(pick(json, 'serverNow')) ?? DateTime.now(),
      attempt: asInt(pick(json, 'attempt'), fallback: 1),
    );
  }

  /// Two deliveries of the same offer — socket and push — are one offer.
  @override
  bool operator ==(Object other) => other is JobOffer && other.offerId == offerId;

  @override
  int get hashCode => offerId.hashCode;
}

/// Why a worker turned an offer down. Four buttons, not free text: matching has
/// to be able to tell a radius problem from a skills problem.
enum DeclineReason {
  tooFar('too_far'),
  busy('busy'),
  notMyTrade('not_my_trade'),
  unsafe('unsafe'),
  rateTooLow('rate_too_low'),
  other('other');

  const DeclineReason(this.wire);
  final String wire;
}

/// Why an offer vanished from the screen.
enum RevokeReason { timeout, reassigned, cancelled, taken, unknown }

class JobRevoked {
  const JobRevoked({required this.offerId, required this.bookingId, required this.reason});
  final String offerId;
  final String bookingId;
  final RevokeReason reason;

  factory JobRevoked.fromJson(Json json) => JobRevoked(
        offerId: asString(pick(json, 'offerId')),
        bookingId: asString(pick(json, 'bookingId')),
        reason: switch (asString(pick(json, 'reason'))) {
          'timeout' => RevokeReason.timeout,
          'reassigned' => RevokeReason.reassigned,
          'cancelled' => RevokeReason.cancelled,
          'taken' => RevokeReason.taken,
          _ => RevokeReason.unknown,
        },
      );
}

// ──────────────────────────────────────────────────────────── the shift ──

/// available / busy / offline, as the backend spells them.
enum DutyStatus {
  available('available'),
  busy('busy'),
  offline('offline');

  const DutyStatus(this.wire);
  final String wire;

  static DutyStatus parse(String? value) => switch (value) {
        'available' => DutyStatus.available,
        'busy' => DutyStatus.busy,
        _ => DutyStatus.offline,
      };

  bool get isOnDuty => this != DutyStatus.offline;
}

class ScheduleEntry {
  const ScheduleEntry({required this.weekday, required this.startsAt, required this.endsAt});

  /// 0 = Sunday, matching Postgres `extract(dow …)`.
  final int weekday;
  final String startsAt; // "08:00"
  final String endsAt; // "18:00"

  factory ScheduleEntry.fromJson(Json json) => ScheduleEntry(
        weekday: asInt(pick(json, 'weekday')),
        startsAt: asString(pick(json, 'startsAt')),
        endsAt: asString(pick(json, 'endsAt')),
      );

  Json toJson() => {'weekday': weekday, 'startsAt': startsAt, 'endsAt': endsAt};
}

class TimeOff {
  const TimeOff({required this.id, required this.startsAt, required this.endsAt, this.reason});
  final String id;
  final DateTime startsAt;
  final DateTime endsAt;
  final String? reason;

  factory TimeOff.fromJson(Json json) => TimeOff(
        id: asString(pick(json, 'id')),
        startsAt: asDateOrNull(pick(json, 'startsAt')) ?? DateTime.now(),
        endsAt: asDateOrNull(pick(json, 'endsAt')) ?? DateTime.now(),
        reason: asStringOrNull(pick(json, 'reason')),
      );
}

class OfferPreferences {
  const OfferPreferences({
    this.maxTravelKm,
    this.acceptEmergency = true,
    this.autoOfflineAtShiftEnd = true,
  });

  final double? maxTravelKm;
  final bool acceptEmergency;
  final bool autoOfflineAtShiftEnd;

  factory OfferPreferences.fromJson(Json json) => OfferPreferences(
        maxTravelKm: asDoubleOrNull(pick(json, 'maxTravelKm')),
        acceptEmergency: asBool(pick(json, 'acceptEmergency'), fallback: true),
        autoOfflineAtShiftEnd: asBool(pick(json, 'autoOfflineAtShiftEnd'), fallback: true),
      );
}

// ────────────────────────────────────────────────────────────── the job ──

/// The worker's view of a booking they hold.
///
/// Distinct from the shared `Booking`: it carries the door — the contact name
/// and phone from the ORDER, not the account — and the sibling trades arriving
/// at the same address.
class WorkerJob {
  const WorkerJob({
    required this.id,
    required this.status,
    required this.serviceName,
    required this.category,
    required this.address,
    required this.latitude,
    required this.longitude,
    required this.scheduledAt,
    required this.durationMinutes,
    required this.isEmergency,
    required this.description,
    required this.contactName,
    required this.contactPhone,
    required this.payout,
    required this.orderId,
    required this.arrivedAt,
    required this.workStartedAt,
  });

  final String id;
  final String status;
  final String serviceName;
  final String? category;
  final String address;
  final double? latitude;
  final double? longitude;
  final DateTime? scheduledAt;
  final int? durationMinutes;
  final bool isEmergency;
  final String? description;
  final String? contactName;
  final String? contactPhone;
  final double? payout;
  final String? orderId;
  final DateTime? arrivedAt;
  final DateTime? workStartedAt;

  /// The single next thing to do, which is what the sticky bottom action shows.
  JobStage get stage => switch (status) {
        'assigned' => JobStage.offered,
        'accepted' => JobStage.accepted,
        'en_route' => JobStage.enRoute,
        'arrived' => JobStage.arrived,
        'started' => JobStage.inProgress,
        'completed' => JobStage.done,
        'no_show' => JobStage.done,
        _ => JobStage.done,
      };

  factory WorkerJob.fromJson(Json json) => WorkerJob(
        id: asString(pick(json, 'id', aliases: ['bookingId'])),
        status: asString(pick(json, 'status')),
        serviceName: asString(pick(json, 'serviceName', aliases: ['service_name', 'service'])),
        category: asStringOrNull(pick(json, 'category')),
        address: asString(pick(json, 'address')),
        latitude: asDoubleOrNull(pick(json, 'latitude', aliases: ['customerLat'])),
        longitude: asDoubleOrNull(pick(json, 'longitude', aliases: ['customerLng'])),
        scheduledAt: asDateOrNull(pick(json, 'scheduledAt')),
        durationMinutes: asIntOrNull(pick(json, 'durationMinutes')),
        isEmergency: asBool(pick(json, 'isEmergency')),
        description: asStringOrNull(pick(json, 'description')),
        contactName: asStringOrNull(pick(json, 'contactName', aliases: ['customerName'])),
        contactPhone: asStringOrNull(pick(json, 'contactPhone', aliases: ['customerPhone'])),
        payout: asDoubleOrNull(pick(json, 'payout')),
        orderId: asStringOrNull(pick(json, 'orderId')),
        arrivedAt: asDateOrNull(pick(json, 'arrivedAt')),
        workStartedAt: asDateOrNull(pick(json, 'workStartedAt')),
      );
}

/// The states the active-job screen changes its chrome for.
enum JobStage { offered, accepted, enRoute, arrived, inProgress, done }

class OrderSibling {
  const OrderSibling({
    required this.bookingId,
    required this.serviceName,
    required this.status,
    required this.scheduledAt,
    required this.workerFirstName,
  });

  final String bookingId;
  final String serviceName;
  final String status;
  final DateTime? scheduledAt;

  /// First name only. Enough to say "Ravi is doing the wiring"; not a directory.
  final String? workerFirstName;

  factory OrderSibling.fromJson(Json json) => OrderSibling(
        bookingId: asString(pick(json, 'bookingId')),
        serviceName: asString(pick(json, 'serviceName')),
        status: asString(pick(json, 'status')),
        scheduledAt: asDateOrNull(pick(json, 'scheduledAt')),
        workerFirstName: asStringOrNull(pick(json, 'workerFirstName')),
      );
}

// ──────────────────────────────────────────────────────────── the money ──

/// One line of the split, as the breakdown screen reads it.
///
/// Negative amounts are deductions. Each carries where it went, because on a
/// cooperative platform "5% platform fee" without "to GET IT DONE" is exactly
/// the sort of line that makes a worker distrust the whole figure.
class PayoutLine {
  const PayoutLine({required this.key, required this.label, required this.amount, required this.destination});
  final String key;
  final String label;
  final double amount;
  final String destination;

  bool get isDeduction => amount < 0;

  factory PayoutLine.fromJson(Json json) => PayoutLine(
        key: asString(pick(json, 'key')),
        label: asString(pick(json, 'label')),
        amount: asDouble(pick(json, 'amount')),
        destination: asString(pick(json, 'destination')),
      );
}

class PayoutPreview {
  const PayoutPreview({
    required this.bookingId,
    required this.lines,
    required this.payout,
    required this.customerTotal,
  });

  final String bookingId;
  final List<PayoutLine> lines;
  final double payout;
  final double customerTotal;

  factory PayoutPreview.fromJson(Json json) => PayoutPreview(
        bookingId: asString(pick(json, 'bookingId')),
        lines: parseList(pick(json, 'lines'), PayoutLine.fromJson),
        payout: asDouble(pick(json, 'payout')),
        customerTotal: asDouble(pick(json, 'customerTotal')),
      );
}

class EarningsSummary {
  const EarningsSummary({
    required this.today,
    required this.week,
    required this.month,
    required this.pending,
    required this.jobsToday,
    required this.jobsWeek,
    required this.dailyBars,
  });

  final double today;
  final double week;
  final double month;

  /// Earned but not yet in a settlement batch. Labelled honestly in the UI:
  /// settlements are generated by admins on a schedule, and the app must never
  /// imply a worker can pull money on demand.
  final double pending;

  final int jobsToday;
  final int jobsWeek;

  /// Seven days, oldest first, for the strip on Today and the chart on Earnings.
  final List<DayEarning> dailyBars;

  factory EarningsSummary.fromJson(Json json) => EarningsSummary(
        today: asDouble(pick(json, 'today')),
        week: asDouble(pick(json, 'week', aliases: ['thisWeek'])),
        month: asDouble(pick(json, 'month', aliases: ['thisMonth'])),
        pending: asDouble(pick(json, 'pending', aliases: ['pendingPayout'])),
        jobsToday: asInt(pick(json, 'jobsToday')),
        jobsWeek: asInt(pick(json, 'jobsWeek', aliases: ['jobsThisWeek'])),
        dailyBars: parseList(pick(json, 'daily', aliases: ['dailyBars', 'byDay']), DayEarning.fromJson),
      );
}

class DayEarning {
  const DayEarning({required this.date, required this.amount, required this.jobs});
  final DateTime date;
  final double amount;
  final int jobs;

  factory DayEarning.fromJson(Json json) => DayEarning(
        date: asDateOrNull(pick(json, 'date', aliases: ['day'])) ?? DateTime.now(),
        amount: asDouble(pick(json, 'amount', aliases: ['total', 'earnings'])),
        jobs: asInt(pick(json, 'jobs', aliases: ['count'])),
      );
}

class LedgerEntry {
  const LedgerEntry({
    required this.id,
    required this.bookingId,
    required this.entryType,
    required this.amount,
    required this.reference,
    required this.createdAt,
  });

  final String id;
  final String? bookingId;
  final String entryType;
  final double amount;
  final String? reference;
  final DateTime createdAt;

  factory LedgerEntry.fromJson(Json json) => LedgerEntry(
        id: asString(pick(json, 'id')),
        bookingId: asStringOrNull(pick(json, 'bookingId')),
        entryType: asString(pick(json, 'entryType', aliases: ['type'])),
        amount: asDouble(pick(json, 'amount')),
        reference: asStringOrNull(pick(json, 'reference')),
        createdAt: asDateOrNull(pick(json, 'createdAt')) ?? DateTime.now(),
      );
}

// ─────────────────────────────────────────────────────── self and status ──

class WorkerProfile {
  const WorkerProfile({
    required this.id,
    required this.name,
    required this.photoUrl,
    required this.rating,
    required this.verificationStatus,
    required this.currentStatus,
    required this.experienceYears,
    required this.cooperativeName,
  });

  final String id;
  final String name;
  final String? photoUrl;
  final double rating;
  final String verificationStatus;
  final DutyStatus currentStatus;
  final int experienceYears;
  final String? cooperativeName;

  bool get isVerified => verificationStatus == 'verified';

  factory WorkerProfile.fromJson(Json json) {
    final worker = asJson(pick(json, 'worker')) ?? json;
    return WorkerProfile(
      id: asString(pick(worker, 'id')),
      name: asString(pick(worker, 'name', aliases: ['userName'])),
      photoUrl: asStringOrNull(pick(worker, 'profilePhotoUrl')),
      rating: asDouble(pick(worker, 'rating')),
      verificationStatus: asString(pick(worker, 'verificationStatus'), fallback: 'pending'),
      currentStatus: DutyStatus.parse(asStringOrNull(pick(worker, 'currentStatus'))),
      experienceYears: asInt(pick(worker, 'experienceYears')),
      cooperativeName: asStringOrNull(pick(worker, 'cooperativeName')),
    );
  }
}

/// The onboarding funnel, as a checklist rather than a spinner.
///
/// An unverified worker must always be shown *what is left*, never an empty job
/// feed — the difference between someone who finishes onboarding and someone
/// who deletes the app.
class VerificationStatus {
  const VerificationStatus({
    required this.status,
    required this.steps,
    required this.rejectionReason,
  });

  final String status;
  final List<VerificationStep> steps;
  final String? rejectionReason;

  bool get isVerified => status == 'verified';
  bool get isRejected => status == 'rejected';

  factory VerificationStatus.fromJson(Json json) => VerificationStatus(
        status: asString(pick(json, 'status'), fallback: 'pending'),
        steps: parseList(pick(json, 'steps', aliases: ['checks']), VerificationStep.fromJson),
        rejectionReason: asStringOrNull(pick(json, 'rejectionReason', aliases: ['reason'])),
      );
}

class VerificationStep {
  const VerificationStep({required this.key, required this.label, required this.done, this.detail});
  final String key;
  final String label;
  final bool done;
  final String? detail;

  factory VerificationStep.fromJson(Json json) => VerificationStep(
        key: asString(pick(json, 'key')),
        label: asString(pick(json, 'label', aliases: ['title'])),
        done: asBool(pick(json, 'done', aliases: ['ok', 'complete', 'passed'])),
        detail: asStringOrNull(pick(json, 'detail', aliases: ['hint'])),
      );
}

class WorkerStatistics {
  const WorkerStatistics({
    required this.windowDays,
    required this.completedJobs,
    required this.totalJobs,
    required this.completionRate,
    required this.acceptanceRate,
    required this.medianResponseSeconds,
    required this.rating,
    required this.acceptanceRateAffects,
  });

  final int windowDays;
  final int completedJobs;
  final int totalJobs;
  final double? completionRate;

  /// Visible because it feeds matching. A number that changes which jobs a
  /// worker is offered, and which they cannot see, is not acceptable.
  final double? acceptanceRate;

  final int? medianResponseSeconds;
  final double? rating;

  /// The backend's own words about what the rate does, shown verbatim rather
  /// than paraphrased in the client where it could drift from the truth.
  final String acceptanceRateAffects;

  factory WorkerStatistics.fromJson(Json json) {
    final jobs = asJson(pick(json, 'jobs')) ?? const {};
    final offers = asJson(pick(json, 'offers')) ?? const {};
    return WorkerStatistics(
      windowDays: asInt(pick(json, 'windowDays'), fallback: 30),
      completedJobs: asInt(pick(jobs, 'completed')),
      totalJobs: asInt(pick(jobs, 'total')),
      completionRate: asDoubleOrNull(pick(jobs, 'completionRate')),
      acceptanceRate: asDoubleOrNull(pick(offers, 'acceptanceRate')),
      medianResponseSeconds: asIntOrNull(pick(offers, 'medianResponseSeconds')),
      rating: asDoubleOrNull(pick(json, 'rating')),
      acceptanceRateAffects: asString(pick(json, 'acceptanceRateAffects')),
    );
  }
}

class WorkerSkill {
  const WorkerSkill({
    required this.serviceId,
    required this.serviceName,
    required this.category,
    required this.certificationLevel,
    required this.verified,
  });

  final String serviceId;
  final String serviceName;
  final String? category;
  final String? certificationLevel;
  final bool verified;

  factory WorkerSkill.fromJson(Json json) => WorkerSkill(
        serviceId: asString(pick(json, 'serviceId', aliases: ['service_id'])),
        serviceName: asString(pick(json, 'serviceName', aliases: ['service_name'])),
        category: asStringOrNull(pick(json, 'category')),
        certificationLevel: asStringOrNull(pick(json, 'certificationLevel', aliases: ['certification_level'])),
        verified: asBool(pick(json, 'hasActiveCertification', aliases: ['has_active_certification', 'verified'])),
      );
}

class ServiceArea {
  const ServiceArea({required this.serviceId, required this.serviceName, required this.radiusKm});
  final String serviceId;
  final String serviceName;
  final double radiusKm;

  factory ServiceArea.fromJson(Json json) => ServiceArea(
        serviceId: asString(pick(json, 'serviceId', aliases: ['service_id'])),
        serviceName: asString(pick(json, 'serviceName', aliases: ['service_name'])),
        radiusKm: asDouble(pick(json, 'radiusKm', aliases: ['radius_km']), fallback: 15),
      );
}

class SosResult {
  const SosResult({required this.incidentId, required this.callNumber});
  final String incidentId;

  /// The cooperative's own number where there is one, `112` otherwise. Never
  /// empty: this screen must always give the worker something to press.
  final String callNumber;

  factory SosResult.fromJson(Json json) => SosResult(
        incidentId: asString(pick(asJson(pick(json, 'incident')) ?? const {}, 'id')),
        callNumber: asString(pick(json, 'callNumber'), fallback: '112'),
      );
}

class WorkClock {
  const WorkClock({
    required this.workStartedAt,
    required this.workFinishedAt,
    required this.purchasedMinutes,
    required this.elapsedMinutes,
    required this.serverNow,
    required this.promptExtensionAtPercent,
  });

  final DateTime? workStartedAt;
  final DateTime? workFinishedAt;
  final int? purchasedMinutes;
  final int elapsedMinutes;
  final DateTime serverNow;

  /// Served rather than hardcoded, so the "need more time?" threshold can be
  /// tuned without an app release.
  final int promptExtensionAtPercent;

  double? get fractionUsed =>
      purchasedMinutes == null || purchasedMinutes == 0 ? null : elapsedMinutes / purchasedMinutes!;

  bool get shouldPromptExtension =>
      (fractionUsed ?? 0) >= promptExtensionAtPercent / 100 && workFinishedAt == null;

  factory WorkClock.fromJson(Json json) => WorkClock(
        workStartedAt: asDateOrNull(pick(json, 'workStartedAt')),
        workFinishedAt: asDateOrNull(pick(json, 'workFinishedAt')),
        purchasedMinutes: asIntOrNull(pick(json, 'purchasedMinutes')),
        elapsedMinutes: asInt(pick(json, 'elapsedMinutes')),
        serverNow: asDateOrNull(pick(json, 'serverNow')) ?? DateTime.now(),
        promptExtensionAtPercent: asInt(pick(json, 'promptExtensionAtPercent'), fallback: 85),
      );
}

class TimeExtension {
  const TimeExtension({
    required this.id,
    required this.minutes,
    required this.amount,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final int minutes;
  final double amount;
  final String status;
  final DateTime createdAt;

  bool get isPending => status == 'pending';

  factory TimeExtension.fromJson(Json json) => TimeExtension(
        id: asString(pick(json, 'id')),
        minutes: asInt(pick(json, 'minutes')),
        amount: asDouble(pick(json, 'amount')),
        status: asString(pick(json, 'status'), fallback: 'pending'),
        createdAt: asDateOrNull(pick(json, 'createdAt')) ?? DateTime.now(),
      );
}

class ReviewReceived {
  const ReviewReceived({
    required this.id,
    required this.rating,
    required this.comment,
    required this.serviceName,
    required this.customerFirstName,
    required this.createdAt,
  });

  final String id;
  final int rating;
  final String? comment;
  final String serviceName;
  final String? customerFirstName;
  final DateTime createdAt;

  factory ReviewReceived.fromJson(Json json) => ReviewReceived(
        id: asString(pick(json, 'id')),
        rating: asInt(pick(json, 'rating')),
        comment: asStringOrNull(pick(json, 'comment')),
        serviceName: asString(pick(json, 'serviceName')),
        customerFirstName: asStringOrNull(pick(json, 'customerFirstName')),
        createdAt: asDateOrNull(pick(json, 'createdAt')) ?? DateTime.now(),
      );
}

class NavigationAid {
  const NavigationAid({
    required this.distanceKm,
    required this.etaMinutes,
    required this.navigationUrl,
    required this.embedMapUrl,
  });

  final double? distanceKm;
  final int? etaMinutes;

  /// `google.navigation:q=lat,lng`. Handed to Google Maps rather than
  /// reimplemented: it has the traffic data and the worker already knows it.
  final String? navigationUrl;

  final String? embedMapUrl;

  factory NavigationAid.fromJson(Json json) => NavigationAid(
        distanceKm: asDoubleOrNull(pick(json, 'distanceKm')),
        etaMinutes: asIntOrNull(pick(json, 'etaMinutes')),
        navigationUrl: asStringOrNull(pick(json, 'navigationUrl')),
        embedMapUrl: asStringOrNull(pick(json, 'embedMapUrl')),
      );
}

// ─────────────────────────────────────────────────── welfare passport ──

class WelfarePassport {
  const WelfarePassport({this.summary, this.training, this.insurance, this.payoutAccount});

  final WelfareSummary? summary;
  final List<TrainingRecord>? training;
  final List<InsuranceRecord>? insurance;
  final PayoutAccountInfo? payoutAccount;

  factory WelfarePassport.fromJson(Json json) => WelfarePassport(
        summary: asJson(pick(json, 'summary')) != null
            ? WelfareSummary.fromJson(asJson(pick(json, 'summary'))!)
            : null,
        training: parseList(pick(json, 'training'), TrainingRecord.fromJson),
        insurance: parseList(pick(json, 'insurance'), InsuranceRecord.fromJson),
        payoutAccount: asJson(pick(json, 'payoutAccount')) != null
            ? PayoutAccountInfo.fromJson(asJson(pick(json, 'payoutAccount'))!)
            : null,
      );
}

class WelfareSummary {
  const WelfareSummary({
    required this.insuranceStatus,
    required this.trainingStatus,
    this.notes,
  });

  final String insuranceStatus;
  final String trainingStatus;
  final String? notes;

  factory WelfareSummary.fromJson(Json json) => WelfareSummary(
        insuranceStatus: asStringOrNull(pick(json, 'insuranceStatus')) ?? 'unknown',
        trainingStatus: asStringOrNull(pick(json, 'trainingStatus')) ?? 'unknown',
        notes: asStringOrNull(pick(json, 'notes')),
      );
}

class TrainingRecord {
  const TrainingRecord({
    required this.id,
    required this.courseName,
    this.provider,
    this.completedOn,
    this.expiresOn,
    required this.status,
  });

  final String id;
  final String courseName;
  final String? provider;
  final DateTime? completedOn;
  final DateTime? expiresOn;
  final String status;

  factory TrainingRecord.fromJson(Json json) => TrainingRecord(
        id: asString(pick(json, 'id')),
        courseName: asString(pick(json, 'courseName')),
        provider: asStringOrNull(pick(json, 'provider')),
        completedOn: asDateOrNull(pick(json, 'completedOn')),
        expiresOn: asDateOrNull(pick(json, 'expiresOn')),
        status: asStringOrNull(pick(json, 'status')) ?? 'unknown',
      );
}

class InsuranceRecord {
  const InsuranceRecord({
    required this.id,
    required this.provider,
    required this.policyReference,
    required this.coverageAmount,
    this.startsOn,
    this.expiresOn,
    required this.status,
  });

  final String id;
  final String provider;
  final String policyReference;
  final double coverageAmount;
  final DateTime? startsOn;
  final DateTime? expiresOn;
  final String status;

  factory InsuranceRecord.fromJson(Json json) => InsuranceRecord(
        id: asString(pick(json, 'id')),
        provider: asString(pick(json, 'provider')),
        policyReference: asString(pick(json, 'policyReference')),
        coverageAmount: asDouble(pick(json, 'coverageAmount')),
        startsOn: asDateOrNull(pick(json, 'startsOn')),
        expiresOn: asDateOrNull(pick(json, 'expiresOn')),
        status: asStringOrNull(pick(json, 'status')) ?? 'unknown',
      );
}

class PayoutAccountInfo {
  const PayoutAccountInfo({required this.provider, required this.accountReference, this.verifiedAt});

  final String provider;
  final String accountReference;
  final DateTime? verifiedAt;

  factory PayoutAccountInfo.fromJson(Json json) => PayoutAccountInfo(
        provider: asString(pick(json, 'provider')),
        accountReference: asString(pick(json, 'accountReference')),
        verifiedAt: asDateOrNull(pick(json, 'verifiedAt')),
      );
}

// ─────────────────────────────────────────────── blocked customers ──

class BlockedCustomer {
  const BlockedCustomer({required this.customerId, required this.name, this.reason, required this.createdAt});

  final String customerId;
  final String name;
  final String? reason;
  final DateTime createdAt;

  factory BlockedCustomer.fromJson(Json json) => BlockedCustomer(
        customerId: asString(pick(json, 'customerId')),
        name: asStringOrNull(pick(json, 'name')) ?? 'Unknown',
        reason: asStringOrNull(pick(json, 'reason')),
        createdAt: asDateOrNull(pick(json, 'createdAt')) ?? DateTime.now(),
      );
}
