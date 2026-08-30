// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Hindi (`hi`).
class AppLocalizationsHi extends AppLocalizations {
  AppLocalizationsHi([String locale = 'hi']) : super(locale);

  @override
  String get appTitle => 'काम पूरा करो';

  @override
  String get appDutyOnline => 'ऑनलाइन';

  @override
  String get appDutyOnJob => 'काम पर';

  @override
  String get appDutyOffline => 'ऑफलाइन';

  @override
  String appQueuedLabel(Object count) {
    return '$count कतार में';
  }

  @override
  String get appBottomNavToday => 'आज';

  @override
  String get appBottomNavJobs => 'काम';

  @override
  String get appBottomNavEarnings => 'कमाई';

  @override
  String get signInTitleRegistering => 'सहकारी के साथ कमाई शुरू करें';

  @override
  String get signInTitleReturning => 'वापसी पर स्वागत है';

  @override
  String get signInSubtitleRegistering =>
      'आपको एक आईडी और एक बैंक खाते की आवश्यकता होगी।';

  @override
  String get signInSubtitleReturning =>
      'अपने काम और कमाई देखने के लिए साइन इन करें।';

  @override
  String get signInNameLabel => 'आपका पूरा नाम';

  @override
  String get signInNameValidation => 'हमें अपना नाम बताएं';

  @override
  String get signInEmailLabel => 'ईमेल';

  @override
  String get signInEmailValidation =>
      'जिस ईमेल से आपने साइन अप किया वह दर्ज करें';

  @override
  String get signInPhoneLabel => 'फ़ोन नंबर';

  @override
  String get signInPhoneValidation =>
      'हमें एक ऐसा नंबर चाहिए जिस पर ग्राहक कॉल कर सके';

  @override
  String get signInPasswordLabel => 'पासवर्ड';

  @override
  String get signInPasswordValidation => 'कम से कम 8 अक्षर';

  @override
  String get signInConfirmLabel => 'अपना पासवर्ड फिर से टाइप करें';

  @override
  String get signInConfirmValidation => 'दोनों मेल नहीं खाते';

  @override
  String get signInPasswordsMatch => 'पासवर्ड मेल खाते हैं';

  @override
  String get signInButtonRegister => 'मेरा खाता बनाएं';

  @override
  String get signInButtonLogin => 'साइन इन';

  @override
  String get signInOrDivider => 'या';

  @override
  String get signInGoogleButton => 'Google से साइन इन करें';

  @override
  String get signInHaveAccount => 'मेरा पहले से खाता है';

  @override
  String get signInNewHere => 'मैं यहां नया हूं';

  @override
  String get signInNetworkError =>
      'कोई कनेक्शन नहीं। अपना नेटवर्क जांचें और फिर से प्रयास करें।';

  @override
  String get signInGoogleErrorIdToken =>
      'Google साइन इन विफल। कृपया फिर से प्रयास करें।';

  @override
  String get signInGoogleErrorGeneral =>
      'Google साइन इन विफल। अपना कनेक्शन जांचें।';

  @override
  String get languageGateTitle =>
      'భాష ఎంచుకోండి\nChoose your language\nभाषा चुनें';

  @override
  String get onboardingStepAboutYou => 'आपके बारे में';

  @override
  String get onboardingStepAboutYouSubtitle =>
      'आप कहां स्थित हैं, और आप यह काम कब से कर रहे हैं';

  @override
  String get onboardingStepYourTrades => 'आपके काम';

  @override
  String get onboardingStepYourTradesSubtitle =>
      'आप कौन सा काम लेते हैं। आप बाद में बदल सकते हैं';

  @override
  String get onboardingStepHowFarTravel => 'आप कितनी दूर तक जाते हैं';

  @override
  String get onboardingStepHowFarTravelSubtitle =>
      'हम आपको इससे दूर के काम नहीं देंगे';

  @override
  String get onboardingStepYourDocuments => 'आपके दस्तावेज़';

  @override
  String get onboardingStepYourDocumentsSubtitle =>
      'एक आईडी और कोई भी दस्तावेज़ जो आपके काम को साबित करे';

  @override
  String get onboardingStepWhereYouGetPaid => 'आपको कहां भुगतान मिलता है';

  @override
  String get onboardingStepWhereYouGetPaidSubtitle =>
      'आपके नाम पर एक UPI आईडी या बैंक खाता';

  @override
  String get onboardingStepSendForChecking => 'जांच के लिए भेजें';

  @override
  String get onboardingStepSendForCheckingSubtitle =>
      'सहकारी प्रशासक देखेंगे, आमतौर पर एक दिन में';

  @override
  String get onboardingAddressLabel => 'आप कहां स्थित हैं';

  @override
  String get onboardingExperienceLabel => 'इस काम में कितने साल का अनुभव';

  @override
  String get onboardingTradesError => 'काम की सूची लोड नहीं हो सकी।';

  @override
  String get onboardingRadiusHint => 'बड़ा क्षेत्र मतलब ज़्यादा प्रस्ताव।';

  @override
  String get onboardingDocumentsDescription => 'आपको एक फ़ोटो आईडी चाहिए।';

  @override
  String get onboardingUploadButton => 'दस्तावेज़ अपलोड करें';

  @override
  String get onboardingPayoutUpi => 'UPI';

  @override
  String get onboardingPayoutBank => 'बैंक खाता';

  @override
  String get onboardingPayoutUpiLabel => 'आपकी UPI आईडी';

  @override
  String get onboardingPayoutBankLabel => 'खाता संख्या और IFSC';

  @override
  String get onboardingPayoutWarning => 'यह आपके अपने नाम पर होना चाहिए।';

  @override
  String get onboardingSubmitDescription => 'यही सब कुछ है जो हमें चाहिए।';

  @override
  String get onboardingSubmitWarning =>
      'तब तक आपको काम के प्रस्ताव नहीं दिए जाएंगे।';

  @override
  String get onboardingBottomButtonFinal => 'जांच के लिए भेजें';

  @override
  String get onboardingBottomButtonSave => 'सहेजें और जारी रखें';

  @override
  String get onboardingNetworkError => 'कोई कनेक्शन नहीं।';

  @override
  String get verificationAppBarTitle => 'आपका सत्यापन हो रहा है';

  @override
  String get verificationStatusError => 'आपकी स्थिति जांच नहीं हो सकी।';

  @override
  String get verificationNotStartedTitle => 'आपने अभी शुरू नहीं किया';

  @override
  String get verificationStartButton => 'शुरू करें';

  @override
  String get verificationStatusRejected => 'कुछ ठीक करने की ज़रूरत है';

  @override
  String get verificationStatusPending => 'सहकारी के पास जांच के लिए';

  @override
  String verificationStatusRemaining(Object count) {
    return '$count चीज़ें बाकी';
  }

  @override
  String get verificationRejectionFallback =>
      'आपके एक दस्तावेज़ को स्वीकार नहीं किया जा सका।';

  @override
  String get verificationPendingDescription =>
      'आमतौर पर एक दिन में पूरा हो जाता है।';

  @override
  String get verificationRemainingDescription => 'इन्हें पूरा करें।';

  @override
  String get verificationFinishButton => 'सेटअप पूरा करें';

  @override
  String get todayFinishCurrentJobFirst => 'पहले अपना मौजूदा काम पूरा करें।';

  @override
  String get todayLocationNeededTitle => 'काम पाने के लिए स्थान आवश्यक है';

  @override
  String get todayLocationNeededContent => 'काम दूरी के आधार पर दिए जाते हैं।';

  @override
  String get todayLocationNeededDismiss => 'अभी नहीं';

  @override
  String get todayStatusChangeError => 'आपकी स्थिति नहीं बदली जा सकी।';

  @override
  String get todayLabelOnline => 'आप ऑनलाइन हैं';

  @override
  String get todayDetailOnline => 'ऑफलाइन होने के लिए टैप करें';

  @override
  String get todayLabelBusy => 'काम पर';

  @override
  String get todayDetailBusy => 'यह बदलने के लिए काम पूरा करें';

  @override
  String get todayLabelOffline => 'आप ऑफलाइन हैं';

  @override
  String get todayDetailOffline => 'काम लेना शुरू करने के लिए टैप करें';

  @override
  String get todayStageAccepted => 'जाना शुरू करें';

  @override
  String get todayStageEnRoute => 'पहुंचने पर हमें बताएं';

  @override
  String get todayStageArrived => 'स्टार्ट कोड प्राप्त करें';

  @override
  String get todayStageInProgress => 'पूरा करें और भुगतान पाएं';

  @override
  String get todayStageDefault => 'खुला';

  @override
  String get todayActiveNowLabel => 'अभी';

  @override
  String get todayNothingBooked => 'अभी तक कुछ बुक नहीं हुआ';

  @override
  String get todayNothingBookedHint => 'ऑनलाइन रहें।';

  @override
  String get todayNextPrefix => 'अगला: ';

  @override
  String get todayEarningsToday => 'आज';

  @override
  String get todayEarningsWeek => 'इस सप्ताह';

  @override
  String todayJobsCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# काम',
      one: '# काम',
    );
    return '$_temp0';
  }

  @override
  String get todayWarningVerifyTitle => 'सत्यापन पूरा करें';

  @override
  String get todayWarningVerifyDetail =>
      'काम लेने से पहले इतनी चीज़ें बाकी हैं';

  @override
  String get todayJobsLoadError => 'आपके काम लोड नहीं हो सके।';

  @override
  String get todayRetry => 'पुनः प्रयास करें';

  @override
  String get offerExpiresWarning =>
      'यदि आप जवाब नहीं देते, तो यह काम किसी और को मिल जाएगा।';

  @override
  String get offerCountdownSeconds => 'सेकंड';

  @override
  String get offerYouEarnLabel => 'आपकी कमाई';

  @override
  String offerCustomerPays(Object amount) {
    return 'ग्राहक ₹$amount देता है';
  }

  @override
  String offerDistanceKm(Object distance) {
    return '$distance km दूर';
  }

  @override
  String offerDriveMinutes(Object minutes) {
    return '$minutes मिनट ड्राइव';
  }

  @override
  String offerBookedMinutes(Object minutes) {
    return '$minutes मिनट बुक किया';
  }

  @override
  String get offerEmergencyBanner => 'आपातकाल — अभी जाएं';

  @override
  String get offerDeclineButton => 'अस्वीकार करें';

  @override
  String get offerAcceptButton => 'स्वीकार करें';

  @override
  String get offerDeclineTitle => 'आप क्यों छोड़ रहे हैं?';

  @override
  String get offerDeclineHint => 'इसका आप पर कोई बुरा प्रभाव नहीं पड़ता।';

  @override
  String get offerDeclineReasonTooFar => 'बहुत दूर';

  @override
  String get offerDeclineReasonTooFarDetail =>
      'हम इतनी दूर के काम देना बंद कर देंगे';

  @override
  String get offerDeclineReasonBusy => 'अभी व्यस्त हूं';

  @override
  String get offerDeclineReasonBusyDetail => 'कुछ नहीं बदलता;';

  @override
  String get offerDeclineReasonNotMyTrade => 'मेरा काम नहीं है';

  @override
  String get offerDeclineReasonNotMyTradeDetail => 'अपनी कुशलता जांचें';

  @override
  String get offerDeclineReasonUnsafe => 'सुरक्षित नहीं लगता';

  @override
  String get offerDeclineReasonUnsafeDetail =>
      'सहकारी द्वारा समीक्षा की जाती है';

  @override
  String get offerOutcomeDeclined => 'छोड़ दिया।';

  @override
  String get offerOutcomeExpired => 'उस प्रस्ताव का समय समाप्त हो गया।';

  @override
  String get offerOutcomeTaken => 'वह काम किसी और को मिल गया।';

  @override
  String get offerErrorUnreachable => 'सर्वर तक नहीं पहुंचा जा सका।';

  @override
  String get offerErrorFailed => 'कुछ गड़बड़ हुई।';

  @override
  String get activeJobLocationError => 'आपकी स्थिति प्राप्त नहीं हो सकी।';

  @override
  String get activeJobArrivalError => 'आपके आने का रिकॉर्ड नहीं हो सका।';

  @override
  String get activeJobPayTooltip => 'आपको कितना भुगतान मिलेगा';

  @override
  String get activeJobNavigate => 'नेविगेट करें';

  @override
  String get activeJobCall => 'कॉल करें';

  @override
  String get activeJobSectionDoor => 'दरवाज़ा';

  @override
  String activeJobAskFor(Object name) {
    return '$name से मिलें';
  }

  @override
  String get activeJobSectionAlsoAtAddress => 'इस पते पर और भी';

  @override
  String get activeJobSectionYouWillBePaid => 'आपको भुगतान मिलेगा';

  @override
  String get activeJobSeeBreakdown => 'ब्रेकडाउन देखें';

  @override
  String get activeJobStatusAssigned => 'सौंपा जा रहा है';

  @override
  String get activeJobStatusAccepted => 'पुष्टि हो गई';

  @override
  String get activeJobStatusEnRoute => 'रास्ते में';

  @override
  String get activeJobStatusArrived => 'दरवाज़े पर';

  @override
  String get activeJobStatusStarted => 'काम हो रहा है';

  @override
  String get activeJobStatusCompleted => 'पूरा हो गया';

  @override
  String get activeJobStatusCancelled => 'रद्द हो गया';

  @override
  String get activeJobActionOnMyWay => 'मैं रास्ते में हूं';

  @override
  String get activeJobActionImHere => 'मैं यहां हूं';

  @override
  String get activeJobActionStartJob => 'काम शुरू करें';

  @override
  String get activeJobActionFinishJob => 'काम पूरा करें';

  @override
  String get activeJobStepBooked => 'बुक किया';

  @override
  String get activeJobStepOnTheWay => 'रास्ते में';

  @override
  String get activeJobStepAtTheDoor => 'दरवाज़े पर';

  @override
  String get activeJobStepWorking => 'काम हो रहा है';

  @override
  String get activeJobStepDone => 'हो गया';

  @override
  String get activeJobWaitingTitle => 'दरवाज़े पर इंतज़ार';

  @override
  String get activeJobWaitingCanReport => 'आपने काफ़ी देर इंतज़ार कर लिया।';

  @override
  String activeJobWaitingCountdown(Object minutes, Object seconds) {
    return 'आप ${minutes}m ${seconds}s में न आने की रिपोर्ट कर सकते हैं।';
  }

  @override
  String get activeJobNoShowButton => 'ग्राहक नहीं आया';

  @override
  String get activeJobNoShowDialogTitle => 'ग्राहक नहीं आया?';

  @override
  String get activeJobNoShowDialogContent => 'इससे काम समाप्त हो जाता है।';

  @override
  String get activeJobNoShowKeepWaiting => 'इंतज़ार जारी रखें';

  @override
  String get activeJobNoShowReportButton => 'न आने की रिपोर्ट करें';

  @override
  String activeJobNoShowReportedSnackbar(Object amount) {
    return 'रिपोर्ट हो गई। यात्रा के लिए ₹$amount जोड़ा गया।';
  }

  @override
  String get activeJobLoadError => 'यह काम लोड नहीं हो सका।';

  @override
  String get activeJobNoLongerYours => 'यह काम अब आपका नहीं है।';

  @override
  String get activeJobTimerElapsedSuffix => ' मिनट';

  @override
  String activeJobTimerOfBookedPrefix(Object minutes) {
    return '$minutes बुक में से';
  }

  @override
  String get activeJobNeedMoreTime => 'और समय चाहिए?';

  @override
  String get activeJobExtensionTitle => 'कितनी और देर?';

  @override
  String get activeJobExtensionHint => 'उसी दर पर चार्ज होगा।';

  @override
  String activeJobExtensionMinutes(Object minutes) {
    return '$minutes मिनट';
  }

  @override
  String get activeJobExtensionHour => '1 घंटा';

  @override
  String activeJobExtensionHours(Object hours) {
    return '$hours घंटे';
  }

  @override
  String get activeJobExtensionSnackbar => 'अनुरोध भेजा गया।';

  @override
  String get otpStartJobTitle => 'काम शुरू करें';

  @override
  String get otpFinishJobTitle => 'काम पूरा करें';

  @override
  String get otpStartCodePrompt => 'ग्राहक से स्टार्ट कोड मांगें';

  @override
  String get otpFinishCodePrompt => 'ग्राहक से फिनिश कोड मांगें';

  @override
  String get otpTheCustomerFallback => 'ग्राहक';

  @override
  String get otpCodeExplanation => 'उनके पास ऐप में है।';

  @override
  String get otpNetworkError => 'कोई कनेक्शन नहीं।';

  @override
  String get jobDetailTitle => 'काम का रिकॉर्ड';

  @override
  String get jobDetailPayTooltip => 'आपको कितना भुगतान मिला';

  @override
  String get jobDetailLoadError => 'यह काम लोड नहीं हो सका।';

  @override
  String get jobDetailNoEvents => 'कोई घटना रिकॉर्ड नहीं।';

  @override
  String get jobDetailServerTimesNote =>
      'ये समय सर्वर द्वारा रिकॉर्ड किए जाते हैं।';

  @override
  String get jobDetailStatusRequested => 'ग्राहक ने बुक किया';

  @override
  String get jobDetailStatusMatching => 'कामगार ढूंढा जा रहा है';

  @override
  String get jobDetailStatusAssigned => 'आपको दिया गया';

  @override
  String get jobDetailStatusAccepted => 'आपने स्वीकार किया';

  @override
  String get jobDetailStatusEnRoute => 'आप निकले';

  @override
  String get jobDetailStatusArrived => 'आप पहुंचे';

  @override
  String get jobDetailStatusStarted => 'काम शुरू हुआ';

  @override
  String get jobDetailStatusCompleted => 'काम पूरा हुआ';

  @override
  String get jobDetailStatusCancelled => 'रद्द हो गया';

  @override
  String get jobDetailStatusNoShow => 'ग्राहक नहीं आया';

  @override
  String get jobDetailStatusExpired => 'समय समाप्त';

  @override
  String get earningsLoadError => 'आपकी कमाई लोड नहीं हो सकी।';

  @override
  String get earningsThisWeek => 'इस सप्ताह';

  @override
  String earningsJobsDone(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# काम पूरे',
      one: '# काम पूरा',
    );
    return '$_temp0';
  }

  @override
  String get earningsEveryLine => 'हर लाइन';

  @override
  String get earningsLedgerLoadError => 'लेजर लोड नहीं हो सका।';

  @override
  String get earningsNothingYet => 'अभी कुछ नहीं।';

  @override
  String earningsPendingAmount(Object amount) {
    return '₹$amount भुगतान की प्रतीक्षा में';
  }

  @override
  String get earningsPayoutSchedule =>
      'भुगतान सहकारी द्वारा अनुसूची के अनुसार जारी किए जाते हैं।';

  @override
  String get earningsJobCompleted => 'काम पूरा हुआ';

  @override
  String get earningsPaidOut => 'भुगतान हो गया';

  @override
  String get earningsWastedJourney => 'बेकार यात्रा';

  @override
  String get earningsAdjustment => 'समायोजन';

  @override
  String get earningsRefunded => 'वापसी हो गई';

  @override
  String get payoutBreakdownAppBarTitle => 'इस काम के लिए आपकी पेमेंट';

  @override
  String get payoutBreakdownLoadError => 'ब्रेकडाउन लोड नहीं हो सका।';

  @override
  String get payoutBreakdownYouReceive => 'आप प्राप्त करेंगे';

  @override
  String payoutBreakdownPercentOfCustomerPaid(Object percent) {
    return 'ग्राहक द्वारा दिए गए का $percent%';
  }

  @override
  String get payoutBreakdownWelfareFundDescription =>
      'कल्याण कोष बीमा, प्रशिक्षण और सहायता का भुगतान करता है।';

  @override
  String get jobsTabToday => 'आज';

  @override
  String get jobsTabUpcoming => 'आने वाले';

  @override
  String get jobsTabHistory => 'इतिहास';

  @override
  String get jobsEmptyHistory => 'अभी तक कुछ पूरा नहीं हुआ।';

  @override
  String get jobsEmptyToday => 'आज के लिए कुछ बुक नहीं।';

  @override
  String get jobsEmptyUpcoming => 'आज के बाद कुछ बुक नहीं।';

  @override
  String get jobsLoadError => 'आपके काम लोड नहीं हो सके।';

  @override
  String get jobsNow => 'अभी';

  @override
  String get alertsAppBarTitle => 'अलर्ट';

  @override
  String get alertsMarkAllRead => 'सभी पठित चिन्हित करें';

  @override
  String get alertsLoadError => 'आपके अलर्ट लोड नहीं हो सके।';

  @override
  String get alertsEmptyState => 'अभी कुछ नहीं';

  @override
  String get profileTitle => 'आप';

  @override
  String get profileVerified => 'सत्यापित';

  @override
  String get profileBeingVerified => 'सत्यापन हो रहा है';

  @override
  String get profileYourWork => 'आपका काम';

  @override
  String get profileTradesYouTake => 'जो काम आप लेते हैं';

  @override
  String get profileWhereYouWork => 'जहां आप काम करते हैं';

  @override
  String get profileWorkingHours => 'कार्य समय';

  @override
  String get profileDocuments => 'दस्तावेज़';

  @override
  String get profileLookingAfterYou => 'आपकी देखभाल';

  @override
  String get profileSafetyAndSos => 'सुरक्षा और SOS';

  @override
  String get profileWelfarePassport => 'कल्याण पासपोर्ट';

  @override
  String get profileReviewsReceived => 'प्राप्त समीक्षाएं';

  @override
  String get profileBlockedCustomers => 'रोके गए ग्राहक';

  @override
  String get profileApp => 'ऐप';

  @override
  String get profileSettings => 'सेटिंग्स';

  @override
  String get profileSignOutQuestion => 'साइन आउट करें?';

  @override
  String get profileSignOutDescription =>
      'आप ऑफलाइन हो जाएंगे और काम के प्रस्ताव मिलना बंद हो जाएगा।';

  @override
  String get profileStay => 'रहें';

  @override
  String get profileSignOut => 'साइन आउट';

  @override
  String profileLastNDays(Object days) {
    return 'पिछले $days दिन';
  }

  @override
  String get profileJobsDone => 'पूरे किए गए काम';

  @override
  String get profileFinished => 'पूरा हुआ';

  @override
  String get profileAccepted => 'स्वीकार किया';

  @override
  String profileMedianResponse(Object seconds) {
    return 'आप आमतौर पर $seconds सेकंड में जवाब देते हैं।';
  }

  @override
  String get settingsTitle => 'सेटिंग्स';

  @override
  String get settingsLanguage => 'भाषा';

  @override
  String get settingsHowItLooks => 'दिखता कैसा है';

  @override
  String get settingsFollowThePhone => 'फ़ोन का अनुसरण करें';

  @override
  String get settingsLight => 'लाइट';

  @override
  String get settingsDark => 'डार्क';

  @override
  String get settingsBrightSunlight => 'तेज़ धूप';

  @override
  String get settingsDaylightSubtitle => 'अधिकतम कंट्रास्ट।';

  @override
  String get settingsWhatYouGetOffered => 'आपको क्या प्रस्ताव मिलते हैं';

  @override
  String get settingsCouldNotLoadPreferences =>
      'आपकी प्राथमिकताएं लोड नहीं हो सकीं।';

  @override
  String get settingsNotifications => 'सूचनाएं';

  @override
  String get settingsJobOffers => 'काम के प्रस्ताव';

  @override
  String get settingsJobOffersSubtitle =>
      'जब तक आप ऑनलाइन हैं तब तक हमेशा चालू।';

  @override
  String get settingsNoTravelLimit => 'कोई यात्रा सीमा नहीं';

  @override
  String settingsAtMostKm(Object km) {
    return 'अधिकतम $km km';
  }

  @override
  String get settingsNoLimit => 'कोई सीमा नहीं';

  @override
  String get settingsTravelHint => 'छोटी सीमा का मतलब कम प्रस्ताव।';

  @override
  String get settingsEmergencyJobs => 'आपातकालीन काम';

  @override
  String get settingsEmergencyJobsSubtitle => 'अर्जेंट काम जो बाधित करता है।';

  @override
  String get settingsAutoOffline => 'मेरी शिफ्ट समाप्त होने पर ऑफलाइन हो जाएं';

  @override
  String get settingsAutoOfflineSubtitle =>
      'ताकि रात 2 बजे काम का प्रस्ताव न मिले।';

  @override
  String get skillsTitle => 'जो काम आप लेते हैं';

  @override
  String get skillsSaved => 'सहेजा गया।';

  @override
  String get skillsCouldNotLoadTrades => 'आपके काम लोड नहीं हो सके।';

  @override
  String get skillsCouldNotLoadTradeList => 'काम की सूची लोड नहीं हो सकी।';

  @override
  String get skillsCertificateInfo =>
      'कुछ कामों के लिए प्रमाणपत्र की आवश्यकता होती है।';

  @override
  String get skillsCertificateVerified => 'प्रमाणपत्र सत्यापित';

  @override
  String get skillsSave => 'सहेजें';

  @override
  String get serviceAreasTitle => 'जहां आप काम करते हैं';

  @override
  String get serviceAreasSaved => 'सहेजा गया।';

  @override
  String get serviceAreasCouldNotLoadAreas => 'आपके क्षेत्र लोड नहीं हो सके।';

  @override
  String get serviceAreasAddTradeFirst => 'पहले एक काम जोड़ें';

  @override
  String get serviceAreasAddTradeSubtitle =>
      'आपकी यात्रा दूरी प्रति काम निर्धारित होती है।';

  @override
  String get serviceAreasSave => 'सहेजें';

  @override
  String get documentsTitle => 'दस्तावेज़';

  @override
  String get documentsCouldNotLoadDocuments =>
      'आपके दस्तावेज़ लोड नहीं हो सके।';

  @override
  String get documentsEmptyState => 'अभी तक कुछ अपलोड नहीं।';

  @override
  String get documentsUploadHint =>
      'अपलोड करने में मदद के लिए अपने सहकारी प्रशासक से कहें।';

  @override
  String get documentsUploadDocument => 'दस्तावेज़ अपलोड करें';

  @override
  String get documentsAccepted => 'स्वीकार किया';

  @override
  String get documentsNotAccepted => 'स्वीकार नहीं किया';

  @override
  String get documentsExpired => 'समय समाप्त';

  @override
  String get documentsWaitingToBeChecked => 'जांच की प्रतीक्षा में';

  @override
  String documentsExpiredDaysAgo(Object days) {
    return '$days दिन पहले समय समाप्त';
  }

  @override
  String documentsExpiresInDays(Object days) {
    return '$days दिनों में समय समाप्त';
  }

  @override
  String documentsValidUntil(Object date) {
    return '$date तक मान्य';
  }

  @override
  String get documentsFallbackType => 'दस्तावेज़';

  @override
  String get scheduleTitle => 'कार्य समय';

  @override
  String get scheduleSaved => 'सहेजा गया।';

  @override
  String get scheduleCouldNotLoadHours => 'आपके समय लोड नहीं हो सके।';

  @override
  String get scheduleEmptyState => 'आपने कोई समय सेट नहीं किया।';

  @override
  String get scheduleSaveMyHours => 'मेरे समय सहेजें';

  @override
  String get scheduleTimeOff => 'छुट्टी';

  @override
  String get scheduleNoneBooked => 'कुछ बुक नहीं।';

  @override
  String get scheduleTimeOffFallback => 'छुट्टी';

  @override
  String get scheduleBookTimeOff => 'छुट्टी बुक करें';

  @override
  String get scheduleWhenAreYouAway => 'आप कब दूर हैं?';

  @override
  String scheduleStartOf(Object day) {
    return '$day की शुरुआत';
  }

  @override
  String scheduleEndOf(Object day) {
    return '$day का अंत';
  }

  @override
  String get scheduleEndMustBeAfterStart => 'अंत शुरुआत के बाद होना चाहिए।';

  @override
  String get scheduleNotWorking => 'काम नहीं कर रहे';

  @override
  String get safetyAppBarTitle => 'सुरक्षा';

  @override
  String get safetySosButtonLabel => 'SOS';

  @override
  String get safetyHoldInstruction => 'तीन सेकंड तक दबाएं';

  @override
  String get safetyHoldDescription =>
      'यह आपकी स्थिति तुरंत सहकारी को भेजता है।';

  @override
  String get safetyPastAlertsHeader => 'पिछले अलर्ट';

  @override
  String get safetyNoPastAlerts => 'कोई नहीं। अच्छा।';

  @override
  String get safetyStatusSent => 'भेजा गया';

  @override
  String get safetyStatusAcknowledged => 'कोई देख रहा है';

  @override
  String get safetyStatusResolved => 'हल हो गया';

  @override
  String get safetyStatusFalseAlarm => 'झूठा अलर्ट चिन्हित';

  @override
  String get safetyAlertDialogTitle => 'अलर्ट भेजा गया';

  @override
  String get safetyAlertDialogContent => 'ऑपरेशन रूम के पास आपकी स्थिति है।';

  @override
  String get safetyDialogCloseButton => 'बंद करें';

  @override
  String safetyDialogCallButton(Object number) {
    return '$number पर कॉल करें';
  }

  @override
  String get welfareAppBarTitle => 'कल्याण पासपोर्ट';

  @override
  String get welfareLoadError => 'आपके कल्याण रिकॉर्ड लोड नहीं हो सके।';

  @override
  String get welfareNoRecords => 'कोई कल्याण रिकॉर्ड नहीं मिला।';

  @override
  String get welfareSectionTraining => 'प्रशिक्षण';

  @override
  String get welfareNoTrainingRecords => 'अभी तक कोई प्रशिक्षण रिकॉर्ड नहीं।';

  @override
  String get welfareSectionInsurance => 'बीमा';

  @override
  String get welfareNoInsuranceRecords => 'अभी तक कोई बीमा रिकॉर्ड नहीं।';

  @override
  String get welfareSectionPayoutAccount => 'भुगतान खाता';

  @override
  String get welfareNoPayoutAccount => 'कोई भुगतान खाता सेट नहीं।';

  @override
  String get welfareStatusLabelInsurance => 'बीमा';

  @override
  String get welfareStatusLabelTraining => 'प्रशिक्षण';

  @override
  String welfareCompletedPrefix(Object date) {
    return '$date को पूरा हुआ';
  }

  @override
  String welfareExpiresPrefix(Object date) {
    return '$date को समय समाप्त';
  }

  @override
  String welfareCoverageLabel(Object amount) {
    return '₹$amount कवरेज';
  }

  @override
  String get welfareStatusExpired => 'समय समाप्त';

  @override
  String get welfareStatusPending => 'प्रतीक्षा में';

  @override
  String get welfareStatusInProgress => 'प्रगति में';

  @override
  String get welfareRetryButton => 'पुनः प्रयास करें';

  @override
  String get reviewsAppBarTitle => 'समीक्षाएं';

  @override
  String get reviewsLoadError => 'समीक्षाएं लोड नहीं हो सकीं।';

  @override
  String get reviewsRetryButton => 'पुनः प्रयास करें';

  @override
  String get reviewsEmptyState => 'अभी तक कोई समीक्षा नहीं।';

  @override
  String reviewsCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# समीक्षाएं',
      one: '# समीक्षा',
    );
    return '($_temp0)';
  }

  @override
  String get blockedAppBarTitle => 'रोके गए ग्राहक';

  @override
  String get blockedBlockTooltip => 'ग्राहक को रोकें';

  @override
  String get blockedLoadError => 'रोके गए ग्राहक लोड नहीं हो सके।';

  @override
  String get blockedRetryButton => 'पुनः प्रयास करें';

  @override
  String get blockedEmptyState => 'कोई रोका गया ग्राहक नहीं।';

  @override
  String get blockedDialogCustomerLabel => 'ग्राहक आईडी';

  @override
  String get blockedDialogCustomerHint => 'ग्राहक की आईडी पेस्ट करें';

  @override
  String get blockedDialogCancelButton => 'रद्द करें';

  @override
  String get blockedDialogBlockButton => 'रोकें';

  @override
  String get blockedBlockError => 'ग्राहक को नहीं रोका जा सका।';

  @override
  String get blockedUnblockDialogTitle => 'अनब्लॉक करें?';

  @override
  String blockedUnDialogContent(Object name) {
    return 'आपको $name से काम फिर से मिल सकते हैं।';
  }

  @override
  String get blockedUnblockKeepButton => 'रोका रखें';

  @override
  String get blockedUnblockConfirmButton => 'अनब्लॉक करें';

  @override
  String get blockedUnblockTooltip => 'अनब्लॉक करें';

  @override
  String get blockedUnblockError => 'ग्राहक को अनब्लॉक नहीं किया जा सका।';

  @override
  String blockedDatePrefix(Object date) {
    return '$date को रोका गया';
  }
}
