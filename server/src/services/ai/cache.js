import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Caches model responses by the exact content of the request.
 *
 * Development means calling the model with the same photo dozens of times while
 * working on everything downstream of it. On a free tier that exhausts the
 * quota before you have tested anything, and each call costs several seconds.
 *
 * Keyed on a hash of system prompt plus messages, so any change to either is a
 * different entry. Persisted to disk so a restart does not throw the work away —
 * which is what made this worth doing at all.
 *
 * Disable with AI_CACHE=false when you specifically want fresh output.
 */
const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".cache");
const FILE = resolve(DIR, "ai-responses.json");
const MAX = Number(process.env.AI_CACHE_MAX || 500);
const enabled = process.env.AI_CACHE !== "false";

let store = new Map();

if (enabled && existsSync(FILE)) {
  try {
    store = new Map(Object.entries(JSON.parse(readFileSync(FILE, "utf8"))));
  } catch {
    // A corrupt cache is not worth crashing over; start clean.
    store = new Map();
  }
}

let pending = null;

function persist() {
  if (!enabled) return;
  clearTimeout(pending);
  // Debounced: a burst of calls should write once, not once each.
  pending = setTimeout(() => {
    try {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(FILE, JSON.stringify(Object.fromEntries(store)));
    } catch {
      /* a cache that cannot persist is still useful in memory */
    }
  }, 1500);
}

export function keyFor({ system, messages, model }) {
  return createHash("sha256")
    .update(JSON.stringify({ system, messages, model }))
    .digest("hex")
    .slice(0, 32);
}

export function get(key) {
  if (!enabled) return null;
  const hit = store.get(key);
  if (!hit) return null;

  // Refresh recency so the eviction below drops genuinely cold entries.
  store.delete(key);
  store.set(key, hit);
  return hit;
}

export function set(key, value) {
  if (!enabled || !value) return;

  store.set(key, value);
  while (store.size > MAX) store.delete(store.keys().next().value);

  persist();
}

export const cacheStats = () => ({ enabled, entries: store.size, max: MAX });
