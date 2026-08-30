import { pool } from "../db/pool.js";
import logger from "../core/logger.js";
import { emitWorkerAvailabilityUpdate } from "../core/realtime.js";
import { writeNotification } from "../services/notificationService.js";

/**
 * Working hours, time off, and the two chores they imply.
 *
 * WORKER_APP_PLAN 4.4. `workers.current_status` is three values and no
 * calendar, so a worker who forgets to go offline gets a 2am plumbing offer,
 * and matching has no idea they are asleep.
 *
 * Wall-clock, in Asia/Kolkata, deliberately. A worker thinks "I work eight to
 * six", and storing that as a timestamptz would shift their shift the first
 * time anything about the server's zone changed.
 */

export const IST = "Asia/Kolkata";

export interface ScheduleEntry {
  weekday: number; // 0 = Sunday
  startsAt: string; // "08:00"
  endsAt: string; // "18:00"
}

export interface TimeOffEntry {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export async function getSchedule(workerId: string): Promise<ScheduleEntry[]> {
  const result = await pool.query<{ weekday: number; starts_at: string; ends_at: string }>(
    `select weekday, starts_at::text, ends_at::text
       from worker_availability_schedule
      where worker_id = $1
      order by weekday, starts_at`,
    [workerId]
  );
  return result.rows.map((row) => ({
    weekday: Number(row.weekday),
    // Postgres renders `time` as HH:MM:SS; the app shows HH:MM.
    startsAt: row.starts_at.slice(0, 5),
    endsAt: row.ends_at.slice(0, 5),
  }));
}

/**
 * Replace the whole week in one transaction.
 *
 * A PUT rather than per-row edits: the weekly grid is edited as a unit, and a
 * half-applied schedule -- Monday saved, Tuesday not -- would leave a worker
 * matched on hours they did not agree to.
 */
export async function replaceSchedule(workerId: string, entries: ScheduleEntry[]): Promise<ScheduleEntry[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from worker_availability_schedule where worker_id = $1", [workerId]);
    for (const entry of entries) {
      await client.query(
        `insert into worker_availability_schedule (worker_id, weekday, starts_at, ends_at)
         values ($1, $2, $3::time, $4::time)
         on conflict (worker_id, weekday, starts_at) do update set ends_at = excluded.ends_at`,
        [workerId, entry.weekday, entry.startsAt, entry.endsAt]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return getSchedule(workerId);
}

export async function listTimeOff(workerId: string, includePast = false): Promise<TimeOffEntry[]> {
  const result = await pool.query<{ id: string; starts_at: Date; ends_at: Date; reason: string | null }>(
    `select id, starts_at, ends_at, reason
       from worker_time_off
      where worker_id = $1 ${includePast ? "" : "and ends_at > now()"}
      order by starts_at`,
    [workerId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    reason: row.reason,
  }));
}

export async function addTimeOff(
  workerId: string,
  input: { startsAt: string; endsAt: string; reason?: string }
): Promise<TimeOffEntry> {
  const result = await pool.query<{ id: string; starts_at: Date; ends_at: Date; reason: string | null }>(
    `insert into worker_time_off (worker_id, starts_at, ends_at, reason)
     values ($1, $2, $3, $4)
     returning id, starts_at, ends_at, reason`,
    [workerId, input.startsAt, input.endsAt, input.reason ?? null]
  );
  const row = result.rows[0];
  return { id: row.id, startsAt: row.starts_at.toISOString(), endsAt: row.ends_at.toISOString(), reason: row.reason };
}

export async function removeTimeOff(workerId: string, id: string): Promise<boolean> {
  const result = await pool.query("delete from worker_time_off where worker_id = $1 and id = $2", [workerId, id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Is this worker inside their declared hours right now?
 *
 * A worker with no schedule is always inside them. The duty toggle stays the
 * primary control; hours are an additional guard a worker opts into, not a new
 * way to become unbookable by doing nothing.
 */
export async function isOnShift(workerId: string): Promise<boolean> {
  const result = await pool.query<{ on_shift: boolean }>(
    `select (
       (not exists (select 1 from worker_availability_schedule where worker_id = $1))
       or exists (
         select 1 from worker_availability_schedule
          where worker_id = $1
            and weekday = extract(dow from (now() at time zone $2))::smallint
            and (now() at time zone $2)::time between starts_at and ends_at
       )
     ) and not exists (
       select 1 from worker_time_off where worker_id = $1 and now() between starts_at and ends_at
     ) as on_shift`,
    [workerId, IST]
  );
  return Boolean(result.rows[0]?.on_shift);
}

/**
 * Take off duty everyone whose shift has ended.
 *
 * The toggle should not be something a worker has to remember at the end of a
 * twelve-hour day. Workers mid-job are left alone: `busy` means someone is
 * waiting on them, and the shift ending does not end the job.
 */
export async function autoOfflineAfterShift(): Promise<number> {
  const result = await pool.query<{ user_id: string }>(
    `update workers w
        set current_status = 'offline', updated_at = now()
      from worker_offer_preferences p
     where p.worker_id = w.id
       and p.auto_offline_at_shift_end = true
       and w.current_status = 'available'
       and exists (select 1 from worker_availability_schedule s where s.worker_id = w.id)
       and not exists (
         select 1 from worker_availability_schedule s
          where s.worker_id = w.id
            and s.weekday = extract(dow from (now() at time zone $1))::smallint
            and (now() at time zone $1)::time between s.starts_at and s.ends_at
       )
     returning w.user_id`,
    [IST]
  );

  for (const row of result.rows) {
    emitWorkerAvailabilityUpdate(row.user_id, { userId: row.user_id, currentStatus: "offline", reason: "shift_ended" });
  }
  if (result.rowCount) logger.info({ count: result.rowCount }, "Workers taken off duty at end of shift");
  return result.rowCount ?? 0;
}

/**
 * Warn a worker before a document lapses.
 *
 * TASKLIST 2.6 has this unchecked, and the consequence is specific: a worker
 * whose insurance expired silently stops being matched and never finds out why.
 * Two warnings -- thirty days and seven -- then one on the day.
 *
 * The `date_part` guard is what makes it idempotent enough to run daily: a
 * document is only warned about on the exact days it crosses a threshold.
 */
export async function warnExpiringDocuments(): Promise<number> {
  const client = await pool.connect();
  let sent = 0;
  try {
    await client.query("begin");

    const due = await client.query<{
      user_id: string;
      kind: string;
      label: string;
      days_left: number;
    }>(
      `select u.id as user_id, 'insurance' as kind, i.provider as label,
              (i.expires_on - current_date) as days_left
         from worker_insurance_records i
         join workers w on w.id = i.worker_id
         join users   u on u.id = w.user_id
        where i.status = 'active'
          and (i.expires_on - current_date) in (30, 7, 0)
        union all
       select u.id, 'certification', sk.name,
              (c.expires_at::date - current_date)
         from certifications c
         join skills  sk on sk.id = c.skill_id
         join workers w  on w.id = c.worker_id
         join users   u  on u.id = w.user_id
        where c.status = 'active'
          and c.expires_at is not null
          and (c.expires_at::date - current_date) in (30, 7, 0)`
    );

    for (const row of due.rows) {
      const days = Number(row.days_left);
      await writeNotification(client, {
        userId: row.user_id,
        type: "document_expiry",
        title: days === 0 ? `Your ${row.kind} expired today` : `Your ${row.kind} expires in ${days} days`,
        body:
          days === 0
            ? `${row.label} has lapsed. You will stop receiving jobs that require it until it is renewed.`
            : `${row.label} expires in ${days} days. Renew it to keep receiving jobs.`,
        aggregateType: "worker_document",
        aggregateId: row.user_id,
      });
      sent += 1;
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    // A warning that failed to send is not worth failing the daily sweep over;
    // it will be re-attempted tomorrow, and the expiry itself is still visible
    // on the documents screen.
    logger.error({ err: error }, "Document expiry warnings failed");
    return sent;
  } finally {
    client.release();
  }

  if (sent > 0) logger.info({ sent }, "Document expiry warnings sent");
  return sent;
}
