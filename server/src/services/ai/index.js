import { HttpError } from "../../middleware/errors.js";
import { gemini } from "./gemini.js";
import { groq } from "./groq.js";
import { openrouter } from "./openrouter.js";
import { ollama } from "./ollama.js";
import { mock } from "./mock.js";
import { local } from "./local.js";
import * as cache from "./cache.js";

/**
 * One interface, several free backends.
 *
 * Feature code never imports a provider directly — it calls complete() or
 * completeJSON() with a neutral message shape, and the adapter translates.
 * Switching provider is an environment variable, not a code change.
 *
 * Neutral message shape:
 *   { role: "user" | "assistant",
 *     content: string | Array<{ type: "text", text } | { type: "image", mimeType, data }> }
 *   where `data` is raw base64 with no data-URI prefix.
 */
const PROVIDERS = { gemini, groq, openrouter, ollama, mock, local };

const name = process.env.AI_PROVIDER || "gemini";
const provider = PROVIDERS[name];

if (!provider) {
  throw new Error(
    `Unknown AI_PROVIDER "${name}". Choose one of: ${Object.keys(PROVIDERS).join(", ")}`
  );
}

/**
 * A second provider, used only when an image is involved.
 *
 * Text and vision have different needs. Briefs, the agent and the assistant run
 * constantly and want a provider with room to breathe; photo classification is
 * one call per report and needs to actually see. Splitting them means the local
 * classifier handles every photograph while text goes wherever it works best,
 * and neither has to compromise for the other.
 *
 * Leave AI_VISION_PROVIDER unset and everything stays on one provider.
 */
const visionName = process.env.AI_VISION_PROVIDER || "";
const visionProvider = PROVIDERS[visionName] || null;

if (visionName && !visionProvider) {
  throw new Error(
    `Unknown AI_VISION_PROVIDER "${visionName}". Choose one of: ${Object.keys(PROVIDERS).join(", ")}`
  );
}

const providerFor = (hasImage) =>
  hasImage && visionProvider?.configured() ? visionProvider : provider;

const carriesImage = (messages) =>
  messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "image"));

if (visionProvider) console.log(`[ai] images route to: ${visionProvider.label}`);

console.log(`[ai] provider: ${provider.label}${provider.vision ? "" : " (no vision support)"}`);

/** Free tiers are rate limited, so a 429 is expected traffic, not an error. */
async function withRetry(fn, { attempts = 3 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err.status !== 429 && err.status !== 503) throw err;
      // 1s, 3s, 7s — enough to clear a per-minute bucket without stalling a request.
      await new Promise((r) => setTimeout(r, 1000 * (2 ** i - 1) + 1000));
    }
  }
  throw lastError;
}

export async function complete({ messages, system, maxTokens = 1200, temperature = 0.2 }) {
  const active = providerFor(carriesImage(messages));
  if (!active.configured()) {
    throw new HttpError(503, "The analysis service is not configured on this server.", {
      hint: `Set ${active.envKey} in server/.env, or change AI_PROVIDER.`,
    });
  }

  // The same photo gets classified dozens of times while everything downstream
  // of it is being built. On a free tier that exhausts the quota before any of
  // it has been tested, so identical requests are answered from disk.
  const key = cache.keyFor({ system, messages, model: aiProvider.model });
  const hit = cache.get(key);
  if (hit) return hit;

  try {
    const answer = await withRetry(() =>
      active.complete({ messages, system, maxTokens, temperature })
    );
    cache.set(key, answer);
    return answer;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err.status === 429) {
      throw new HttpError(429, "The analysis service is busy. Wait a moment and try again.");
    }
    throw new HttpError(502, "The analysis service is unavailable. Try again shortly.", {
      provider: active.label,
      cause: err.message,
    });
  }
}

/** Same call, but parses a JSON object out of the reply. */
export async function completeJSON(options) {
  const text = await complete({ ...options, temperature: options.temperature ?? 0 });
  return parseJSON(text);
}

/**
 * Free models are markedly worse than paid ones at "reply with only JSON" —
 * they wrap it in fences, prepend "Here is the JSON:", or trail an explanation.
 * Rather than fight it with prompting alone, we extract the outermost object.
 */
export function parseJSON(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, "").trim();

  const start = cleaned.indexOf("{");
  if (start === -1) throw new HttpError(502, "The analysis service returned an unreadable result.");

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i];

    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          throw new HttpError(502, "The analysis service returned an unreadable result.");
        }
      }
    }
  }

  throw new HttpError(502, "The analysis service returned an incomplete result.");
}

export const cacheStats = cache.cacheStats;

export const aiProvider = {
  name,
  // Whether whichever provider handles images can reason about two of them at
  // once. It is the vision provider's capability, not the text one's, since the
  // vision provider is what actually receives the photographs.
  vision_comparison: (visionProvider || provider).vision_comparison === true,
  label: provider.label,
  vision: provider.vision,
  configured: provider.configured(),
  get model() {
    return (
      process.env[`${name.toUpperCase()}_MODEL`] || provider.defaultModel || "default"
    );
  },
};
