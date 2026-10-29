/**
 * Keeps the map's category glyphs in step with what the classifier can return.
 *
 * These two lists live in different packages and drifted apart in both
 * directions — nine glyphs for categories that no longer existed, three
 * categories with no glyph at all. The failure is silent: a marker just shows
 * the fallback and nobody notices.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const between = (src, from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));

const glyphs = [
  ...between(
    fs.readFileSync(path.join(root, "client/src/components/PhotoMarkers.jsx"), "utf8"),
    "const GLYPH",
    "};"
  ).matchAll(/"([^"]+)":/g),
].map((m) => m[1]);

const categories = [
  ...between(
    fs.readFileSync(path.join(root, "server/src/services/vision.js"), "utf8"),
    "const CATEGORIES",
    "];"
  ).matchAll(/"([^"]+)"/g),
].map((m) => m[1]);

const orphans = glyphs.filter((g) => !categories.includes(g));
// "Other" is deliberately uncovered — it falls through to the default marker.
const uncovered = categories.filter((c) => !glyphs.includes(c) && c !== "Other");

for (const g of orphans) console.log(`  ✗ glyph "${g}" is not a category the classifier returns`);
for (const c of uncovered) console.log(`  ✗ category "${c}" has no glyph`);

const problems = orphans.length + uncovered.length;
console.log(
  problems
    ? `\n${problems} mismatch(es) between PhotoMarkers.jsx and vision.js`
    : `${glyphs.length} glyphs cover all ${categories.length} categories`
);
process.exit(problems ? 1 : 0);