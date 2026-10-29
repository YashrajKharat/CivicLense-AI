/**
 * Basic CSS syntax and brace validation checker.
 */
import fs from "node:fs";
import path from "node:path";

const targetFile = process.argv[2];

if (!targetFile) {
  console.error("Usage: node check-css.js <path-to-css-file>");
  process.exit(1);
}

const fullPath = path.resolve(process.cwd(), targetFile);

if (!fs.existsSync(fullPath)) {
  console.error(`CSS file not found: ${fullPath}`);
  process.exit(1);
}

const content = fs.readFileSync(fullPath, "utf-8");

let openBraces = 0;
let line = 1;

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  if (char === "\n") line++;
  if (char === "{") openBraces++;
  if (char === "}") {
    openBraces--;
    if (openBraces < 0) {
      console.error(`Unexpected closing brace at line ${line} in ${targetFile}`);
      process.exit(1);
    }
  }
}

if (openBraces !== 0) {
  console.error(`Mismatched braces (${openBraces} unclosed) in ${targetFile}`);
  process.exit(1);
}

console.log(`CSS syntax valid: ${targetFile}`);
process.exit(0);
