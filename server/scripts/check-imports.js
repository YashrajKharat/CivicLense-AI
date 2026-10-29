/**
 * Verifies that every default import resolves to a default export.
 *
 * A file can parse perfectly and still fail at startup: my edit to a route file
 * removed `export default router;` while leaving every route inside it intact,
 * and the syntax check passed. Node only complained when it tried to load it.
 *
 *     SyntaxError: The requested module './routes/clusters.js'
 *     does not provide an export named 'default'
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let problems = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);

    if (fs.statSync(full).isDirectory()) {
      if (entry !== "node_modules") walk(full);
      continue;
    }
    if (!full.endsWith(".js")) continue;

    const src = fs.readFileSync(full, "utf8");

    // `import x from "./y.js"` — a default import of a local file.
    for (const m of src.matchAll(/^import\s+(\w+)\s+from\s+["'](\.[^"']+)["']/gm)) {
      const target = path.resolve(path.dirname(full), m[2]);
      if (!fs.existsSync(target)) {
        problems += 1;
        console.log(`  ✗ ${path.relative(root, full)} imports ${m[2]}, which does not exist`);
        continue;
      }

      if (!/export\s+default\b/.test(fs.readFileSync(target, "utf8"))) {
        problems += 1;
        console.log(
          `  ✗ ${path.relative(root, full)} imports "${m[1]}" from ${m[2]},\n` +
            `      but that file has no default export`
        );
      }
    }
  }
}

walk(path.join(root, "src"));

console.log(problems ? `\n${problems} broken import(s)` : "every default import resolves");
process.exit(problems ? 1 : 0);
