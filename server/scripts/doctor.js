/**
 * npm run doctor
 *
 * Checks what is actually installed, rather than what was meant to be. Written
 * after several rounds where a fix had been issued but never reached the tree,
 * and every symptom looked like a new bug.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);

let failures = 0;

/** A file counts as current only if it contains the marker from its fix. */
function checkFile(label, relPath, marker, why) {
  const full = resolve(root, relPath);

  if (!existsSync(full)) {
    bad(`${label} — file missing at ${relPath}`);
    failures += 1;
    return;
  }

  if (!readFileSync(full, "utf8").includes(marker)) {
    bad(`${label} — file is out of date`);
    console.log(`      ${why}`);
    console.log(`      expected to find: ${marker}`);
    failures += 1;
    return;
  }

  ok(label);
}

console.log("\nFrontend fixes\n");

checkFile(
  "CityMap guards null coordinates",
  "client/src/components/CityMap.jsx",
  "hasCoords",
  "Without this, one complaint with no location crashes the whole page."
);

checkFile(
  "ErrorBoundary exists",
  "client/src/components/ErrorBoundary.jsx",
  "getDerivedStateFromError",
  "Without this, any thrown component blanks the entire route."
);

checkFile(
  "ErrorBoundary is wired into the router",
  "client/src/App.jsx",
  "ErrorBoundary",
  "The boundary file can exist without being used."
);

checkFile(
  "JobDetail guards its map",
  "client/src/pages/officer/JobDetail.jsx",
  "quiet fallbackText",
  "A job with no coordinates should cost the map, not the page."
);

checkFile(
  "Voice hook restarts on silence",
  "client/src/lib/useVoice.js",
  "wanted.current",
  "Chrome stops listening after a pause; without this, speech is lost mid-sentence."
);

console.log("\nBackend fixes\n");

checkFile(
  "Proof upload survives an AI failure",
  "server/src/routes/officer.js",
  "checkNote",
  "The evidence check is assistive and must not block an officer submitting work."
);

checkFile(
  "Storage bucket is configurable",
  "server/src/services/storage.js",
  "STORAGE_BUCKET",
  "A bucket name mismatch otherwise surfaces as an unexplained 502."
);

checkFile(
  "Upstream errors reach the browser",
  "server/src/middleware/errors.js",
  "upstream",
  "Otherwise every 502 looks identical and needs the server terminal to diagnose."
);

checkFile(
  "Responsibility coerces the category id",
  "server/src/services/responsibility.js",
  "Number.isFinite(Number(categoryId))",
  "A string category id silently matches nothing and 404s a valid location."
);

checkFile(
  "Offline mock provider available",
  "server/src/services/ai/mock.js",
  "Mock (offline)",
  "Lets the whole app run with no API key and no quota."
);

checkFile(
  "Model responses are cached",
  "server/src/services/ai/cache.js",
  "keyFor",
  "Without it, the same photo costs quota every time you re-test."
);

console.log("\nEnvironment\n");

const need = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of need) {
  if (process.env[key]) ok(key);
  else { bad(`${key} is not set`); failures += 1; }
}

if (process.env.STORAGE_BUCKET) ok(`STORAGE_BUCKET = ${process.env.STORAGE_BUCKET}`);
else warn('STORAGE_BUCKET not set — defaulting to "complaint-media"');

const provider = process.env.AI_PROVIDER || "gemini";
const keyFor = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", openrouter: "OPENROUTER_API_KEY", ollama: null }[provider];
if (!keyFor || process.env[keyFor]) ok(`AI provider ${provider}`);
else { bad(`AI_PROVIDER is ${provider} but ${keyFor} is not set`); failures += 1; }

console.log(
  failures === 0
    ? "\nEverything is in place. If something still misbehaves it is a new problem, not a missing file.\n"
    : `\n${failures} problem${failures === 1 ? "" : "s"}. Copy the files named above before testing further.\n`
);

process.exit(failures ? 1 : 0);
