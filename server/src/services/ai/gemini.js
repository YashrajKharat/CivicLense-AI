/**
 * Google Gemini — the default provider.
 *
 * Free tier covers vision, which most free text APIs do not, and the limits are
 * comfortable for a project this size. Key at aistudio.google.com/apikey.
 * No SDK: one fetch call is easier to reason about than a dependency.
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const toParts = (content) => {
  if (typeof content === "string") return [{ text: content }];
  return content.map((block) =>
    block.type === "image"
      ? { inline_data: { mime_type: block.mimeType, data: block.data } }
      : { text: block.text }
  );
};

export const gemini = {
  label: "Google Gemini",
  envKey: "GEMINI_API_KEY",
  vision: true,
  // Whether it can be shown two images and reason about both.
  vision_comparison: true,
  defaultModel: "gemini-flash-latest",
  configured: () => Boolean(process.env.GEMINI_API_KEY),

  async complete({ messages, system, maxTokens, temperature }) {
    const model = process.env.GEMINI_MODEL || "gemini-flash-latest";

    const body = {
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: toParts(m.content),
      })),
      generationConfig: {
        // Gemini 2.5+ models reason before answering, and that reasoning is
        // billed against maxOutputTokens. With a small budget the model can
        // spend the whole allowance thinking and return an empty candidate,
        // which looks like "the API works but says nothing". Zero disables it —
        // these are extraction tasks, not problems that need deliberation.
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: Math.max(maxTokens ?? 1024, 256),
        temperature,
        responseMimeType: "text/plain",
      },
    };

    if (system) body.systemInstruction = { parts: [{ text: system }] };

    const res = await fetch(`${BASE}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text();
      const err = new Error(readableError(detail, model));
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];

    if (data.promptFeedback?.blockReason) {
      const err = new Error(`Blocked by safety filter: ${data.promptFeedback.blockReason}`);
      err.status = 400;
      throw err;
    }

    // MAX_TOKENS with no parts means the budget went entirely on reasoning.
    // Saying so beats returning "" and failing somewhere further downstream.
    if (candidate?.finishReason === "MAX_TOKENS" && !candidate?.content?.parts?.length) {
      const err = new Error(
        "The model used its whole token budget before answering. Raise maxTokens, " +
          "or set GEMINI_MODEL=gemini-flash-latest to avoid a thinking model."
      );
      err.status = 502;
      throw err;
    }

    const text = (candidate?.content?.parts || [])
      .map((p) => p.text || "")
      .filter(Boolean)
      .join("\n");

    if (!text.trim()) {
      const err = new Error(
        `The model returned no text (finishReason: ${candidate?.finishReason || "unknown"}).`
      );
      err.status = 502;
      throw err;
    }

    return text;
  },
};

/**
 * Google's errors arrive as a JSON blob. The message inside is usually precise —
 * a retired model name, a bad key — and worth surfacing rather than burying.
 */
function readableError(detail, model) {
  try {
    const parsed = JSON.parse(detail);
    const message = parsed?.error?.message || detail;

    if (/is not found|no longer available|not supported/i.test(message)) {
      return `${message} (configured model: ${model})`;
    }
    if (/API key not valid/i.test(message)) {
      return "That GEMINI_API_KEY was rejected. Keys from aistudio.google.com begin with AIza.";
    }
    return message;
  } catch {
    return detail.slice(0, 300);
  }
}
