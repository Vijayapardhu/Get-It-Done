import 'package:clock/clock.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:gid_core/gid_core.dart';

/// How the customer wants the cart carried out.
enum CheckoutMode {
  /// Matched to whoever is free now.
  instant,

  /// Held for a chosen date and time.
  scheduled,

  /// Scheduled, and repeated on the same days every week.
  recurring;

  String get wire => name;

  String get label => switch (this) {
        CheckoutMode.instant => 'Instant',
        CheckoutMode.scheduled => 'Scheduled',
        CheckoutMode.recurring => 'Recurring',
      };
}

@immutable
class CheckoutState {
  const CheckoutState({
    this.mode = CheckoutMode.scheduled,
    this.scheduledAt,
    this.addressId,
    this.days = const {},
    this.notes = '',
    this.contactName = '',
    this.contactPhone = '',
  });

  final CheckoutMode mode;

  /// When the work should happen. Required for [CheckoutMode.scheduled] and
  /// [CheckoutMode.recurring]; ignored for instant.
  final DateTime? scheduledAt;

  final String? addressId;

  /// Weekday numbers (1 = Monday) for a recurring order.
  final Set<int> days;

  final String notes;

  /// Who the worker asks for at the door.
  ///
  /// Prefilled from the account the first time the cart is opened, then owned
  /// by the customer: a booking is often for somebody else's house, and the
  /// account holder's name and number are the wrong two facts to send a worker
  /// with. Empty means "not filled in yet", not "same as the account" — the
  /// prefill happens once, visibly, in the cart.
  final String contactName;
  final String contactPhone;

  /// Ten digits, and never starting below 6. Same rule the sign-up form uses,
  /// so a number accepted there is accepted here.
  static final _phonePattern = RegExp(r'^[6-9]\d{9}$');

  String get contactDigits => contactPhone.replaceAll(RegExp(r'\D'), '');

  bool get hasContact =>
      contactName.trim().length >= 2 && _phonePattern.hasMatch(contactDigits);

  bool get needsSlot => mode != CheckoutMode.instant;
  bool get needsDays => mode == CheckoutMode.recurring;

  /// Everything the order endpoint requires is present.
  ///
  /// The address is checked by the screen against the saved list rather than
  /// here, because "has an id" and "that id still exists" are different
  /// questions and only one of them is answerable from this object.
  bool get isComplete {
    if (addressId == null) return false;
    if (!hasContact) return false;
    if (needsSlot && scheduledAt == null) return false;
    if (needsDays && days.isEmpty) return false;
    return true;
  }

  CheckoutState copyWith({
    CheckoutMode? mode,
    DateTime? scheduledAt,
    bool clearScheduledAt = false,
    String? addressId,
    Set<int>? days,
    String? notes,
    String? contactName,
    String? contactPhone,
  }) =>
      CheckoutState(
        mode: mode ?? this.mode,
        scheduledAt: clearScheduledAt ? null : (scheduledAt ?? this.scheduledAt),
        addressId: addressId ?? this.addressId,
        days: days ?? this.days,
        notes: notes ?? this.notes,
        contactName: contactName ?? this.contactName,
        contactPhone: contactPhone ?? this.contactPhone,
      );
}

class CheckoutController extends Notifier<CheckoutState> {
  @override
  CheckoutState build() => const CheckoutState();

  void setMode(CheckoutMode mode) {
    // Switching to instant drops the slot rather than keeping it hidden: a
    // stale time silently reappearing when the user switches back is worse
    // than asking again.
    state = mode == CheckoutMode.instant
        ? state.copyWith(mode: mode, clearScheduledAt: true)
        : state.copyWith(mode: mode);
  }

  void setSlot(DateTime at) => state = state.copyWith(scheduledAt: at);
  void setAddress(String id) => state = state.copyWith(addressId: id);
  void setNotes(String notes) => state = state.copyWith(notes: notes);

  void setContactName(String name) => state = state.copyWith(contactName: name);
  void setContactPhone(String phone) => state = state.copyWith(contactPhone: phone);

  /// Fill the contact in from the account, without overwriting anything the
  /// customer has already typed.
  ///
  /// Called once when the cart opens. Prefilling is the whole reason this is
  /// not a burden — most orders are for the account holder, and for those the
  /// two fields are already correct and simply need looking at.
  void prefillContact({String? name, String? phone}) {
    state = state.copyWith(
      contactName: state.contactName.isEmpty ? (name ?? '') : state.contactName,
      contactPhone: state.contactPhone.isEmpty ? (phone ?? '') : state.contactPhone,
    );
  }

  void toggleDay(int weekday) {
    final days = {...state.days};
    if (!days.remove(weekday)) days.add(weekday);
    state = state.copyWith(days: days);
  }

  /// Default the address to the customer's default (or only) one.
  ///
  /// Only fills a gap — never overwrites a choice the customer has already
  /// made, which is why it checks for null first.
  void ensureAddress(List<SavedAddress> addresses) {
    if (state.addressId != null || addresses.isEmpty) return;
    final preferred = addresses.firstWhere(
      (a) => a.isDefault,
      orElse: () => addresses.first,
    );
    state = state.copyWith(addressId: preferred.id);
  }

  /// Drop a chosen slot that is now in the past.
  ///
  /// A cart can sit open for hours. Submitting "today at 09:00" at 18:00 would
  /// be accepted by the server and scheduled into the past.
  void dropStaleSlot() {
    final at = state.scheduledAt;
    if (at != null && at.isBefore(clock.now())) {
      state = state.copyWith(clearScheduledAt: true);
    }
  }

  void reset() => state = const CheckoutState();
}

final checkoutProvider =
    NotifierProvider<CheckoutController, CheckoutState>(CheckoutController.new);
