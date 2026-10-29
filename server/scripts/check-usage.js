/**
 * Finds identifiers used in a module but never imported or declared in it.
 *
 * A missing import is a runtime ReferenceError, not a syntax error, so the file
 * parses cleanly and Node only complains at startup. That is how a route using
 * requireMinRole shipped with only requireAuth imported.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The things route files reach for. Narrow on purpose — a general
// undefined-identifier check would need real scope analysis.
const WATCH = [
  "requireAuth", "requireMinRole", "requireRole", "requireApprovedStaff",
  "requireApprovalRights", "query", "transaction", "wrap", "badRequest",
  "notFound", "HttpError", "notify", "signedUrl", "uploadImage", "z",
  // Added after vision.js used aiProvider without importing it and this check
  // passed. The list is only as good as what is on it — anything a module
  // reaches for across a file boundary belongs here.
  "aiProvider", "complete", "completeJSON", "clamp", "scoreSeverity",
  "resolveResponsibility", "buildSections", "clusterBrief", "dailyBrief",
  "matchIntent", "answerFrom",
];

let problems = 0;

for (const rel of ["server/src/routes", "server/src/services", "server/src/agent"]) {
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) continue;

  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".js")) continue;

    const file = path.join(dir, f);
    const raw = fs.readFileSync(file, "utf8");

    // Comments and strings do not use anything. Without stripping them the
    // check flagged two files for the word "query" appearing in prose, and a
    // check that cries wolf teaches you to skim past its output — which is
    // roughly how the real missing import survived.
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/`(?:[^`\\]|\\.)*`/g, "``")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''");

    // Everything brought in or defined locally.
    const known = new Set();
    for (const m of raw.matchAll(/import\s*\{([^}]+)\}/g))
      m[1].split(",").forEach((n) => known.add(n.trim().split(/\s+as\s+/).pop().trim()));
    for (const m of raw.matchAll(/import\s+(\w+)\s+from/g)) known.add(m[1]);
    for (const m of src.matchAll(/(?:const|let|var|function)\s+(\w+)/g)) known.add(m[1]);

    for (const name of WATCH) {
      if (!new RegExp(`\\b${name}\\b`).test(src)) continue;
      if (known.has(name)) continue;
      problems += 1;
      console.log(`  ✗ ${path.relative(root, file)} uses ${name} but never imports it`);
    }
  }
}

console.log(problems ? `\n${problems} missing import(s)` : "every module imports what it uses");
process.exit(problems ? 1 : 0);
