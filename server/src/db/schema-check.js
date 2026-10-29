import { query } from "./pool.js";

/**
 * Verifies at boot that the database has what the code expects.
 *
 * Every migration adds columns the routes then reference unconditionally. Skip
 * one and the failure surfaces later as a 500 on an unrelated-looking action —
 * "create complaint" breaking because a triage column is missing tells you
 * nothing useful. Checking up front turns that into one clear line at startup.
 *
 * This only warns. A partially migrated database is still worth running for
 * everything that does work, and refusing to boot would be a worse trade.
 */
const EXPECTED = [
  { migration: "0001_init",              table: "complaints",          column: "severity" },
  { migration: "0002_workflow",          table: "complaints",          column: "review_decision" },
  { migration: "0003_agent",             table: "agent_runs",          column: "task" },
  { migration: "0004_staff_and_fixes",   table: "staff_applications",  column: "requested_role" },
  { migration: "0005_role_hierarchy",    table: "profiles",            column: "role" },
  { migration: "0006_repair_clusters",   table: "clusters",            column: "centroid" },
  { migration: "0007_responsibility",    table: "establishments",      column: "licence_no" },
  { migration: "0007_responsibility",    table: "complaint_reviews",   column: "rating" },
  { migration: "0008_category_mgmt",     table: "categories",          column: "active" },
  { migration: "0009_contact_details",   table: "profiles",            column: "email" },
  { migration: "0010_triage_department", table: "complaints",          column: "flagged_not_civic" },
  { migration: "0011_rework_profiles",   table: "complaints",          column: "rework_count" },
  { migration: "0011_rework_profiles",   table: "profiles",            column: "citizen_ref" },
  { migration: "0011_rework_profiles",   table: "followup_questions",  column: "prompt" },
  { migration: "0012_categories",        table: "complaints",          column: "ai_category_id" },
  { migration: "0013_scoped_followups",  table: "followup_questions",  column: "universal" },
  // Everything after 0013 was missing from this list, so a missing migration
  // surfaced as a 500 from whichever route touched the column first rather than
  // a named warning at boot — which is the entire point of this check.
  // 0015 adds an enum value rather than a column, so it is checked separately
  // below — listing complaints.status here would always pass and detect
  // nothing, which is worse than not checking at all.
  { migration: "0016_work_zones",        table: "complaints",          column: "work_zone_id" },
  { migration: "0018_public_comments",   table: "complaints",          column: "comment_count" },
  { migration: "0019_anonymous_reports", table: "complaints",          column: "anonymous" },
];

export async function checkSchema() {
  let rows;
  try {
    const result = await query(
      `select table_name, column_name
       from information_schema.columns
       where table_schema = 'public'`
    );
    rows = result.rows;
  } catch (err) {
    console.error(`[schema] could not read the database: ${err.message}`);
    return { ok: false, missing: [] };
  }

  const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing = EXPECTED.filter((e) => !present.has(`${e.table}.${e.column}`));

  // Enum values added by later migrations. A missing one fails at the moment
  // somebody uses the feature, with a constraint error that names the type
  // rather than the migration.
  try {
    const { rows: labels } = await query(
      `select t.typname, e.enumlabel
       from pg_type t join pg_enum e on e.enumtypid = t.oid
       where t.typname in ('complaint_status', 'comment_kind')`
    );
    const has = new Set(labels.map((r) => `${r.typname}.${r.enumlabel}`));

    for (const [migration, type, label] of [
      ["0015_withdraw_report", "complaint_status", "withdrawn"],
      ["0018_public_comments", "comment_kind", "corroborate"],
    ]) {
      if (!has.has(`${type}.${label}`)) {
        missing.push({ migration, table: type, column: label });
      }
    }
  } catch {
    // Not fatal. A database that cannot answer this can still serve requests,
    // and refusing to boot over a diagnostic would be the wrong trade.
  }

  if (missing.length === 0) {
    console.log("[schema] all migrations applied");
    return { ok: true, missing: [] };
  }

  // Group by migration — one missing column and ten missing columns from the
  // same file are the same instruction: run that file.
  const byMigration = new Map();
  for (const m of missing) {
    if (!byMigration.has(m.migration)) byMigration.set(m.migration, []);
    byMigration.get(m.migration).push(`${m.table}.${m.column}`);
  }

  console.warn("\n\x1b[33m[schema] Migrations are missing. Expect 500s until they are run.\x1b[0m");
  for (const [migration, cols] of byMigration) {
    console.warn(`  ✗ supabase/migrations/${migration}*.sql`);
    console.warn(`      missing: ${cols.join(", ")}`);
  }
  console.warn("  Run them in the Supabase SQL Editor, in order.\n");

  return { ok: false, missing: [...byMigration.keys()] };
}
