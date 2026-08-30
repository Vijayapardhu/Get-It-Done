import { registerHandler, registerPeriodicHandler, periodicJobTypes, enqueue } from "../core/jobQueue.js";
import { handleAssignmentTimeout, escalateEmergency } from "../services/emergencyService.js";
import { generateDueRecurringBookings } from "../services/recurringService.js";
import { generateSettlements, previousMonthPeriod } from "../services/settlementService.js";
import { processOutboxEvents } from "../services/notificationService.js";
import { generateExport, generatePendingExports } from "../services/reportExportService.js";
import { expireDueOffers } from "../services/offerService.js";
import { autoOfflineAfterShift, warnExpiringDocuments } from "../services/workerShiftService.js";
import logger from "../core/logger.js";

/**
 * Job handler registry.
 *
 * Everything here was previously either missing or ran on an in-process timer
 * that a restart discarded:
 *   - the 45s worker-acceptance failover did not exist
 *   - emergency escalation used `setTimeout` up to an hour out
 *   - recurring generation lived in an orphaned router nothing imported
 *   - settlement batches were never created by anything
 *   - processOutboxEvents was exported but never called, so `outbox_events`
 *     accumulated forever
 *
 * Periodic jobs are registered with `registerPeriodicHandler`; the runner books
 * the next occurrence once the current row is terminal. Handlers must NOT
 * re-enqueue themselves — see the note in jobQueue.ts.
 */

const FIFTEEN_MINUTES = 15 * 60;
const THIRTY_SECONDS = 30;
const SIX_HOURS = 6 * 60 * 60;
const ONE_MINUTE = 60;
const ONE_DAY = 24 * 60 * 60;

export function registerJobHandlers(): void {
  // ── One-shot: blueprint 5.4 acceptance failover ──────────────────────────
  registerHandler("booking.assignment_timeout", async (payload) => {
    const bookingId = String(payload.bookingId ?? "");
    const workerId = String(payload.workerId ?? "");
    if (!bookingId || !workerId) return;

    const result = await handleAssignmentTimeout(bookingId, workerId);
    logger.info({ bookingId, workerId, result }, "Assignment timeout processed");
  });

  // ── One-shot: emergency escalation ───────────────────────────────────────
  registerHandler("emergency.escalate", async (payload) => {
    const bookingId = String(payload.bookingId ?? "");
    if (!bookingId) return;

    const result = await escalateEmergency(
      bookingId,
      typeof payload.newRadiusKm === "number" ? payload.newRadiusKm : undefined,
      true,
      String(payload.reason ?? "scheduled_escalation")
    );
    logger.info({ bookingId, result }, "Emergency escalation processed");
  });

  // ── One-shot: generate a queued report export ────────────────────────────
  registerHandler("report.export", async (payload) => {
    const exportId = String(payload.exportId ?? "");
    if (!exportId) return;

    const result = await generateExport(exportId);
    // A failed export is recorded on its own row with the reason; throwing here
    // would also retry it through the queue's backoff, which is what we want
    // for a transient storage error.
    if (result.status === "failed") throw new Error(result.error ?? "Report export failed");

    logger.info({ exportId, rowCount: result.rowCount }, "Report export completed");
  });

  // ── Periodic ─────────────────────────────────────────────────────────────
  // Sweep for exports queued while no runner was up.
  registerPeriodicHandler("report.export.sweep", FIFTEEN_MINUTES, async () => {
    const generated = await generatePendingExports();
    if (generated > 0) logger.info({ generated }, "Backfilled pending report exports");
  });

  registerPeriodicHandler("recurring.generate", FIFTEEN_MINUTES, async () => {
    const result = await generateDueRecurringBookings();
    if (result.generated || result.failed) logger.info(result, "Recurring generation tick");
  });

  registerPeriodicHandler("outbox.drain", THIRTY_SECONDS, async () => {
    const processed = await processOutboxEvents();
    if (processed > 0) logger.debug({ processed }, "Outbox drained");
  });

  // ── Periodic: the worker app's housekeeping ──────────────────────────────
  //
  // The 45-second failover job already reassigns a lapsed booking. This is the
  // bookkeeping half: an offer whose booking was cancelled outright has no
  // failover job to close it, and would otherwise sit `offered` forever and
  // keep appearing in GET /workers/me/offers.
  registerPeriodicHandler("offers.expire", ONE_MINUTE, async () => {
    const expired = await expireDueOffers();
    if (expired > 0) logger.debug({ expired }, "Lapsed job offers swept");
  });

  // WORKER_APP_PLAN 4.4: going offline should not be something to remember at
  // the end of a twelve-hour day.
  registerPeriodicHandler("worker.shift_end", ONE_MINUTE * 5, async () => {
    await autoOfflineAfterShift();
  });

  // TASKLIST 2.6: a worker whose insurance lapsed silently stops getting
  // matched and never finds out why.
  registerPeriodicHandler("worker.document_expiry", ONE_DAY, async () => {
    await warnExpiringDocuments();
  });

  registerPeriodicHandler("settlement.generate", SIX_HOURS, async (payload) => {
    // Explicit period when a caller asked for one; otherwise last calendar month.
    const period =
      typeof payload.periodStart === "string" && typeof payload.periodEnd === "string"
        ? { periodStart: payload.periodStart, periodEnd: payload.periodEnd }
        : previousMonthPeriod();

    const batches = await generateSettlements(period, {
      cooperativeId: typeof payload.cooperativeId === "string" ? payload.cooperativeId : undefined,
    });
    logger.info({ period, batches: batches.length }, "Scheduled settlement generation complete");
  });
}

/**
 * Seed the periodic jobs. Safe to call on every boot and from every instance —
 * the dedupe key collapses concurrent seeds to a single live job per schedule.
 */
export async function seedRecurringJobs(): Promise<void> {
  for (const { jobType } of periodicJobTypes()) {
    await enqueue(jobType, {}, { delaySeconds: 10, dedupeKey: `cron:${jobType}` }).catch((error) =>
      logger.error({ jobType, error }, "Failed to seed recurring job")
    );
  }
}
