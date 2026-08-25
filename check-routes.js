/**
 * Cross-checks three sources of truth:
 *  1. swagger.json (documented API)
 *  2. Express routes actually registered in source (router.<m>("/path") + app.use mounts)
 *  3. Path-param names used in handlers vs declared in route patterns (chat-bug class)
 */
const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, 'backend', 'src', 'routes');
const swagger = JSON.parse(fs.readFileSync(path.join(__dirname, 'backend', 'swagger.json'), 'utf8'));
const METHODS = ['get', 'post', 'patch', 'put', 'delete'];

// ── collect express routes ──────────────────────────────────────────────────
const routes = [];
for (const f of fs.readdirSync(ROUTES_DIR)) {
  if (!f.endsWith('.ts')) continue;
  const src = fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8');
  // line-based scan
  const lines = src.split('\n');
  lines.forEach((line, idx) => {
    const m = line.match(/^\s*\w+Router\.(\w+)\(\s*[`'"]\/([^`'"]*)[`'"]/);
    if (!m || !METHODS.includes(m[1])) return;
    const rawPath = '/' + m[2];
    const params = [...rawPath.matchAll(/:(\w+)/g)].map(p => p[1]);
    routes.push({ file: f, method: m[1].toUpperCase(), path: rawPath, params, line: idx + 1 });
  });
}

// normalize express path -> swagger style
function toSwaggerPath(p) {
  return p.replace(/:(\w+)/g, (_, n) => `{${n}}`);
}

// ── mounts from app.ts ──────────────────────────────────────────────────────
const appSrc = fs.readFileSync(path.join(__dirname, 'backend', 'src', 'app.ts'), 'utf8');
const mounts = [];
for (const line of appSrc.split('\n')) {
  const m = line.match(/app\.use\(\s*["'`](\/[^"'`]*)["'`]\s*,.*?(\w+Router)\s*\)/);
  if (!m) continue;
  // skip aliases already handled explicitly
  mounts.push({ prefix: m[1], router: m[2] });
}

function fullPaths(r) {
  const cands = mounts.filter(m => r.file.toLowerCase().startsWith(m.router.replace(/Router$/, '').toLowerCase()));
  if (cands.length === 0) return [];
  return cands.map(c => (c.prefix === '' ? '' : c.prefix.replace(/\/$/, '')) + r.path);
}

// ── compare ─────────────────────────────────────────────────────────────────
const norm = s => s.replace(/\/+$/, '') || '/';
const docKeys = new Set();
for (const [p, methods] of Object.entries(swagger.paths)) {
  for (const mm of Object.keys(methods)) docKeys.add(`${mm.toUpperCase()} ${norm(p)}`);
}
const implKeys = new Set();
const unmappedRoutes = [];
for (const r of routes) {
  const fps = fullPaths(r);
  if (fps.length === 0) { unmappedRoutes.push(r); continue; }
  for (const fp of fps) implKeys.add(`${r.method} ${norm(toSwaggerPath(fp))}`);
}

console.log('=== Documented but NOT implemented ===');
let count = 0;
for (const k of [...docKeys].sort()) {
  if (!implKeys.has(k)) { console.log('  ', k); count++; }
}
console.log(`(${count})`);

console.log('\n=== Implemented but NOT documented ===');
count = 0;
for (const k of [...implKeys].sort()) {
  if (!docKeys.has(k)) { console.log('  ', k); count++; }
}
console.log(`(${count})`);

if (unmappedRoutes.length) {
  console.log('\n=== Routes with no matching app.mount (check naming) ===');
  for (const r of unmappedRoutes) console.log(`   ${r.file}:${r.line} ${r.method} ${r.path}`);
}

// ── param-name mismatch detection (chat-bug class) ───────────────────────────
console.log('\n=== Handler uses params not declared in its route pattern ===');
let mismatches = 0;
for (const f of fs.readdirSync(ROUTES_DIR)) {
  if (!f.endsWith('.ts')) continue;
  const src = fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8');
  const re = /\b(\w+Router)\.(\w+)\(\s*[`'"]\/([^`'"]*)[`'"]\s*,([\s\S]*?)\n\}\);/g;
  let m;
  while ((m = re.exec(src))) {
    const method = m[2];
    if (!METHODS.includes(method)) continue;
    const routePath = '/' + m[3];
    const body = m[4];
    const declared = new Set([...routePath.matchAll(/:(\w+)/g)].map(p => p[1]));
    // req.params.X usage
    for (const p of body.matchAll(/req\.params\.(\w+)/g)) {
      if (!declared.has(p[1])) {
        console.log(`   ${f}: ${method.toUpperCase()} ${routePath} uses req.params.${p[1]} (declared: ${[...declared].join(',') || 'none'})`);
        mismatches++;
      }
    }
    // zod schema .parse(req.params)
    for (const s of body.matchAll(/z\.object\(\{([^}]*)\}\)\.parse\(req\.params\)/g)) {
      const keys = [...s[1].matchAll(/(\w+)\s*:/g)].map(k => k[1]);
      for (const k of keys) {
        if (!declared.has(k)) {
          console.log(`   ${f}: ${method.toUpperCase()} ${routePath} schema expects params.${k} (declared: ${[...declared].join(',') || 'none'})`);
          mismatches++;
        }
      }
    }
  }
}
console.log(`(${mismatches})`);
