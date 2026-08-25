import { pool } from "../db/pool.js";
import { putObject, generatedFileKey } from "../core/storage.js";
import logger from "../core/logger.js";

/**
 * Report export generation.
 *
 * `POST /reports/export` inserted a `report_exports` row with status 'pending'
 * and nothing anywhere processed it, so `GET /reports/exports/:id` reported
 * 'pending' forever and no file was ever produced. Same orphaned-queue shape as
 * `outbox_events` and the recurring-booking generator.
 */

export type ReportType =
  | "bookings"
  | "workers"
  | "earnings"
  | "payments"
  | "welfare"
  | "cooperative_performance";

interface ReportQuery {
  sql: string;
  /** Builds the parameter list from the filters stored on the export row. */
  params: (filters: Record<string, unknown>) => unknown[];
}

/**
 * One query per report type, mirroring the corresponding GET handler in
 * routes/reports.ts but without its pagination — an export is the whole set.
 *
 * Filters are bound as parameters and every value is passed through `?? null`
 * so a missing filter becomes a no-op rather than changing the SQL shape.
 */
const REPORTS: Record<ReportType, ReportQuery> = {
  bookings: {
    sql: `select b.id, b.status, b.is_emergency, b.address, b.price, b.scheduled_at, b.created_at,
                 s.name as service_name, u.name as customer_name, wu.name as worker_name,
                 c.name as cooperative_name
            from bookings b
            join services s on s.id = b.service_id
            join users u on u.id = b.customer_id
            left join workers w on w.id = b.worker_id
            left join users wu on wu.id = w.user_id
            left join cooperatives c on c.id = w.cooperative_id
           where ($1::timestamptz is null or b.created_at >= $1)
             and ($2::timestamptz is null or b.created_at <= $2)
             and ($3::uuid is null or b.service_id = $3)
             and ($4::uuid is null or w.cooperative_id = $4)
             and ($5::text is null or b.status = $5)
           order by b.created_at desc`,
    params: (f) => [f.fromDate ?? null, f.toDate ?? null, f.serviceId ?? null, f.cooperativeId ?? null, f.status ?? null],
  },

  workers: {
    sql: `select w.id, w.worker_code, u.name, u.phone, u.email,
                 w.verification_status, w.current_status, w.rating,
                 w.experience_years, w.completed_jobs, w.cancelled_jobs,
                 c.name as cooperative_name, w.created_at
            from workers w
            join users u on u.id = w.user_id
            left join cooperatives c on c.id = w.cooperative_id
           where ($1::uuid is null or w.cooperative_id = $1)
             and ($2::text is null or w.verification_status = $2)
           order by w.created_at desc`,
    params: (f) => [f.cooperativeId ?? null, f.status ?? null],
  },

  earnings: {
    sql: `select wel.id, wel.entry_type, wel.amount, wel.reference, wel.created_at,
                 w.worker_code, u.name as worker_name, c.name as cooperative_name,
                 wel.booking_id
            from worker_earnings_ledger wel
            join workers w on w.id = wel.worker_id
            join users u on u.id = w.user_id
            left join cooperatives c on c.id = w.cooperative_id
           where ($1::timestamptz is null or wel.created_at >= $1)
             and ($2::timestamptz is null or wel.created_at <= $2)
             and ($3::uuid is null or w.cooperative_id = $3)
           order by wel.created_at desc`,
    params: (f) => [f.fromDate ?? null, f.toDate ?? null, f.cooperativeId ?? null],
  },

  payments: {
    sql: `select po.id, po.status, po.amount, po.currency, po.provider,
                 po.provider_order_id, po.paid_at, po.created_at,
                 u.name as customer_name, s.name as service_name
            from payment_orders po
            join users u on u.id = po.customer_id
            join bookings b on b.id = po.booking_id
            join services s on s.id = b.service_id
           where ($1::timestamptz is null or po.created_at >= $1)
             and ($2::timestamptz is null or po.created_at <= $2)
             and ($3::text is null or po.status = $3)
           order by po.created_at desc`,
    params: (f) => [f.fromDate ?? null, f.toDate ?? null, f.status ?? null],
  },

  welfare: {
    sql: `select c.name as cooperative_name,
                 count(w.id)::int as total_workers,
                 count(w.id) filter (where w.verification_status = 'verified')::int as verified_workers,
                 count(distinct it.id)::int as insured_workers,
                 count(distinct tr.id)::int as trained_workers,
                 count(distinct si.id)::int as safety_incidents,
                 coalesce(sum(wc.amount), 0)::numeric(14,2) as welfare_fund_collected
            from cooperatives c
            left join workers w on w.cooperative_id = c.id
            left join worker_insurance_records it on it.worker_id = w.id and it.status = 'active'
            left join worker_training_records tr on tr.worker_id = w.id and tr.status = 'completed'
            left join safety_incidents si on si.worker_id = w.id
            left join welfare_contributions wc on wc.worker_id = w.id
           group by c.id, c.name
           order by c.name`,
    params: () => [],
  },

  cooperative_performance: {
    sql: `select c.name,
                 count(distinct w.id)::int as total_workers,
                 count(distinct w.id) filter (where w.verification_status = 'verified')::int as verified_workers,
                 count(distinct b.id)::int as total_bookings,
                 count(distinct b.id) filter (where b.status = 'completed')::int as completed_bookings,
                 round(avg(w.rating)::numeric, 1)::float8 as avg_rating,
                 coalesce(sum(i.subtotal), 0)::numeric(14,2) as gross_revenue,
                 coalesce(sum(i.cooperative_share), 0)::numeric(14,2) as cooperative_share
            from cooperatives c
            left join workers w on w.cooperative_id = c.id
            left join bookings b on b.worker_id = w.id
            left join invoices i on i.booking_id = b.id
           group by c.id, c.name
           order by total_bookings desc`,
    params: () => [],
  },
};

/**
 * RFC 4180 CSV escaping. A cell is quoted when it contains a delimiter, a quote
 * or a newline, and embedded quotes are doubled — otherwise a customer address
 * containing a comma silently shifts every later column.
 */
function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const header = columns.map(toCsvCell).join(",");
  const body = rows.map((row) => columns.map((column) => toCsvCell(row[column])).join(","));
  // Excel needs CRLF to parse embedded newlines inside quoted cells correctly.
  return [header, ...body].join("\r\n");
}

const CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "text/csv; charset=utf-8", // see note in generateExport
  pdf: "text/csv; charset=utf-8",
};

export interface ExportResult {
  status: "completed" | "failed";
  fileUrl?: string;
  rowCount?: number;
  error?: string;
}

/**
 * Run one queued export to completion and record the outcome on its row.
 *
 * Marks 'processing' first with a guard on the current status, so two runners
 * claiming the same row cannot both generate the file.
 */
export async function generateExport(exportId: string): Promise<ExportResult> {
  const claimed = await pool.query(
    `update report_exports set status = 'processing'
      where id = $1 and status in ('pending', 'failed')
    returning id, report_type, filters, format, requested_by`,
    [exportId]
  );

  if (!claimed.rows[0]) {
    return { status: "failed", error: "Export not found or already processed" };
  }

  const row = claimed.rows[0];
  const reportType = row.report_type as ReportType;

  try {
    const report = REPORTS[reportType];
    if (!report) throw new Error(`Unknown report type '${reportType}'`);

    const filters = (row.filters ?? {}) as Record<string, unknown>;
    const result = await pool.query(report.sql, report.params(filters));

    // xlsx/pdf are accepted by the API's format enum but only CSV is generated;
    // emit CSV bytes rather than writing a file that claims to be a spreadsheet.
    const content = toCsv(result.rows);
    const extension = row.format === "csv" ? "csv" : "csv";
    const filename = `${reportType}-${exportId}.${extension}`;

    const stored = await putObject(
      generatedFileKey("reports", row.requested_by ?? "system", filename),
      content,
      CONTENT_TYPES[row.format] ?? CONTENT_TYPES.csv
    );

    await pool.query(
      `update report_exports
          set status = 'completed', file_url = $1, file_size = $2, completed_at = now(), error = null
        where id = $3`,
      [stored.fileUrl, stored.size, exportId]
    );

    logger.info({ exportId, reportType, rowCount: result.rows.length, size: stored.size }, "Report export generated");
    return { status: "completed", fileUrl: stored.fileUrl, rowCount: result.rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool
      .query("update report_exports set status = 'failed', error = $1 where id = $2", [message, exportId])
      .catch(() => undefined);
    logger.error({ exportId, reportType, error: message }, "Report export failed");
    return { status: "failed", error: message };
  }
}

/**
 * Sweep for exports left 'pending' — a row queued while no runner was up, or
 * one whose job was lost.
 */
export async function generatePendingExports(limit = 20): Promise<number> {
  const pending = await pool.query(
    "select id from report_exports where status = 'pending' order by created_at limit $1",
    [limit]
  );

  let generated = 0;
  for (const row of pending.rows) {
    const result = await generateExport(row.id);
    if (result.status === "completed") generated++;
  }
  return generated;
}
