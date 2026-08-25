import crypto from "node:crypto";
import { pool } from "../db/pool.js";
import logger from "../core/logger.js";

/**
 * Cooperative settlement batches.
 *
 * Nothing in the codebase ever INSERTed into `settlements`, so `GET /settlements`
 * was permanently empty and `POST /settlements/:id/process` could never find a
 * row to act on. The blueprint's `POST /settlements/generate` and
 * `POST /settlements/:id/payout` did not exist at all.
 *
 * Batches aggregate the invoices that `revenueSplit.settleBooking` already
 * issued, rather than recomputing the split from `services.base_price` a second
 * time. The old process handler recomputed it and posted ANOTHER
 * worker_earnings_ledger row per booking, double-crediting every worker whose
 * batch was processed.
 */

export interface SettlementPeriod {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
}

export interface GeneratedSettlement {
  id: string;
  cooperativeId: string;
  cooperativeName: string;
  totalBookings: number;
  totalRevenue: number;
  platformFee: number;
  cooperativeShare: number;
  workerShare: number;
  welfareFund: number;
  tax: number;
  status: string;
}

/** Calendar month containing `reference` (default: the month just ended). */
export function previousMonthPeriod(reference = new Date()): SettlementPeriod {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 0));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

/**
 * Build (or extend) settlement batches for a period.
 *
 * Idempotent in two layers: the settlement row is unique per
 * (cooperative, period), and `settlement_bookings.booking_id` is unique
 * globally, so re-running only picks up invoices that have not been settled into
 * any batch yet.
 */
export async function generateSettlements(
  period: SettlementPeriod,
  options: { cooperativeId?: string; actorId?: string | null } = {}
): Promise<GeneratedSettlement[]> {
  const client = await pool.connect();
  const generated: GeneratedSettlement[] = [];

  try {
    const cooperatives = await client.query(
      options.cooperativeId
        ? "select id, name from cooperatives where id = $1"
        : "select id, name from cooperatives order by name",
      options.cooperativeId ? [options.cooperativeId] : []
    );

    for (const cooperative of cooperatives.rows) {
      try {
        await client.query("begin");

        // Claim the settlement row first so two concurrent generators for the
        // same cooperative and period serialise rather than both inserting.
        const settlement = await client.query(
          `insert into settlements (id, cooperative_id, period_start, period_end, status, generated_by)
           values ($1, $2, $3, $4, 'draft', $5)
           on conflict (cooperative_id, period_start, period_end) do update
             set updated_at = now()
           returning *`,
          [crypto.randomUUID(), cooperative.id, period.periodStart, period.periodEnd, options.actorId ?? null]
        );
        const settlementId = settlement.rows[0].id;

        if (settlement.rows[0].status === "paid" || settlement.rows[0].status === "completed") {
          // Books already closed for this period; never reopen them.
          await client.query("rollback");
          continue;
        }

        // Invoices for this cooperative's workers in the period that are not yet
        // attached to any batch. The NOT EXISTS is what makes re-runs additive
        // rather than duplicating.
        const claimed = await client.query(
          `insert into settlement_bookings
             (settlement_id, booking_id, gross_amount, platform_fee, cooperative_share, worker_share, welfare_fund, tax)
           select $1, i.booking_id, i.subtotal, i.platform_fee, i.cooperative_share, i.worker_share, i.welfare_fund, i.tax
             from invoices i
             join workers w on w.id = i.worker_id
            where w.cooperative_id = $2
              and i.payment_status = 'paid'
              and i.issued_at::date between $3 and $4
              and not exists (select 1 from settlement_bookings sb where sb.booking_id = i.booking_id)
           on conflict (booking_id) do nothing
           returning gross_amount`,
          [settlementId, cooperative.id, period.periodStart, period.periodEnd]
        );

        if (claimed.rowCount === 0 && settlement.rows[0].total_bookings === 0) {
          // Nothing to settle and no prior content: drop the empty draft rather
          // than leaving a zero-value batch cluttering the admin list.
          await client.query("delete from settlements where id = $1 and total_bookings = 0", [settlementId]);
          await client.query("commit");
          continue;
        }

        // Recompute the header from its line items, so the totals always match
        // what settlement_bookings actually contains.
        const totals = await client.query(
          `select count(*)::int                       as total_bookings,
                  coalesce(sum(gross_amount), 0)      as total_revenue,
                  coalesce(sum(platform_fee), 0)      as platform_fee,
                  coalesce(sum(cooperative_share), 0) as cooperative_share,
                  coalesce(sum(worker_share), 0)      as worker_share,
                  coalesce(sum(welfare_fund), 0)      as welfare_fund,
                  coalesce(sum(tax), 0)               as tax
             from settlement_bookings where settlement_id = $1`,
          [settlementId]
        );
        const t = totals.rows[0];

        await client.query(
          `update settlements
              set total_bookings = $1, total_revenue = $2, platform_fee = $3,
                  cooperative_share = $4, worker_share = $5, welfare_fund = $6,
                  tax = $7, updated_at = now()
            where id = $8`,
          [t.total_bookings, t.total_revenue, t.platform_fee, t.cooperative_share, t.worker_share, t.welfare_fund, t.tax, settlementId]
        );

        // Mark the welfare contributions as belonging to this batch.
        await client.query(
          `update welfare_contributions
              set settlement_id = $1
            where settlement_id is null
              and booking_id in (select booking_id from settlement_bookings where settlement_id = $1)`,
          [settlementId]
        );

        await client.query("commit");

        generated.push({
          id: settlementId,
          cooperativeId: cooperative.id,
          cooperativeName: cooperative.name,
          totalBookings: Number(t.total_bookings),
          totalRevenue: Number(t.total_revenue),
          platformFee: Number(t.platform_fee),
          cooperativeShare: Number(t.cooperative_share),
          workerShare: Number(t.worker_share),
          welfareFund: Number(t.welfare_fund),
          tax: Number(t.tax),
          status: "draft",
        });
      } catch (error) {
        await client.query("rollback");
        logger.error({ cooperativeId: cooperative.id, period, error }, "Settlement generation failed for cooperative");
      }
    }
  } finally {
    client.release();
  }

  logger.info({ period, batches: generated.length }, "Settlement generation complete");
  return generated;
}

export interface PayoutInput {
  settlementId: string;
  method: string;
  reference: string;
  actorId: string;
  notes?: string;
}

export type PayoutResult =
  | { ok: true; settlementId: string; amount: number }
  | { ok: false; error: string; message: string };

/**
 * Record the transfer of a completed batch to the cooperative's escrow account
 * and post the matching worker payout ledger entries.
 *
 * Only `completed` batches can be paid — paying a draft would transfer money
 * against figures nobody has signed off.
 */
export async function executePayout(input: PayoutInput): Promise<PayoutResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const settlement = await client.query("select * from settlements where id = $1 for update", [input.settlementId]);
    if (!settlement.rows[0]) {
      await client.query("rollback");
      return { ok: false, error: "NOT_FOUND", message: "Settlement not found" };
    }

    const row = settlement.rows[0];
    if (row.status === "paid") {
      await client.query("rollback");
      return { ok: false, error: "ALREADY_PAID", message: "This settlement has already been paid out" };
    }
    if (row.status !== "completed") {
      await client.query("rollback");
      return {
        ok: false,
        error: "NOT_READY",
        message: `Settlement must be 'completed' before payout (currently '${row.status}')`,
      };
    }

    // One payout ledger entry per worker in the batch, drawn from the line items
    // rather than recomputed. Workers were credited their earning at settle
    // time; this records the money actually leaving for them.
    await client.query(
      `insert into worker_earnings_ledger (worker_id, booking_id, entry_type, amount, reference)
       select b.worker_id, sb.booking_id, 'payout', sb.worker_share, $1
         from settlement_bookings sb
         join bookings b on b.id = sb.booking_id
        where sb.settlement_id = $2 and b.worker_id is not null`,
      [`settlement:${input.settlementId}`, input.settlementId]
    );

    await client.query(
      `update settlements
          set status = 'paid', paid_at = now(), payout_method = $1, payout_reference = $2,
              notes = coalesce($3, notes), updated_at = now()
        where id = $4`,
      [input.method, input.reference, input.notes ?? null, input.settlementId]
    );

    await client.query("commit");

    logger.info(
      { settlementId: input.settlementId, amount: Number(row.total_revenue), reference: input.reference },
      "Settlement paid out"
    );

    return { ok: true, settlementId: input.settlementId, amount: Number(row.total_revenue) };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
