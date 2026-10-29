/**
 * Finds JSX components that are used but never imported or defined.
 *
 * The parse check passes on these because a missing import is a runtime
 * ReferenceError, not a syntax error — which is exactly how `Steps` reached the
 * browser. Worth catching here rather than in a screenshot.
 */
import { parse } from "@babel/parser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let problems = 0;

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (f !== "node_modules") walk(p); continue; }
    if (!/\.jsx?$/.test(f)) continue;

    const src = fs.readFileSync(p, "utf8");
    let ast;
    try { ast = parse(src, { sourceType: "module", plugins: ["jsx"] }); }
    catch { continue; }

    const known = new Set();

    // anything imported, declared, or defined in this file
    for (const m of src.matchAll(/import\s+(?:(\w+)\s*,\s*)?\{([^}]*)\}/g)) {
      if (m[1]) known.add(m[1]);
      m[2].split(",").forEach((n) => {
        const name = n.trim().split(/\s+as\s+/).pop().trim();
        if (name) known.add(name);
      });
    }
    for (const m of src.matchAll(/import\s+(\w+)\s+from/g)) known.add(m[1]);
    for (const m of src.matchAll(/(?:function|class)\s+([A-Z]\w*)/g)) known.add(m[1]);
    for (const m of src.matchAll(/(?:const|let|var)\s+([A-Z]\w*)\s*=/g)) known.add(m[1]);

    // Destructured props renamed to a component: ({ icon: Ico = Icon.file })
    for (const m of src.matchAll(/\w+\s*:\s*([A-Z]\w*)\s*(?:=|[,}])/g)) known.add(m[1]);
    // and destructured directly: ({ Icon, Thing })
    for (const m of src.matchAll(/\{[^}]*?\b([A-Z]\w*)\b[^}]*?\}\s*(?:=|\))/g)) known.add(m[1]);

    // capitalised JSX tags that are not member expressions (Icon.foo is fine)
    const used = new Set();
    for (const m of src.matchAll(/<([A-Z]\w*)(?=[\s/>])/g)) used.add(m[1]);

    for (const tag of used) {
      if (!known.has(tag)) {
        problems += 1;
        console.log(`  ${p}  <${tag}> is used but never imported or defined`);
      }
    }
  }
}

walk(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src"));
console.log(problems ? `\n${problems} undefined component(s)` : "every JSX component is defined");
process.exit(problems ? 1 : 0);
