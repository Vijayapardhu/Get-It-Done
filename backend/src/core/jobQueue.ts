import crypto from "node:crypto";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import logger from "./logger.js";

/**
 * Postgres-backed job queue.
 *
 * The codebase declared `bullmq` as a dependency but never created a queue or a
 * worker: the 45-second acceptance failover, recurring-booking generation,
 * settlement batching and outbox draining all either did not exist or ran on a
 * bare `setTimeout` that died with the process. An emergency escalation
 * scheduled an hour out simply never fired after a deploy.
 *
 * This uses `FOR UPDATE SKIP LOCKED`, so several API instances can run the
 * runner concurrently without handling the same job twice, and it needs no
 * broker beyond the database already in the request path.
 */

export type JobHandler = (payload: Record<string, unknown>, job: JobRecord) => Promise<void>;

export interface JobRecord {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

const handlers = new Map<string, JobHandler>();

/**
 * Job types that must run forever on a fixed cadence, and how often.
 *
 * The next occurrence is enqueued by the runner AFTER the current one reaches a
 * terminal state — never from inside the handler. The dedupe index only covers
 * 'pending' and 'running', so a handler that re-enqueues itself collides with
 * its own still-running row, `on conflict do nothing` swallows it, and the
 * schedule silently stops after a single tick.
 */
const periodicIntervals = new Map<string, number>();

export function registerHandler(jobType: string, handler: JobHandler): void {
  if (handlers.has(jobType)) throw new Error(`Duplicate job handler registered for '${jobType}'`);
  handlers.set(jobType, handler);
}

/** Register a handler that re-arms itself every `intervalSeconds`. */
export function registerPeriodicHandler(jobType: string, intervalSeconds: number, handler: JobHandler): void {
  registerHandler(jobType, handler);
  periodicIntervals.set(jobType, intervalSeconds);
}

export function periodicJobTypes(): Array<{ jobType: string; intervalSeconds: number }> {
  return [...periodicIntervals.entries()].map(([jobType, intervalSeconds]) => ({ jobType, intervalSeconds }));
}

/**
 * Book the next occurrence of a periodic job. Called only once the current row
 * is terminal, so the dedupe key is free.
 */
async function rearmPeriodic(jobType: string): Promise<void> {
  const intervalSeconds = periodicIntervals.get(jobType);
  if (intervalSeconds === undefined) return;

  try {
    await enqueue(jobType, {}, { delaySeconds: intervalSeconds, dedupeKey: `cron:${jobType}` });
  } catch (error) {
    logger.error({ jobType, error }, "Failed to re-arm periodic job");
  }
}

export interface EnqueueOptions {
  /** When to run. Defaults to immediately. */
  runAt?: Date;
  /** Seconds from now; ignored when runAt is given. */
  delaySeconds?: number;
  /**
   * At most one live (pending or running) job may hold a given key. Use it to
   * express "one failover timer per booking" without a read-modify-write race.
   */
  dedupeKey?: string;
  maxAttempts?: number;
}

/**
 * Schedule a job. Returns the job id, or null when a live job already holds the
 * same dedupe key (which is a success, not an error — the work is already booked).
 */
export async function enqueue(
  jobType: string,
  payload: Record<string, unknown> = {},
  options: EnqueueOptions = {}
): Promise<string | null> {
  const runAt =
    options.runAt ?? (options.delaySeconds ? new Date(Date.now() + options.delaySeconds * 1000) : new Date());

  const result = await pool.query(
    `insert into job_queue (id, job_type, payload, run_at, dedupe_key, max_attempts)
     values ($1, $2, $3, $4, $5, $6)
     on conflict do nothing
     returning id`,
    [crypto.randomUUID(), jobType, payload, runAt, options.dedupeKey ?? null, options.maxAttempts ?? 5]
  );

  const id = result.rows[0]?.id ?? null;
  if (id) logger.debug({ jobType, jobId: id, runAt }, "Job enqueued");
  return id;
}

/**
 * Cancel any pending job matching a dedupe key — e.g. the worker accepted, so
 * the failover timer should not fire.
 */
export async function cancelByDedupeKey(dedupeKey: string): Promise<number> {
  const result = await pool.query(
    `update job_queue set status = 'cancelled', updated_at = now()
      where dedupe_key = $1 and status = 'pending'`,
    [dedupeKey]
  );
  return result.rowCount ?? 0;
}

const runnerId = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;

/**
 * Atomically claim up to `limit` due jobs. SKIP LOCKED means a second runner
 * takes the next rows instead of blocking on ours.
 */
async function claimJobs(limit: number): Promise<JobRecord[]> {
  const result = await pool.query(
    `update job_queue
        set status = 'running', locked_at = now(), locked_by = $1, attempts = attempts + 1, updated_at = now()
      where id in (
        select id from job_queue
         where status = 'pending' and run_at <= now()
         order by run_at
         limit $2
         for update skip locked
      )
      returning id, job_type, payload, attempts, max_attempts`,
    [runnerId, limit]
  );
  return result.rows;
}

async function completeJob(job: JobRecord): Promise<void> {
  await pool.query(
    "update job_queue set status = 'done', locked_at = null, locked_by = null, updated_at = now() where id = $1",
    [job.id]
  );
}

async function failJob(job: JobRecord, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= job.max_attempts;

  if (exhausted) {
    await pool.query(
      "update job_queue set status = 'failed', last_error = $1, locked_at = null, locked_by = null, updated_at = now() where id = $2",
      [message, job.id]
    );
    logger.error({ jobId: job.id, jobType: job.job_type, attempts: job.attempts, error: message }, "Job failed permanently");
    return;
  }

  // Exponential backoff: 30s, 60s, 120s, 240s...
  const backoffSeconds = 30 * 2 ** (job.attempts - 1);
  await pool.query(
    `update job_queue
        set status = 'pending', run_at = now() + ($1 || ' seconds')::interval,
            last_error = $2, locked_at = null, locked_by = null, updated_at = now()
      where id = $3`,
    [String(backoffSeconds), message, job.id]
  );
  logger.warn({ jobId: job.id, jobType: job.job_type, attempts: job.attempts, backoffSeconds, error: message }, "Job failed, retrying");
}

/** Process one batch of due jobs. Exported so tests can pump the queue directly. */
export async function runDueJobs(limit = env.JOB_BATCH_SIZE): Promise<number> {
  const jobs = await claimJobs(limit);
  if (jobs.length === 0) return 0;

  await Promise.all(
    jobs.map(async (job) => {
      const handler = handlers.get(job.job_type);
      if (!handler) {
        await failJob(job, new Error(`No handler registered for job type '${job.job_type}'`));
        // Still re-arm: an unregistered type on one instance may be handled by
        // another, and dropping the schedule entirely is worse than retrying.
        await rearmPeriodic(job.job_type);
        return;
      }

      let terminal = true;
      try {
        await handler(job.payload ?? {}, job);
        await completeJob(job);
      } catch (error) {
        await failJob(job, error);
        // failJob leaves the row 'pending' for a retry unless attempts are
        // exhausted; only re-arm the schedule once this row is finished with.
        terminal = job.attempts >= job.max_attempts;
      }

      if (terminal) await rearmPeriodic(job.job_type);
    })
  );

  return jobs.length;
}

/**
 * Re-queue jobs a crashed runner left in 'running'. Called on startup; the
 * 5-minute threshold is well beyond any handler's expected runtime.
 */
export async function recoverStuckJobs(): Promise<number> {
  const result = await pool.query(
    `update job_queue
        set status = 'pending', locked_at = null, locked_by = null, updated_at = now()
      where status = 'running' and locked_at < now() - interval '5 minutes'`
  );
  const count = result.rowCount ?? 0;
  if (count > 0) logger.warn({ count }, "Recovered jobs orphaned by a crashed runner");
  return count;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startJobRunner(): void {
  if (timer) return;
  if (!env.JOBS_ENABLED) {
    logger.info("JOBS_ENABLED=false — background job runner not started");
    return;
  }

  void recoverStuckJobs().catch((error) => logger.error({ error }, "Stuck-job recovery failed"));

  timer = setInterval(() => {
    // Skip the tick rather than overlapping if the previous batch is still going.
    if (running) return;
    running = true;
    void runDueJobs()
      .catch((error) => logger.error({ error }, "Job runner tick failed"))
      .finally(() => { running = false; });
  }, env.JOB_POLL_INTERVAL_MS);

  timer.unref();
  logger.info({ intervalMs: env.JOB_POLL_INTERVAL_MS, runnerId }, "Background job runner started");
}

export function stopJobRunner(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info("Background job runner stopped");
  }
}
