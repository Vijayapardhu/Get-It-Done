/**
 * End-to-end lifecycle + authorization (IDOR) probe.
 * Exercises the real happy paths the smoke suite can't reach, and checks
 * that cross-tenant access is properly denied.
 */
const fetch = require('node-fetch');
const { execSync } = require('child_process');

const BASE = 'http://localhost:4000';
const TEST_USER = { email: 'testcustomer@example.com', password: 'password123' };
const WORKER_LOGIN = { email: 'worker1@example.com', password: 'password123' };
const ADMIN_LOGIN = { email: 'admin1@example.com', password: 'password123' };
const COOP_ID = '00000000-0000-0000-0000-000000000101';

const anomalies = [];
let step = 0;

function report(name, expected, actual, extra = '') {
  step++;
  const ok = Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  console.log(`${ok ? '[OK]  ' : '[!!!] '} ${String(step).padStart(2)}. ${name} -> ${actual}${extra ? '  ' + extra : ''}`);
  if (!ok) anomalies.push({ name, expected, actual, extra });
}

function psql(sql) {
  return execSync(`docker exec getitdone-postgres psql -U getitdone -d getitdone -At -c "${sql.replace(/"/g, '\\"')}"`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
}

async function req(method, path, body, token, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function login(creds) {
  const r = await req('POST', '/auth/login', creds);
  if (!r.data.accessToken) throw new Error('login failed: ' + JSON.stringify(r.data));
  return r.data.accessToken;
}

(async () => {
  // ── accounts ──────────────────────────────────────────────────────────────
  psql(`UPDATE users SET email='worker1@example.com', password_hash=(SELECT password_hash FROM users WHERE email='${TEST_USER.email}') WHERE phone='+919999990101' AND email IS NULL`);
  psql(`UPDATE users SET email='admin1@example.com', password_hash=(SELECT password_hash FROM users WHERE email='${TEST_USER.email}') WHERE phone='+919999990201' AND email IS NULL`);
  // free all verified workers so assignment is deterministic across runs
  psql(`UPDATE workers SET current_status='available' WHERE verification_status='verified'`);

  const c1 = await login(TEST_USER);
  const wk = await login(WORKER_LOGIN);
  const adm = await login(ADMIN_LOGIN);

  const uniq = Date.now();
  const reg = await req('POST', '/auth/register', { name: 'Second Customer', email: `c2-${uniq}@example.com`, password: 'password123' });
  report('register second customer', [200, 201], reg.status);
  let c2 = null;
  if ([200, 201].includes(reg.status)) {
    const l2 = await req('POST', '/auth/login', { email: `c2-${uniq}@example.com`, password: 'password123' });
    c2 = l2.data.accessToken;
  }

  const svcList = await req('GET', '/services?limit=5', null, c1);
  const serviceId = svcList.data.services?.[0]?.id;
  const workers = (await req('GET', '/workers?limit=5', null, c1)).data.workers || [];
  const workerId = workers[0]?.id;

  // ── lifecycle ─────────────────────────────────────────────────────────────
  const created = await req('POST', '/bookings',
    { serviceId, description: 'E2E lifecycle booking', latitude: 12.9716, longitude: 77.5946, address: 'MG Road Bangalore', isEmergency: false },
    c1, { 'Idempotency-Key': `e2e-create-${uniq}-${serviceId}` });
  report('create booking', [201], created.status, created.status !== 201 ? JSON.stringify(created.data).slice(0, 200) : '');
  let bookingId = created.data.booking?.id;
  let startOtp = created.data.otps?.startOtp;
  let completionOtp = created.data.otps?.completionOtp;

  if (!bookingId) {
    console.log('\nLifecycle aborted (no booking). IDOR checks use synthetic uuid.');
    bookingId = '00000000-0000-4000-8000-00000000e2e1';
    startOtp = completionOtp = null;
  }

  // invalid uuid in path must not 500
  report('GET /bookings/<not-a-uuid> handled', [400, 404], (await req('GET', '/bookings/not-a-uuid', null, c1)).status);
  report('POST /bookings/<not-a-uuid>/cancel handled', [400, 404], (await req('POST', '/bookings/not-a-uuid/cancel', {}, c1)).status);

  const est = await req('POST', '/pricing/estimate', { serviceId, latitude: 12.9716, longitude: 77.5946 }, c1);
  report('pricing estimate', [200], est.status);

  const cand = await req('GET', `/matching/bookings/${bookingId}/candidates`, null, c1);
  report('matching candidates for booking', [200], cand.status);

  const assign = await req('POST', `/matching/bookings/${bookingId}/assign`, { workerId, reason: 'e2e' }, adm);
  report('admin assigns worker', [200], assign.status, assign.status !== 200 ? JSON.stringify(assign.data).slice(0, 120) : '');

  const notifWorker = await req('GET', '/notifications?limit=10', null, wk);
  const gotAssignNotif = (notifWorker.data.notifications || []).some(n => n.aggregate_id === bookingId || n.aggregateId === bookingId || n.type === 'booking.assigned');
  report('worker received assignment notification', [true], gotAssignNotif);

  const accept = await req('POST', `/bookings/${bookingId}/accept`, {}, wk);
  report('worker accepts', [200], accept.status, accept.status !== 200 ? JSON.stringify(accept.data).slice(0, 120) : '');

  const badOtp = await req('POST', `/bookings/${bookingId}/verify-start`, { otp: '000000' }, wk);
  report('wrong start OTP rejected', [400], badOtp.status);

  const start = await req('POST', `/bookings/${bookingId}/verify-start`, { otp: String(startOtp) }, wk);
  report('verify-start with real OTP', [200], start.status, start.status !== 200 ? JSON.stringify(start.data).slice(0, 120) : '');

  const chat = await req('POST', '/chats', { bookingId }, c1);
  report('create chat on booking', [200, 201], chat.status);
  const chatId = chat.data.chat?.id || chat.data.id;
  if (chatId) {
    const msg = await req('POST', `/chats/${chatId}/messages`, { content: 'On my way' }, wk);
    report('worker posts chat message', [200, 201], msg.status);
    const msgs = await req('GET', `/chats/${chatId}/messages`, null, c1);
    report('customer reads thread', [200], msgs.status);
  }

  const complete = await req('POST', `/bookings/${bookingId}/verify-complete`, { otp: String(completionOtp) }, wk);
  report('verify-complete with real OTP', [200], complete.status, complete.status !== 200 ? JSON.stringify(complete.data).slice(0, 120) : '');

  const track = await req('GET', `/customer/bookings/${bookingId}/track`, null, c1);
  report('customer tracking view', [200], track.status);

  const review = await req('POST', '/reviews', { bookingId, rating: 5, feedback: 'Excellent service' }, c1);
  report('customer reviews completed booking', [201], review.status, review.status !== 201 ? JSON.stringify(review.data).slice(0, 120) : '');
  const dupReview = await req('POST', '/reviews', { bookingId, rating: 4 }, c1);
  report('duplicate review rejected', [409], dupReview.status);

  const earn = await req('GET', '/workers/' + workerId + '/earnings', null, adm);
  const hasLedgerEntry = JSON.stringify(earn.data).includes('settlement_processed') || JSON.stringify(earn.data).includes('earning');
  report('worker earnings ledger has entries', [true], hasLedgerEntry);

  // payments
  const order = await req('POST', '/payments/orders', { bookingId, provider: 'razorpay', idempotencyKey: `e2e-${uniq}` }, c1);
  report('create payment order', [200, 201], order.status, order.status >= 300 ? JSON.stringify(order.data).slice(0, 150) : '');
  const orderId = order.data.order?.id;
  const providerOrderId = order.data.order?.providerOrderId || order.data.order?.provider_order_id;
  if (orderId && providerOrderId) {
    const wh = await req('POST', '/payments/webhooks/razorpay',
      { eventId: `evt-${uniq}`, eventType: 'payment.captured', payload: { order_id: providerOrderId, payment_id: `pay-${uniq}` } });
    report('webhook marks payment captured', [200], wh.status, JSON.stringify(wh.data).slice(0, 100));
    const whReplay = await req('POST', '/payments/webhooks/razorpay',
      { eventId: `evt-${uniq}`, eventType: 'payment.captured', payload: { order_id: providerOrderId } });
    report('webhook replay is idempotent', [200], whReplay.status);
    const processedFlag = whReplay.data.processed;
    report('replay not reprocessed', [false], processedFlag);
    const invoice = await req('GET', `/payments/invoices/booking/${bookingId}`, null, c1);
    report('invoice exists after capture', [200], invoice.status);
    const refund = await req('POST', `/payments/orders/${orderId}/refund`, { amount: 50, reason: 'partial service issue' }, adm);
    report('initiate refund on paid order', [200, 201], refund.status, refund.status >= 300 ? JSON.stringify(refund.data).slice(0, 120) : '');
  }

  // settlement lifecycle (admin) — fresh period row each run
  psql(`DELETE FROM settlements WHERE cooperative_id='${COOP_ID}' AND period_start=date_trunc('month', current_date)::date`);
  psql(`INSERT INTO settlements (cooperative_id, period_start, period_end) VALUES ('${COOP_ID}', date_trunc('month', current_date)::date, current_date)`);
  const setts = await req('GET', '/settlements', null, adm);
  const settlement = (setts.data.settlements || []).find(s => s.cooperative_id === COOP_ID && s.status === 'draft');
  if (settlement) {
    const proc = await req('POST', `/settlements/${settlement.id}/process`, {}, adm);
    report('process settlement', [200], proc.status, proc.status !== 200 ? JSON.stringify(proc.data).slice(0, 120) : '');
  } else {
    report('seed settlement row exists', true, false, 'no settlement for coop');
  }

  // welfare quick path (worker)
  const payout = await req('PUT', '/welfare/workers/me/payout-account', { provider: 'upi', accountReference: 'worker@upi' }, wk);
  report('worker sets payout account', [200], payout.status);
  const insurance = await req('POST', '/welfare/workers/me/insurance',
    { provider: 'TestIns', policyReference: `POL-${uniq}`, coverageAmount: 100000, startsOn: new Date().toISOString().slice(0, 10), expiresOn: new Date(Date.now() + 31536e6).toISOString().slice(0, 10) }, wk);
  report('worker adds insurance', [201], insurance.status, insurance.status !== 201 ? JSON.stringify(insurance.data).slice(0, 120) : '');

  // ── IDOR / auth matrix ────────────────────────────────────────────────────
  if (c2) {
    report('C2 reads C1 booking', [404], (await req('GET', `/bookings/${bookingId}`, null, c2)).status);
    report('C2 cancels C1 booking', [403, 404], (await req('POST', `/bookings/${bookingId}/cancel`, {}, c2)).status);
    report('C2 tracks C1 booking', [404], (await req('GET', `/customer/bookings/${bookingId}/track`, null, c2)).status);
    if (chatId) report('C2 reads C1 chat', [403, 404], (await req('GET', `/chats/${chatId}`, null, c2)).status);
    report('C2 pays for C1 booking', [400, 404], (await req('POST', '/payments/orders', { bookingId, provider: 'razorpay' }, c2)).status);
    report('C2 hits admin verifications', [403], (await req('GET', '/admin/verifications', null, c2)).status);
    report('C2 posts welfare training (no worker profile)', [403, 404], (await req('POST', '/welfare/workers/me/training', { courseName: 'X course' }, c2)).status);
  }
  report('anon hits bookings', [401], (await req('GET', '/bookings', null, null)).status);

  // ── summary ───────────────────────────────────────────────────────────────
  console.log(`\n=== PROBE SUMMARY === steps=${step} anomalies=${anomalies.length}`);
  for (const a of anomalies) console.log(`  ANOMALY: ${a.name}: expected=${JSON.stringify(a.expected)} actual=${a.actual} ${a.extra}`);
})().catch(e => { console.error('probe crashed:', e); process.exit(1); });
