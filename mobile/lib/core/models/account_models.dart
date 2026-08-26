import '../network/json.dart';

/// Models for the account, support and scheduling screens.
///
/// Split from models.dart to keep that file about the booking lifecycle. Same
/// rule applies: written from probed responses, read through the tolerant
/// helpers, because these endpoints are snake_case where the booking ones are
/// camelCase.

// ────────────────────────────────────────────────────── notifications ──

/// Per-channel settings, from GET /notifications/preferences.
class NotificationPreferences {
  const NotificationPreferences({
    this.push = true,
    this.sms = true,
    this.email = true,
    this.inApp = true,
  });

  final bool push;
  final bool sms;
  final bool email;
  final bool inApp;

  NotificationPreferences copyWith({bool? push, bool? sms, bool? email, bool? inApp}) =>
      NotificationPreferences(
        push: push ?? this.push,
        sms: sms ?? this.sms,
        email: email ?? this.email,
        inApp: inApp ?? this.inApp,
      );

  Map<String, dynamic> toJson() => {'push': push, 'sms': sms, 'email': email, 'inApp': inApp};

  factory NotificationPreferences.fromJson(Json json) {
    final p = asJson(pick(json, 'preferences')) ?? json;
    return NotificationPreferences(
      push: asBool(pick(p, 'push'), fallback: true),
      sms: asBool(pick(p, 'sms'), fallback: true),
      email: asBool(pick(p, 'email'), fallback: true),
      inApp: asBool(pick(p, 'inApp'), fallback: true),
    );
  }
}

// ─────────────────────────────────────────────────────────────── i18n ──

class AppLanguage {
  const AppLanguage({
    required this.code,
    required this.name,
    required this.nativeName,
    this.isDefault = false,
  });

  final String code;
  final String name;

  /// Shown in the language's own script. Someone looking for Telugu is looking
  /// for the word written in Telugu, not the English label.
  final String nativeName;
  final bool isDefault;

  factory AppLanguage.fromJson(Json json) => AppLanguage(
        code: asString(pick(json, 'code'), fallback: 'en'),
        name: asString(pick(json, 'name')),
        nativeName: asString(pick(json, 'nativeName')),
        isDefault: asBool(pick(json, 'isDefault')),
      );
}

// ──────────────────────────────────────────────────────────── support ──

/// A support ticket.
///
/// The backing table is `complaints`, which has NO subject column — the API
/// accepts one on create and silently drops it. The first line of the
/// description is used as the title so the list still scans.
class SupportTicket {
  const SupportTicket({
    required this.id,
    required this.status,
    required this.description,
    this.category,
    this.priority = 'medium',
    this.bookingId,
    this.serviceName,
    this.resolution,
    this.assignedToName,
    this.createdAt,
    this.resolvedAt,
    this.comments = const [],
  });

  final String id;
  final String status;
  final String description;
  final String? category;
  final String priority;
  final String? bookingId;
  final String? serviceName;
  final String? resolution;
  final String? assignedToName;
  final DateTime? createdAt;
  final DateTime? resolvedAt;
  final List<TicketComment> comments;

  bool get isOpen => status != 'resolved' && status != 'closed';

  /// First line of the description, for the list row.
  String get title {
    final firstLine = description.split('\n').first.trim();
    if (firstLine.isEmpty) return 'Support request';
    return firstLine.length <= 60 ? firstLine : '${firstLine.substring(0, 57)}…';
  }

  factory SupportTicket.fromJson(Json json) {
    final ticket = asJson(pick(json, 'ticket')) ?? json;
    return SupportTicket(
      id: asString(pick(ticket, 'id')),
      status: asString(pick(ticket, 'status'), fallback: 'open'),
      description: asString(pick(ticket, 'description')),
      category: asStringOrNull(pick(ticket, 'category')),
      priority: asString(pick(ticket, 'priority'), fallback: 'medium'),
      bookingId: asStringOrNull(pick(ticket, 'bookingId')),
      serviceName: asStringOrNull(pick(ticket, 'serviceName')),
      resolution: asStringOrNull(pick(ticket, 'resolution')),
      assignedToName: asStringOrNull(pick(ticket, 'assignedToName')),
      createdAt: asDateOrNull(pick(ticket, 'createdAt')),
      resolvedAt: asDateOrNull(pick(ticket, 'resolvedAt')),
      comments: parseList(pick(json, 'comments'), TicketComment.fromJson),
    );
  }
}

class TicketComment {
  const TicketComment({
    required this.id,
    required this.comment,
    this.authorName,
    this.authorRole,
    this.isInternal = false,
    this.createdAt,
  });

  final String id;
  final String comment;
  final String? authorName;
  final String? authorRole;

  /// Staff-only note. Never rendered to a customer.
  final bool isInternal;
  final DateTime? createdAt;

  bool get isFromStaff =>
      authorRole != null && authorRole != 'customer' && authorRole != 'institutional_customer';

  factory TicketComment.fromJson(Json json) => TicketComment(
        id: asString(pick(json, 'id')),
        comment: asString(pick(json, 'comment')),
        authorName: asStringOrNull(pick(json, 'authorName')),
        authorRole: asStringOrNull(pick(json, 'authorRole')),
        isInternal: asBool(pick(json, 'isInternal')),
        createdAt: asDateOrNull(pick(json, 'createdAt')),
      );
}

// ─────────────────────────────────────────────────────────────── chat ──

class ChatThread {
  const ChatThread({
    required this.id,
    this.bookingId,
    this.title,
    this.lastMessage,
    this.lastMessageAt,
    this.unreadCount = 0,
  });

  final String id;
  final String? bookingId;
  final String? title;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final int unreadCount;

  factory ChatThread.fromJson(Json json) => ChatThread(
        id: asString(pick(json, 'id')),
        bookingId: asStringOrNull(pick(json, 'bookingId')),
        title: asStringOrNull(pick(json, 'title', aliases: ['subject', 'service_name'])),
        lastMessage: asStringOrNull(pick(json, 'lastMessage')),
        lastMessageAt: asDateOrNull(pick(json, 'lastMessageAt', aliases: ['updated_at'])),
        unreadCount: asInt(pick(json, 'unreadCount')),
      );
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.body,
    this.senderId,
    this.senderName,
    this.createdAt,
  });

  final String id;
  final String body;
  final String? senderId;
  final String? senderName;
  final DateTime? createdAt;

  factory ChatMessage.fromJson(Json json) => ChatMessage(
        id: asString(pick(json, 'id')),
        body: asString(pick(json, 'body', aliases: ['message', 'content', 'text'])),
        senderId: asStringOrNull(pick(json, 'senderId')),
        senderName: asStringOrNull(pick(json, 'senderName')),
        createdAt: asDateOrNull(pick(json, 'createdAt')),
      );
}

// ────────────────────────────────────────────────────────── recurring ──

class RecurringPlan {
  const RecurringPlan({
    required this.id,
    required this.frequency,
    required this.status,
    this.serviceId,
    this.serviceName,
    this.daysOfWeek = const [],
    this.startDate,
    this.endDate,
    this.nextGenerationAt,
  });

  final String id;
  final String frequency;
  final String status;
  final String? serviceId;
  final String? serviceName;
  final List<int> daysOfWeek;
  final DateTime? startDate;
  final DateTime? endDate;
  final DateTime? nextGenerationAt;

  bool get isActive => status == 'active';
  bool get isPaused => status == 'paused';

  /// Human schedule: "Every Monday and Thursday", not "weekly [1,4]".
  String get scheduleLabel {
    switch (frequency) {
      case 'daily':
        return 'Every day';
      case 'monthly':
        return 'Once a month';
      case 'weekly':
        const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        final days = daysOfWeek.where((d) => d >= 0 && d < 7).map((d) => names[d]).toList();
        if (days.isEmpty) return 'Every week';
        if (days.length == 1) return 'Every ${days.first}';
        return 'Every ${days.sublist(0, days.length - 1).join(', ')} and ${days.last}';
      default:
        return 'Custom schedule';
    }
  }

  factory RecurringPlan.fromJson(Json json) {
    final raw = pick(json, 'daysOfWeek');
    return RecurringPlan(
      id: asString(pick(json, 'id')),
      frequency: asString(pick(json, 'frequency'), fallback: 'weekly'),
      status: asString(pick(json, 'status'), fallback: 'active'),
      serviceId: asStringOrNull(pick(json, 'serviceId')),
      serviceName: asStringOrNull(pick(json, 'serviceName')),
      daysOfWeek: raw is List ? raw.map(asIntOrNull).whereType<int>().toList() : const [],
      startDate: asDateOrNull(pick(json, 'startDate')),
      endDate: asDateOrNull(pick(json, 'endDate')),
      nextGenerationAt: asDateOrNull(pick(json, 'nextGenerationAt')),
    );
  }
}

// ─────────────────────────────────────────────────────────── invoices ──

class Invoice {
  const Invoice({
    required this.id,
    required this.invoiceNumber,
    required this.total,
    this.bookingId,
    this.subtotal = 0,
    this.tax = 0,
    this.platformFee = 0,
    this.cooperativeShare = 0,
    this.welfareFund = 0,
    this.workerShare = 0,
    this.paymentStatus = 'pending',
    this.issuedAt,
  });

  final String id;
  final String invoiceNumber;
  final double total;
  final String? bookingId;
  final double subtotal;
  final double tax;
  final double platformFee;
  final double cooperativeShare;

  /// The 2% funding worker insurance and training. Shown on the receipt,
  /// because it is the reason this platform is a cooperative rather than an
  /// aggregator, and a line item nobody else prints.
  final double welfareFund;
  final double workerShare;
  final String paymentStatus;
  final DateTime? issuedAt;

  bool get isPaid => paymentStatus == 'paid';

  factory Invoice.fromJson(Json json) => Invoice(
        id: asString(pick(json, 'id')),
        invoiceNumber: asString(pick(json, 'invoiceNumber')),
        total: asDouble(pick(json, 'total')),
        bookingId: asStringOrNull(pick(json, 'bookingId')),
        subtotal: asDouble(pick(json, 'subtotal')),
        tax: asDouble(pick(json, 'tax')),
        platformFee: asDouble(pick(json, 'platformFee')),
        cooperativeShare: asDouble(pick(json, 'cooperativeShare')),
        welfareFund: asDouble(pick(json, 'welfareFund')),
        workerShare: asDouble(pick(json, 'workerShare')),
        paymentStatus: asString(pick(json, 'paymentStatus'), fallback: 'pending'),
        issuedAt: asDateOrNull(pick(json, 'issuedAt')),
      );
}
