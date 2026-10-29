/**
 * Groq — free, and far faster than anything else here. Vision depends on the
 * model: the Llama 4 models accept images, the older text models do not.
 * Key at console.groq.com.
 */
const URL = "https://api.groq.com/openai/v1/chat/completions";

/* OpenAI-compatible wire format: images are data URIs inside the content array. */
const toContent = (content) => {
  if (typeof content === "string") return content;
  return content.map((block) =>
    block.type === "image"
      ? { type: "image_url", image_url: { url: `data:${block.mimeType};base64,${block.data}` } }
      : { type: "text", text: block.text }
  );
};

/**
 * Groq returns a JSON error body with a precise message — a decommissioned
 * model, a text-only model handed an image, an exhausted quota. Passing the raw
 * blob through buries it, so the useful part is pulled out.
 */
function readableError(detail, model) {
  try {
    const message = JSON.parse(detail)?.error?.message || detail;

    if (/does not exist|decommissioned|not found/i.test(message)) {
      return `${message} (configured model: ${model}). Check console.groq.com/docs/models for current ids.`;
    }
    if (/image|vision|multimodal/i.test(message)) {
      return `${message} — this model does not accept images. Photo classification needs a vision model such as meta-llama/llama-4-scout-17b-16e-instruct.`;
    }
    if (/rate limit|quota/i.test(message)) {
      return `${message} Requests retry automatically; if it persists the daily quota is spent.`;
    }
    return message;
  } catch {
    return detail.slice(0, 300);
  }
}

export const groq = {
  label: "Groq",
  envKey: "GROQ_API_KEY",
  vision: true,
  // Whether it can be shown two images and reason about both.
  vision_comparison: true,
  defaultModel: "meta-llama/llama-4-scout-17b-16e-instruct",
  configured: () => Boolean(process.env.GROQ_API_KEY),

  async complete({ messages, system, maxTokens, temperature }) {
    const model = process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

    const payload = [
      ...(system ? [{ role: "system", content: system }] : []),
      ...messages.map((m) => ({ role: m.role, content: toContent(m.content) })),
    ];

    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({ model, messages: payload, max_tokens: maxTokens, temperature }),
    });

    if (!res.ok) {
      const detail = await res.text();
      const err = new Error(readableError(detail, model));
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  },
};
