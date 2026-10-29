/**
 * Verifies the configured provider actually answers, including vision.
 *   node scripts/check-ai.js
 *
 * Run this before blaming the app. Nearly every "the AI is broken" report is a
 * missing key, a retired model name, an exhausted daily quota, or a thinking
 * model spending its whole token budget before it says anything.
 */
import "dotenv/config";
import { deflateSync } from "node:zlib";
import { complete, completeJSON, aiProvider } from "../src/services/ai/index.js";

/**
 * A 16x16 pure-red PNG, built here rather than pasted as a constant so it is
 * verifiably the colour we claim. The previous hardcoded blob was never checked,
 * and when a model answered "gradient" there was no way to tell whether vision
 * had failed or the test asset was simply wrong.
 */
function redPng() {
  const crc32 = (buf) => {
    let c, crc = 0xffffffff;
    for (let n = 0; n < buf.length; n += 1) {
      c = (crc ^ buf[n]) & 0xff;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc = c ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };

  const size = 16;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // truecolour RGB

  // Each scanline: one filter byte, then size × (255,0,0)
  const raw = Buffer.concat(
    Array.from({ length: size }, () =>
      Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: size }, () => Buffer.from([255, 0, 0])))])
    )
  );

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const note = (m) => console.log(`      ${m}`);

async function main() {
  console.log(`\nProvider : ${aiProvider.label}`);
  console.log(`Model    : ${aiProvider.model}`);
  console.log(`Key set  : ${aiProvider.configured ? "yes" : "NO"}\n`);

  if (!aiProvider.configured) {
    bad("No key. Set the relevant *_API_KEY in server/.env, or change AI_PROVIDER.");
    process.exit(1);
  }

  let failures = 0;

  /* ---- text ---- */
  try {
    const text = await complete({
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      maxTokens: 256,
    });
    if (text.trim()) ok(`text — "${text.trim().slice(0, 40)}"`);
    else { bad("text returned nothing"); failures += 1; }
  } catch (err) {
    bad(`text failed — ${err.message}`);
    note("If this mentions a token budget, the model is a thinking model. Try GEMINI_MODEL=gemini-flash-latest.");
    failures += 1;
  }

  /* ---- structured output ---- */
  try {
    const json = await completeJSON({
      messages: [{ role: "user", content: 'Reply with only JSON, no prose: {"status":"ready","n":7}' }],
      maxTokens: 256,
    });
    if (json.status === "ready" && json.n === 7) ok("json — parsed and matched");
    else { bad(`json — unexpected shape ${JSON.stringify(json)}`); failures += 1; }
  } catch (err) {
    bad(`json failed — ${err.message}`);
    note("Classification and briefs depend on this. Try a different model before going further.");
    failures += 1;
  }

  /* ---- vision ---- */
  try {
    const seen = await complete({
      messages: [
        {
          role: "user",
          content: [
            { type: "image", mimeType: "image/png", data: redPng() },
            { type: "text", text: "This image is one solid colour. Name that colour in one word." },
          ],
        },
      ],
      maxTokens: 256,
    });

    const answer = seen.trim().toLowerCase();
    if (/red|crimson|scarlet/.test(answer)) {
      ok(`vision — "${seen.trim().slice(0, 40)}"`);
    } else if (answer) {
      // It looked at something and described it, so the image path works even
      // if the description is off. Worth flagging, not worth failing over.
      bad(`vision answered "${seen.trim().slice(0, 40)}" — expected red`);
      note("The image reached the model, so vision is wired up. Odd answers here usually mean a weak model.");
      failures += 1;
    } else {
      bad("vision returned nothing");
      failures += 1;
    }
  } catch (err) {
    bad(`vision failed — ${err.message}`);
    note("Photo classification will not work until this passes.");
    failures += 1;
  }

  console.log(
    failures === 0
      ? "\nAll good. Photo classification, briefs and the agent will work.\n"
      : `\n${failures} of 3 checks failed. See docs/AI-PROVIDERS.md.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
