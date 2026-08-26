import '../network/json.dart';

/// Domain models.
///
/// Written from probed responses, not from the swagger summary — several
/// endpoints return field names the spec does not mention. Every model reads
/// through the tolerant helpers in json.dart, so an endpoint that returns
/// `base_price: "299.00"` and one that returns `basePrice: 299` both parse.

// ─────────────────────────────────────────────────────────────── user ──

class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    required this.role,
    this.phone,
    this.email,
    this.language = 'en',
    this.status = 'active',
    this.avatarUrl,
    this.displayName,
  });

  final String id;
  final String name;
  final String role;
  final String? phone;
  final String? email;
  final String language;
  final String status;
  final String? avatarUrl;
  final String? displayName;

  bool get isCustomer => role == 'customer' || role == 'institutional_customer';
  bool get isWorker => role == 'worker';
  String get shortName => name.trim().split(RegExp(r'\s+')).first;

  /// One or two letters for an avatar with no photo behind it.
  ///
  /// Empty rather than a placeholder glyph-in-text when there is no usable
  /// name, so the caller can fall back to an icon instead of drawing "?".
  String get initials {
    final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (words.isEmpty) return '';
    if (words.length == 1) return words.first.substring(0, 1).toUpperCase();
    return (words.first.substring(0, 1) + words.last.substring(0, 1)).toUpperCase();
  }

  /// Handles both `/auth/me` (camelCase) and `/users/me` (snake_case), which
  /// return the same resource in two different shapes.
  factory AppUser.fromJson(Json json) => AppUser(
        id: asString(pick(json, 'id')),
        name: asString(pick(json, 'name')),
        role: asString(pick(json, 'role'), fallback: 'customer'),
        phone: asStringOrNull(pick(json, 'phone')),
        email: asStringOrNull(pick(json, 'email')),
        language: asString(
          pick(json, 'preferredLanguage') ?? pick(json, 'language'),
          fallback: 'en',
        ),
        status: asString(pick(json, 'status'), fallback: 'active'),
        avatarUrl: asStringOrNull(pick(json, 'avatarUrl')),
        displayName: asStringOrNull(pick(json, 'displayName')),
      );
}

class AuthSession {
  const AuthSession({required this.accessToken, required this.refreshToken, required this.user});

  final String accessToken;
  final String refreshToken;
  final AppUser user;

  factory AuthSession.fromJson(Json json) => AuthSession(
        accessToken: asString(pick(json, 'accessToken')),
        refreshToken: asString(pick(json, 'refreshToken')),
        user: AppUser.fromJson(asJson(pick(json, 'user')) ?? const {}),
      );
}

// ──────────────────────────────────────────────────────────── service ──

class Service {
  const Service({
    required this.id,
    required this.name,
    required this.category,
    required this.basePrice,
    this.description,
    this.emergencySupported = false,
    this.availableWorkers,
    this.rating,
    this.reviewCount,
    this.distanceKm,
    this.imageUrl,
    this.animationUrl,
    this.categoryImageUrl,
    this.categoryAnimationUrl,
    this.categoryAccentColor,
    this.listPrice,
  });

  final String id;
  final String name;
  final String category;

  /// `/services` sends a number; `/services/discovery/*` sends `"299.00"`.
  final double basePrice;

  final String? description;
  final bool emergencySupported;

  /// Only present on discovery results.
  final int? availableWorkers;
  final double? rating;
  final int? reviewCount;
  final double? distanceKm;

  // ── Artwork ───────────────────────────────────────────────────────────────
  // Served by the backend so a new service arrives with its own look instead
  // of falling back to a glyph until the app is rebuilt.

  /// Raster artwork for this specific service.
  final String? imageUrl;

  /// Lottie JSON for this specific service.
  final String? animationUrl;

  /// Artwork for the service's category, used when the service has none.
  final String? categoryImageUrl;
  final String? categoryAnimationUrl;

  /// Hex accent (`#3B63F5`) from the category, if it defines one.
  final String? categoryAccentColor;

  /// The "was" price a promotion is struck through against.
  ///
  /// Null is the normal case, and the card then shows one price and claims no
  /// discount. See [hasDiscount] — a list price equal to or below the charge is
  /// treated as no promotion at all rather than rendered as a saving of zero.
  final double? listPrice;

  bool get hasDiscount => listPrice != null && listPrice! > basePrice;

  /// Whole-percent saving, for the badge. Null when there is no promotion.
  int? get discountPercent =>
      hasDiscount ? (100 - (basePrice / listPrice! * 100)).round() : null;

  /// The best artwork available, most specific first. Null means the client
  /// falls back to its built-in glyph.
  String? get artworkImage => imageUrl ?? categoryImageUrl;
  String? get artworkAnimation => animationUrl ?? categoryAnimationUrl;

  bool get hasWorkers => (availableWorkers ?? 1) > 0;

  factory Service.fromJson(Json json) => Service(
        id: asString(pick(json, 'id')),
        name: asString(pick(json, 'name')),
        category: asString(pick(json, 'category'), fallback: 'Services'),
        basePrice: asDouble(pick(json, 'basePrice')),
        description: asStringOrNull(pick(json, 'description')),
        emergencySupported: asBool(pick(json, 'emergencySupported')),
        availableWorkers: asIntOrNull(pick(json, 'availableWorkers')),
        // `/services` sends ratingAverage/ratingCount aggregated from real
        // reviews; `/services/discovery/*` sends avgRating/reviewCount.
        rating: asDoubleOrNull(
          pick(json, 'ratingAverage', aliases: ['avgRating', 'rating']),
        ),
        reviewCount: asIntOrNull(
          pick(json, 'ratingCount', aliases: ['reviewCount']),
        ),
        distanceKm: asDoubleOrNull(
          pick(json, 'distanceKm', aliases: ['min_distance_km', 'minDistanceKm']),
        ),
        imageUrl: asStringOrNull(pick(json, 'imageUrl')),
        animationUrl: asStringOrNull(pick(json, 'animationUrl')),
        categoryImageUrl: asStringOrNull(pick(json, 'categoryImageUrl')),
        categoryAnimationUrl: asStringOrNull(pick(json, 'categoryAnimationUrl')),
        categoryAccentColor: asStringOrNull(pick(json, 'categoryAccentColor')),
        listPrice: asDoubleOrNull(pick(json, 'listPrice')),
      );
}

/// One thing that happens while the job is being done.
class ServiceStep {
  const ServiceStep({required this.title, this.description = '', this.imageUrl});

  final String title;
  final String description;
  final String? imageUrl;

  factory ServiceStep.fromJson(Json json) => ServiceStep(
        title: asString(pick(json, 'title')),
        description: asString(pick(json, 'description')),
        imageUrl: asStringOrNull(pick(json, 'imageUrl')),
      );
}

class ServiceFaq {
  const ServiceFaq({required this.question, required this.answer});

  final String question;
  final String answer;

  factory ServiceFaq.fromJson(Json json) => ServiceFaq(
        question: asString(pick(json, 'question')),
        answer: asString(pick(json, 'answer')),
      );
}

/// A service plus the editorial content its own page needs.
///
/// Comes from `GET /services/:id`; the catalogue endpoint does not carry these
/// lists, because sending every service's FAQs to render a grid of cards is
/// several kilobytes nobody reads.
class ServiceDetail {
  const ServiceDetail({
    required this.service,
    this.heroImageUrl,
    this.includes = const [],
    this.excludes = const [],
    this.steps = const [],
    this.faqs = const [],
  });

  final Service service;
  final String? heroImageUrl;

  final List<String> includes;

  /// What the service is NOT. Empty is legitimate, and the section is hidden
  /// rather than shown empty — but an operator leaving it blank is the usual
  /// cause of a doorstep argument.
  final List<String> excludes;

  final List<ServiceStep> steps;
  final List<ServiceFaq> faqs;

  bool get hasContent =>
      includes.isNotEmpty || excludes.isNotEmpty || steps.isNotEmpty || faqs.isNotEmpty;

  factory ServiceDetail.fromJson(Json json) => ServiceDetail(
        service: Service.fromJson(json),
        heroImageUrl: asStringOrNull(pick(json, 'heroImageUrl')),
        includes: asStringList(pick(json, 'includes')),
        excludes: asStringList(pick(json, 'excludes')),
        steps: parseList(pick(json, 'steps'), ServiceStep.fromJson),
        faqs: parseList(pick(json, 'faqs'), ServiceFaq.fromJson),
      );
}

class ServiceCategory {
  const ServiceCategory({
    required this.name,
    required this.services,
    this.imageUrl,
    this.animationUrl,
    this.accentColor,
  });

  final String name;
  final List<Service> services;

  /// Category-level artwork, so a category tile renders without having to pick
  /// a representative service.
  final String? imageUrl;
  final String? animationUrl;

  /// Hex accent (`#3B63F5`) set by the backend.
  final String? accentColor;

  factory ServiceCategory.fromJson(Json json) => ServiceCategory(
        name: asString(pick(json, 'category'), fallback: 'Services'),
        services: parseList(pick(json, 'services'), Service.fromJson),
        imageUrl: asStringOrNull(pick(json, 'imageUrl')),
        animationUrl: asStringOrNull(pick(json, 'animationUrl')),
        accentColor: asStringOrNull(pick(json, 'accentColor')),
      );
}

// ──────────────────────────────────────────────────────────── pricing ──

/// Fare breakdown from POST /pricing/estimate.
///
/// Shown in full rather than as a single total: the split is the product's
/// transparency story, and a customer who can see the travel and tax lines
/// disputes the bill far less often.
class FareEstimate {
  const FareEstimate({
    required this.baseService,
    required this.travel,
    required this.emergency,
    required this.surge,
    required this.subtotal,
    required this.tax,
    required this.total,
    this.taxRate = 0.18,
    this.currency = 'INR',
  });

  final double baseService;
  final double travel;
  final double emergency;
  final double surge;
  final double subtotal;
  final double tax;
  final double total;
  final double taxRate;
  final String currency;

  factory FareEstimate.fromJson(Json json) {
    // The route wraps it: { estimate: {...} }
    final e = asJson(pick(json, 'estimate')) ?? json;
    return FareEstimate(
      baseService: asDouble(pick(e, 'baseService')),
      travel: asDouble(pick(e, 'travel')),
      emergency: asDouble(pick(e, 'emergency')),
      surge: asDouble(pick(e, 'surge')),
      subtotal: asDouble(pick(e, 'subtotal')),
      tax: asDouble(pick(e, 'tax')),
      total: asDouble(pick(e, 'total')),
      taxRate: asDouble(pick(e, 'taxRate'), fallback: 0.18),
      currency: asString(pick(e, 'currency'), fallback: 'INR'),
    );
  }
}

// ──────────────────────────────────────────────────────────── address ──

/// The result of checking out a cart.
///
/// One order, and one booking per service in it — a booking is assigned to a
/// single worker, and a cart can hold two different trades.
class PlacedOrder {
  const PlacedOrder({
    required this.id,
    required this.mode,
    required this.total,
    required this.bookings,
    this.scheduledAt,
    this.address,
  });

  final String id;
  final String mode;

  /// Sum of the prices the SERVER froze when it created the bookings, not
  /// anything the app added up.
  final double total;

  final List<Booking> bookings;
  final DateTime? scheduledAt;
  final String? address;

  int get bookingCount => bookings.length;

  factory PlacedOrder.fromJson(Json json) {
    final order = asJson(pick(json, 'order')) ?? const {};
    return PlacedOrder(
      id: asString(pick(order, 'id')),
      mode: asString(pick(order, 'mode'), fallback: 'scheduled'),
      total: asDouble(pick(order, 'total')),
      scheduledAt: asDateOrNull(pick(order, 'scheduledAt')),
      address: asStringOrNull(pick(order, 'address')),
      bookings: parseList(pick(json, 'bookings'), Booking.fromJson),
    );
  }
}

class SavedAddress {
  const SavedAddress({
    required this.id,
    required this.name,
    required this.address,
    this.latitude,
    this.longitude,
    this.isDefault = false,
    this.instructions,
  });

  final String id;
  final String name;
  final String address;
  final double? latitude;
  final double? longitude;
  final bool isDefault;
  final String? instructions;

  bool get hasCoordinates => latitude != null && longitude != null;

  factory SavedAddress.fromJson(Json json) => SavedAddress(
        id: asString(pick(json, 'id')),
        name: asString(pick(json, 'name'), fallback: 'Address'),
        address: asString(pick(json, 'address')),
        latitude: asDoubleOrNull(pick(json, 'latitude')),
        longitude: asDoubleOrNull(pick(json, 'longitude')),
        isDefault: asBool(pick(json, 'isDefault')),
        instructions: asStringOrNull(pick(json, 'instructions')),
      );
}

// ──────────────────────────────────────────────────────────── booking ──

class Booking {
  const Booking({
    required this.id,
    required this.status,
    this.serviceId,
    this.serviceName,
    this.serviceCategory,
    this.workerId,
    this.workerName,
    this.workerPhone,
    this.address,
    this.description,
    this.price,
    this.isEmergency = false,
    this.scheduledAt,
    this.createdAt,
  });

  final String id;
  final String status;
  final String? serviceId;
  final String? serviceName;
  final String? serviceCategory;
  final String? workerId;
  final String? workerName;
  final String? workerPhone;
  final String? address;
  final String? description;
  final double? price;
  final bool isEmergency;
  final DateTime? scheduledAt;
  final DateTime? createdAt;

  /// Still moving — belongs on the home screen's active card.
  bool get isActive =>
      !const {'completed', 'cancelled', 'expired', 'refunded'}.contains(status);

  /// A worker is assigned and en route or working.
  bool get isTrackable =>
      const {'assigned', 'accepted', 'en_route', 'started'}.contains(status);

  /// The start OTP is due — the worker is at the door.
  bool get awaitsStartOtp => const {'accepted', 'en_route'}.contains(status);

  bool get awaitsCompletionOtp => status == 'started';

  factory Booking.fromJson(Json json) => Booking(
        id: asString(pick(json, 'id', aliases: ['bookingId'])),
        status: asString(pick(json, 'status'), fallback: 'requested'),
        serviceId: asStringOrNull(pick(json, 'serviceId')),
        // Dashboard sends `service_name`; track sends `serviceName`.
        serviceName: asStringOrNull(pick(json, 'serviceName')),
        serviceCategory: asStringOrNull(pick(json, 'serviceCategory', aliases: ['category'])),
        workerId: asStringOrNull(pick(json, 'workerId')),
        workerName: asStringOrNull(pick(json, 'workerName')),
        workerPhone: asStringOrNull(pick(json, 'workerPhone')),
        address: asStringOrNull(pick(json, 'address')),
        description: asStringOrNull(pick(json, 'description')),
        price: asDoubleOrNull(pick(json, 'price')),
        isEmergency: asBool(pick(json, 'isEmergency')),
        scheduledAt: asDateOrNull(pick(json, 'scheduledAt')),
        createdAt: asDateOrNull(pick(json, 'createdAt')),
      );
}

/// A matched worker, from POST /bookings or /matching/candidates.
class WorkerMatch {
  const WorkerMatch({
    required this.workerId,
    required this.name,
    this.distanceKm,
    this.rating,
    this.jobsToday,
    this.hasCertification = false,
    this.isAvailable = true,
    this.score,
    this.reasons = const [],
  });

  final String workerId;
  final String name;
  final double? distanceKm;
  final double? rating;
  final int? jobsToday;
  final bool hasCertification;
  final bool isAvailable;

  /// Fair-match score. Shown as the human-readable [reasons] rather than the
  /// number, which means nothing to a customer.
  final double? score;
  final List<String> reasons;

  factory WorkerMatch.fromJson(Json json) => WorkerMatch(
        workerId: asString(pick(json, 'workerId', aliases: ['id'])),
        name: asString(pick(json, 'name'), fallback: 'Worker'),
        distanceKm: asDoubleOrNull(pick(json, 'distanceKm')),
        rating: asDoubleOrNull(pick(json, 'rating')),
        jobsToday: asIntOrNull(pick(json, 'jobsToday')),
        hasCertification: asBool(pick(json, 'hasCertification')),
        isAvailable: asBool(pick(json, 'isAvailable'), fallback: true),
        score: asDoubleOrNull(pick(json, 'score')),
        reasons: asStringList(pick(json, 'reasons')),
      );
}

/// The handshake codes, returned exactly once by POST /bookings.
///
/// Persist immediately on receipt. They are never returned again; only the
/// SHA-256 hashes are stored server-side. POST /bookings/:id/otp reissues.
class BookingOtps {
  const BookingOtps({required this.startOtp, required this.completionOtp});

  final String startOtp;
  final String completionOtp;

  factory BookingOtps.fromJson(Json json) => BookingOtps(
        startOtp: asString(pick(json, 'startOtp')),
        completionOtp: asString(pick(json, 'completionOtp')),
      );
}

class BookingCreated {
  const BookingCreated({
    required this.booking,
    required this.otps,
    this.recommendedWorker,
    this.alternatives = const [],
  });

  final Booking booking;
  final BookingOtps? otps;
  final WorkerMatch? recommendedWorker;
  final List<WorkerMatch> alternatives;

  factory BookingCreated.fromJson(Json json) {
    final worker = asJson(pick(json, 'recommendedWorker'));
    final otps = asJson(pick(json, 'otps'));
    return BookingCreated(
      booking: Booking.fromJson(asJson(pick(json, 'booking')) ?? const {}),
      otps: otps == null ? null : BookingOtps.fromJson(otps),
      recommendedWorker: worker == null ? null : WorkerMatch.fromJson(worker),
      alternatives: parseList(pick(json, 'alternatives'), WorkerMatch.fromJson),
    );
  }
}

class BookingEvent {
  const BookingEvent({required this.status, this.at, this.actorName, this.reason});

  final String status;
  final DateTime? at;
  final String? actorName;
  final String? reason;

  factory BookingEvent.fromJson(Json json) => BookingEvent(
        status: asString(pick(json, 'status')),
        at: asDateOrNull(pick(json, 'timestamp', aliases: ['created_at', 'createdAt'])),
        actorName: asStringOrNull(pick(json, 'actorName')),
        reason: asStringOrNull(pick(json, 'reason')),
      );
}

/// GET /customer/bookings/:id/track
class BookingTracking {
  const BookingTracking({
    required this.booking,
    this.worker,
    this.distanceKm,
    this.etaMinutes,
    this.timeline = const [],
  });

  final Booking booking;
  final WorkerMatch? worker;
  final double? distanceKm;
  final int? etaMinutes;
  final List<BookingEvent> timeline;

  factory BookingTracking.fromJson(Json json) {
    final tracking = asJson(pick(json, 'tracking'));
    final worker = asJson(pick(json, 'worker'));
    return BookingTracking(
      booking: Booking.fromJson(asJson(pick(json, 'booking')) ?? const {}),
      worker: worker == null ? null : WorkerMatch.fromJson(worker),
      distanceKm: asDoubleOrNull(pick(tracking, 'distanceKm')),
      etaMinutes: asIntOrNull(pick(tracking, 'etaMinutes')),
      timeline: parseList(pick(json, 'timeline'), BookingEvent.fromJson),
    );
  }
}

/// GET /customer/dashboard — one call for the whole home screen.
class CustomerDashboard {
  const CustomerDashboard({
    this.upcoming = const [],
    this.recent = const [],
    this.favorites = const [],
    this.notifications = const [],
  });

  final List<Booking> upcoming;
  final List<Booking> recent;
  final List<FavouriteWorker> favorites;
  final List<AppNotification> notifications;

  Booking? get activeBooking {
    for (final booking in upcoming) {
      if (booking.isActive) return booking;
    }
    return null;
  }

  factory CustomerDashboard.fromJson(Json json) => CustomerDashboard(
        upcoming: parseList(pick(json, 'upcomingBookings'), Booking.fromJson),
        recent: parseList(pick(json, 'recentBookings'), Booking.fromJson),
        favorites: parseList(pick(json, 'favorites'), FavouriteWorker.fromJson),
        notifications: parseList(pick(json, 'notifications'), AppNotification.fromJson),
      );
}

class FavouriteWorker {
  const FavouriteWorker({
    required this.workerId,
    required this.name,
    this.avatarUrl,
    this.rating,
    this.completedJobs,
    this.skills = const [],
  });

  final String workerId;
  final String name;
  final String? avatarUrl;
  final double? rating;
  final int? completedJobs;
  final List<String> skills;

  factory FavouriteWorker.fromJson(Json json) => FavouriteWorker(
        workerId: asString(pick(json, 'workerId', aliases: ['worker_id', 'id'])),
        name: asString(pick(json, 'workerName', aliases: ['worker_name', 'name']), fallback: 'Worker'),
        avatarUrl: asStringOrNull(pick(json, 'avatarUrl')),
        rating: asDoubleOrNull(pick(json, 'rating')),
        completedJobs: asIntOrNull(pick(json, 'completedJobs')),
        skills: asStringList(pick(json, 'skills')),
      );
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    this.body,
    this.type,
    this.readAt,
    this.createdAt,
  });

  final String id;
  final String title;
  final String? body;
  final String? type;
  final DateTime? readAt;
  final DateTime? createdAt;

  bool get isUnread => readAt == null;

  factory AppNotification.fromJson(Json json) => AppNotification(
        id: asString(pick(json, 'id')),
        title: asString(pick(json, 'title')),
        body: asStringOrNull(pick(json, 'body')),
        type: asStringOrNull(pick(json, 'type')),
        readAt: asDateOrNull(pick(json, 'readAt')),
        createdAt: asDateOrNull(pick(json, 'createdAt')),
      );
}

// ────────────────────────────────────────────────────────── trust graph ──

/// GET /trust/workers/:id — the cooperative trust profile.
class TrustGraph {
  const TrustGraph({
    required this.workerId,
    required this.name,
    this.avatarUrl,
    this.verificationStatus = 'pending',
    this.cooperativeName,
    this.federationName,
    this.experienceYears,
    this.memberSince,
    this.skills = const [],
    this.badges = const [],
    this.rating,
    this.reviewCount,
    this.completedJobs,
    this.completionRate,
    this.activeCertifications = 0,
    this.activeInsurancePolicies = 0,
    this.completedTrainings = 0,
    this.incidentsLast12Months = 0,
  });

  final String workerId;
  final String name;
  final String? avatarUrl;
  final String verificationStatus;
  final String? cooperativeName;
  final String? federationName;
  final int? experienceYears;
  final DateTime? memberSince;
  final List<String> skills;

  /// Derived server-side: identity_verified, society_member, certified_skills,
  /// insured, trained, top_rated, clean_safety_record.
  final List<String> badges;

  final double? rating;
  final int? reviewCount;
  final int? completedJobs;
  final double? completionRate;
  final int activeCertifications;
  final int activeInsurancePolicies;
  final int completedTrainings;
  final int incidentsLast12Months;

  bool get isVerified => verificationStatus == 'verified';
  bool hasBadge(String badge) => badges.contains(badge);

  factory TrustGraph.fromJson(Json json) {
    final worker = asJson(pick(json, 'worker')) ?? const {};
    final verification = asJson(pick(json, 'verification'));
    final cooperative = asJson(pick(json, 'cooperative'));
    final welfare = asJson(pick(json, 'welfare'));
    final safety = asJson(pick(json, 'safety'));
    final performance = asJson(pick(json, 'performance'));
    final certifications = asJson(pick(json, 'certifications'));

    return TrustGraph(
      workerId: asString(pick(worker, 'id')),
      name: asString(pick(worker, 'name'), fallback: 'Worker'),
      avatarUrl: asStringOrNull(pick(worker, 'avatarUrl')),
      verificationStatus: asString(pick(verification, 'status'), fallback: 'pending'),
      cooperativeName: asStringOrNull(pick(cooperative, 'name')),
      federationName: asStringOrNull(pick(cooperative, 'federation')),
      experienceYears: asIntOrNull(pick(worker, 'experienceYears')),
      memberSince: asDateOrNull(pick(worker, 'memberSince')),
      skills: parseList(pick(json, 'skills'), (s) => s)
          .map((s) => asString(pick(s, 'serviceName')))
          .where((s) => s.isNotEmpty)
          .toList(),
      badges: asStringList(pick(json, 'badges')),
      rating: asDoubleOrNull(pick(performance, 'averageRating', aliases: ['rating'])),
      reviewCount: asIntOrNull(pick(performance, 'reviewCount')),
      completedJobs: asIntOrNull(pick(performance, 'completedJobs')),
      completionRate: asDoubleOrNull(pick(performance, 'completionRate')),
      activeCertifications: asInt(pick(certifications, 'active')),
      activeInsurancePolicies: asInt(pick(welfare, 'activeInsurancePolicies')),
      completedTrainings: asInt(pick(welfare, 'completedTrainings')),
      incidentsLast12Months: asInt(pick(safety, 'incidentsLast12Months')),
    );
  }
}

// ─────────────────────────────────────────────────────────────── geocoding ──

/// A place from /maps/geocode or /maps/reverse-geocode.
///
/// The backend proxies Google Maps so no API key ships in the binary, and
/// normalises the response to camelCase (`formattedAddress`, `location.lat`).
class GeoPlace {
  const GeoPlace({
    required this.formattedAddress,
    this.latitude,
    this.longitude,
    this.placeId,
  });

  final String formattedAddress;
  final double? latitude;
  final double? longitude;
  final String? placeId;

  bool get hasCoordinates => latitude != null && longitude != null;

  /// A short label for a list row — the first two comma-separated parts, which
  /// is usually "building, locality" and enough to tell two results apart.
  String get shortLabel {
    final parts = formattedAddress.split(',').map((p) => p.trim()).where((p) => p.isNotEmpty);
    return parts.take(2).join(', ');
  }

  factory GeoPlace.fromJson(Json json) {
    final location = asJson(pick(json, 'location'));
    return GeoPlace(
      formattedAddress: asString(
        pick(json, 'formattedAddress', aliases: ['address', 'name']),
      ),
      latitude: asDoubleOrNull(pick(location, 'lat') ?? pick(json, 'latitude')),
      longitude: asDoubleOrNull(pick(location, 'lng') ?? pick(json, 'longitude')),
      placeId: asStringOrNull(pick(json, 'placeId')),
    );
  }
}

// ────────────────────────────────────────────────────────────────── review ──

class WorkerReview {
  const WorkerReview({
    required this.id,
    required this.rating,
    this.feedback,
    this.customerName,
    this.createdAt,
  });

  final String id;
  final int rating;
  final String? feedback;
  final String? customerName;
  final DateTime? createdAt;

  factory WorkerReview.fromJson(Json json) => WorkerReview(
        id: asString(pick(json, 'id')),
        rating: asInt(pick(json, 'rating')),
        feedback: asStringOrNull(pick(json, 'feedback', aliases: ['comment'])),
        customerName: asStringOrNull(pick(json, 'customerName')),
        createdAt: asDateOrNull(pick(json, 'createdAt')),
      );
}
