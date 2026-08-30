import 'package:flutter/widgets.dart';

import 'colors.dart';
import 'spacing.dart';

/// Duty status: the most-read fact in the worker app.
///
/// It gets its own colour role and never shares one. `success` already means
/// "completed" and `warning` already means "expiring", and a worker glancing at
/// a phone in sunlight between jobs is reading for one thing only — am I on?
///
/// These are roles, not new hexes. They resolve to the same semantic values the
/// rest of the system uses, so a change to `AppColors.success` moves both.
abstract final class Duty {
  /// On duty, taking offers.
  static const online = AppColors.success;
  static const onlineSoft = AppColors.successSoft;

  /// On a job. Still on duty, not offerable.
  static const busy = AppColors.warning;
  static const busySoft = AppColors.warningSoft;

  /// Off duty. Grey, deliberately: "off" should look inert, not alarming.
  static const offline = AppColors.n400;
  static const offlineSoft = AppColors.n100;

  /// The countdown ring under ten seconds. The one place `danger` is allowed to
  /// mean "hurry" rather than "destructive".
  static const offerUrgent = AppColors.danger;
  static const offerUrgentSoft = AppColors.dangerSoft;
}

/// Sizes the worker app overrides.
///
/// The customer app is used indoors, seated, with two hands and full attention.
/// This one is used outdoors, standing, one-handed, sometimes with wet or
/// gloved hands, on a cracked screen in direct sun. Every number here is
/// larger than its customer-app equivalent for that reason and no other.
abstract final class WorkerSizes {
  /// Primary action height. `Sizes.buttonMd` is 52.
  static const double button = 56;

  /// Job-state actions — Accept, Decline, I'm here, Start, Complete. These are
  /// pressed in the situations the app exists for, and a mis-tap on one of them
  /// costs the worker a job or the customer a wait.
  static const double jobAction = 64;

  /// The duty toggle. Full width, and taller than anything else on Today.
  static const double dutyToggle = 72;

  /// Nothing in this app renders below 13pt. See [WorkerTypeScale].
  static const double minFontSize = 13;

  /// Text-scale clamp. Wider than the customer app's 0.9–1.3 because worker
  /// layouts are single-column and can absorb it — and because this audience
  /// includes people who have set their phone to its largest text for a reason.
  static const double textScaleMin = 0.9;
  static const double textScaleMax = 1.5;

  /// Denser list rows between jobs, because more rows on screen is worth more
  /// than air when you are checking what is next.
  static const rowInsets = EdgeInsets.symmetric(horizontal: Space.page, vertical: Space.x3);
}
