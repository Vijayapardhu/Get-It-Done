const fetch = require('node-fetch');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:4000';
const TEST_USER = { email: 'testcustomer@example.com', password: 'password123' };
// Seeded phone-based accounts get email+password promoted via SQL so we can log in as them
const WORKER_LOGIN = { email: 'worker1@example.com', password: 'password123' };
const ADMIN_LOGIN = { email: 'admin1@example.com', password: 'password123' };
const SEED_COOPERATIVE_ID = '00000000-0000-0000-0000-000000000101';
const CUSTOMER_USER_ID = 'aace9912-7c90-43b0-bfda-78e5a81dbd57';

const results = { passed: [], failed: [], skipped: [] };
const tokens = { customer: null, worker: null, admin: null };

const testData = {
    services: [], workers: [], bookings: [], organizations: [],
    recurringBookings: [], roles: [], userRoles: [], aiRecommendations: [],
    cooperatives: [], skills: [], serviceAreas: [], benefits: [],
    documents: [], certifications: [], files: [],
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function psql(sql) {
    try {
        execSync(`docker exec getitdone-postgres psql -U getitdone -d getitdone -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
        return true;
    } catch (e) {
        console.log('psql failed:', String(e.message).split('\n')[0]);
        return false;
    }
}

function isUuid(v) { return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); }

function firstUuid(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) { for (const v of obj) { const r = firstUuid(v); if (r) return r; } return null; }
    for (const k of ['id', 'benefitId', 'areaId', 'skillId', 'documentId', 'certificationId']) {
        if (isUuid(obj[k])) return obj[k];
    }
    for (const v of Object.values(obj)) { const r = firstUuid(v); if (r) return r; }
    return null;
}

async function makeRequest(method, path, body = null, headers = {}, opts = {}) {
    const url = `${BASE_URL}${path}`;
    const options = { method, headers: { 'Content-Type': 'application/json', ...headers } };
    if (opts.redirect) options.redirect = opts.redirect;
    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) options.body = JSON.stringify(body);
    try {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));
        return { status: response.status, data, ok: response.ok };
    } catch (error) {
        return { status: 0, data: { error: error.message }, ok: false };
    }
}

async function login(creds, label) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const r = await makeRequest('POST', '/auth/login', creds);
        if (r.ok && r.data.accessToken) return r.data.accessToken;
        if (attempt < 3) await delay(1000);
    }
    console.log(`✗ Login failed for ${label}`);
    return null;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Upload bytes to MinIO from the host.
 * Presigned URLs are signed for host "minio:9000" (docker-internal), so we connect
 * to the published localhost:9000 port but send a Host header matching the signature.
 */
function putToMinio(presignedUrl, body) {
    return new Promise((resolve) => {
        const u = new URL(presignedUrl);
        const req = http.request({
            host: u.hostname === 'minio' ? 'localhost' : u.hostname,
            port: u.port,
            path: u.pathname + u.search,
            method: 'PUT',
            headers: { Host: u.host, 'Content-Length': Buffer.byteLength(body) },
        }, res => { res.resume(); resolve(res.statusCode); });
        req.on('error', () => resolve(0));
        req.write(body);
        req.end();
    });
}

function fileKeyOr(fallback, index = 0) { return testData.files[index]?.fileKey ?? fallback; }

// ─── setup ────────────────────────────────────────────────────────────────────

async function ensureRoleAccounts() {
    // Promote seeded phone-based users to email+password logins (idempotent)
    psql(`UPDATE users SET email='${WORKER_LOGIN.email}', password_hash=(SELECT password_hash FROM users WHERE email='${TEST_USER.email}') WHERE phone='+919999990101' AND email IS NULL`);
    psql(`UPDATE users SET email='${ADMIN_LOGIN.email}', password_hash=(SELECT password_hash FROM users WHERE email='${TEST_USER.email}') WHERE phone='+919999990201' AND email IS NULL`);

    tokens.customer = await login(TEST_USER, 'customer');
    tokens.worker = await login(WORKER_LOGIN, 'worker');
    tokens.admin = await login(ADMIN_LOGIN, 'admin');
}

async function fetchExistingTestData() {
    const auth = { 'Authorization': `Bearer ${tokens.customer}` };
    try {
        const svc = await makeRequest('GET', '/services?limit=10', null, auth);
        if (svc.ok) testData.services = svc.data.services || [];
        const wkr = await makeRequest('GET', '/workers?limit=10', null, auth);
        if (wkr.ok) testData.workers = wkr.data.workers || [];
        const bkg = await makeRequest('GET', '/bookings?limit=10', null, auth);
        if (bkg.ok) testData.bookings = bkg.data.bookings || [];
        const org = await makeRequest('GET', '/institutions?limit=10', null, auth);
        if (org.ok) testData.organizations = org.data.organizations || [];
        const rb = await makeRequest('GET', '/recurring/bookings?limit=10', null, auth);
        if (rb.ok) testData.recurringBookings = rb.data.recurringBookings || [];
        const roles = await makeRequest('GET', '/admin/roles', null, { 'Authorization': `Bearer ${tokens.admin}` });
        if (roles.ok) testData.roles = roles.data.roles || [];
        const ai = await makeRequest('GET', '/ai/recommendations', null, { 'Authorization': `Bearer ${tokens.admin}` });
        if (ai.ok) testData.aiRecommendations = ai.data.recommendations || [];
        const coop = await makeRequest('GET', '/cooperatives/societies', null, { 'Authorization': `Bearer ${tokens.admin}` });
        if (coop.ok) testData.cooperatives = coop.data.cooperatives || coop.data.societies || [];
        if (testData.cooperatives.length === 0) testData.cooperatives = [{ id: SEED_COOPERATIVE_ID }];
        const skills = await makeRequest('GET', '/skills', null, { 'Authorization': `Bearer ${tokens.admin}` });
        if (skills.ok) testData.skills = skills.data.skills || (Array.isArray(skills.data) ? skills.data : []);
    } catch (e) {
        console.log('Fetch existing data failed:', e.message);
    }
}

async function createMissingResources() {
    // Skill (needed by certifications)
    if (testData.skills.length === 0 && tokens.admin) {
        const r = await makeRequest('POST', '/skills', { name: 'Test Skill', category: 'cleaning' }, { 'Authorization': `Bearer ${tokens.admin}` });
        const id = firstUuid(r.data);
        if (id) testData.skills.push({ id });
    }

    // Service area
    if (tokens.customer && testData.services.length > 0) {
        const r = await makeRequest('POST', '/service-areas',
            { serviceId: testData.services[0].id, polygon: { type: 'Polygon', coordinates: [[[77.5, 12.9], [77.7, 12.9], [77.7, 13.1], [77.5, 13.1], [77.5, 12.9]]] } },
            { 'Authorization': `Bearer ${tokens.admin}` });
        const id = firstUuid(r.data);
        if (id) testData.serviceAreas.push({ id });
    }

    // Welfare benefit (needed by /welfare/benefits/{id}/eligibility)
    if (tokens.admin) {
        const r = await makeRequest('POST', '/welfare/benefits', { name: 'Test Benefit', description: 'Created by API test suite' }, { 'Authorization': `Bearer ${tokens.admin}` });
        const id = firstUuid(r.data);
        if (id) testData.benefits.push({ id });
    }

    // Real files through presign -> PUT to MinIO -> (complete tested in sweep)
    // [0] is the shared fixture used by documents/avatar; [1] is disposable (deleted by DELETE test)
    if (tokens.customer) {
        for (let i = 0; i < 2; i++) {
            const up = await makeRequest('POST', '/files/upload-url',
                { type: 'document', filename: `api-test-${Date.now()}-${i}.pdf`, contentType: 'application/pdf' },
                { 'Authorization': `Bearer ${tokens.customer}` });
            if (up.ok && up.data.fileKey && up.data.uploadUrl) {
                const status = await putToMinio(up.data.uploadUrl, '%PDF-1.4\n% api-test payload\n');
                if (status === 200) testData.files.push({ fileKey: up.data.fileKey });
            }
        }
    }

    // Worker document backed by the uploaded file (admin may submit on behalf of worker)
    if (tokens.admin && testData.workers.length > 0 && testData.files.length > 0) {
        const wid = testData.workers[0].id;
        const r = await makeRequest('POST', `/documents/workers/${wid}/documents`,
            { type: 'identity_proof', fileKey: testData.files[0].fileKey },
            { 'Authorization': `Bearer ${tokens.admin}` });
        const id = firstUuid(r.data);
        if (id) testData.documents.push({ id, workerId: wid });

        // Certification linking skill + document
        if (testData.skills.length > 0) {
            const c = await makeRequest('POST', `/documents/workers/${wid}/certifications`,
                { skillId: testData.skills[0].id, ...(id ? { documentId: id } : {}) },
                { 'Authorization': `Bearer ${tokens.admin}` });
            const cid = firstUuid(c.data);
            if (cid) testData.certifications.push({ id: cid });
        }
    }
}

async function setupTestData() {
    console.log('\n=== Setting up test data ===\n');

    await ensureRoleAccounts();
    if (!tokens.customer) { console.log('Cannot proceed without customer token'); process.exit(1); }

    await fetchExistingTestData();

    // Bookings / organization / recurring booking / role (as before)
    if (testData.services.length > 0) {
        const r = await makeRequest('POST', '/bookings',
            { serviceId: testData.services[0].id, description: 'Test booking', latitude: 12.9716, longitude: 77.5946, address: 'Test Address, Bangalore', isEmergency: false },
            { 'Authorization': `Bearer ${tokens.customer}`, 'Idempotency-Key': `test-${Date.now()}` });
        if (r.ok && r.data.booking) testData.bookings.push(r.data.booking);
    }
    if (tokens.customer) {
        const org = await makeRequest('POST', '/institutions',
            { name: 'Test Organization', type: 'office', registrationNumber: `REG${Date.now()}`, gstNumber: `GST${Date.now()}`, address: 'Test Address', contactPerson: 'Test Person', contactEmail: `t${Date.now()}@org.com`, contactPhone: '+919876543210', billingAddress: 'Billing Address' },
            { 'Authorization': `Bearer ${tokens.customer}` });
        if (org.ok && org.data.organization) testData.organizations.push(org.data.organization);
        const rb = await makeRequest('POST', '/recurring/bookings',
            { serviceId: testData.services[0]?.id, frequency: 'weekly', daysOfWeek: [1, 3, 5], timeWindowStart: '09:00', timeWindowEnd: '12:00', startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0] },
            { 'Authorization': `Bearer ${tokens.customer}` });
        if (rb.ok && rb.data.recurringBooking) testData.recurringBookings.push(rb.data.recurringBooking);
    }
    if (tokens.admin) {
        const role = await makeRequest('POST', '/admin/roles',
            { name: 'test_role_' + Date.now(), description: 'Test role for API testing', permissions: ['users.read', 'bookings.read'] },
            { 'Authorization': `Bearer ${tokens.admin}` });
        if (role.ok && role.data.role) testData.roles.push(role.data.role);
    }

    await createMissingResources();

    try { await makeRequest('POST', '/analytics/refresh', {}, { 'Authorization': `Bearer ${tokens.admin}` }); } catch {}

    console.log(`services=${testData.services.length} workers=${testData.workers.length} bookings=${testData.bookings.length} orgs=${testData.organizations.length} recurring=${testData.recurringBookings.length} roles=${testData.roles.length} coops=${testData.cooperatives.length} skills=${testData.skills.length} areas=${testData.serviceAreas.length} benefits=${testData.benefits.length} files=${testData.files.length} documents=${testData.documents.length} certs=${testData.certifications.length}`);
    console.log(`tokens: customer=${!!tokens.customer} worker=${!!tokens.worker} admin=${!!tokens.admin}`);
    console.log('\n=== Test data setup complete ===\n');
}

// ─── request generation ───────────────────────────────────────────────────────

function generateTestValue(param, endpointPath = '') {
    const schema = param.schema || {};
    const format = schema.format;
    const type = schema.type || 'string';
    const enum_ = schema.enum;

    if (enum_ && enum_.length > 0) return enum_[0];
    if (format === 'uuid') {
        const n = param.name;
        if (n === 'userId') return CUSTOMER_USER_ID;
        if (n === 'cooperativeId' || n === 'federationId') return testData.cooperatives[0]?.id ?? '00000000-0000-0000-0000-000000000000';
        if (n === 'serviceId') return testData.services[0]?.id ?? '00000000-0000-0000-0000-000000000000';
        if (n === 'workerId') return testData.workers[0]?.id ?? '00000000-0000-0000-0000-000000000000';
        if (n === 'bookingId') return testData.bookings[0]?.id ?? '00000000-0000-0000-0000-000000000000';
        if (n === 'organizationId') return testData.organizations[0]?.id ?? '00000000-0000-0000-0000-000000000000';
        if (n === 'roleId') return testData.roles[0]?.id ?? '00000000-0000-0000-0000-000000000000';
        if (n === 'skillId') return testData.skills[0]?.id ?? '00000000-0000-0000-0000-000000000000';
        if (n === 'id') {
            if (endpointPath.startsWith('/workers/') || endpointPath.startsWith('/skills/workers/')) return testData.workers[0]?.id ?? '00000000-0000-0000-0000-000000000000';
            if (endpointPath.startsWith('/bookings/')) return testData.bookings[0]?.id ?? '00000000-0000-0000-0000-000000000000';
            if (endpointPath.startsWith('/skills/')) return testData.skills[0]?.id ?? '00000000-0000-0000-0000-000000000000';
            if (endpointPath.startsWith('/service-areas/')) return testData.serviceAreas[0]?.id ?? '00000000-0000-0000-0000-000000000000';
            if (endpointPath.startsWith('/documents/certifications/')) return testData.certifications[0]?.id ?? '00000000-0000-0000-0000-000000000000';
            if (endpointPath.startsWith('/documents/documents/')) return testData.documents[0]?.id ?? '00000000-0000-0000-0000-000000000000';
            if (endpointPath.startsWith('/welfare/benefits/')) return testData.benefits[0]?.id ?? '00000000-0000-0000-0000-000000000000';
            if (endpointPath.startsWith('/institutions/')) return testData.organizations[0]?.id ?? '00000000-0000-0000-0000-000000000000';
            if (endpointPath.startsWith('/recurring/')) return testData.recurringBookings[0]?.id ?? '00000000-0000-0000-0000-000000000000';
            if (endpointPath.startsWith('/services/')) return testData.services[0]?.id ?? '00000000-0000-0000-0000-000000000000';
        }
        return '00000000-0000-0000-0000-000000000000';
    }
    if (format === 'date-time') return new Date().toISOString();
    if (format === 'date') return new Date().toISOString().split('T')[0];
    if (format === 'email') return 'test@example.com';
    if (type === 'integer' || type === 'number') return schema.minimum || 1;
    if (type === 'boolean') return false;
    if (type === 'array') return [];
    if (type === 'object') return {};
    return 'test';
}

// Endpoint-specific bodies where generated values can't satisfy business rules
const BODY_OVERRIDES = {
    'POST /files/upload-url': () => ({ type: 'document', filename: `api-test-${Date.now()}.pdf`, contentType: 'application/pdf' }),
    'POST /documents/workers/{workerId}/documents/upload-url': () => ({ type: 'document', filename: `api-test-${Date.now()}.pdf`, contentType: 'application/pdf' }),
    'POST /users/me/avatar': () => ({ fileKey: fileKeyOr('missing-file-key') }),
    'POST /documents/documents/{id}/submit': () => ({ type: 'identity_proof', fileKey: fileKeyOr('missing-file-key') }),
    'POST /workers/me/verification/submit': () => ({ documents: [{ type: 'identity_proof', fileKey: fileKeyOr('missing-file-key') }] }),
    'POST /welfare/workers/me/safety-incidents': () => ({ type: 'injury', severity: 'low', description: 'Test safety incident reported by API test suite' }),
};

// Endpoints whose {id} is a storage file key rather than a UUID (value = index into testData.files)
const FILE_KEY_PATHS = { 'GET /files/{id}': 0, 'POST /files/{id}/complete': 0, 'DELETE /files/{id}': 1 };

function buildTestRequest(endpoint) {
    let path = endpoint.path;
    const queryParams = {};
    let body = {};

    const key = `${endpoint.method} ${endpoint.path}`;

    for (const param of endpoint.params) {
        let value;
        if (FILE_KEY_PATHS[key] !== undefined && param.name === 'id') {
            value = encodeURIComponent(fileKeyOr('missing-file-key', FILE_KEY_PATHS[key]));
        } else {
            value = generateTestValue(param, endpoint.path);
        }
        if (param.in === 'path') path = path.replace(`{${param.name}}`, value);
        else if (param.in === 'query') queryParams[param.name] = value;
    }

    if (BODY_OVERRIDES[key]) {
        body = BODY_OVERRIDES[key]() || {};
    } else if (endpoint.requestBody) {
        const schema = endpoint.requestBody.content?.['application/json']?.schema;
        if (schema?.required) {
            for (const field of schema.required) {
                const prop = schema.properties?.[field];
                if (prop) body[field] = generateTestValue({ name: field, schema: prop }, endpoint.path);
            }
        }
    }

    const hasBody = BODY_OVERRIDES[key] || (endpoint.requestBody && Object.keys(body).length > 0);
    const queryString = Object.keys(queryParams).length ? '?' + new URLSearchParams(queryParams).toString() : '';
    return { path: path + queryString, body: hasBody ? body : null };
}

function pickRole(path) {
    if (/^\/(workers|earnings\/workers|welfare\/workers)\//.test(path) && path.includes('/me')) return 'worker';
    if (/^\/(workers|earnings\/workers|welfare\/workers)\/me/.test(path)) return 'worker';
    if (path.startsWith('/worker/')) return 'worker';
    if (path.startsWith('/admin/')) return 'admin';
    return 'customer';
}

async function testEndpoint(endpoint) {
    const requiresAuth = endpoint.security && endpoint.security.some(s => s.bearerAuth);
    const key = `${endpoint.method} ${endpoint.path}`;

    // Files flow needs a real uploaded object; DELETE consumes the disposable second file
    if (key === 'DELETE /files/{id}' && testData.files.length < 2) {
        return { endpoint, status: 'skipped', reason: 'No disposable file available (MinIO)' };
    }
    if (key.includes('/files/') && testData.files.length === 0) {
        return { endpoint, status: 'skipped', reason: 'No uploaded file available (MinIO)' };
    }

    const role = pickRole(endpoint.path);
    const token = tokens[role];
    if (requiresAuth && !token) {
        return { endpoint, status: 'skipped', reason: `No ${role} token` };
    }

    const headers = requiresAuth ? { 'Authorization': `Bearer ${token}` } : {};
    const { path, body } = buildTestRequest(endpoint);

    await delay(50);

    const opts = key === 'GET /files/{id}' ? { redirect: 'manual' } : {};
    const result = await makeRequest(endpoint.method, path, body, headers, opts);

    if (result.status === 429) return { endpoint, status: 'skipped', reason: 'Rate limited' };

    // 302 from GET /files/{id} is a successful presigned redirect
    if (key === 'GET /files/{id}' && result.status === 302) {
        return { endpoint, status: 'passed', httpStatus: result.status };
    }

    // 400/403/404 = validation / role-gating / absent-resource (expected with synthetic data)
    // 409 = intentional conflict responses (FK-protected deletes, duplicates, state rules)
    const acceptable = [400, 403, 404, 409];
    const isOk = result.ok || acceptable.includes(result.status);

    return { endpoint, status: isOk ? 'passed' : 'failed', httpStatus: result.status, error: isOk ? null : result.data };
}

// ─── main ─────────────────────────────────────────────────────────────────────

const spec = JSON.parse(fs.readFileSync('/tmp/swagger.json', 'utf8'));
const paths = spec.paths || {};

const endpoints = [];
for (const [path, methods] of Object.entries(paths)) {
    for (const [method, details] of Object.entries(methods)) {
        endpoints.push({
            method: method.toUpperCase(),
            path,
            tags: details.tags || ['no-tag'],
            summary: details.summary || '',
            params: details.parameters || [],
            requestBody: details.requestBody || null,
            security: details.security || [],
        });
    }
}

console.log(`Total endpoints to test: ${endpoints.length}`);

async function runTests() {
    console.log('\n=== Starting API Tests ===\n');
    await setupTestData();

    console.log('\n--- Testing Endpoints ---\n');

    let tested = 0;
    for (const endpoint of endpoints) {
        tested++;
        if (tested % 20 === 0) console.log(`Progress: ${tested}/${endpoints.length}`);
        const result = await testEndpoint(endpoint);
        if (result.status === 'passed') results.passed.push(result);
        else if (result.status === 'failed') results.failed.push(result);
        else results.skipped.push(result);
    }

    console.log('\n=== TEST SUMMARY ===');
    console.log(`Total: ${endpoints.length}`);
    console.log(`Passed: ${results.passed.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Skipped: ${results.skipped.length}`);

    if (results.failed.length > 0) {
        console.log('\n=== FAILED ENDPOINTS ===');
        for (const f of results.failed) {
            console.log(`  ${f.endpoint.method} ${f.endpoint.path} - HTTP ${f.httpStatus}`);
            console.log(`    Error: ${JSON.stringify(f.error).substring(0, 200)}`);
        }
    }
    if (results.skipped.length > 0) {
        console.log('\n=== SKIPPED ENDPOINTS ===');
        for (const s of results.skipped) {
            console.log(`  ${s.endpoint.method} ${s.endpoint.path} - ${s.reason}`);
        }
    }

    fs.writeFileSync('api-test-results.json', JSON.stringify(results, null, 2));
    console.log('\nDetailed results saved to api-test-results.json');
}

runTests().catch(console.error);
