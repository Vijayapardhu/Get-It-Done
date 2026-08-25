import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../services/auditService.js";
export const i18nRouter = Router();
// Supported languages configuration
const SUPPORTED_LANGUAGES = [
    { code: "en", name: "English", nativeName: "English", isDefault: true },
    { code: "te", name: "Telugu", nativeName: "తెలుగు", isDefault: false },
    { code: "hi", name: "Hindi", nativeName: "हिन्दी", isDefault: false },
];
// Translation keys used in the application
const TRANSLATION_KEYS = [
    // Auth
    "auth.login", "auth.register", "auth.logout", "auth.forgotPassword", "auth.resetPassword",
    "auth.otpSent", "auth.invalidOtp", "auth.otpVerified", "auth.sessionExpired",
    // Booking
    "booking.create", "booking.confirm", "booking.cancel", "booking.reschedule",
    "booking.track", "booking.emergency", "booking.scheduled", "booking.completed",
    "booking.workerAssigned", "booking.workerArrived", "booking.jobStarted",
    "booking.jobCompleted", "booking.paymentRequired", "booking.invoiceGenerated",
    // Worker
    "worker.profile", "worker.availability", "worker.earnings", "worker.skills",
    "worker.verification", "worker.documents", "worker.training", "worker.insurance",
    "worker.welfare", "worker.rating", "worker.jobs",
    // Services
    "service.search", "service.category", "service.price", "service.description",
    "service.emergency", "service.schedule",
    // Notifications
    "notification.newBooking", "notification.bookingConfirmed", "notification.workerAssigned",
    "notification.workerArrived", "notification.jobStarted", "notification.jobCompleted",
    "notification.paymentReceived", "notification.ratingRequest", "notification.emergencyAlert",
    "notification.verificationUpdate", "notification.certificationExpiry",
    // Common
    "common.save", "common.cancel", "common.delete", "common.edit", "common.view",
    "common.loading", "common.error", "common.success", "common.confirm",
    "common.yes", "common.no", "common.ok", "common.close", "common.search",
    "common.filter", "common.sort", "common.refresh", "common.retry",
    // Errors
    "error.network", "error.unauthorized", "error.forbidden", "error.notFound",
    "error.validation", "error.server", "error.unknown",
];
/**
 * @openapi
 * /i18n/languages:
 *   get:
 *     summary: Get supported languages
 *     tags: [Internationalization]
 *     responses:
 *       200:
 *         description: List of supported languages
 */
i18nRouter.get("/languages", async (_req, res) => {
    res.json({ languages: SUPPORTED_LANGUAGES });
});
/**
 * @openapi
 * /i18n/translations/{lang}:
 *   get:
 *     summary: Get translations for a language
 *     tags: [Internationalization]
 *     parameters:
 *       - name: lang
 *         in: path
 *         required: true
 *         schema: { type: string, enum: [en, te, hi] }
 *     responses:
 *       200:
 *         description: Translation strings
 *       404:
 *         description: Language not supported
 */
i18nRouter.get("/translations/:lang", async (req, res, next) => {
    try {
        const lang = req.params.lang;
        const supported = SUPPORTED_LANGUAGES.find(l => l.code === lang);
        if (!supported) {
            res.status(404).json({ error: "Language not supported" });
            return;
        }
        // Built-in defaults, with any admin overrides stored for this language
        // layered on top. The overrides used to be discarded outright: the
        // admin PUT below acknowledged edits without saving them anywhere.
        const translations = generateTranslations(lang);
        const overrides = await pool.query("select key, value, updated_at from translations where lang = $1", [lang]);
        for (const row of overrides.rows) translations[row.key] = row.value;
        const lastUpdated = overrides.rows.reduce((latest: Date | null, row: { updated_at: string }) => {
            const at = new Date(row.updated_at);
            return latest === null || at > latest ? at : latest;
        }, null);
        res.json({
            language: supported,
            translations,
            overrideCount: overrides.rows.length,
            lastUpdated: (lastUpdated ?? new Date()).toISOString(),
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @openapi
 * /i18n/user/language:
 *   get:
 *     summary: Get current user's preferred language
 *     tags: [Internationalization]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: User's language preference
 */
i18nRouter.get("/user/language", requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query(`SELECT language, preferred_language as "preferredLanguage" FROM users WHERE id = $1`, [req.user!.id]);
        if (!result.rows[0]) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        res.json({
            language: result.rows[0].language ?? "en",
            preferredLanguage: result.rows[0].preferredLanguage ?? "en",
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @openapi
 * /i18n/user/language:
 *   patch:
 *     summary: Update user's preferred language
 *     tags: [Internationalization]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [language]
 *             properties:
 *               language: { type: string, enum: [en, te, hi] }
 *     responses:
 *       200:
 *         description: Language updated
 *       400:
 *         description: Invalid language
 */
i18nRouter.patch("/user/language", requireAuth, async (req, res, next) => {
    try {
        const { language } = z.object({ language: z.enum(["en", "te", "hi"]) }).parse(req.body);
        const supported = SUPPORTED_LANGUAGES.find(l => l.code === language);
        if (!supported) {
            res.status(400).json({ error: "Invalid language" });
            return;
        }
        const result = await pool.query(`UPDATE users SET preferred_language = $1, updated_at = now() WHERE id = $2 RETURNING id, preferred_language as "preferredLanguage"`, [language, req.user!.id]);
        await recordAuditEvent({
            actorId: req.user!.id,
            action: "user.language.changed",
            resourceType: "user",
            resourceId: req.user!.id,
            requestId: req.header("x-request-id"),
            metadata: { language }
        }).catch(() => undefined);
        res.json({
            message: "Language preference updated",
            preferredLanguage: result.rows[0].preferredLanguage
        });
    }
    catch (error) {
        next(error);
    }
});
// Admin endpoints for managing translations
/**
 * @openapi
 * /i18n/admin/translations:
 *   get:
 *     summary: List all translation keys (admin)
 *     tags: [Internationalization]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Translation keys
 */
i18nRouter.get("/admin/translations", requireAuth, requireRoles("system_admin"), async (_req, res) => {
    res.json({ keys: TRANSLATION_KEYS });
});
/**
 * @openapi
 * /i18n/admin/translations/{lang}:
 *   put:
 *     summary: Update translations for a language (admin)
 *     tags: [Internationalization]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: lang
 *         in: path
 *         required: true
 *         schema: { type: string, enum: [en, te, hi] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: { type: string }
 *     responses:
 *       200:
 *         description: Translations updated
 */
i18nRouter.put("/admin/translations/:lang", requireAuth, requireRoles("system_admin"), async (req, res, next) => {
    try {
        const lang = Array.isArray(req.params.lang) ? req.params.lang[0] : req.params.lang;
        const supported = SUPPORTED_LANGUAGES.find(l => l.code === lang);
        if (!supported) {
            res.status(404).json({ error: "Language not supported" });
            return;
        }
        const entries = z.record(z.string().max(2000)).parse(req.body ?? {});
        const keys = Object.keys(entries);
        if (keys.length === 0) {
            res.status(400).json({ error: "No translation keys supplied" });
            return;
        }
        if (keys.length > 2000) {
            res.status(400).json({ error: "Too many keys in one request (max 2000)" });
            return;
        }
        // Reject unknown keys rather than storing typos the client will never read back.
        const known = new Set(TRANSLATION_KEYS);
        const unknown = keys.filter((key) => !known.has(key));
        if (unknown.length > 0) {
            res.status(400).json({ error: "Unknown translation keys", keys: unknown.slice(0, 20) });
            return;
        }
        // This handler used to record an audit event and return 200 without
        // writing anything, so every admin translation edit was silently lost.
        const client = await pool.connect();
        try {
            await client.query("begin");
            for (const key of keys) {
                await client.query(`insert into translations (lang, key, value, updated_by)
                     values ($1, $2, $3, $4)
                     on conflict (lang, key) do update
                       set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`, [lang, key, entries[key], req.user!.id]);
            }
            await client.query("commit");
        }
        catch (error) {
            await client.query("rollback");
            throw error;
        }
        finally {
            client.release();
        }
        await recordAuditEvent({
            actorId: req.user!.id,
            action: "i18n.translations.updated",
            resourceType: "translation",
            resourceId: lang,
            requestId: req.header("x-request-id"),
            metadata: { keyCount: keys.length }
        }).catch(() => undefined);
        res.json({ message: `Translations updated for ${lang}`, language: lang, keyCount: keys.length });
    }
    catch (error) {
        next(error);
    }
});
function generateTranslations(lang: string): Record<string, string> {
    const baseTranslations: Record<string, Record<string, string>> = {
        en: {
            "auth.login": "Login",
            "auth.register": "Register",
            "auth.logout": "Logout",
            "auth.forgotPassword": "Forgot Password",
            "auth.resetPassword": "Reset Password",
            "auth.otpSent": "OTP sent to your phone",
            "auth.invalidOtp": "Invalid or expired OTP",
            "auth.otpVerified": "OTP verified successfully",
            "auth.sessionExpired": "Your session has expired. Please login again.",
            "booking.create": "Book Service",
            "booking.confirm": "Confirm Booking",
            "booking.cancel": "Cancel Booking",
            "booking.reschedule": "Reschedule Booking",
            "booking.track": "Track Booking",
            "booking.emergency": "Emergency Service",
            "booking.scheduled": "Scheduled",
            "booking.completed": "Completed",
            "booking.workerAssigned": "Worker Assigned",
            "booking.workerArrived": "Worker Arrived",
            "booking.jobStarted": "Job Started",
            "booking.jobCompleted": "Job Completed",
            "booking.paymentRequired": "Payment Required",
            "booking.invoiceGenerated": "Invoice Generated",
            "worker.profile": "Profile",
            "worker.availability": "Availability",
            "worker.earnings": "Earnings",
            "worker.skills": "Skills",
            "worker.verification": "Verification",
            "worker.documents": "Documents",
            "worker.training": "Training",
            "worker.insurance": "Insurance",
            "worker.welfare": "Welfare",
            "worker.rating": "Rating",
            "worker.jobs": "Jobs",
            "service.search": "Search Services",
            "service.category": "Category",
            "service.price": "Price",
            "service.description": "Description",
            "service.emergency": "Emergency Available",
            "service.schedule": "Schedule Service",
            "notification.newBooking": "New Booking Request",
            "notification.bookingConfirmed": "Booking Confirmed",
            "notification.workerAssigned": "Worker Assigned",
            "notification.workerArrived": "Worker Has Arrived",
            "notification.jobStarted": "Job Started",
            "notification.jobCompleted": "Job Completed",
            "notification.paymentReceived": "Payment Received",
            "notification.ratingRequest": "Please Rate Your Service",
            "notification.emergencyAlert": "Emergency Service Request",
            "notification.verificationUpdate": "Verification Status Updated",
            "notification.certificationExpiry": "Certification Expiring Soon",
            "common.save": "Save",
            "common.cancel": "Cancel",
            "common.delete": "Delete",
            "common.edit": "Edit",
            "common.view": "View",
            "common.loading": "Loading...",
            "common.error": "Error",
            "common.success": "Success",
            "common.confirm": "Confirm",
            "common.yes": "Yes",
            "common.no": "No",
            "common.ok": "OK",
            "common.close": "Close",
            "common.search": "Search",
            "common.filter": "Filter",
            "common.sort": "Sort",
            "common.refresh": "Refresh",
            "common.retry": "Retry",
            "error.network": "Network error. Please check your connection.",
            "error.unauthorized": "Please login to continue.",
            "error.forbidden": "You don't have permission to do this.",
            "error.notFound": "Not found.",
            "error.validation": "Please check your input.",
            "error.server": "Server error. Please try again later.",
            "error.unknown": "An unknown error occurred.",
        },
        te: {
            "auth.login": "లాగిన్",
            "auth.register": "రోలochet",
            "auth.logout": "లాగౌట్",
            "auth.forgotPassword": "పాస్‌వర్డ్ మర్చినట్టు",
            "auth.resetPassword": "పాస్‌వర్డ్ రీసెట్ చేయండి",
            "auth.otpSent": "మీ ఫోనుకవలె OTP పంపబడింది",
            "auth.invalidOtp": "అమಾನ್ಯ లేదా Hülిగించిన OTP",
            "auth.otpVerified": "OTP విజయవంతంగా ధృవీకరించబడింది",
            "auth.sessionExpired": "మీ సెషన్ కాలாவధి అంతyorడ్డినది. దయచేసి మళ్లీ లాగిన్ చేయండి.",
            "booking.create": "సేవా బుక్ చేయండి",
            "booking.confirm": "బుకింగ్ నిర్ధారించండి",
            "booking.cancel": "బుకింగ్ రద్దు చేయండి",
            "booking.reschedule": "బుకింగ్neoschedule చేయండి",
            "booking.track": "బుకింగ్ ట్రాక్ చేయండి",
            "booking.emergency": "అత్యవసர సేవ",
            "booking.scheduled": "నిర్ధారించబడింది",
            "booking.completed": "పూర్తయింది",
            "booking.workerAssigned": "వార్కర్ ალోకరినారు",
            "booking.workerArrived": "వార్కర్ రాయించారు",
            "booking.jobStarted": "పని ప్రారంభమైంది",
            "booking.jobCompleted": "పని పూర్తయింది",
            "booking.paymentRequired": "చెల్లింపు అవసరం",
            "booking.invoiceGenerated": "ఇన్వాయిస్ రూపొందించబడింది",
            "worker.profile": "ప్రొఫైల్",
            "worker.availability": "లಭ్యత",
            "worker.earnings": "ఆదాయాలు",
            "worker.skills": "నైపుణ్యాలు",
            "worker.verification": "ధృవీకరణ",
            "worker.documents": "డాక్యుమెంట్లు",
            "worker.training": "శిక్షణ",
            "worker.insurance": "ఇన్షూరెన్స్",
            "worker.welfare": "కల్యాణం",
            "worker.rating": "రేటింగ్",
            "worker.jobs": "పనులు",
            "service.search": "సేవలను శోధించండి",
            "service.category": "వర్గం",
            "service.price": "ధర",
            "service.description": "వివరణ",
            "service.emergency": "అత్యవసర アルバム",
            "service.schedule": "సేవను Онаడ్యూల్ చేయండి",
            "notification.newBooking": "కొత్త బుకింగ్ aanvవడం",
            "notification.bookingConfirmed": "బుకింగ్ నిర్ధారించబడింది",
            "notification.workerAssigned": "వార్కర్ అలోకరినారు",
            "notification.workerArrived": "వార్కర్ రాయించారు",
            "notification.jobStarted": "పని ప్రారంభమైంది",
            "notification.jobCompleted": "పని పూర్తయింది",
            "notification.paymentReceived": "చెల్లింపు పొందారు",
            "notification.ratingRequest": "దయచేసి మీ సేవను రేటింగ్ చేయండి",
            "notification.emergencyAlert": "అత్యవసర సేవా అభ్యర్థన",
            "notification.verificationUpdate": "ధృవీకరణ స్థితి అప్‌డేట్ అయింది",
            "notification.certificationExpiry": "సర్టిఫికేషన్ గడిపడేదారు",
            "common.save": "సేవ్ చేయండి",
            "common.cancel": "రద్దు చేయండి",
            "common.delete": "అధికార చికిత్స",
            "common.edit": "ప్రాసదిక్సి",
            "common.view": "చూడండి",
            "common.loading": "లోడ్ అవుతోంది...",
            "common.error": "లోపం",
            "common.success": "విజయం",
            "common.confirm": "నిర్ధారించండి",
            "common.yes": "అవును",
            "common.no": "కాదు",
            "common.ok": "సరే",
            "common.close": "వ ռուսస్",
            "common.search": "శోధన",
            "common.filter": "ఫిల్టర్",
            "common.sort": "క్రమबద్ధం",
            "common.refresh": "రిఫ్రెష్",
            "common.retry": "మళ్లీ ప్రయత్నించండి",
            "error.network": "నెట్‌వర్క్ లోపం. దయచేసి మీ కనెక్షన్ చూడండి.",
            "error.unauthorized": "దయచేసి కొనసాగించడానికి లాగిన్ చేయండి.",
            "error.forbidden": "మీకు ఇది చేయడానికి అనుమతి లేదు.",
            "error.notFound": "నहीं मिला.",
            "error.validation": "దయచేసి మీ ఇన్పుట్ చూడండి.",
            "error.server": "సర్వర్ లోపం. దయచేసిésőవ십 ప్రయత్నించండి.",
            "error.unknown": "అనామ 발매.",
        },
        hi: {
            "auth.login": "लॉगिन",
            "auth.register": "रजिस्टर",
            "auth.logout": "लॉगआउट",
            "auth.forgotPassword": "पासवर्ड भूल गए",
            "auth.resetPassword": "पासवर्ड रीसेट करें",
            "auth.otpSent": "आपके फोन पर OTP भेजा गया",
            "auth.invalidOtp": "अमान्य या समाप्त OTP",
            "auth.otpVerified": "OTP सफलतापूर्वक सत्यापित",
            "auth.sessionExpired": "आपका सत्र समाप्त हो गया है। कृपया फिर से लॉगिन करें।",
            "booking.create": "सेवा बुक करें",
            "booking.confirm": "बुकिंग की पुष्टि करें",
            "booking.cancel": "बुकिंग रद्द करें",
            "booking.reschedule": "बुकिंग पुनर्निर्धारित करें",
            "booking.track": "बुकिंग ट्रैक करें",
            "booking.emergency": "आपातकालीन सेवा",
            "booking.scheduled": "निर्धारित",
            "booking.completed": "पूर्ण",
            "booking.workerAssigned": "कार्यकर्ता नियुक्त",
            "booking.workerArrived": "कार्यकर्ता पहुंचे",
            "booking.jobStarted": "कार्य शुरू",
            "booking.jobCompleted": "कार्य पूर्ण",
            "booking.paymentRequired": "भुगतान आवश्यक",
            "booking.invoiceGenerated": "चालान उत्पन्न",
            "worker.profile": "प्रोफाइल",
            "worker.availability": "उपलब्धता",
            "worker.earnings": "आय",
            "worker.skills": "कौशल",
            "worker.verification": "सत्यापन",
            "worker.documents": "दस्तावेज",
            "worker.training": "प्रशिक्षण",
            "worker.insurance": "बीमा",
            "worker.welfare": "कल्याण",
            "worker.rating": "रेटिंग",
            "worker.jobs": "नौकरियां",
            "service.search": "सेवा खोजें",
            "service.category": "श्रेणी",
            "service.price": "मूल्य",
            "service.description": "विवरण",
            "service.emergency": "आपातकालीन उपलब्ध",
            "service.schedule": "सेवा निर्धारित करें",
            "notification.newBooking": "नई बुकिंग अनुरोध",
            "notification.bookingConfirmed": "बुकिंग की पुष्टि हुई",
            "notification.workerAssigned": "कार्यकर्ता नियुक्त",
            "notification.workerArrived": "कार्यकर्ता पहुंचे",
            "notification.jobStarted": "कार्य शुरू",
            "notification.jobCompleted": "कार्य पूर्ण",
            "notification.paymentReceived": "भुगतान प्राप्त",
            "notification.ratingRequest": "कृपया अपनी सेवा को रेट करें",
            "notification.emergencyAlert": "आपातकालीन सेवा अनुरोध",
            "notification.verificationUpdate": "सत्यापन स्थिति अद्यतन",
            "notification.certificationExpiry": "प्रमाणपत्र समाप्ति निकट",
            "common.save": "सेव करें",
            "common.cancel": "रद्द करें",
            "common.delete": "हटाएं",
            "common.edit": "संपादित करें",
            "common.view": "देखें",
            "common.loading": "लोड हो रहा है...",
            "common.error": "त्रुटि",
            "common.success": "सफलता",
            "common.confirm": "पुष्टि करें",
            "common.yes": "हाँ",
            "common.no": "नहीं",
            "common.ok": "ठीक है",
            "common.close": "बंद करें",
            "common.search": "खोजें",
            "common.filter": "फिल्टर",
            "common.sort": "क्रमबद्ध करें",
            "common.refresh": "रीफ्रेश",
            "common.retry": "पुनः प्रयास करें",
            "error.network": "नेटवर्क त्रुटि। कृपया अपना कनेक्शन जांचें।",
            "error.unauthorized": "जारी रखने के लिए कृपया लॉगिन करें।",
            "error.forbidden": "आपके पास ऐसा करने की अनुमति नहीं है।",
            "error.notFound": "नहीं मिला।",
            "error.validation": "कृपया अपना इनपुट जांचें।",
            "error.server": "सर्वर त्रुटि। कृपया बाद में पुनः प्रयास करें।",
            "error.unknown": "अज्ञात त्रुटि हुई।",
        },
    };
    return baseTranslations[lang] ?? baseTranslations.en;
}
export default i18nRouter;
