import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_hi.dart';
import 'app_localizations_te.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('te'),
    Locale('hi'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'GET IT DONE'**
  String get appTitle;

  /// No description provided for @appDutyOnline.
  ///
  /// In en, this message translates to:
  /// **'Online'**
  String get appDutyOnline;

  /// No description provided for @appDutyOnJob.
  ///
  /// In en, this message translates to:
  /// **'On a job'**
  String get appDutyOnJob;

  /// No description provided for @appDutyOffline.
  ///
  /// In en, this message translates to:
  /// **'Offline'**
  String get appDutyOffline;

  /// No description provided for @appQueuedLabel.
  ///
  /// In en, this message translates to:
  /// **'{count} queued'**
  String appQueuedLabel(Object count);

  /// No description provided for @appBottomNavToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get appBottomNavToday;

  /// No description provided for @appBottomNavJobs.
  ///
  /// In en, this message translates to:
  /// **'Jobs'**
  String get appBottomNavJobs;

  /// No description provided for @appBottomNavEarnings.
  ///
  /// In en, this message translates to:
  /// **'Earnings'**
  String get appBottomNavEarnings;

  /// No description provided for @signInTitleRegistering.
  ///
  /// In en, this message translates to:
  /// **'Start earning with the cooperative'**
  String get signInTitleRegistering;

  /// No description provided for @signInTitleReturning.
  ///
  /// In en, this message translates to:
  /// **'Welcome back'**
  String get signInTitleReturning;

  /// No description provided for @signInSubtitleRegistering.
  ///
  /// In en, this message translates to:
  /// **'You will need an ID and a bank account. It takes about ten minutes.'**
  String get signInSubtitleRegistering;

  /// No description provided for @signInSubtitleReturning.
  ///
  /// In en, this message translates to:
  /// **'Sign in to see your jobs and your earnings.'**
  String get signInSubtitleReturning;

  /// No description provided for @signInNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Your full name'**
  String get signInNameLabel;

  /// No description provided for @signInNameValidation.
  ///
  /// In en, this message translates to:
  /// **'Tell us your name'**
  String get signInNameValidation;

  /// No description provided for @signInEmailLabel.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get signInEmailLabel;

  /// No description provided for @signInEmailValidation.
  ///
  /// In en, this message translates to:
  /// **'Enter the email you signed up with'**
  String get signInEmailValidation;

  /// No description provided for @signInPhoneLabel.
  ///
  /// In en, this message translates to:
  /// **'Phone number'**
  String get signInPhoneLabel;

  /// No description provided for @signInPhoneValidation.
  ///
  /// In en, this message translates to:
  /// **'We need a number the customer can ring'**
  String get signInPhoneValidation;

  /// No description provided for @signInPasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get signInPasswordLabel;

  /// No description provided for @signInPasswordValidation.
  ///
  /// In en, this message translates to:
  /// **'At least 8 characters'**
  String get signInPasswordValidation;

  /// No description provided for @signInConfirmLabel.
  ///
  /// In en, this message translates to:
  /// **'Type your password again'**
  String get signInConfirmLabel;

  /// No description provided for @signInConfirmValidation.
  ///
  /// In en, this message translates to:
  /// **'The two do not match'**
  String get signInConfirmValidation;

  /// No description provided for @signInPasswordsMatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords match'**
  String get signInPasswordsMatch;

  /// No description provided for @signInButtonRegister.
  ///
  /// In en, this message translates to:
  /// **'Create my account'**
  String get signInButtonRegister;

  /// No description provided for @signInButtonLogin.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signInButtonLogin;

  /// No description provided for @signInOrDivider.
  ///
  /// In en, this message translates to:
  /// **'or'**
  String get signInOrDivider;

  /// No description provided for @signInGoogleButton.
  ///
  /// In en, this message translates to:
  /// **'Sign in with Google'**
  String get signInGoogleButton;

  /// No description provided for @signInHaveAccount.
  ///
  /// In en, this message translates to:
  /// **'I already have an account'**
  String get signInHaveAccount;

  /// No description provided for @signInNewHere.
  ///
  /// In en, this message translates to:
  /// **'I am new here'**
  String get signInNewHere;

  /// No description provided for @signInNetworkError.
  ///
  /// In en, this message translates to:
  /// **'No connection. Check your network and try again.'**
  String get signInNetworkError;

  /// No description provided for @signInGoogleErrorIdToken.
  ///
  /// In en, this message translates to:
  /// **'Google sign-in failed. Please try again.'**
  String get signInGoogleErrorIdToken;

  /// No description provided for @signInGoogleErrorGeneral.
  ///
  /// In en, this message translates to:
  /// **'Google sign-in failed. Check your connection and try again.'**
  String get signInGoogleErrorGeneral;

  /// No description provided for @languageGateTitle.
  ///
  /// In en, this message translates to:
  /// **'భాష ఎంచుకోండి\nChoose your language\nभाषा चुनें'**
  String get languageGateTitle;

  /// No description provided for @onboardingStepAboutYou.
  ///
  /// In en, this message translates to:
  /// **'About you'**
  String get onboardingStepAboutYou;

  /// No description provided for @onboardingStepAboutYouSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Where you are based, and how long you have been doing this'**
  String get onboardingStepAboutYouSubtitle;

  /// No description provided for @onboardingStepYourTrades.
  ///
  /// In en, this message translates to:
  /// **'Your trades'**
  String get onboardingStepYourTrades;

  /// No description provided for @onboardingStepYourTradesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'What work you take. You can change this later'**
  String get onboardingStepYourTradesSubtitle;

  /// No description provided for @onboardingStepHowFarTravel.
  ///
  /// In en, this message translates to:
  /// **'How far you travel'**
  String get onboardingStepHowFarTravel;

  /// No description provided for @onboardingStepHowFarTravelSubtitle.
  ///
  /// In en, this message translates to:
  /// **'We will not offer you jobs beyond this'**
  String get onboardingStepHowFarTravelSubtitle;

  /// No description provided for @onboardingStepYourDocuments.
  ///
  /// In en, this message translates to:
  /// **'Your documents'**
  String get onboardingStepYourDocuments;

  /// No description provided for @onboardingStepYourDocumentsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'An ID and anything that proves your trade'**
  String get onboardingStepYourDocumentsSubtitle;

  /// No description provided for @onboardingStepWhereYouGetPaid.
  ///
  /// In en, this message translates to:
  /// **'Where you get paid'**
  String get onboardingStepWhereYouGetPaid;

  /// No description provided for @onboardingStepWhereYouGetPaidSubtitle.
  ///
  /// In en, this message translates to:
  /// **'A UPI id or a bank account in your name'**
  String get onboardingStepWhereYouGetPaidSubtitle;

  /// No description provided for @onboardingStepSendForChecking.
  ///
  /// In en, this message translates to:
  /// **'Send for checking'**
  String get onboardingStepSendForChecking;

  /// No description provided for @onboardingStepSendForCheckingSubtitle.
  ///
  /// In en, this message translates to:
  /// **'A cooperative admin looks at it, usually within a day'**
  String get onboardingStepSendForCheckingSubtitle;

  /// No description provided for @onboardingAddressLabel.
  ///
  /// In en, this message translates to:
  /// **'Where you are based'**
  String get onboardingAddressLabel;

  /// No description provided for @onboardingExperienceLabel.
  ///
  /// In en, this message translates to:
  /// **'Years doing this work'**
  String get onboardingExperienceLabel;

  /// No description provided for @onboardingTradesError.
  ///
  /// In en, this message translates to:
  /// **'Could not load the list of trades. Pull down to retry.'**
  String get onboardingTradesError;

  /// No description provided for @onboardingRadiusHint.
  ///
  /// In en, this message translates to:
  /// **'A bigger area means more offers and longer journeys. You can change it any time.'**
  String get onboardingRadiusHint;

  /// No description provided for @onboardingDocumentsDescription.
  ///
  /// In en, this message translates to:
  /// **'You will need a photo ID, and a certificate for any trade that needs one (gas, electrical, childcare).'**
  String get onboardingDocumentsDescription;

  /// No description provided for @onboardingUploadButton.
  ///
  /// In en, this message translates to:
  /// **'Upload documents'**
  String get onboardingUploadButton;

  /// No description provided for @onboardingPayoutUpi.
  ///
  /// In en, this message translates to:
  /// **'UPI'**
  String get onboardingPayoutUpi;

  /// No description provided for @onboardingPayoutBank.
  ///
  /// In en, this message translates to:
  /// **'Bank account'**
  String get onboardingPayoutBank;

  /// No description provided for @onboardingPayoutUpiLabel.
  ///
  /// In en, this message translates to:
  /// **'Your UPI id'**
  String get onboardingPayoutUpiLabel;

  /// No description provided for @onboardingPayoutBankLabel.
  ///
  /// In en, this message translates to:
  /// **'Account number and IFSC'**
  String get onboardingPayoutBankLabel;

  /// No description provided for @onboardingPayoutWarning.
  ///
  /// In en, this message translates to:
  /// **'It must be in your own name. Payouts to somebody else\'s account cannot be released.'**
  String get onboardingPayoutWarning;

  /// No description provided for @onboardingSubmitDescription.
  ///
  /// In en, this message translates to:
  /// **'That is everything we need. A cooperative admin will check it, usually within a day. We will tell you as soon as it is done.'**
  String get onboardingSubmitDescription;

  /// No description provided for @onboardingSubmitWarning.
  ///
  /// In en, this message translates to:
  /// **'You will not be offered jobs until then.'**
  String get onboardingSubmitWarning;

  /// No description provided for @onboardingBottomButtonFinal.
  ///
  /// In en, this message translates to:
  /// **'Send for checking'**
  String get onboardingBottomButtonFinal;

  /// No description provided for @onboardingBottomButtonSave.
  ///
  /// In en, this message translates to:
  /// **'Save and continue'**
  String get onboardingBottomButtonSave;

  /// No description provided for @onboardingNetworkError.
  ///
  /// In en, this message translates to:
  /// **'No connection. Nothing was lost — try again when you have signal.'**
  String get onboardingNetworkError;

  /// No description provided for @verificationAppBarTitle.
  ///
  /// In en, this message translates to:
  /// **'Getting you verified'**
  String get verificationAppBarTitle;

  /// No description provided for @verificationStatusError.
  ///
  /// In en, this message translates to:
  /// **'Could not check your status.'**
  String get verificationStatusError;

  /// No description provided for @verificationNotStartedTitle.
  ///
  /// In en, this message translates to:
  /// **'You have not started yet'**
  String get verificationNotStartedTitle;

  /// No description provided for @verificationStartButton.
  ///
  /// In en, this message translates to:
  /// **'Start'**
  String get verificationStartButton;

  /// No description provided for @verificationStatusRejected.
  ///
  /// In en, this message translates to:
  /// **'Something needs fixing'**
  String get verificationStatusRejected;

  /// No description provided for @verificationStatusPending.
  ///
  /// In en, this message translates to:
  /// **'With the cooperative for checking'**
  String get verificationStatusPending;

  /// No description provided for @verificationStatusRemaining.
  ///
  /// In en, this message translates to:
  /// **'{count} things left'**
  String verificationStatusRemaining(Object count);

  /// No description provided for @verificationRejectionFallback.
  ///
  /// In en, this message translates to:
  /// **'One of your documents could not be accepted.'**
  String get verificationRejectionFallback;

  /// No description provided for @verificationPendingDescription.
  ///
  /// In en, this message translates to:
  /// **'Usually done within a day. We will tell you the moment it is.'**
  String get verificationPendingDescription;

  /// No description provided for @verificationRemainingDescription.
  ///
  /// In en, this message translates to:
  /// **'Finish these and we will send it for checking.'**
  String get verificationRemainingDescription;

  /// No description provided for @verificationFinishButton.
  ///
  /// In en, this message translates to:
  /// **'Finish setting up'**
  String get verificationFinishButton;

  /// No description provided for @todayFinishCurrentJobFirst.
  ///
  /// In en, this message translates to:
  /// **'Finish your current job first.'**
  String get todayFinishCurrentJobFirst;

  /// No description provided for @todayLocationNeededTitle.
  ///
  /// In en, this message translates to:
  /// **'Location is needed to get jobs'**
  String get todayLocationNeededTitle;

  /// No description provided for @todayLocationNeededContent.
  ///
  /// In en, this message translates to:
  /// **'Jobs are offered by distance. Without your position we cannot offer you anything, and the customer cannot see you on the way.\n\nIt is only shared while you are online, and stops the moment you go offline.'**
  String get todayLocationNeededContent;

  /// No description provided for @todayLocationNeededDismiss.
  ///
  /// In en, this message translates to:
  /// **'Not now'**
  String get todayLocationNeededDismiss;

  /// No description provided for @todayStatusChangeError.
  ///
  /// In en, this message translates to:
  /// **'Could not change your status. Check your connection.'**
  String get todayStatusChangeError;

  /// No description provided for @todayLabelOnline.
  ///
  /// In en, this message translates to:
  /// **'You are online'**
  String get todayLabelOnline;

  /// No description provided for @todayDetailOnline.
  ///
  /// In en, this message translates to:
  /// **'Tap to go offline'**
  String get todayDetailOnline;

  /// No description provided for @todayLabelBusy.
  ///
  /// In en, this message translates to:
  /// **'On a job'**
  String get todayLabelBusy;

  /// No description provided for @todayDetailBusy.
  ///
  /// In en, this message translates to:
  /// **'Finish the job to change this'**
  String get todayDetailBusy;

  /// No description provided for @todayLabelOffline.
  ///
  /// In en, this message translates to:
  /// **'You are offline'**
  String get todayLabelOffline;

  /// No description provided for @todayDetailOffline.
  ///
  /// In en, this message translates to:
  /// **'Tap to start taking jobs'**
  String get todayDetailOffline;

  /// No description provided for @todayStageAccepted.
  ///
  /// In en, this message translates to:
  /// **'Start heading over'**
  String get todayStageAccepted;

  /// No description provided for @todayStageEnRoute.
  ///
  /// In en, this message translates to:
  /// **'Tell us when you arrive'**
  String get todayStageEnRoute;

  /// No description provided for @todayStageArrived.
  ///
  /// In en, this message translates to:
  /// **'Get the start code'**
  String get todayStageArrived;

  /// No description provided for @todayStageInProgress.
  ///
  /// In en, this message translates to:
  /// **'Finish and get paid'**
  String get todayStageInProgress;

  /// No description provided for @todayStageDefault.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get todayStageDefault;

  /// No description provided for @todayActiveNowLabel.
  ///
  /// In en, this message translates to:
  /// **'RIGHT NOW'**
  String get todayActiveNowLabel;

  /// No description provided for @todayNothingBooked.
  ///
  /// In en, this message translates to:
  /// **'Nothing booked yet'**
  String get todayNothingBooked;

  /// No description provided for @todayNothingBookedHint.
  ///
  /// In en, this message translates to:
  /// **'Stay online and we will send you the next job in your area.'**
  String get todayNothingBookedHint;

  /// No description provided for @todayNextPrefix.
  ///
  /// In en, this message translates to:
  /// **'Next: '**
  String get todayNextPrefix;

  /// No description provided for @todayEarningsToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get todayEarningsToday;

  /// No description provided for @todayEarningsWeek.
  ///
  /// In en, this message translates to:
  /// **'This week'**
  String get todayEarningsWeek;

  /// No description provided for @todayJobsCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{# job} other{# jobs}}'**
  String todayJobsCount(num count);

  /// No description provided for @todayWarningVerifyTitle.
  ///
  /// In en, this message translates to:
  /// **'Finish getting verified'**
  String get todayWarningVerifyTitle;

  /// No description provided for @todayWarningVerifyDetail.
  ///
  /// In en, this message translates to:
  /// **'things left before you can take jobs'**
  String get todayWarningVerifyDetail;

  /// No description provided for @todayJobsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load your jobs.'**
  String get todayJobsLoadError;

  /// No description provided for @todayRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get todayRetry;

  /// No description provided for @offerExpiresWarning.
  ///
  /// In en, this message translates to:
  /// **'If you do not answer, this job goes to another worker.'**
  String get offerExpiresWarning;

  /// No description provided for @offerCountdownSeconds.
  ///
  /// In en, this message translates to:
  /// **'seconds'**
  String get offerCountdownSeconds;

  /// No description provided for @offerYouEarnLabel.
  ///
  /// In en, this message translates to:
  /// **'YOU EARN'**
  String get offerYouEarnLabel;

  /// No description provided for @offerCustomerPays.
  ///
  /// In en, this message translates to:
  /// **'Customer pays ₹{amount}'**
  String offerCustomerPays(Object amount);

  /// No description provided for @offerDistanceKm.
  ///
  /// In en, this message translates to:
  /// **'{distance} km away'**
  String offerDistanceKm(Object distance);

  /// No description provided for @offerDriveMinutes.
  ///
  /// In en, this message translates to:
  /// **'{minutes} min drive'**
  String offerDriveMinutes(Object minutes);

  /// No description provided for @offerBookedMinutes.
  ///
  /// In en, this message translates to:
  /// **'{minutes} min booked'**
  String offerBookedMinutes(Object minutes);

  /// No description provided for @offerEmergencyBanner.
  ///
  /// In en, this message translates to:
  /// **'EMERGENCY — go now'**
  String get offerEmergencyBanner;

  /// No description provided for @offerDeclineButton.
  ///
  /// In en, this message translates to:
  /// **'Decline'**
  String get offerDeclineButton;

  /// No description provided for @offerAcceptButton.
  ///
  /// In en, this message translates to:
  /// **'Accept'**
  String get offerAcceptButton;

  /// No description provided for @offerDeclineTitle.
  ///
  /// In en, this message translates to:
  /// **'Why are you passing?'**
  String get offerDeclineTitle;

  /// No description provided for @offerDeclineHint.
  ///
  /// In en, this message translates to:
  /// **'This does not count against you. It tells us what to offer you next.'**
  String get offerDeclineHint;

  /// No description provided for @offerDeclineReasonTooFar.
  ///
  /// In en, this message translates to:
  /// **'Too far'**
  String get offerDeclineReasonTooFar;

  /// No description provided for @offerDeclineReasonTooFarDetail.
  ///
  /// In en, this message translates to:
  /// **'We will stop offering jobs this far away'**
  String get offerDeclineReasonTooFarDetail;

  /// No description provided for @offerDeclineReasonBusy.
  ///
  /// In en, this message translates to:
  /// **'Busy right now'**
  String get offerDeclineReasonBusy;

  /// No description provided for @offerDeclineReasonBusyDetail.
  ///
  /// In en, this message translates to:
  /// **'Nothing changes; we will offer you the next one'**
  String get offerDeclineReasonBusyDetail;

  /// No description provided for @offerDeclineReasonNotMyTrade.
  ///
  /// In en, this message translates to:
  /// **'Not my trade'**
  String get offerDeclineReasonNotMyTrade;

  /// No description provided for @offerDeclineReasonNotMyTradeDetail.
  ///
  /// In en, this message translates to:
  /// **'Check your skills so this stops happening'**
  String get offerDeclineReasonNotMyTradeDetail;

  /// No description provided for @offerDeclineReasonUnsafe.
  ///
  /// In en, this message translates to:
  /// **'Does not feel safe'**
  String get offerDeclineReasonUnsafe;

  /// No description provided for @offerDeclineReasonUnsafeDetail.
  ///
  /// In en, this message translates to:
  /// **'Reviewed by the cooperative'**
  String get offerDeclineReasonUnsafeDetail;

  /// No description provided for @offerOutcomeDeclined.
  ///
  /// In en, this message translates to:
  /// **'Passed. We will offer you the next one.'**
  String get offerOutcomeDeclined;

  /// No description provided for @offerOutcomeExpired.
  ///
  /// In en, this message translates to:
  /// **'That offer ran out of time.'**
  String get offerOutcomeExpired;

  /// No description provided for @offerOutcomeTaken.
  ///
  /// In en, this message translates to:
  /// **'That job went to another worker.'**
  String get offerOutcomeTaken;

  /// No description provided for @offerErrorUnreachable.
  ///
  /// In en, this message translates to:
  /// **'Could not reach the server. Try again.'**
  String get offerErrorUnreachable;

  /// No description provided for @offerErrorFailed.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong. Try again.'**
  String get offerErrorFailed;

  /// No description provided for @activeJobLocationError.
  ///
  /// In en, this message translates to:
  /// **'Could not get your position. Step outside and try again.'**
  String get activeJobLocationError;

  /// No description provided for @activeJobArrivalError.
  ///
  /// In en, this message translates to:
  /// **'Could not record your arrival.'**
  String get activeJobArrivalError;

  /// No description provided for @activeJobPayTooltip.
  ///
  /// In en, this message translates to:
  /// **'What you will be paid'**
  String get activeJobPayTooltip;

  /// No description provided for @activeJobNavigate.
  ///
  /// In en, this message translates to:
  /// **'Navigate'**
  String get activeJobNavigate;

  /// No description provided for @activeJobCall.
  ///
  /// In en, this message translates to:
  /// **'Call'**
  String get activeJobCall;

  /// No description provided for @activeJobSectionDoor.
  ///
  /// In en, this message translates to:
  /// **'The door'**
  String get activeJobSectionDoor;

  /// No description provided for @activeJobAskFor.
  ///
  /// In en, this message translates to:
  /// **'Ask for {name}'**
  String activeJobAskFor(Object name);

  /// No description provided for @activeJobSectionAlsoAtAddress.
  ///
  /// In en, this message translates to:
  /// **'Also at this address'**
  String get activeJobSectionAlsoAtAddress;

  /// No description provided for @activeJobSectionYouWillBePaid.
  ///
  /// In en, this message translates to:
  /// **'You will be paid'**
  String get activeJobSectionYouWillBePaid;

  /// No description provided for @activeJobSeeBreakdown.
  ///
  /// In en, this message translates to:
  /// **'See the breakdown'**
  String get activeJobSeeBreakdown;

  /// No description provided for @activeJobStatusAssigned.
  ///
  /// In en, this message translates to:
  /// **'being assigned'**
  String get activeJobStatusAssigned;

  /// No description provided for @activeJobStatusAccepted.
  ///
  /// In en, this message translates to:
  /// **'confirmed'**
  String get activeJobStatusAccepted;

  /// No description provided for @activeJobStatusEnRoute.
  ///
  /// In en, this message translates to:
  /// **'on the way'**
  String get activeJobStatusEnRoute;

  /// No description provided for @activeJobStatusArrived.
  ///
  /// In en, this message translates to:
  /// **'at the door'**
  String get activeJobStatusArrived;

  /// No description provided for @activeJobStatusStarted.
  ///
  /// In en, this message translates to:
  /// **'working'**
  String get activeJobStatusStarted;

  /// No description provided for @activeJobStatusCompleted.
  ///
  /// In en, this message translates to:
  /// **'finished'**
  String get activeJobStatusCompleted;

  /// No description provided for @activeJobStatusCancelled.
  ///
  /// In en, this message translates to:
  /// **'cancelled'**
  String get activeJobStatusCancelled;

  /// No description provided for @activeJobActionOnMyWay.
  ///
  /// In en, this message translates to:
  /// **'On my way'**
  String get activeJobActionOnMyWay;

  /// No description provided for @activeJobActionImHere.
  ///
  /// In en, this message translates to:
  /// **'I\'m here'**
  String get activeJobActionImHere;

  /// No description provided for @activeJobActionStartJob.
  ///
  /// In en, this message translates to:
  /// **'Start the job'**
  String get activeJobActionStartJob;

  /// No description provided for @activeJobActionFinishJob.
  ///
  /// In en, this message translates to:
  /// **'Finish the job'**
  String get activeJobActionFinishJob;

  /// No description provided for @activeJobStepBooked.
  ///
  /// In en, this message translates to:
  /// **'Booked'**
  String get activeJobStepBooked;

  /// No description provided for @activeJobStepOnTheWay.
  ///
  /// In en, this message translates to:
  /// **'On the way'**
  String get activeJobStepOnTheWay;

  /// No description provided for @activeJobStepAtTheDoor.
  ///
  /// In en, this message translates to:
  /// **'At the door'**
  String get activeJobStepAtTheDoor;

  /// No description provided for @activeJobStepWorking.
  ///
  /// In en, this message translates to:
  /// **'Working'**
  String get activeJobStepWorking;

  /// No description provided for @activeJobStepDone.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get activeJobStepDone;

  /// No description provided for @activeJobWaitingTitle.
  ///
  /// In en, this message translates to:
  /// **'Waiting at the door'**
  String get activeJobWaitingTitle;

  /// No description provided for @activeJobWaitingCanReport.
  ///
  /// In en, this message translates to:
  /// **'You have waited long enough. If nobody comes, report it.'**
  String get activeJobWaitingCanReport;

  /// No description provided for @activeJobWaitingCountdown.
  ///
  /// In en, this message translates to:
  /// **'You can report a no-show in {minutes}m {seconds}s.'**
  String activeJobWaitingCountdown(Object minutes, Object seconds);

  /// No description provided for @activeJobNoShowButton.
  ///
  /// In en, this message translates to:
  /// **'Customer did not appear'**
  String get activeJobNoShowButton;

  /// No description provided for @activeJobNoShowDialogTitle.
  ///
  /// In en, this message translates to:
  /// **'Customer did not appear?'**
  String get activeJobNoShowDialogTitle;

  /// No description provided for @activeJobNoShowDialogContent.
  ///
  /// In en, this message translates to:
  /// **'This ends the job. You will be paid a call-out amount for the journey, and it will not count against your completion rate.\n\nTry calling them once more first.'**
  String get activeJobNoShowDialogContent;

  /// No description provided for @activeJobNoShowKeepWaiting.
  ///
  /// In en, this message translates to:
  /// **'Keep waiting'**
  String get activeJobNoShowKeepWaiting;

  /// No description provided for @activeJobNoShowReportButton.
  ///
  /// In en, this message translates to:
  /// **'Report no-show'**
  String get activeJobNoShowReportButton;

  /// No description provided for @activeJobNoShowReportedSnackbar.
  ///
  /// In en, this message translates to:
  /// **'Reported. ₹{amount} added for the journey.'**
  String activeJobNoShowReportedSnackbar(Object amount);

  /// No description provided for @activeJobLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load this job.'**
  String get activeJobLoadError;

  /// No description provided for @activeJobNoLongerYours.
  ///
  /// In en, this message translates to:
  /// **'This job is no longer yours.'**
  String get activeJobNoLongerYours;

  /// No description provided for @activeJobTimerElapsedSuffix.
  ///
  /// In en, this message translates to:
  /// **' min'**
  String get activeJobTimerElapsedSuffix;

  /// No description provided for @activeJobTimerOfBookedPrefix.
  ///
  /// In en, this message translates to:
  /// **'of {minutes} booked'**
  String activeJobTimerOfBookedPrefix(Object minutes);

  /// No description provided for @activeJobNeedMoreTime.
  ///
  /// In en, this message translates to:
  /// **'Need more time?'**
  String get activeJobNeedMoreTime;

  /// No description provided for @activeJobExtensionTitle.
  ///
  /// In en, this message translates to:
  /// **'How much longer?'**
  String get activeJobExtensionTitle;

  /// No description provided for @activeJobExtensionHint.
  ///
  /// In en, this message translates to:
  /// **'Charged at the same rate the customer already agreed. They have to approve it.'**
  String get activeJobExtensionHint;

  /// No description provided for @activeJobExtensionMinutes.
  ///
  /// In en, this message translates to:
  /// **'{minutes} minutes'**
  String activeJobExtensionMinutes(Object minutes);

  /// No description provided for @activeJobExtensionHour.
  ///
  /// In en, this message translates to:
  /// **'1 hour'**
  String get activeJobExtensionHour;

  /// No description provided for @activeJobExtensionHours.
  ///
  /// In en, this message translates to:
  /// **'{hours} hours'**
  String activeJobExtensionHours(Object hours);

  /// No description provided for @activeJobExtensionSnackbar.
  ///
  /// In en, this message translates to:
  /// **'Asked. The customer decides — keep working meanwhile.'**
  String get activeJobExtensionSnackbar;

  /// No description provided for @otpStartJobTitle.
  ///
  /// In en, this message translates to:
  /// **'Start the job'**
  String get otpStartJobTitle;

  /// No description provided for @otpFinishJobTitle.
  ///
  /// In en, this message translates to:
  /// **'Finish the job'**
  String get otpFinishJobTitle;

  /// No description provided for @otpStartCodePrompt.
  ///
  /// In en, this message translates to:
  /// **'Ask the customer for the start code'**
  String get otpStartCodePrompt;

  /// No description provided for @otpFinishCodePrompt.
  ///
  /// In en, this message translates to:
  /// **'Ask the customer for the finish code'**
  String get otpFinishCodePrompt;

  /// No description provided for @otpTheCustomerFallback.
  ///
  /// In en, this message translates to:
  /// **'the customer'**
  String get otpTheCustomerFallback;

  /// No description provided for @otpCodeExplanation.
  ///
  /// In en, this message translates to:
  /// **'They have it in their app. It proves you were both here.'**
  String get otpCodeExplanation;

  /// No description provided for @otpNetworkError.
  ///
  /// In en, this message translates to:
  /// **'No connection. This code has to be checked with the server — step outside and try again.'**
  String get otpNetworkError;

  /// No description provided for @jobDetailTitle.
  ///
  /// In en, this message translates to:
  /// **'Job record'**
  String get jobDetailTitle;

  /// No description provided for @jobDetailPayTooltip.
  ///
  /// In en, this message translates to:
  /// **'What you were paid'**
  String get jobDetailPayTooltip;

  /// No description provided for @jobDetailLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load this job.'**
  String get jobDetailLoadError;

  /// No description provided for @jobDetailNoEvents.
  ///
  /// In en, this message translates to:
  /// **'No events recorded.'**
  String get jobDetailNoEvents;

  /// No description provided for @jobDetailServerTimesNote.
  ///
  /// In en, this message translates to:
  /// **'These times are recorded by the server, not by your phone.'**
  String get jobDetailServerTimesNote;

  /// No description provided for @jobDetailStatusRequested.
  ///
  /// In en, this message translates to:
  /// **'Customer booked it'**
  String get jobDetailStatusRequested;

  /// No description provided for @jobDetailStatusMatching.
  ///
  /// In en, this message translates to:
  /// **'Looking for a worker'**
  String get jobDetailStatusMatching;

  /// No description provided for @jobDetailStatusAssigned.
  ///
  /// In en, this message translates to:
  /// **'Offered to you'**
  String get jobDetailStatusAssigned;

  /// No description provided for @jobDetailStatusAccepted.
  ///
  /// In en, this message translates to:
  /// **'You accepted'**
  String get jobDetailStatusAccepted;

  /// No description provided for @jobDetailStatusEnRoute.
  ///
  /// In en, this message translates to:
  /// **'You set off'**
  String get jobDetailStatusEnRoute;

  /// No description provided for @jobDetailStatusArrived.
  ///
  /// In en, this message translates to:
  /// **'You arrived'**
  String get jobDetailStatusArrived;

  /// No description provided for @jobDetailStatusStarted.
  ///
  /// In en, this message translates to:
  /// **'Work started'**
  String get jobDetailStatusStarted;

  /// No description provided for @jobDetailStatusCompleted.
  ///
  /// In en, this message translates to:
  /// **'Work finished'**
  String get jobDetailStatusCompleted;

  /// No description provided for @jobDetailStatusCancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get jobDetailStatusCancelled;

  /// No description provided for @jobDetailStatusNoShow.
  ///
  /// In en, this message translates to:
  /// **'Customer did not appear'**
  String get jobDetailStatusNoShow;

  /// No description provided for @jobDetailStatusExpired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get jobDetailStatusExpired;

  /// No description provided for @earningsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load your earnings.'**
  String get earningsLoadError;

  /// No description provided for @earningsThisWeek.
  ///
  /// In en, this message translates to:
  /// **'THIS WEEK'**
  String get earningsThisWeek;

  /// No description provided for @earningsJobsDone.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{# job done} other{# jobs done}}'**
  String earningsJobsDone(num count);

  /// No description provided for @earningsEveryLine.
  ///
  /// In en, this message translates to:
  /// **'EVERY LINE'**
  String get earningsEveryLine;

  /// No description provided for @earningsLedgerLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load the ledger.'**
  String get earningsLedgerLoadError;

  /// No description provided for @earningsNothingYet.
  ///
  /// In en, this message translates to:
  /// **'Nothing yet.'**
  String get earningsNothingYet;

  /// No description provided for @earningsPendingAmount.
  ///
  /// In en, this message translates to:
  /// **'₹{amount} waiting to be paid out'**
  String earningsPendingAmount(Object amount);

  /// No description provided for @earningsPayoutSchedule.
  ///
  /// In en, this message translates to:
  /// **'Payouts are released by the cooperative on a schedule. You cannot request one here.'**
  String get earningsPayoutSchedule;

  /// No description provided for @earningsJobCompleted.
  ///
  /// In en, this message translates to:
  /// **'Job completed'**
  String get earningsJobCompleted;

  /// No description provided for @earningsPaidOut.
  ///
  /// In en, this message translates to:
  /// **'Paid out'**
  String get earningsPaidOut;

  /// No description provided for @earningsWastedJourney.
  ///
  /// In en, this message translates to:
  /// **'Wasted journey'**
  String get earningsWastedJourney;

  /// No description provided for @earningsAdjustment.
  ///
  /// In en, this message translates to:
  /// **'Adjustment'**
  String get earningsAdjustment;

  /// No description provided for @earningsRefunded.
  ///
  /// In en, this message translates to:
  /// **'Refunded'**
  String get earningsRefunded;

  /// No description provided for @payoutBreakdownAppBarTitle.
  ///
  /// In en, this message translates to:
  /// **'Your pay for this job'**
  String get payoutBreakdownAppBarTitle;

  /// No description provided for @payoutBreakdownLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load the breakdown.'**
  String get payoutBreakdownLoadError;

  /// No description provided for @payoutBreakdownYouReceive.
  ///
  /// In en, this message translates to:
  /// **'YOU RECEIVE'**
  String get payoutBreakdownYouReceive;

  /// No description provided for @payoutBreakdownPercentOfCustomerPaid.
  ///
  /// In en, this message translates to:
  /// **'{percent}% of what the customer paid'**
  String payoutBreakdownPercentOfCustomerPaid(Object percent);

  /// No description provided for @payoutBreakdownWelfareFundDescription.
  ///
  /// In en, this message translates to:
  /// **'The welfare fund pays for insurance, training and support when you cannot work. It comes out of every job on the platform, including this one.'**
  String get payoutBreakdownWelfareFundDescription;

  /// No description provided for @jobsTabToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get jobsTabToday;

  /// No description provided for @jobsTabUpcoming.
  ///
  /// In en, this message translates to:
  /// **'Upcoming'**
  String get jobsTabUpcoming;

  /// No description provided for @jobsTabHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get jobsTabHistory;

  /// No description provided for @jobsEmptyHistory.
  ///
  /// In en, this message translates to:
  /// **'Nothing finished yet.'**
  String get jobsEmptyHistory;

  /// No description provided for @jobsEmptyToday.
  ///
  /// In en, this message translates to:
  /// **'Nothing booked for today.'**
  String get jobsEmptyToday;

  /// No description provided for @jobsEmptyUpcoming.
  ///
  /// In en, this message translates to:
  /// **'Nothing booked after today.'**
  String get jobsEmptyUpcoming;

  /// No description provided for @jobsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load your jobs.'**
  String get jobsLoadError;

  /// No description provided for @jobsNow.
  ///
  /// In en, this message translates to:
  /// **'Now'**
  String get jobsNow;

  /// No description provided for @alertsAppBarTitle.
  ///
  /// In en, this message translates to:
  /// **'Alerts'**
  String get alertsAppBarTitle;

  /// No description provided for @alertsMarkAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all read'**
  String get alertsMarkAllRead;

  /// No description provided for @alertsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load your alerts.'**
  String get alertsLoadError;

  /// No description provided for @alertsEmptyState.
  ///
  /// In en, this message translates to:
  /// **'Nothing yet'**
  String get alertsEmptyState;

  /// No description provided for @profileTitle.
  ///
  /// In en, this message translates to:
  /// **'You'**
  String get profileTitle;

  /// No description provided for @profileVerified.
  ///
  /// In en, this message translates to:
  /// **'Verified'**
  String get profileVerified;

  /// No description provided for @profileBeingVerified.
  ///
  /// In en, this message translates to:
  /// **'Being verified'**
  String get profileBeingVerified;

  /// No description provided for @profileYourWork.
  ///
  /// In en, this message translates to:
  /// **'Your work'**
  String get profileYourWork;

  /// No description provided for @profileTradesYouTake.
  ///
  /// In en, this message translates to:
  /// **'Trades you take'**
  String get profileTradesYouTake;

  /// No description provided for @profileWhereYouWork.
  ///
  /// In en, this message translates to:
  /// **'Where you work'**
  String get profileWhereYouWork;

  /// No description provided for @profileWorkingHours.
  ///
  /// In en, this message translates to:
  /// **'Working hours'**
  String get profileWorkingHours;

  /// No description provided for @profileDocuments.
  ///
  /// In en, this message translates to:
  /// **'Documents'**
  String get profileDocuments;

  /// No description provided for @profileLookingAfterYou.
  ///
  /// In en, this message translates to:
  /// **'Looking after you'**
  String get profileLookingAfterYou;

  /// No description provided for @profileSafetyAndSos.
  ///
  /// In en, this message translates to:
  /// **'Safety and SOS'**
  String get profileSafetyAndSos;

  /// No description provided for @profileWelfarePassport.
  ///
  /// In en, this message translates to:
  /// **'Welfare passport'**
  String get profileWelfarePassport;

  /// No description provided for @profileReviewsReceived.
  ///
  /// In en, this message translates to:
  /// **'Reviews received'**
  String get profileReviewsReceived;

  /// No description provided for @profileBlockedCustomers.
  ///
  /// In en, this message translates to:
  /// **'Blocked customers'**
  String get profileBlockedCustomers;

  /// No description provided for @profileApp.
  ///
  /// In en, this message translates to:
  /// **'App'**
  String get profileApp;

  /// No description provided for @profileSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get profileSettings;

  /// No description provided for @profileSignOutQuestion.
  ///
  /// In en, this message translates to:
  /// **'Sign out?'**
  String get profileSignOutQuestion;

  /// No description provided for @profileSignOutDescription.
  ///
  /// In en, this message translates to:
  /// **'You will go offline and stop receiving job offers.'**
  String get profileSignOutDescription;

  /// No description provided for @profileStay.
  ///
  /// In en, this message translates to:
  /// **'Stay'**
  String get profileStay;

  /// No description provided for @profileSignOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get profileSignOut;

  /// No description provided for @profileLastNDays.
  ///
  /// In en, this message translates to:
  /// **'LAST {days} DAYS'**
  String profileLastNDays(Object days);

  /// No description provided for @profileJobsDone.
  ///
  /// In en, this message translates to:
  /// **'Jobs done'**
  String get profileJobsDone;

  /// No description provided for @profileFinished.
  ///
  /// In en, this message translates to:
  /// **'Finished'**
  String get profileFinished;

  /// No description provided for @profileAccepted.
  ///
  /// In en, this message translates to:
  /// **'Accepted'**
  String get profileAccepted;

  /// No description provided for @profileMedianResponse.
  ///
  /// In en, this message translates to:
  /// **'You usually answer an offer in {seconds} seconds.'**
  String profileMedianResponse(Object seconds);

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTitle;

  /// No description provided for @settingsLanguage.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get settingsLanguage;

  /// No description provided for @settingsHowItLooks.
  ///
  /// In en, this message translates to:
  /// **'How it looks'**
  String get settingsHowItLooks;

  /// No description provided for @settingsFollowThePhone.
  ///
  /// In en, this message translates to:
  /// **'Follow the phone'**
  String get settingsFollowThePhone;

  /// No description provided for @settingsLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get settingsLight;

  /// No description provided for @settingsDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get settingsDark;

  /// No description provided for @settingsBrightSunlight.
  ///
  /// In en, this message translates to:
  /// **'Bright sunlight'**
  String get settingsBrightSunlight;

  /// No description provided for @settingsDaylightSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Maximum contrast, for working on a roof at noon.'**
  String get settingsDaylightSubtitle;

  /// No description provided for @settingsWhatYouGetOffered.
  ///
  /// In en, this message translates to:
  /// **'What you get offered'**
  String get settingsWhatYouGetOffered;

  /// No description provided for @settingsCouldNotLoadPreferences.
  ///
  /// In en, this message translates to:
  /// **'Could not load your preferences.'**
  String get settingsCouldNotLoadPreferences;

  /// No description provided for @settingsNotifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get settingsNotifications;

  /// No description provided for @settingsJobOffers.
  ///
  /// In en, this message translates to:
  /// **'Job offers'**
  String get settingsJobOffers;

  /// No description provided for @settingsJobOffersSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Always on while you are online. Use the duty toggle to stop being offered work.'**
  String get settingsJobOffersSubtitle;

  /// No description provided for @settingsNoTravelLimit.
  ///
  /// In en, this message translates to:
  /// **'No travel limit'**
  String get settingsNoTravelLimit;

  /// No description provided for @settingsAtMostKm.
  ///
  /// In en, this message translates to:
  /// **'At most {km} km'**
  String settingsAtMostKm(Object km);

  /// No description provided for @settingsNoLimit.
  ///
  /// In en, this message translates to:
  /// **'No limit'**
  String get settingsNoLimit;

  /// No description provided for @settingsTravelHint.
  ///
  /// In en, this message translates to:
  /// **'A smaller limit means fewer offers, but no long journeys for small jobs.'**
  String get settingsTravelHint;

  /// No description provided for @settingsEmergencyJobs.
  ///
  /// In en, this message translates to:
  /// **'Emergency jobs'**
  String get settingsEmergencyJobs;

  /// No description provided for @settingsEmergencyJobsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Urgent work that interrupts whatever you are doing. Usually paid more.'**
  String get settingsEmergencyJobsSubtitle;

  /// No description provided for @settingsAutoOffline.
  ///
  /// In en, this message translates to:
  /// **'Go offline at the end of my shift'**
  String get settingsAutoOffline;

  /// No description provided for @settingsAutoOfflineSubtitle.
  ///
  /// In en, this message translates to:
  /// **'So you are not offered a job at 2am because you forgot.'**
  String get settingsAutoOfflineSubtitle;

  /// No description provided for @skillsTitle.
  ///
  /// In en, this message translates to:
  /// **'Trades you take'**
  String get skillsTitle;

  /// No description provided for @skillsSaved.
  ///
  /// In en, this message translates to:
  /// **'Saved.'**
  String get skillsSaved;

  /// No description provided for @skillsCouldNotLoadTrades.
  ///
  /// In en, this message translates to:
  /// **'Could not load your trades.'**
  String get skillsCouldNotLoadTrades;

  /// No description provided for @skillsCouldNotLoadTradeList.
  ///
  /// In en, this message translates to:
  /// **'Could not load the list of trades.'**
  String get skillsCouldNotLoadTradeList;

  /// No description provided for @skillsCertificateInfo.
  ///
  /// In en, this message translates to:
  /// **'Some trades need a certificate before you can be offered them. Upload it under Documents and the cooperative will verify it.'**
  String get skillsCertificateInfo;

  /// No description provided for @skillsCertificateVerified.
  ///
  /// In en, this message translates to:
  /// **'Certificate verified'**
  String get skillsCertificateVerified;

  /// No description provided for @skillsSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get skillsSave;

  /// No description provided for @serviceAreasTitle.
  ///
  /// In en, this message translates to:
  /// **'Where you work'**
  String get serviceAreasTitle;

  /// No description provided for @serviceAreasSaved.
  ///
  /// In en, this message translates to:
  /// **'Saved.'**
  String get serviceAreasSaved;

  /// No description provided for @serviceAreasCouldNotLoadAreas.
  ///
  /// In en, this message translates to:
  /// **'Could not load your areas.'**
  String get serviceAreasCouldNotLoadAreas;

  /// No description provided for @serviceAreasAddTradeFirst.
  ///
  /// In en, this message translates to:
  /// **'Add a trade first'**
  String get serviceAreasAddTradeFirst;

  /// No description provided for @serviceAreasAddTradeSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Your travel distance is set per trade, so there is nothing to set until you have picked at least one.'**
  String get serviceAreasAddTradeSubtitle;

  /// No description provided for @serviceAreasSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get serviceAreasSave;

  /// No description provided for @documentsTitle.
  ///
  /// In en, this message translates to:
  /// **'Documents'**
  String get documentsTitle;

  /// No description provided for @documentsCouldNotLoadDocuments.
  ///
  /// In en, this message translates to:
  /// **'Could not load your documents.'**
  String get documentsCouldNotLoadDocuments;

  /// No description provided for @documentsEmptyState.
  ///
  /// In en, this message translates to:
  /// **'Nothing uploaded yet. You will need a photo ID, and a certificate for any trade that requires one.'**
  String get documentsEmptyState;

  /// No description provided for @documentsUploadHint.
  ///
  /// In en, this message translates to:
  /// **'Ask your cooperative admin to help you upload, or use the web portal.'**
  String get documentsUploadHint;

  /// No description provided for @documentsUploadDocument.
  ///
  /// In en, this message translates to:
  /// **'Upload a document'**
  String get documentsUploadDocument;

  /// No description provided for @documentsAccepted.
  ///
  /// In en, this message translates to:
  /// **'Accepted'**
  String get documentsAccepted;

  /// No description provided for @documentsNotAccepted.
  ///
  /// In en, this message translates to:
  /// **'Not accepted — upload it again'**
  String get documentsNotAccepted;

  /// No description provided for @documentsExpired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get documentsExpired;

  /// No description provided for @documentsWaitingToBeChecked.
  ///
  /// In en, this message translates to:
  /// **'Waiting to be checked'**
  String get documentsWaitingToBeChecked;

  /// No description provided for @documentsExpiredDaysAgo.
  ///
  /// In en, this message translates to:
  /// **'Expired {days} days ago'**
  String documentsExpiredDaysAgo(Object days);

  /// No description provided for @documentsExpiresInDays.
  ///
  /// In en, this message translates to:
  /// **'Expires in {days} days'**
  String documentsExpiresInDays(Object days);

  /// No description provided for @documentsValidUntil.
  ///
  /// In en, this message translates to:
  /// **'Valid until {date}'**
  String documentsValidUntil(Object date);

  /// No description provided for @documentsFallbackType.
  ///
  /// In en, this message translates to:
  /// **'Document'**
  String get documentsFallbackType;

  /// No description provided for @scheduleTitle.
  ///
  /// In en, this message translates to:
  /// **'Working hours'**
  String get scheduleTitle;

  /// No description provided for @scheduleSaved.
  ///
  /// In en, this message translates to:
  /// **'Saved. You will only be offered work in these hours.'**
  String get scheduleSaved;

  /// No description provided for @scheduleCouldNotLoadHours.
  ///
  /// In en, this message translates to:
  /// **'Could not load your hours.'**
  String get scheduleCouldNotLoadHours;

  /// No description provided for @scheduleEmptyState.
  ///
  /// In en, this message translates to:
  /// **'You have not set any hours, so you can be offered work at any time you are online. Set them if you would rather not be.'**
  String get scheduleEmptyState;

  /// No description provided for @scheduleSaveMyHours.
  ///
  /// In en, this message translates to:
  /// **'Save my hours'**
  String get scheduleSaveMyHours;

  /// No description provided for @scheduleTimeOff.
  ///
  /// In en, this message translates to:
  /// **'TIME OFF'**
  String get scheduleTimeOff;

  /// No description provided for @scheduleNoneBooked.
  ///
  /// In en, this message translates to:
  /// **'None booked.'**
  String get scheduleNoneBooked;

  /// No description provided for @scheduleTimeOffFallback.
  ///
  /// In en, this message translates to:
  /// **'Time off'**
  String get scheduleTimeOffFallback;

  /// No description provided for @scheduleBookTimeOff.
  ///
  /// In en, this message translates to:
  /// **'Book time off'**
  String get scheduleBookTimeOff;

  /// No description provided for @scheduleWhenAreYouAway.
  ///
  /// In en, this message translates to:
  /// **'When are you away?'**
  String get scheduleWhenAreYouAway;

  /// No description provided for @scheduleStartOf.
  ///
  /// In en, this message translates to:
  /// **'Start of {day}'**
  String scheduleStartOf(Object day);

  /// No description provided for @scheduleEndOf.
  ///
  /// In en, this message translates to:
  /// **'End of {day}'**
  String scheduleEndOf(Object day);

  /// No description provided for @scheduleEndMustBeAfterStart.
  ///
  /// In en, this message translates to:
  /// **'The end has to be after the start. For a night shift, set it on both days.'**
  String get scheduleEndMustBeAfterStart;

  /// No description provided for @scheduleNotWorking.
  ///
  /// In en, this message translates to:
  /// **'Not working'**
  String get scheduleNotWorking;

  /// No description provided for @safetyAppBarTitle.
  ///
  /// In en, this message translates to:
  /// **'Safety'**
  String get safetyAppBarTitle;

  /// No description provided for @safetySosButtonLabel.
  ///
  /// In en, this message translates to:
  /// **'SOS'**
  String get safetySosButtonLabel;

  /// No description provided for @safetyHoldInstruction.
  ///
  /// In en, this message translates to:
  /// **'Hold for three seconds'**
  String get safetyHoldInstruction;

  /// No description provided for @safetyHoldDescription.
  ///
  /// In en, this message translates to:
  /// **'This sends your position and your current job to the cooperative straight away, and gives you a number to call.'**
  String get safetyHoldDescription;

  /// No description provided for @safetyPastAlertsHeader.
  ///
  /// In en, this message translates to:
  /// **'PAST ALERTS'**
  String get safetyPastAlertsHeader;

  /// No description provided for @safetyNoPastAlerts.
  ///
  /// In en, this message translates to:
  /// **'None. Good.'**
  String get safetyNoPastAlerts;

  /// No description provided for @safetyStatusSent.
  ///
  /// In en, this message translates to:
  /// **'Sent — waiting for the cooperative'**
  String get safetyStatusSent;

  /// No description provided for @safetyStatusAcknowledged.
  ///
  /// In en, this message translates to:
  /// **'Someone is looking at it'**
  String get safetyStatusAcknowledged;

  /// No description provided for @safetyStatusResolved.
  ///
  /// In en, this message translates to:
  /// **'Resolved'**
  String get safetyStatusResolved;

  /// No description provided for @safetyStatusFalseAlarm.
  ///
  /// In en, this message translates to:
  /// **'Marked a false alarm'**
  String get safetyStatusFalseAlarm;

  /// No description provided for @safetyAlertDialogTitle.
  ///
  /// In en, this message translates to:
  /// **'Alert sent'**
  String get safetyAlertDialogTitle;

  /// No description provided for @safetyAlertDialogContent.
  ///
  /// In en, this message translates to:
  /// **'The operations room has your position and your current job.\n\nIf you are in immediate danger, call now.'**
  String get safetyAlertDialogContent;

  /// No description provided for @safetyDialogCloseButton.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get safetyDialogCloseButton;

  /// No description provided for @safetyDialogCallButton.
  ///
  /// In en, this message translates to:
  /// **'Call {number}'**
  String safetyDialogCallButton(Object number);

  /// No description provided for @welfareAppBarTitle.
  ///
  /// In en, this message translates to:
  /// **'Welfare passport'**
  String get welfareAppBarTitle;

  /// No description provided for @welfareLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load your welfare records.'**
  String get welfareLoadError;

  /// No description provided for @welfareNoRecords.
  ///
  /// In en, this message translates to:
  /// **'No welfare records found.'**
  String get welfareNoRecords;

  /// No description provided for @welfareSectionTraining.
  ///
  /// In en, this message translates to:
  /// **'Training'**
  String get welfareSectionTraining;

  /// No description provided for @welfareNoTrainingRecords.
  ///
  /// In en, this message translates to:
  /// **'No training records yet.'**
  String get welfareNoTrainingRecords;

  /// No description provided for @welfareSectionInsurance.
  ///
  /// In en, this message translates to:
  /// **'Insurance'**
  String get welfareSectionInsurance;

  /// No description provided for @welfareNoInsuranceRecords.
  ///
  /// In en, this message translates to:
  /// **'No insurance records yet.'**
  String get welfareNoInsuranceRecords;

  /// No description provided for @welfareSectionPayoutAccount.
  ///
  /// In en, this message translates to:
  /// **'Payout account'**
  String get welfareSectionPayoutAccount;

  /// No description provided for @welfareNoPayoutAccount.
  ///
  /// In en, this message translates to:
  /// **'No payout account set up.'**
  String get welfareNoPayoutAccount;

  /// No description provided for @welfareStatusLabelInsurance.
  ///
  /// In en, this message translates to:
  /// **'Insurance'**
  String get welfareStatusLabelInsurance;

  /// No description provided for @welfareStatusLabelTraining.
  ///
  /// In en, this message translates to:
  /// **'Training'**
  String get welfareStatusLabelTraining;

  /// No description provided for @welfareCompletedPrefix.
  ///
  /// In en, this message translates to:
  /// **'Completed {date}'**
  String welfareCompletedPrefix(Object date);

  /// No description provided for @welfareExpiresPrefix.
  ///
  /// In en, this message translates to:
  /// **'Expires {date}'**
  String welfareExpiresPrefix(Object date);

  /// No description provided for @welfareCoverageLabel.
  ///
  /// In en, this message translates to:
  /// **'₹{amount} coverage'**
  String welfareCoverageLabel(Object amount);

  /// No description provided for @welfareStatusExpired.
  ///
  /// In en, this message translates to:
  /// **'EXPIRED'**
  String get welfareStatusExpired;

  /// No description provided for @welfareStatusPending.
  ///
  /// In en, this message translates to:
  /// **'PENDING'**
  String get welfareStatusPending;

  /// No description provided for @welfareStatusInProgress.
  ///
  /// In en, this message translates to:
  /// **'IN PROGRESS'**
  String get welfareStatusInProgress;

  /// No description provided for @welfareRetryButton.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get welfareRetryButton;

  /// No description provided for @reviewsAppBarTitle.
  ///
  /// In en, this message translates to:
  /// **'Reviews'**
  String get reviewsAppBarTitle;

  /// No description provided for @reviewsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load reviews.'**
  String get reviewsLoadError;

  /// No description provided for @reviewsRetryButton.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get reviewsRetryButton;

  /// No description provided for @reviewsEmptyState.
  ///
  /// In en, this message translates to:
  /// **'No reviews yet. Complete a job and the customer can leave feedback.'**
  String get reviewsEmptyState;

  /// No description provided for @reviewsCount.
  ///
  /// In en, this message translates to:
  /// **'({count, plural, =1{# review} other{# reviews}})'**
  String reviewsCount(num count);

  /// No description provided for @blockedAppBarTitle.
  ///
  /// In en, this message translates to:
  /// **'Blocked customers'**
  String get blockedAppBarTitle;

  /// No description provided for @blockedBlockTooltip.
  ///
  /// In en, this message translates to:
  /// **'Block a customer'**
  String get blockedBlockTooltip;

  /// No description provided for @blockedLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load blocked customers.'**
  String get blockedLoadError;

  /// No description provided for @blockedRetryButton.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get blockedRetryButton;

  /// No description provided for @blockedEmptyState.
  ///
  /// In en, this message translates to:
  /// **'No blocked customers.\n\nWhen you block a customer, you will never be offered their jobs again.'**
  String get blockedEmptyState;

  /// No description provided for @blockedDialogCustomerLabel.
  ///
  /// In en, this message translates to:
  /// **'Customer ID'**
  String get blockedDialogCustomerLabel;

  /// No description provided for @blockedDialogCustomerHint.
  ///
  /// In en, this message translates to:
  /// **'Paste the customer\'s ID'**
  String get blockedDialogCustomerHint;

  /// No description provided for @blockedDialogCancelButton.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get blockedDialogCancelButton;

  /// No description provided for @blockedDialogBlockButton.
  ///
  /// In en, this message translates to:
  /// **'Block'**
  String get blockedDialogBlockButton;

  /// No description provided for @blockedBlockError.
  ///
  /// In en, this message translates to:
  /// **'Could not block customer.'**
  String get blockedBlockError;

  /// No description provided for @blockedUnblockDialogTitle.
  ///
  /// In en, this message translates to:
  /// **'Unblock?'**
  String get blockedUnblockDialogTitle;

  /// No description provided for @blockedUnDialogContent.
  ///
  /// In en, this message translates to:
  /// **'You may be offered jobs from {name} again.'**
  String blockedUnDialogContent(Object name);

  /// No description provided for @blockedUnblockKeepButton.
  ///
  /// In en, this message translates to:
  /// **'Keep blocked'**
  String get blockedUnblockKeepButton;

  /// No description provided for @blockedUnblockConfirmButton.
  ///
  /// In en, this message translates to:
  /// **'Unblock'**
  String get blockedUnblockConfirmButton;

  /// No description provided for @blockedUnblockTooltip.
  ///
  /// In en, this message translates to:
  /// **'Unblock'**
  String get blockedUnblockTooltip;

  /// No description provided for @blockedUnblockError.
  ///
  /// In en, this message translates to:
  /// **'Could not unblock customer.'**
  String get blockedUnblockError;

  /// No description provided for @blockedDatePrefix.
  ///
  /// In en, this message translates to:
  /// **'Blocked {date}'**
  String blockedDatePrefix(Object date);
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'hi', 'te'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'hi':
      return AppLocalizationsHi();
    case 'te':
      return AppLocalizationsTe();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
