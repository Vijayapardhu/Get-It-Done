import '../models/account_models.dart';
import '../models/models.dart';
import '../config/remote_config.dart';
import '../models/payment_models.dart';
import '../network/api_client.dart';
import '../network/json.dart';

/// Typed wrapper over the GET IT DONE API.
///
/// One place that knows about paths and response envelopes, so a route rename
/// on the backend lands here rather than in twelve widgets. Endpoint choices
/// are annotated where the backend offers more than one spelling for the same
/// thing (it has a compat layer that rewrites blueprint paths onto these).
class GidApi {
  GidApi(this._client);

  final ApiClient _client;

  // ─────────────────────────────────────────────────────────────── auth ──

  /// Phone-first signup and sign-in.
  ///
  /// Delivered by SMS (MSG91 or Twilio, per the backend's SMS_PROVIDER).
  /// Returns the code itself only when the backend runs with
  /// OTP_ECHO_IN_RESPONSE, which env.ts refuses in production.
  Future<String?> requestOtp(String phone) async {
    final json = await _client.post('/auth/request-otp', body: {'phone': phone}, auth: false);
    return asStringOrNull(pick(json, 'devOtp'));
  }

  /// Verifies the code and issues a session. Passing [name] creates the account
  /// when the phone is new, so signup and sign-in are the same call.
  Future<AuthSession> verifyOtp({
    required String phone,
    required String otp,
    String? name,
    String role = 'customer',
  }) async {
    final json = await _client.post('/auth/verify-otp', auth: false, body: {
      'phone': phone,
      'otp': otp,
      if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
      'role': role,
    });
    return AuthSession.fromJson(json);
  }

  /// Create an account with EITHER an email or a phone number, plus a password.
  ///
  /// The backend rejects both or neither, so exactly one must be supplied.
  Future<AuthSession> register({
    required String name,
    required String password,
    String? email,
    String? phone,
    String role = 'customer',
  }) async {
    assert(
      (email == null) != (phone == null),
      'register requires exactly one of email or phone',
    );

    final json = await _client.post('/auth/register', auth: false, body: {
      'name': name,
      if (email != null) 'email': email,
      if (phone != null) 'phone': phone,
      'password': password,
      'role': role,
    });
    return AuthSession.fromJson(json);
  }

  /// Sign in with a password.
  ///
  /// [identifier] is whatever the user typed — an email or a phone number. The
  /// backend works out which; the app should not make the user pick a tab, and
  /// people generally do not remember which one they signed up with.
  Future<AuthSession> login({required String identifier, required String password}) async {
    final json = await _client.post('/auth/login', auth: false, body: {
      'identifier': identifier.trim(),
      'password': password,
    });
    return AuthSession.fromJson(json);
  }

  /// Exchange a Google ID token for a GET IT DONE session.
  ///
  /// The backend verifies the token's signature and audience against its
  /// configured client ids, then links or creates the account by email.
  Future<AuthSession> signInWithGoogle(String idToken) async {
    final json = await _client.post('/auth/oauth/google', auth: false, body: {
      'credential': idToken,
    });
    return AuthSession.fromJson(json);
  }

  /// Sign in to the shared demo account.
  ///
  /// No credential, by design: it exists so the app can be handed to someone
  /// with neither a Google account on the device nor a phone that will receive
  /// our SMS. The server answers 404 unless it was started with demo login on,
  /// so this cannot open a door on a deployment that did not ask for one.
  Future<AuthSession> signInAsDemo() async {
    final json = await _client.post('/auth/demo', auth: false);
    return AuthSession.fromJson(json);
  }

  Future<AppUser> me() async {
    // `/auth/me` rather than `/users/me`: same resource, but this one returns
    // camelCase and includes the OAuth linkage.
    final json = await _client.get('/auth/me');
    return AppUser.fromJson(asJson(pick(json, 'user')) ?? const {});
  }

  Future<void> logout(String refreshToken) =>
      _client.post('/auth/logout', body: {'refreshToken': refreshToken});

  Future<void> setLanguage(String language) =>
      _client.patch('/users/me/language', body: {'language': language});

  // ────────────────────────────────────────────────────────── catalogue ──

  /// One service with its editorial content, for the detail page.
  Future<ServiceDetail> serviceDetail(String id) async {
    final json = await _client.get('/services/$id');
    return ServiceDetail.fromJson(asJson(pick(json, 'service')) ?? const {});
  }

  /// Check out a cart.
  ///
  /// Creates one order and one booking per service, all or nothing. The
  /// idempotency key is required by the server: a retry after a timeout must
  /// not place a second set of bookings, and this is the one request in the
  /// app where that would cost real money and real workers' time.
  Future<PlacedOrder> createOrder({
    required List<({String serviceId, int quantity})> lines,
    required String mode,
    required double latitude,
    required double longitude,
    required String address,
    required String idempotencyKey,
    String? addressId,
    DateTime? scheduledAt,
    String? description,
  }) async {
    final json = await _client.post(
      '/orders',
      headers: {'idempotency-key': idempotencyKey},
      body: {
        'lines': [
          for (final line in lines)
            {'serviceId': line.serviceId, 'quantity': line.quantity},
        ],
        'mode': mode,
        'latitude': latitude,
        'longitude': longitude,
        'address': address,
        if (addressId != null) 'addressId': addressId,
        if (scheduledAt != null) 'scheduledAt': scheduledAt.toUtc().toIso8601String(),
        if (description != null && description.trim().isNotEmpty)
          'description': description.trim(),
      },
    );
    return PlacedOrder.fromJson(json);
  }

  /// One order and its bookings.
  ///
  /// Reuses PlacedOrder: the checkout response and this one describe the same
  /// thing, and the OTP list is simply absent here because the server issues
  /// those exactly once.
  Future<PlacedOrder> order(String id) async {
    final json = await _client.get('/orders/$id');
    return PlacedOrder.fromJson(json);
  }

  Future<List<Service>> services() async {
    final json = await _client.get('/services');
    return parseList(pick(json, 'services'), Service.fromJson);
  }

  Future<List<ServiceCategory>> serviceCategories() async {
    final json = await _client.get('/services/categories');
    return parseList(pick(json, 'categories'), ServiceCategory.fromJson);
  }

  /// Catalogue search scoped to a location, so results carry worker
  /// availability and distance rather than just names.
  Future<List<Service>> searchServices({
    required double latitude,
    required double longitude,
    String? query,
    String? category,
  }) async {
    final json = await _client.get('/services/discovery/search', query: {
      'latitude': latitude,
      'longitude': longitude,
      if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
      if (category != null) 'category': category,
    });
    return parseList(pick(json, 'services'), Service.fromJson);
  }

  Future<List<Service>> nearbyServices({
    required double latitude,
    required double longitude,
  }) async {
    final json = await _client.get('/services/discovery/nearby', query: {
      'latitude': latitude,
      'longitude': longitude,
    });
    return parseList(pick(json, 'services'), Service.fromJson);
  }

  // ──────────────────────────────────────────────────────────── pricing ──

  /// Upfront fare with the full breakdown. Called before the confirm step so
  /// the customer never sees a price for the first time on the invoice.
  Future<FareEstimate> estimate({
    required String serviceId,
    required double latitude,
    required double longitude,
    bool isEmergency = false,
    DateTime? scheduledAt,
  }) async {
    final json = await _client.post('/pricing/estimate', body: {
      'serviceId': serviceId,
      'latitude': latitude,
      'longitude': longitude,
      'isEmergency': isEmergency,
      if (scheduledAt != null) 'scheduledAt': scheduledAt.toUtc().toIso8601String(),
    });
    return FareEstimate.fromJson(json);
  }

  // ────────────────────────────────────────────────────────── addresses ──

  Future<List<SavedAddress>> addresses() async {
    final json = await _client.get('/addresses');
    return parseList(pick(json, 'addresses'), SavedAddress.fromJson);
  }

  Future<SavedAddress> createAddress({
    required String name,
    required String address,
    double? latitude,
    double? longitude,
    bool isDefault = false,
    String? instructions,
  }) async {
    final json = await _client.post('/addresses', body: {
      'name': name,
      'address': address,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
      'is_default': isDefault,
      if (instructions != null && instructions.isNotEmpty) 'instructions': instructions,
    });
    return SavedAddress.fromJson(asJson(pick(json, 'address')) ?? json);
  }

  Future<void> deleteAddress(String id) => _client.delete('/addresses/$id');

  // ─────────────────────────────────────────────────────────── bookings ──

  /// Create a booking.
  ///
  /// [idempotencyKey] is REQUIRED by the backend (16–128 chars). Generate it
  /// when the confirm sheet opens, not when the button is tapped: a double-tap
  /// or a retry after a dropped response then replays the original booking
  /// instead of creating a second one.
  ///
  /// The response carries the start and completion OTPs exactly ONCE. Persist
  /// them before navigating.
  Future<BookingCreated> createBooking({
    required String serviceId,
    required double latitude,
    required double longitude,
    required String address,
    required String idempotencyKey,
    String? description,
    bool isEmergency = false,
    DateTime? scheduledAt,
  }) async {
    final json = await _client.post(
      '/bookings',
      headers: {'idempotency-key': idempotencyKey},
      body: {
        'serviceId': serviceId,
        'latitude': latitude,
        'longitude': longitude,
        'address': address,
        if (description != null && description.isNotEmpty) 'description': description,
        'isEmergency': isEmergency,
        if (scheduledAt != null) 'scheduledAt': scheduledAt.toUtc().toIso8601String(),
      },
    );
    return BookingCreated.fromJson(json);
  }

  Future<List<Booking>> bookings() async {
    final json = await _client.get('/bookings');
    return parseList(pick(json, 'bookings'), Booking.fromJson);
  }

  Future<Booking> booking(String id) async {
    final json = await _client.get('/bookings/$id');
    return Booking.fromJson(asJson(pick(json, 'booking')) ?? json);
  }

  Future<List<BookingEvent>> bookingTimeline(String id) async {
    final json = await _client.get('/bookings/$id/timeline');
    return parseList(pick(json, 'timeline'), BookingEvent.fromJson);
  }

  Future<BookingTracking> trackBooking(String id) async {
    final json = await _client.get('/customer/bookings/$id/track');
    return BookingTracking.fromJson(json);
  }

  Future<void> cancelBooking(String id, {String? reason}) =>
      _client.post('/bookings/$id/cancel', body: {if (reason != null) 'reason': reason});

  /// Reissue the handshake codes when the customer has lost them. Invalidates
  /// the previous pair and clears the failed-attempt counters.
  Future<BookingOtps> reissueOtps(String bookingId) async {
    final json = await _client.post('/bookings/$bookingId/otp');
    return BookingOtps.fromJson(json);
  }

  // ────────────────────────────────────────────────────────── dashboard ──

  Future<CustomerDashboard> dashboard() async {
    final json = await _client.get('/customer/dashboard');
    return CustomerDashboard.fromJson(json);
  }

  Future<List<FavouriteWorker>> favourites() async {
    final json = await _client.get('/customer/favorites');
    return parseList(pick(json, 'favorites'), FavouriteWorker.fromJson);
  }

  Future<void> addFavourite(String workerId) => _client.post('/users/favorites/$workerId');

  Future<void> removeFavourite(String workerId) => _client.delete('/users/favorites/$workerId');

  // ────────────────────────────────────────────────────────────── trust ──

  Future<TrustGraph> trustGraph(String workerId) async {
    final json = await _client.get('/trust/workers/$workerId');
    return TrustGraph.fromJson(json);
  }

  // ────────────────────────────────────────────────────── notifications ──

  Future<List<AppNotification>> notifications({int limit = 30}) async {
    final json = await _client.get('/notifications', query: {'limit': limit});
    return parseList(pick(json, 'notifications'), AppNotification.fromJson);
  }

  Future<void> markNotificationRead(String id) => _client.patch('/notifications/$id/read');

  Future<void> markAllNotificationsRead() => _client.post('/notifications/read-all');

  // ────────────────────────────────────────────────────────── emergency ──

  /// Priority dispatch. A separate path from a normal booking: the backend
  /// suppresses duplicates within 10 minutes and escalates on a timer.
  Future<BookingCreated> createEmergencyBooking({
    required String serviceId,
    required double latitude,
    required double longitude,
    required String address,
    String? description,
    String priority = 'high',
  }) async {
    final json = await _client.post('/emergency/bookings', body: {
      'serviceId': serviceId,
      'latitude': latitude,
      'longitude': longitude,
      'address': address,
      if (description != null && description.isNotEmpty) 'description': description,
      'priority': priority,
    });
    return BookingCreated.fromJson(json);
  }


  // ─────────────────────────────────────────────── notification settings ──

  Future<NotificationPreferences> notificationPreferences() async {
    final json = await _client.get('/notifications/preferences');
    return NotificationPreferences.fromJson(json);
  }

  Future<NotificationPreferences> updateNotificationPreferences(
    NotificationPreferences preferences,
  ) async {
    final json = await _client.patch('/notifications/preferences', body: preferences.toJson());
    return NotificationPreferences.fromJson(json);
  }

  /// Register this device for push. Called after FCM hands over a token.
  Future<void> registerDevice({required String token, required String platform}) =>
      _client.post('/notifications/devices', body: {'token': token, 'platform': platform});

  // ─────────────────────────────────────────────────────────────── i18n ──

  Future<List<AppLanguage>> languages() async {
    final json = await _client.get('/i18n/languages');
    return parseList(pick(json, 'languages'), AppLanguage.fromJson);
  }

  /// Persist the language on the user, so it follows them across devices.
  ///
  /// Two endpoints do this; PATCH /i18n/user/language is the one that also
  /// updates `preferred_language`, which is what /auth/me reads back.
  Future<void> setPreferredLanguage(String code) =>
      _client.patch('/i18n/user/language', body: {'language': code});

  // ──────────────────────────────────────────────────────────── profile ──

  Future<AppUser> updateProfile({String? name, String? displayName}) async {
    final json = await _client.patch('/users/me', body: {
      if (name != null) 'name': name,
      if (displayName != null) 'displayName': displayName,
    });
    return AppUser.fromJson(asJson(pick(json, 'user')) ?? json);
  }

  // ──────────────────────────────────────────────────────────── support ──

  Future<List<SupportTicket>> supportTickets() async {
    final json = await _client.get('/support/tickets');
    return parseList(pick(json, 'tickets'), SupportTicket.fromJson);
  }

  Future<SupportTicket> supportTicket(String id) async {
    final json = await _client.get('/support/tickets/$id');
    return SupportTicket.fromJson(json);
  }

  /// Raise a ticket.
  ///
  /// [subject] is accepted by the route but the complaints table has no column
  /// for it, so it is prefixed onto the description instead of being silently
  /// dropped.
  Future<SupportTicket> createSupportTicket({
    required String subject,
    required String description,
    String category = 'other',
    String? bookingId,
  }) async {
    final body = subject.trim().isEmpty ? description : '${subject.trim()}\n\n$description';
    final json = await _client.post('/support/tickets', body: {
      'subject': subject,
      'description': body,
      'category': category,
      if (bookingId != null) 'bookingId': bookingId,
    });
    return SupportTicket.fromJson(json);
  }

  Future<TicketComment> addTicketComment(String ticketId, String comment) async {
    final json = await _client.post('/support/tickets/$ticketId/comments', body: {
      'comment': comment,
    });
    return TicketComment.fromJson(asJson(pick(json, 'comment')) ?? json);
  }

  // ─────────────────────────────────────────────────────────────── chat ──

  Future<List<ChatThread>> chats() async {
    final json = await _client.get('/chats');
    return parseList(pick(json, 'chats'), ChatThread.fromJson);
  }

  Future<List<ChatMessage>> chatMessages(String chatId) async {
    final json = await _client.get('/chats/$chatId/messages');
    return parseList(pick(json, 'messages'), ChatMessage.fromJson);
  }

  Future<ChatMessage> sendChatMessage(String chatId, String body) async {
    final json = await _client.post('/chats/$chatId/messages', body: {'message': body});
    return ChatMessage.fromJson(asJson(pick(json, 'message')) ?? json);
  }

  /// Open (or reuse) the thread for a booking.
  Future<ChatThread> startChat({required String bookingId}) async {
    final json = await _client.post('/chats', body: {'bookingId': bookingId});
    return ChatThread.fromJson(asJson(pick(json, 'chat')) ?? json);
  }

  // ────────────────────────────────────────────────────────── recurring ──

  Future<List<RecurringPlan>> recurringPlans() async {
    final json = await _client.get('/recurring/plans');
    return parseList(pick(json, 'recurringBookings'), RecurringPlan.fromJson);
  }

  Future<RecurringPlan> createRecurringPlan({
    required String serviceId,
    required String frequency,
    required DateTime startDate,
    List<int> daysOfWeek = const [],
    String? addressId,
    DateTime? endDate,
  }) async {
    final json = await _client.post('/recurring/plans', body: {
      'serviceId': serviceId,
      'frequency': frequency,
      'daysOfWeek': daysOfWeek,
      // The API takes a date, not a timestamp.
      'startDate': startDate.toIso8601String().split('T').first,
      if (endDate != null) 'endDate': endDate.toIso8601String().split('T').first,
      if (addressId != null) 'addressId': addressId,
    });
    return RecurringPlan.fromJson(asJson(pick(json, 'recurringBooking')) ?? json);
  }

  Future<void> pauseRecurringPlan(String id) => _client.post('/recurring/plans/$id/pause');

  Future<void> resumeRecurringPlan(String id) => _client.post('/recurring/plans/$id/resume');

  Future<void> cancelRecurringPlan(String id) => _client.delete('/recurring/plans/$id');

  // ───────────────────────────────────────────────────────────── config ──

  /// Deployment configuration: OAuth client ids, the publishable gateway key,
  /// feature flags and supported languages.
  ///
  /// Unauthenticated — the app needs this before anyone can sign in.
  Future<RemoteConfig> mobileConfig() async {
    final json = await _client.get('/config/mobile', auth: false);
    return RemoteConfig.fromJson(json);
  }

  // ─────────────────────────────────────────────────────────── payments ──

  /// Create (or replay) the payment order for a booking.
  ///
  /// The idempotency key must be generated when the payment screen OPENS, not
  /// when the pay button is tapped. A retry after a dropped response then
  /// returns the SAME order — including the same gateway order id — instead of
  /// creating a second one the customer could be charged for twice.
  Future<PaymentIntent> createPaymentOrder({
    required String bookingId,
    required String idempotencyKey,
    String provider = 'razorpay',
  }) async {
    final json = await _client.post('/payments/orders', body: {
      'bookingId': bookingId,
      'provider': provider,
      'idempotencyKey': idempotencyKey,
    });
    return PaymentIntent.fromJson(json);
  }

  Future<PaymentIntent> paymentOrder(String id) async {
    final json = await _client.get('/payments/orders/$id');
    return PaymentIntent.fromJson(json);
  }

  /// The most recent payment order for a booking, or null if none exists.
  Future<PaymentOrder?> paymentOrderForBooking(String bookingId) async {
    final json = await _client.get('/payments/orders', query: {'bookingId': bookingId, 'limit': 1});
    final orders = parseList(pick(json, 'orders'), PaymentOrder.fromJson);
    return orders.isEmpty ? null : orders.first;
  }

  /// Hand the gateway's signed response back for verification.
  ///
  /// The backend re-derives the HMAC with its secret; a response the app made
  /// up cannot pass. On success the order is captured and the booking settled
  /// immediately, so the customer is not left watching "pending" until the
  /// webhook lands.
  Future<PaymentVerification> verifyPayment({
    required String paymentOrderId,
    required String signature,
    String? providerPaymentId,
    String? providerOrderId,
  }) async {
    final json = await _client.post('/payments/orders/$paymentOrderId/verify', body: {
      'signature': signature,
      if (providerPaymentId != null) 'paymentId': providerPaymentId,
      if (providerOrderId != null) 'orderId': providerOrderId,
    });
    return PaymentVerification.fromJson(json);
  }

  /// What a service will cost before booking it. The backend freezes this same
  /// total onto the booking, so it is a quote, not a guess.
  Future<PriceBreakdown> priceEstimate({
    required String serviceId,
    required double latitude,
    required double longitude,
    bool emergency = false,
    String? variantId,
  }) async {
    final json = await _client.post('/pricing/estimate', body: {
      'serviceId': serviceId,
      'latitude': latitude,
      'longitude': longitude,
      'urgency': emergency ? 'emergency' : 'regular',
      if (variantId != null) 'variantId': variantId,
    });
    return PriceBreakdown.fromJson(json);
  }

  // ─────────────────────────────────────────────────────────── invoices ──

  Future<List<Invoice>> invoices() async {
    final json = await _client.get('/payments/invoices');
    return parseList(pick(json, 'invoices'), Invoice.fromJson);
  }

  Future<Invoice?> invoiceForBooking(String bookingId) async {
    try {
      final json = await _client.get('/payments/invoices/booking/$bookingId');
      return Invoice.fromJson(asJson(pick(json, 'invoice')) ?? json);
    } catch (_) {
      // A booking with no invoice yet is normal, not an error.
      return null;
    }
  }

  /// Signed URL for the invoice PDF. The endpoint streams binary, so this is
  /// handed to the platform browser rather than fetched.
  /// The rendered receipt. Behind `requireAuth`, so it is downloaded with the
  /// bearer token rather than handed to the browser as a URL.
  Future<List<int>> invoicePdf(String invoiceId) =>
      _client.getBytes('/invoices/$invoiceId/pdf');

  // ─────────────────────────────────────────────────────────────── maps ──

  /// Reverse geocode through the backend, never a client-side Maps key.
  ///
  /// The route takes `lat`/`lng` (NOT latitude/longitude) and returns
  /// `{ results: [...] }`, so the first result is unwrapped here.
  Future<GeoPlace?> reverseGeocode({required double latitude, required double longitude}) async {
    final json = await _client.post('/maps/reverse-geocode', body: {
      'lat': latitude,
      'lng': longitude,
    });
    final results = parseList(pick(json, 'results'), GeoPlace.fromJson);
    return results.isEmpty ? null : results.first;
  }

  /// Forward geocode a typed address to coordinates.
  ///
  /// The booking flow needs coordinates: matching is a PostGIS radius search,
  /// so an address without a location cannot be dispatched against.
  Future<List<GeoPlace>> geocode(String address) async {
    final json = await _client.post('/maps/geocode', body: {'address': address});
    return parseList(pick(json, 'results'), GeoPlace.fromJson);
  }

  // ────────────────────────────────────────────────────────────── reviews ──

  /// Rate a completed booking. One review per booking is enforced server-side
  /// by a unique index, so a duplicate submit returns 409 rather than stacking.
  Future<void> submitReview({
    required String bookingId,
    required int rating,
    String? feedback,
  }) =>
      _client.post('/reviews', body: {
        'bookingId': bookingId,
        'rating': rating,
        if (feedback != null && feedback.trim().isNotEmpty) 'feedback': feedback.trim(),
      });
}
