/**
 * npm run models
 *
 * Lists what the configured provider will actually serve you right now.
 *
 * Model ids are retired without notice — llama-4-scout and gemini-2.0-flash-exp
 * both disappeared during this project — and the failure arrives as a 502 on an
 * unrelated-looking action. Asking the provider beats guessing from a blog post.
 */
import "dotenv/config";

const provider = process.env.AI_PROVIDER || "gemini";

const VISION_HINT = /vision|vl\b|scout|maverick|gemini|gemma-3|omni|llava|pixtral|qwen.*vl/i;

async function groq() {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

  const { data } = await res.json();
  return data.map((m) => ({ id: m.id, context: m.context_window }));
}

async function gemini() {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
  );
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

  const { models } = await res.json();
  return models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => ({ id: m.name.replace("models/", ""), context: m.inputTokenLimit }));
}

async function openrouter() {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  const { data } = await res.json();
  return data
    .filter((m) => m.id.endsWith(":free"))
    .map((m) => ({ id: m.id, context: m.context_length }));
}

const LOOKUP = { groq, gemini, openrouter };

async function main() {
  const lookup = LOOKUP[provider];

  if (!lookup) {
    console.log(`\n${provider} has no model list to query. Nothing to do.\n`);
    return;
  }

  console.log(`\nModels available to your ${provider} key\n`);

  let models;
  try {
    models = await lookup();
  } catch (err) {
    console.log(`  Could not reach ${provider}: ${err.message}\n`);
    process.exit(1);
  }

  const vision = models.filter((m) => VISION_HINT.test(m.id));
  const rest = models.filter((m) => !VISION_HINT.test(m.id));

  // Vision first, because photo classification is the one feature that breaks
  // silently when the model cannot accept an image — briefs and the agent keep
  // working, which makes it look like something else is wrong.
  console.log("  Likely to accept images — pick one of these:\n");
  if (vision.length === 0) console.log("    (none found)");
  for (const m of vision) {
    console.log(`    ${m.id}${m.context ? `  · ${m.context.toLocaleString()} ctx` : ""}`);
  }

  console.log("\n  Text only:\n");
  for (const m of rest.slice(0, 15)) console.log(`    ${m.id}`);
  if (rest.length > 15) console.log(`    …and ${rest.length - 15} more`);

  const current = process.env[`${provider.toUpperCase()}_MODEL`];
  const ok = models.some((m) => m.id === current);

  console.log(
    `\n  Currently configured: ${current || "(unset)"} — ${ok ? "available" : "\x1b[31mNOT in the list above\x1b[0m"}\n`
  );

  if (!ok && vision.length) {
    console.log(`  Set ${provider.toUpperCase()}_MODEL=${vision[0].id} in server/.env, then run npm run check:ai\n`);
  }
}

main();