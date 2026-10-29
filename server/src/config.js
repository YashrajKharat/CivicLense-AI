/**
 * Checks the environment before anything tries to use it.
 *
 * Without this, a missing SUPABASE_URL surfaces as "supabaseUrl is required"
 * thrown from inside node_modules, with a stack trace pointing at the Supabase
 * client rather than at the file you need to edit. It reads like a broken
 * dependency and is actually a blank line in .env.
 *
 * Imported first in index.js so it fails before any client is constructed.
 */
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED = [
  ["SUPABASE_URL", "Supabase → Project Settings → API → Project URL"],
  ["SUPABASE_SERVICE_ROLE_KEY", "Supabase → Project Settings → API → service_role key"],
  ["DATABASE_URL", "Supabase → Project Settings → Database → Connection string → Session pooler"],
];

export function checkEnvironment() {
  const missing = REQUIRED.filter(([key]) => !process.env[key]?.trim());

  if (missing.length === 0) return;

  const hasFile = existsSync(resolve(ROOT, ".env"));

  console.error("\n\x1b[31mThe server cannot start.\x1b[0m\n");

  if (!hasFile) {
    console.error(`  There is no .env file at ${resolve(ROOT, ".env")}\n`);
  } else {
    console.error(`  ${missing.length} value(s) are missing from server/.env:\n`);
  }

  for (const [key, where] of missing) {
    console.error(`    ${key}`);
    console.error(`      ${where}\n`);
  }

  console.error("  Fill them in, then run npm run dev again.\n");

  // A clean exit rather than a stack trace. There is no bug to trace — the
  // configuration is simply incomplete, and a traceback through node_modules
  // only obscures that.
  process.exit(1);
}
