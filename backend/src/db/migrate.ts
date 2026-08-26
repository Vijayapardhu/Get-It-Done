import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { env } from "../config/env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Explicit, dependency-ordered migration list.
 *
 * This is deliberately NOT a directory glob. Lexicographic ordering breaks here
 * ("migration_phase10..." sorts before "migration_phase1_2..." because '0' < '_'),
 * and several files depend on tables created by a *later*-sorting file. The list
 * is the source of truth; a file not named here is never applied.
 */
export const MIGRATIONS = [
  "schema.sql",                            // base: extensions, users, workers, bookings, ...
  "migration.sql",                         // auth columns on users
  "migration_roles.sql",                   // roles / permissions / user_roles
  "migration_phase1_2.sql",
  "migration_phase4.sql",
  "migration_phase5.sql",                  // payments, settlements, welfare, materialized views
  "migration_admin_features.sql",
  "migration_chats.sql",
  "migration_phase6.sql",                  // booking_attachments, booking_notes
  "migration_phase7.sql",                  // addresses
  "migration_phase8.sql",
  "migration_phase8_connected_system.sql", // address scoping, favorites, booking OTPs, escalations, AI records
  "migration_phase9.sql",
  "fix_trigger.sql",                       // trailing trigger hotfixes (targets must already exist)
  "fix_triggers.sql",
  "fix_roles_trigger.sql",
  "migration_phase10_missing_entities.sql",// emergency_bookings, complaint_comments, review_reports, ...
  "migration_phase11_financials.sql",      // welfare fund split, settlement batches, job queue
  "migration_phase12_security_events.sql",// anonymous failed-login records
  "migration_phase13_artwork.sql",         // service/category PNG + Lottie artwork
] as const;

const CREATE_TRACKING_TABLE = `
  create table if not exists schema_migrations (
    filename   text primary key,
    checksum   text not null,
    applied_at timestamptz not null default now()
  )
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex").slice(0, 16);
}

export async function runMigrations(options: { seed?: boolean } = {}): Promise<void> {
  // A dedicated pool: the app pool sets statement_timeout=10s, which some index
  // and materialized-view builds legitimately exceed.
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1, statement_timeout: 0 });
  const client = await pool.connect();

  let applied = 0;
  let skipped = 0;

  try {
    await client.query(CREATE_TRACKING_TABLE);
    const done = await client.query<{ filename: string; checksum: string }>(
      "select filename, checksum from schema_migrations"
    );
    const seen = new Map(done.rows.map((r) => [r.filename, r.checksum]));

    for (const filename of MIGRATIONS) {
      const sql = readFileSync(resolve(__dirname, filename), "utf-8");
      const sum = checksum(sql);
      const previous = seen.get(filename);

      if (previous) {
        if (previous !== sum) {
          console.warn(
            `  ~ ${filename} already applied but its contents changed ` +
              `(${previous} -> ${sum}). Not re-running; add a new migration instead.`
          );
        }
        skipped++;
        continue;
      }

      // One transaction per file: a failure leaves the DB at the last good state
      // rather than half-applying the file.
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into schema_migrations (filename, checksum) values ($1, $2)",
          [filename, sum]
        );
        await client.query("commit");
        console.log(`  + ${filename}`);
        applied++;
      } catch (error) {
        await client.query("rollback");
        console.error(`  ! ${filename} failed:`, (error as Error).message);
        throw error;
      }
    }

    if (options.seed) {
      const seedSql = readFileSync(resolve(__dirname, "seed.sql"), "utf-8");
      await client.query(seedSql);
      console.log("  + seed.sql");
    }

    console.log(`Migrations complete: ${applied} applied, ${skipped} already up to date.`);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run directly: `npm run db:migrate` / `npm run db:migrate -- --seed`
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  runMigrations({ seed: process.argv.includes("--seed") })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
