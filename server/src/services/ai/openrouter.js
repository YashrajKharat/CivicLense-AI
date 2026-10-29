/**
 * OpenRouter — one key, many models, including a rotating set of free ones
 * (model ids ending in ":free"). Useful as a fallback when another provider's
 * daily quota runs out mid-demo. Key at openrouter.ai.
 *
 * Which free models exist changes over time, so treat OPENROUTER_MODEL as
 * something to check rather than set once.
 */
const URL = "https://openrouter.ai/api/v1/chat/completions";

const toContent = (content) => {
  if (typeof content === "string") return content;
  return content.map((block) =>
    block.type === "image"
      ? { type: "image_url", image_url: { url: `data:${block.mimeType};base64,${block.data}` } }
      : { type: "text", text: block.text }
  );
};

export const openrouter = {
  label: "OpenRouter",
  envKey: "OPENROUTER_API_KEY",
  vision: true,
  // Whether it can be shown two images and reason about both.
  vision_comparison: true,
  defaultModel: "google/gemini-2.0-flash-exp:free",
  configured: () => Boolean(process.env.OPENROUTER_API_KEY),

  async complete({ messages, system, maxTokens, temperature }) {
    const model = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free";

    const payload = [
      ...(system ? [{ role: "system", content: system }] : []),
      ...messages.map((m) => ({ role: m.role, content: toContent(m.content) })),
    ];

    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        // OpenRouter asks for these to attribute traffic; they are not secrets.
        "HTTP-Referer": process.env.CLIENT_ORIGIN || "http://localhost:5173",
        "X-Title": "CivicLense",
      },
      body: JSON.stringify({ model, messages: payload, max_tokens: maxTokens, temperature }),
    });

    if (!res.ok) {
      const detail = await res.text();
      const err = new Error(detail.slice(0, 300));
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  },
};
