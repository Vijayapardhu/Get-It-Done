import { pool } from "../db/pool.js";

async function workerIdForUser(userId: string) {
  const result = await pool.query("select id from workers where user_id = $1", [userId]);
  return result.rows[0]?.id ?? null;
}

export async function getWelfareBundle(userId: string) {
  const workerId = await workerIdForUser(userId);
  if (!workerId) return null;
  const [base, training, insurance, payout, ledger] = await Promise.all([
    pool.query(`select worker_id as "workerId", insurance_status as "insuranceStatus", training_status as "trainingStatus", notes, updated_at as "updatedAt" from welfare_records where worker_id = $1`, [workerId]),
    pool.query(`select id, course_name as "courseName", provider, completed_on as "completedOn", expires_on as "expiresOn", status, created_at as "createdAt" from worker_training_records where worker_id = $1 order by created_at desc`, [workerId]),
    pool.query(`select id, provider, policy_reference as "policyReference", coverage_amount as "coverageAmount", starts_on as "startsOn", expires_on as "expiresOn", status, created_at as "createdAt" from worker_insurance_records where worker_id = $1 order by created_at desc`, [workerId]),
    pool.query(`select provider, account_reference as "accountReference", verified_at as "verifiedAt" from payout_accounts where worker_id = $1`, [workerId]),
    pool.query(`select id, booking_id as "bookingId", entry_type as "entryType", amount, reference, created_at as "createdAt" from worker_earnings_ledger where worker_id = $1 order by created_at desc limit 100`, [workerId])
  ]);
  return { summary: base.rows[0] ?? null, training: training.rows, insurance: insurance.rows, payoutAccount: payout.rows[0] ?? null, earningsLedger: ledger.rows };
}

export async function addTraining(userId: string, input: { courseName: string; provider?: string; completedOn?: string; expiresOn?: string; status: string }) {
  const workerId = await workerIdForUser(userId);
  if (!workerId) return null;
  const result = await pool.query(`insert into worker_training_records (worker_id, course_name, provider, completed_on, expires_on, status) values ($1, $2, $3, $4, $5, $6) returning id, course_name as "courseName", provider, completed_on as "completedOn", expires_on as "expiresOn", status`, [workerId, input.courseName, input.provider ?? null, input.completedOn ?? null, input.expiresOn ?? null, input.status]);
  return result.rows[0];
}

export async function addInsurance(userId: string, input: { provider: string; policyReference: string; coverageAmount: number; startsOn: string; expiresOn: string; status: string }) {
  const workerId = await workerIdForUser(userId);
  if (!workerId) return null;
  const result = await pool.query(`insert into worker_insurance_records (worker_id, provider, policy_reference, coverage_amount, starts_on, expires_on, status) values ($1, $2, $3, $4, $5, $6, $7) returning id, provider, policy_reference as "policyReference", coverage_amount as "coverageAmount", starts_on as "startsOn", expires_on as "expiresOn", status`, [workerId, input.provider, input.policyReference, input.coverageAmount, input.startsOn, input.expiresOn, input.status]);
  return result.rows[0];
}

export async function setPayoutAccount(userId: string, input: { provider: string; accountReference: string }) {
  const workerId = await workerIdForUser(userId);
  if (!workerId) return null;
  const result = await pool.query(`insert into payout_accounts (worker_id, provider, account_reference) values ($1, $2, $3) on conflict (worker_id) do update set provider = excluded.provider, account_reference = excluded.account_reference, verified_at = null returning provider, account_reference as "accountReference", verified_at as "verifiedAt"`, [workerId, input.provider, input.accountReference]);
  return result.rows[0];
}
