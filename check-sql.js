/**
 * Static SQL-vs-schema checker.
 * Extracts SQL template literals from backend source files and validates
 * INSERT column lists, UPDATE SET columns, and simple SELECT column lists
 * against the live PostgreSQL schema via docker exec psql.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|js)$/.test(f)) out.push(p);
  }
  return out;
}

function extractSqlLiterals(src) {
  // crude template-literal extraction; skip comments/strings roughly
  const out = [];
  const re = /`([^`]*)`/gs;
  let m;
  while ((m = re.exec(src))) {
    const t = m[1];
    if (/\b(select|insert|update|delete)\b/i.test(t)) out.push(t.replace(/\$\{[^}]*\}/g, 'X'));
  }
  return out;
}

let schemaCache = null;
function getSchema() {
  if (schemaCache) return schemaCache;
  const raw = execSync(
    `docker exec getitdone-postgres psql -U getitdone -d getitdone -At -c "SELECT table_name||'|'||column_name FROM information_schema.columns WHERE table_schema='public'"`,
    { stdio: ['pipe', 'pipe', 'ignore'] }
  ).toString();
  schemaCache = {};
  for (const line of raw.split('\n')) {
    if (!line.includes('|')) continue;
    const [t, c] = line.split('|');
    (schemaCache[t] = schemaCache[t] || new Set()).add(c);
  }
  return schemaCache;
}

const KEYWORDS = new Set(['on','and','or','where','group','order','limit','offset','left','right','inner','outer','join','set','values','returning','as','with','union','for','update','select','from','where']);

function analyze() {
  const schema = getSchema();
  const findings = [];
  const files = walk(path.join(__dirname, 'backend', 'src'));
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const sql of extractSqlLiterals(src)) {
      const clean = sql.replace(/--[^\n]*/g, ' ');

      // INSERT INTO t (cols)
      for (const m of clean.matchAll(/insert\s+into\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
        const table = m[1].toLowerCase();
        if (!schema[table]) continue;
        const cols = m[2].split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
        for (const c of cols) {
          if (!schema[table].has(c)) findings.push({ file, kind: 'insert', table, col: c, stmt: m[0].slice(0, 90) });
        }
      }

      // UPDATE t SET col = ..., also handle alias: update t a set a.col
      for (const m of clean.matchAll(/update\s+([a-z_][a-z0-9_]*)\s+([a-z_][a-z0-9_]*)?\s*set\s+((?:.?["\w.]+\s*=\s*[^\s,]+[\s,]*)+)/gi)) {
        const table = m[1].toLowerCase();
        if (!schema[table]) continue;
        const alias = m[2] && !KEYWORDS.has(m[2].toLowerCase()) ? m[2].toLowerCase() : null;
        const setPart = m[3];
        for (const c of setPart.matchAll(/(?:(\w+)\.)?([a-z_][a-z0-9_]*)\s*=/gi)) {
          if (c[1] && alias && c[1].toLowerCase() !== alias) continue;
          const col = c[2].toLowerCase();
          if (!schema[table].has(col) && !['current_timestamp','now'].includes(col)) {
            findings.push({ file, kind: 'update', table, col, stmt: setPart.slice(0, 90) });
          }
        }
      }

      // SELECT explicit cols FROM single table (no joins) — catches select id/name from t
      for (const m of clean.matchAll(/select\s+(distinct\s+on\s*\([^)]*\)\s*)?((?:(?!from)[^;])*?)\s+from\s+([a-z_][a-z0-9_]*)\s*(?![\s\S]{0,400}?\bjoin\b)/gis)) {
        const table = m[3].toLowerCase();
        if (!schema[table]) continue;
        const colList = m[2];
        if (colList.includes('(') || colList.includes('*') || colList.includes(',') === false && colList.trim().split(/\s+/).length > 3) {
          // expressions/aggregates -> skip complex ones except plain comma lists below
        }
        if (colList.includes('(')) continue;
        for (const partRaw of colList.split(',')) {
          const part = partRaw.trim().toLowerCase();
          if (!part || part === '*') continue;
          const cm = part.match(/^(?:(\w+)\.)?([\w]+)(\s+as\s+\w+)?$/);
          if (!cm) continue;
          if (cm[1] && cm[1].toLowerCase() !== table) continue; // qualified by different name (alias/subquery) – skip
          const col = cm[2];
          if (!schema[table].has(col)) findings.push({ file, kind: 'select', table, col, stmt: ('select ' + colList.slice(0, 70) + ' from ' + table) });
        }
      }
    }
  }
  return findings;
}

const seen = new Set();
for (const f of analyze()) {
  const key = `${f.kind}:${f.table}.${f.col}:${path.basename(f.file)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`[${f.kind}] ${f.table}.${f.col}  <- ${path.relative(process.cwd(), f.file)}\n    ${f.stmt}`);
}
console.log('\nDone.');
