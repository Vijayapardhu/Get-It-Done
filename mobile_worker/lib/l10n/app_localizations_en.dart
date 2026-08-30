// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'GET IT DONE';

  @override
  String get appDutyOnline => 'Online';

  @override
  String get appDutyOnJob => 'On a job';

  @override
  String get appDutyOffline => 'Offline';

  @override
  String appQueuedLabel(Object count) {
    return '$count queued';
  }

  @override
  String get appBottomNavToday => 'Today';

  @override
  String get appBottomNavJobs => 'Jobs';

  @override
  String get appBottomNavEarnings => 'Earnings';

  @override
  String get signInTitleRegistering => 'Start earning with the cooperative';

  @override
  String get signInTitleReturning => 'Welcome back';

  @override
  String get signInSubtitleRegistering =>
      'You will need an ID and a bank account. It takes about ten minutes.';

  @override
  String get signInSubtitleReturning =>
      'Sign in to see your jobs and your earnings.';

  @override
  String get signInNameLabel => 'Your full name';

  @override
  String get signInNameValidation => 'Tell us your name';

  @override
  String get signInEmailLabel => 'Email';

  @override
  String get signInEmailValidation => 'Enter the email you signed up with';

  @override
  String get signInPhoneLabel => 'Phone number';

  @override
  String get signInPhoneValidation => 'We need a number the customer can ring';

  @override
  String get signInPasswordLabel => 'Password';

  @override
  String get signInPasswordValidation => 'At least 8 characters';

  @override
  String get signInConfirmLabel => 'Type your password again';

  @override
  String get signInConfirmValidation => 'The two do not match';

  @override
  String get signInPasswordsMatch => 'Passwords match';

  @override
  String get signInButtonRegister => 'Create my account';

  @override
  String get signInButtonLogin => 'Sign in';

  @override
  String get signInOrDivider => 'or';

  @override
  String get signInGoogleButton => 'Sign in with Google';

  @override
  String get signInHaveAccount => 'I already have an account';

  @override
  String get signInNewHere => 'I am new here';

  @override
  String get signInNetworkError =>
      'No connection. Check your network and try again.';

  @override
  String get signInGoogleErrorIdToken =>
      'Google sign-in failed. Please try again.';

  @override
  String get signInGoogleErrorGeneral =>
      'Google sign-in failed. Check your connection and try again.';

  @override
  String get languageGateTitle =>
      'భాష ఎంచుకోండి\nChoose your language\nभाषा चुनें';

  @override
  String get onboardingStepAboutYou => 'About you';

  @override
  String get onboardingStepAboutYouSubtitle =>
      'Where you are based, and how long you have been doing this';

  @override
  String get onboardingStepYourTrades => 'Your trades';

  @override
  String get onboardingStepYourTradesSubtitle =>
      'What work you take. You can change this later';

  @override
  String get onboardingStepHowFarTravel => 'How far you travel';

  @override
  String get onboardingStepHowFarTravelSubtitle =>
      'We will not offer you jobs beyond this';

  @override
  String get onboardingStepYourDocuments => 'Your documents';

  @override
  String get onboardingStepYourDocumentsSubtitle =>
      'An ID and anything that proves your trade';

  @override
  String get onboardingStepWhereYouGetPaid => 'Where you get paid';

  @override
  String get onboardingStepWhereYouGetPaidSubtitle =>
      'A UPI id or a bank account in your name';

  @override
  String get onboardingStepSendForChecking => 'Send for checking';

  @override
  String get onboardingStepSendForCheckingSubtitle =>
      'A cooperative admin looks at it, usually within a day';

  @override
  String get onboardingAddressLabel => 'Where you are based';

  @override
  String get onboardingExperienceLabel => 'Years doing this work';

  @override
  String get onboardingTradesError =>
      'Could not load the list of trades. Pull down to retry.';

  @override
  String get onboardingRadiusHint =>
      'A bigger area means more offers and longer journeys. You can change it any time.';

  @override
  String get onboardingDocumentsDescription =>
      'You will need a photo ID, and a certificate for any trade that needs one (gas, electrical, childcare).';

  @override
  String get onboardingUploadButton => 'Upload documents';

  @override
  String get onboardingPayoutUpi => 'UPI';

  @override
  String get onboardingPayoutBank => 'Bank account';

  @override
  String get onboardingPayoutUpiLabel => 'Your UPI id';

  @override
  String get onboardingPayoutBankLabel => 'Account number and IFSC';

  @override
  String get onboardingPayoutWarning =>
      'It must be in your own name. Payouts to somebody else\'s account cannot be released.';

  @override
  String get onboardingSubmitDescription =>
      'That is everything we need. A cooperative admin will check it, usually within a day. We will tell you as soon as it is done.';

  @override
  String get onboardingSubmitWarning =>
      'You will not be offered jobs until then.';

  @override
  String get onboardingBottomButtonFinal => 'Send for checking';

  @override
  String get onboardingBottomButtonSave => 'Save and continue';

  @override
  String get onboardingNetworkError =>
      'No connection. Nothing was lost — try again when you have signal.';

  @override
  String get verificationAppBarTitle => 'Getting you verified';

  @override
  String get verificationStatusError => 'Could not check your status.';

  @override
  String get verificationNotStartedTitle => 'You have not started yet';

  @override
  String get verificationStartButton => 'Start';

  @override
  String get verificationStatusRejected => 'Something needs fixing';

  @override
  String get verificationStatusPending => 'With the cooperative for checking';

  @override
  String verificationStatusRemaining(Object count) {
    return '$count things left';
  }

  @override
  String get verificationRejectionFallback =>
      'One of your documents could not be accepted.';

  @override
  String get verificationPendingDescription =>
      'Usually done within a day. We will tell you the moment it is.';

  @override
  String get verificationRemainingDescription =>
      'Finish these and we will send it for checking.';

  @override
  String get verificationFinishButton => 'Finish setting up';

  @override
  String get todayFinishCurrentJobFirst => 'Finish your current job first.';

  @override
  String get todayLocationNeededTitle => 'Location is needed to get jobs';

  @override
  String get todayLocationNeededContent =>
      'Jobs are offered by distance. Without your position we cannot offer you anything, and the customer cannot see you on the way.\n\nIt is only shared while you are online, and stops the moment you go offline.';

  @override
  String get todayLocationNeededDismiss => 'Not now';

  @override
  String get todayStatusChangeError =>
      'Could not change your status. Check your connection.';

  @override
  String get todayLabelOnline => 'You are online';

  @override
  String get todayDetailOnline => 'Tap to go offline';

  @override
  String get todayLabelBusy => 'On a job';

  @override
  String get todayDetailBusy => 'Finish the job to change this';

  @override
  String get todayLabelOffline => 'You are offline';

  @override
  String get todayDetailOffline => 'Tap to start taking jobs';

  @override
  String get todayStageAccepted => 'Start heading over';

  @override
  String get todayStageEnRoute => 'Tell us when you arrive';

  @override
  String get todayStageArrived => 'Get the start code';

  @override
  String get todayStageInProgress => 'Finish and get paid';

  @override
  String get todayStageDefault => 'Open';

  @override
  String get todayActiveNowLabel => 'RIGHT NOW';

  @override
  String get todayNothingBooked => 'Nothing booked yet';

  @override
  String get todayNothingBookedHint =>
      'Stay online and we will send you the next job in your area.';

  @override
  String get todayNextPrefix => 'Next: ';

  @override
  String get todayEarningsToday => 'Today';

  @override
  String get todayEarningsWeek => 'This week';

  @override
  String todayJobsCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# jobs',
      one: '# job',
    );
    return '$_temp0';
  }

  @override
  String get todayWarningVerifyTitle => 'Finish getting verified';

  @override
  String get todayWarningVerifyDetail => 'things left before you can take jobs';

  @override
  String get todayJobsLoadError => 'Could not load your jobs.';

  @override
  String get todayRetry => 'Retry';

  @override
  String get offerExpiresWarning =>
      'If you do not answer, this job goes to another worker.';

  @override
  String get offerCountdownSeconds => 'seconds';

  @override
  String get offerYouEarnLabel => 'YOU EARN';

  @override
  String offerCustomerPays(Object amount) {
    return 'Customer pays ₹$amount';
  }

  @override
  String offerDistanceKm(Object distance) {
    return '$distance km away';
  }

  @override
  String offerDriveMinutes(Object minutes) {
    return '$minutes min drive';
  }

  @override
  String offerBookedMinutes(Object minutes) {
    return '$minutes min booked';
  }

  @override
  String get offerEmergencyBanner => 'EMERGENCY — go now';

  @override
  String get offerDeclineButton => 'Decline';

  @override
  String get offerAcceptButton => 'Accept';

  @override
  String get offerDeclineTitle => 'Why are you passing?';

  @override
  String get offerDeclineHint =>
      'This does not count against you. It tells us what to offer you next.';

  @override
  String get offerDeclineReasonTooFar => 'Too far';

  @override
  String get offerDeclineReasonTooFarDetail =>
      'We will stop offering jobs this far away';

  @override
  String get offerDeclineReasonBusy => 'Busy right now';

  @override
  String get offerDeclineReasonBusyDetail =>
      'Nothing changes; we will offer you the next one';

  @override
  String get offerDeclineReasonNotMyTrade => 'Not my trade';

  @override
  String get offerDeclineReasonNotMyTradeDetail =>
      'Check your skills so this stops happening';

  @override
  String get offerDeclineReasonUnsafe => 'Does not feel safe';

  @override
  String get offerDeclineReasonUnsafeDetail => 'Reviewed by the cooperative';

  @override
  String get offerOutcomeDeclined => 'Passed. We will offer you the next one.';

  @override
  String get offerOutcomeExpired => 'That offer ran out of time.';

  @override
  String get offerOutcomeTaken => 'That job went to another worker.';

  @override
  String get offerErrorUnreachable => 'Could not reach the server. Try again.';

  @override
  String get offerErrorFailed => 'Something went wrong. Try again.';

  @override
  String get activeJobLocationError =>
      'Could not get your position. Step outside and try again.';

  @override
  String get activeJobArrivalError => 'Could not record your arrival.';

  @override
  String get activeJobPayTooltip => 'What you will be paid';

  @override
  String get activeJobNavigate => 'Navigate';

  @override
  String get activeJobCall => 'Call';

  @override
  String get activeJobSectionDoor => 'The door';

  @override
  String activeJobAskFor(Object name) {
    return 'Ask for $name';
  }

  @override
  String get activeJobSectionAlsoAtAddress => 'Also at this address';

  @override
  String get activeJobSectionYouWillBePaid => 'You will be paid';

  @override
  String get activeJobSeeBreakdown => 'See the breakdown';

  @override
  String get activeJobStatusAssigned => 'being assigned';

  @override
  String get activeJobStatusAccepted => 'confirmed';

  @override
  String get activeJobStatusEnRoute => 'on the way';

  @override
  String get activeJobStatusArrived => 'at the door';

  @override
  String get activeJobStatusStarted => 'working';

  @override
  String get activeJobStatusCompleted => 'finished';

  @override
  String get activeJobStatusCancelled => 'cancelled';

  @override
  String get activeJobActionOnMyWay => 'On my way';

  @override
  String get activeJobActionImHere => 'I\'m here';

  @override
  String get activeJobActionStartJob => 'Start the job';

  @override
  String get activeJobActionFinishJob => 'Finish the job';

  @override
  String get activeJobStepBooked => 'Booked';

  @override
  String get activeJobStepOnTheWay => 'On the way';

  @override
  String get activeJobStepAtTheDoor => 'At the door';

  @override
  String get activeJobStepWorking => 'Working';

  @override
  String get activeJobStepDone => 'Done';

  @override
  String get activeJobWaitingTitle => 'Waiting at the door';

  @override
  String get activeJobWaitingCanReport =>
      'You have waited long enough. If nobody comes, report it.';

  @override
  String activeJobWaitingCountdown(Object minutes, Object seconds) {
    return 'You can report a no-show in ${minutes}m ${seconds}s.';
  }

  @override
  String get activeJobNoShowButton => 'Customer did not appear';

  @override
  String get activeJobNoShowDialogTitle => 'Customer did not appear?';

  @override
  String get activeJobNoShowDialogContent =>
      'This ends the job. You will be paid a call-out amount for the journey, and it will not count against your completion rate.\n\nTry calling them once more first.';

  @override
  String get activeJobNoShowKeepWaiting => 'Keep waiting';

  @override
  String get activeJobNoShowReportButton => 'Report no-show';

  @override
  String activeJobNoShowReportedSnackbar(Object amount) {
    return 'Reported. ₹$amount added for the journey.';
  }

  @override
  String get activeJobLoadError => 'Could not load this job.';

  @override
  String get activeJobNoLongerYours => 'This job is no longer yours.';

  @override
  String get activeJobTimerElapsedSuffix => ' min';

  @override
  String activeJobTimerOfBookedPrefix(Object minutes) {
    return 'of $minutes booked';
  }

  @override
  String get activeJobNeedMoreTime => 'Need more time?';

  @override
  String get activeJobExtensionTitle => 'How much longer?';

  @override
  String get activeJobExtensionHint =>
      'Charged at the same rate the customer already agreed. They have to approve it.';

  @override
  String activeJobExtensionMinutes(Object minutes) {
    return '$minutes minutes';
  }

  @override
  String get activeJobExtensionHour => '1 hour';

  @override
  String activeJobExtensionHours(Object hours) {
    return '$hours hours';
  }

  @override
  String get activeJobExtensionSnackbar =>
      'Asked. The customer decides — keep working meanwhile.';

  @override
  String get otpStartJobTitle => 'Start the job';

  @override
  String get otpFinishJobTitle => 'Finish the job';

  @override
  String get otpStartCodePrompt => 'Ask the customer for the start code';

  @override
  String get otpFinishCodePrompt => 'Ask the customer for the finish code';

  @override
  String get otpTheCustomerFallback => 'the customer';

  @override
  String get otpCodeExplanation =>
      'They have it in their app. It proves you were both here.';

  @override
  String get otpNetworkError =>
      'No connection. This code has to be checked with the server — step outside and try again.';

  @override
  String get jobDetailTitle => 'Job record';

  @override
  String get jobDetailPayTooltip => 'What you were paid';

  @override
  String get jobDetailLoadError => 'Could not load this job.';

  @override
  String get jobDetailNoEvents => 'No events recorded.';

  @override
  String get jobDetailServerTimesNote =>
      'These times are recorded by the server, not by your phone.';

  @override
  String get jobDetailStatusRequested => 'Customer booked it';

  @override
  String get jobDetailStatusMatching => 'Looking for a worker';

  @override
  String get jobDetailStatusAssigned => 'Offered to you';

  @override
  String get jobDetailStatusAccepted => 'You accepted';

  @override
  String get jobDetailStatusEnRoute => 'You set off';

  @override
  String get jobDetailStatusArrived => 'You arrived';

  @override
  String get jobDetailStatusStarted => 'Work started';

  @override
  String get jobDetailStatusCompleted => 'Work finished';

  @override
  String get jobDetailStatusCancelled => 'Cancelled';

  @override
  String get jobDetailStatusNoShow => 'Customer did not appear';

  @override
  String get jobDetailStatusExpired => 'Expired';

  @override
  String get earningsLoadError => 'Could not load your earnings.';

  @override
  String get earningsThisWeek => 'THIS WEEK';

  @override
  String earningsJobsDone(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# jobs done',
      one: '# job done',
    );
    return '$_temp0';
  }

  @override
  String get earningsEveryLine => 'EVERY LINE';

  @override
  String get earningsLedgerLoadError => 'Could not load the ledger.';

  @override
  String get earningsNothingYet => 'Nothing yet.';

  @override
  String earningsPendingAmount(Object amount) {
    return '₹$amount waiting to be paid out';
  }

  @override
  String get earningsPayoutSchedule =>
      'Payouts are released by the cooperative on a schedule. You cannot request one here.';

  @override
  String get earningsJobCompleted => 'Job completed';

  @override
  String get earningsPaidOut => 'Paid out';

  @override
  String get earningsWastedJourney => 'Wasted journey';

  @override
  String get earningsAdjustment => 'Adjustment';

  @override
  String get earningsRefunded => 'Refunded';

  @override
  String get payoutBreakdownAppBarTitle => 'Your pay for this job';

  @override
  String get payoutBreakdownLoadError => 'Could not load the breakdown.';

  @override
  String get payoutBreakdownYouReceive => 'YOU RECEIVE';

  @override
  String payoutBreakdownPercentOfCustomerPaid(Object percent) {
    return '$percent% of what the customer paid';
  }

  @override
  String get payoutBreakdownWelfareFundDescription =>
      'The welfare fund pays for insurance, training and support when you cannot work. It comes out of every job on the platform, including this one.';

  @override
  String get jobsTabToday => 'Today';

  @override
  String get jobsTabUpcoming => 'Upcoming';

  @override
  String get jobsTabHistory => 'History';

  @override
  String get jobsEmptyHistory => 'Nothing finished yet.';

  @override
  String get jobsEmptyToday => 'Nothing booked for today.';

  @override
  String get jobsEmptyUpcoming => 'Nothing booked after today.';

  @override
  String get jobsLoadError => 'Could not load your jobs.';

  @override
  String get jobsNow => 'Now';

  @override
  String get alertsAppBarTitle => 'Alerts';

  @override
  String get alertsMarkAllRead => 'Mark all read';

  @override
  String get alertsLoadError => 'Could not load your alerts.';

  @override
  String get alertsEmptyState => 'Nothing yet';

  @override
  String get profileTitle => 'You';

  @override
  String get profileVerified => 'Verified';

  @override
  String get profileBeingVerified => 'Being verified';

  @override
  String get profileYourWork => 'Your work';

  @override
  String get profileTradesYouTake => 'Trades you take';

  @override
  String get profileWhereYouWork => 'Where you work';

  @override
  String get profileWorkingHours => 'Working hours';

  @override
  String get profileDocuments => 'Documents';

  @override
  String get profileLookingAfterYou => 'Looking after you';

  @override
  String get profileSafetyAndSos => 'Safety and SOS';

  @override
  String get profileWelfarePassport => 'Welfare passport';

  @override
  String get profileReviewsReceived => 'Reviews received';

  @override
  String get profileBlockedCustomers => 'Blocked customers';

  @override
  String get profileApp => 'App';

  @override
  String get profileSettings => 'Settings';

  @override
  String get profileSignOutQuestion => 'Sign out?';

  @override
  String get profileSignOutDescription =>
      'You will go offline and stop receiving job offers.';

  @override
  String get profileStay => 'Stay';

  @override
  String get profileSignOut => 'Sign out';

  @override
  String profileLastNDays(Object days) {
    return 'LAST $days DAYS';
  }

  @override
  String get profileJobsDone => 'Jobs done';

  @override
  String get profileFinished => 'Finished';

  @override
  String get profileAccepted => 'Accepted';

  @override
  String profileMedianResponse(Object seconds) {
    return 'You usually answer an offer in $seconds seconds.';
  }

  @override
  String get settingsTitle => 'Settings';

  @override
  String get settingsLanguage => 'Language';

  @override
  String get settingsHowItLooks => 'How it looks';

  @override
  String get settingsFollowThePhone => 'Follow the phone';

  @override
  String get settingsLight => 'Light';

  @override
  String get settingsDark => 'Dark';

  @override
  String get settingsBrightSunlight => 'Bright sunlight';

  @override
  String get settingsDaylightSubtitle =>
      'Maximum contrast, for working on a roof at noon.';

  @override
  String get settingsWhatYouGetOffered => 'What you get offered';

  @override
  String get settingsCouldNotLoadPreferences =>
      'Could not load your preferences.';

  @override
  String get settingsNotifications => 'Notifications';

  @override
  String get settingsJobOffers => 'Job offers';

  @override
  String get settingsJobOffersSubtitle =>
      'Always on while you are online. Use the duty toggle to stop being offered work.';

  @override
  String get settingsNoTravelLimit => 'No travel limit';

  @override
  String settingsAtMostKm(Object km) {
    return 'At most $km km';
  }

  @override
  String get settingsNoLimit => 'No limit';

  @override
  String get settingsTravelHint =>
      'A smaller limit means fewer offers, but no long journeys for small jobs.';

  @override
  String get settingsEmergencyJobs => 'Emergency jobs';

  @override
  String get settingsEmergencyJobsSubtitle =>
      'Urgent work that interrupts whatever you are doing. Usually paid more.';

  @override
  String get settingsAutoOffline => 'Go offline at the end of my shift';

  @override
  String get settingsAutoOfflineSubtitle =>
      'So you are not offered a job at 2am because you forgot.';

  @override
  String get skillsTitle => 'Trades you take';

  @override
  String get skillsSaved => 'Saved.';

  @override
  String get skillsCouldNotLoadTrades => 'Could not load your trades.';

  @override
  String get skillsCouldNotLoadTradeList =>
      'Could not load the list of trades.';

  @override
  String get skillsCertificateInfo =>
      'Some trades need a certificate before you can be offered them. Upload it under Documents and the cooperative will verify it.';

  @override
  String get skillsCertificateVerified => 'Certificate verified';

  @override
  String get skillsSave => 'Save';

  @override
  String get serviceAreasTitle => 'Where you work';

  @override
  String get serviceAreasSaved => 'Saved.';

  @override
  String get serviceAreasCouldNotLoadAreas => 'Could not load your areas.';

  @override
  String get serviceAreasAddTradeFirst => 'Add a trade first';

  @override
  String get serviceAreasAddTradeSubtitle =>
      'Your travel distance is set per trade, so there is nothing to set until you have picked at least one.';

  @override
  String get serviceAreasSave => 'Save';

  @override
  String get documentsTitle => 'Documents';

  @override
  String get documentsCouldNotLoadDocuments => 'Could not load your documents.';

  @override
  String get documentsEmptyState =>
      'Nothing uploaded yet. You will need a photo ID, and a certificate for any trade that requires one.';

  @override
  String get documentsUploadHint =>
      'Ask your cooperative admin to help you upload, or use the web portal.';

  @override
  String get documentsUploadDocument => 'Upload a document';

  @override
  String get documentsAccepted => 'Accepted';

  @override
  String get documentsNotAccepted => 'Not accepted — upload it again';

  @override
  String get documentsExpired => 'Expired';

  @override
  String get documentsWaitingToBeChecked => 'Waiting to be checked';

  @override
  String documentsExpiredDaysAgo(Object days) {
    return 'Expired $days days ago';
  }

  @override
  String documentsExpiresInDays(Object days) {
    return 'Expires in $days days';
  }

  @override
  String documentsValidUntil(Object date) {
    return 'Valid until $date';
  }

  @override
  String get documentsFallbackType => 'Document';

  @override
  String get scheduleTitle => 'Working hours';

  @override
  String get scheduleSaved =>
      'Saved. You will only be offered work in these hours.';

  @override
  String get scheduleCouldNotLoadHours => 'Could not load your hours.';

  @override
  String get scheduleEmptyState =>
      'You have not set any hours, so you can be offered work at any time you are online. Set them if you would rather not be.';

  @override
  String get scheduleSaveMyHours => 'Save my hours';

  @override
  String get scheduleTimeOff => 'TIME OFF';

  @override
  String get scheduleNoneBooked => 'None booked.';

  @override
  String get scheduleTimeOffFallback => 'Time off';

  @override
  String get scheduleBookTimeOff => 'Book time off';

  @override
  String get scheduleWhenAreYouAway => 'When are you away?';

  @override
  String scheduleStartOf(Object day) {
    return 'Start of $day';
  }

  @override
  String scheduleEndOf(Object day) {
    return 'End of $day';
  }

  @override
  String get scheduleEndMustBeAfterStart =>
      'The end has to be after the start. For a night shift, set it on both days.';

  @override
  String get scheduleNotWorking => 'Not working';

  @override
  String get safetyAppBarTitle => 'Safety';

  @override
  String get safetySosButtonLabel => 'SOS';

  @override
  String get safetyHoldInstruction => 'Hold for three seconds';

  @override
  String get safetyHoldDescription =>
      'This sends your position and your current job to the cooperative straight away, and gives you a number to call.';

  @override
  String get safetyPastAlertsHeader => 'PAST ALERTS';

  @override
  String get safetyNoPastAlerts => 'None. Good.';

  @override
  String get safetyStatusSent => 'Sent — waiting for the cooperative';

  @override
  String get safetyStatusAcknowledged => 'Someone is looking at it';

  @override
  String get safetyStatusResolved => 'Resolved';

  @override
  String get safetyStatusFalseAlarm => 'Marked a false alarm';

  @override
  String get safetyAlertDialogTitle => 'Alert sent';

  @override
  String get safetyAlertDialogContent =>
      'The operations room has your position and your current job.\n\nIf you are in immediate danger, call now.';

  @override
  String get safetyDialogCloseButton => 'Close';

  @override
  String safetyDialogCallButton(Object number) {
    return 'Call $number';
  }

  @override
  String get welfareAppBarTitle => 'Welfare passport';

  @override
  String get welfareLoadError => 'Could not load your welfare records.';

  @override
  String get welfareNoRecords => 'No welfare records found.';

  @override
  String get welfareSectionTraining => 'Training';

  @override
  String get welfareNoTrainingRecords => 'No training records yet.';

  @override
  String get welfareSectionInsurance => 'Insurance';

  @override
  String get welfareNoInsuranceRecords => 'No insurance records yet.';

  @override
  String get welfareSectionPayoutAccount => 'Payout account';

  @override
  String get welfareNoPayoutAccount => 'No payout account set up.';

  @override
  String get welfareStatusLabelInsurance => 'Insurance';

  @override
  String get welfareStatusLabelTraining => 'Training';

  @override
  String welfareCompletedPrefix(Object date) {
    return 'Completed $date';
  }

  @override
  String welfareExpiresPrefix(Object date) {
    return 'Expires $date';
  }

  @override
  String welfareCoverageLabel(Object amount) {
    return '₹$amount coverage';
  }

  @override
  String get welfareStatusExpired => 'EXPIRED';

  @override
  String get welfareStatusPending => 'PENDING';

  @override
  String get welfareStatusInProgress => 'IN PROGRESS';

  @override
  String get welfareRetryButton => 'Retry';

  @override
  String get reviewsAppBarTitle => 'Reviews';

  @override
  String get reviewsLoadError => 'Could not load reviews.';

  @override
  String get reviewsRetryButton => 'Retry';

  @override
  String get reviewsEmptyState =>
      'No reviews yet. Complete a job and the customer can leave feedback.';

  @override
  String reviewsCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# reviews',
      one: '# review',
    );
    return '($_temp0)';
  }

  @override
  String get blockedAppBarTitle => 'Blocked customers';

  @override
  String get blockedBlockTooltip => 'Block a customer';

  @override
  String get blockedLoadError => 'Could not load blocked customers.';

  @override
  String get blockedRetryButton => 'Retry';

  @override
  String get blockedEmptyState =>
      'No blocked customers.\n\nWhen you block a customer, you will never be offered their jobs again.';

  @override
  String get blockedDialogCustomerLabel => 'Customer ID';

  @override
  String get blockedDialogCustomerHint => 'Paste the customer\'s ID';

  @override
  String get blockedDialogCancelButton => 'Cancel';

  @override
  String get blockedDialogBlockButton => 'Block';

  @override
  String get blockedBlockError => 'Could not block customer.';

  @override
  String get blockedUnblockDialogTitle => 'Unblock?';

  @override
  String blockedUnDialogContent(Object name) {
    return 'You may be offered jobs from $name again.';
  }

  @override
  String get blockedUnblockKeepButton => 'Keep blocked';

  @override
  String get blockedUnblockConfirmButton => 'Unblock';

  @override
  String get blockedUnblockTooltip => 'Unblock';

  @override
  String get blockedUnblockError => 'Could not unblock customer.';

  @override
  String blockedDatePrefix(Object date) {
    return 'Blocked $date';
  }
}
