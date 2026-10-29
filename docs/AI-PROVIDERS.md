# AI providers

Nothing in this project depends on a paid API. Feature code calls `complete()` or
`completeJSON()` from `server/src/services/ai/index.js` with a neutral message shape, and an
adapter translates it for whichever backend is configured. Switching provider is one
environment variable.

```
AI_PROVIDER=gemini   # gemini | groq | openrouter | ollama
```

## Choosing one

| Provider | Cost | Vision | Notes |
|---|---|---|---|
| **Gemini** *(default)* | Free tier | Yes | Best free vision. Comfortable limits for a project this size. |
| **Groq** | Free tier | Model-dependent | Fastest by a distance. Vision needs a Llama 4 model; older text models will fail the image test. |
| **OpenRouter** | Free models available | Model-dependent | One key, many models. Handy fallback when another provider's daily quota runs out mid-demo. |
| **Ollama** | Free, local | Yes (`llava`) | No key, no quota, no network. Slower and noticeably weaker on JSON tasks — but it cannot fail because of conference wifi. |

Rate limits and free-tier terms change often; check the provider's current page rather than
trusting a table in a repo.

## Setup

### Gemini
1. Get a key at `aistudio.google.com/apikey`.
2. In `server/.env`:
   ```
   AI_PROVIDER=gemini
   GEMINI_API_KEY=...
   GEMINI_MODEL=gemini-2.0-flash
   ```

### Groq
```
AI_PROVIDER=groq
GROQ_API_KEY=...
GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
```
Key at `console.groq.com/keys`. A text-only model here breaks photo classification while leaving
briefs and the assistant working — a confusing half-failure, so run the check below after switching.

### OpenRouter
```
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free
```
Which `:free` models exist changes over time. Check `openrouter.ai/models?q=free`.

### Ollama
```bash
ollama pull llava
```
```
AI_PROVIDER=ollama
OLLAMA_MODEL=llava
```
No key needed. If Ollama is not running you get a clear connection error rather than a timeout.

## Verify before blaming the app

```bash
cd server && npm run check:ai
```

Tests text, JSON parsing and vision separately:

```
Provider : Google Gemini
Model    : gemini-2.0-flash
Key set  : yes

  ✓ text: OK
  ✓ json: parsed and matched
  ✓ vision: Red
```

`GET /health` reports the same state, so you can check a deployed instance without shell access.

## What the adapters handle for you

**Image encoding differs per provider.** Gemini takes `inline_data`, the OpenAI-compatible APIs
take a data URI inside `image_url`, and Ollama takes a sibling `images` array. Feature code writes
`{ type: "image", mimeType, data }` once and never thinks about it again.

**Free models are worse at instruction-following.** Two defences:

1. `parseJSON` walks the string and extracts the outermost balanced `{...}`, so fences, a
   "Here is the JSON:" preamble and a trailing explanation are all survivable.
2. `vision.js` normalises the result — an off-list category is matched back onto the taxonomy, a
   confidence of `"high"` becomes a number, a missing field gets a sane default. The rest of the
   app can trust the shape regardless of which model produced it.

**Free tiers are rate limited**, so a 429 is ordinary traffic. Requests retry three times with
backoff before surfacing "the analysis service is busy."

## One honest caveat

Free tiers generally allow the provider to use your prompts to improve their models. For street
photos that is usually acceptable, but it is a real consideration, and worth stating plainly if
anyone asks where the images go. Ollama is the option that keeps everything on your own machine.
