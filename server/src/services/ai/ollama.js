/**
 * Ollama — models running on your own machine. No key, no quota, no network
 * dependency, which makes it the safest option for a live demo on conference
 * wifi. Slower, and quality drops noticeably on the JSON-shaped tasks.
 *
 *   ollama pull llava        # vision
 *   ollama pull llama3.2     # text
 */
const HOST = () => process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

export const ollama = {
  label: "Ollama (local)",
  envKey: "OLLAMA_HOST",
  vision: true,
  // Whether it can be shown two images and reason about both.
  vision_comparison: true,
  defaultModel: "llava",
  configured: () => true, // no key; failure surfaces as a connection error instead

  async complete({ messages, system, maxTokens, temperature }) {
    const model = process.env.OLLAMA_MODEL || "llava";

    /* Ollama keeps images in a sibling array rather than inline in the content. */
    const payload = [
      ...(system ? [{ role: "system", content: system }] : []),
      ...messages.map((m) => {
        if (typeof m.content === "string") return { role: m.role, content: m.content };

        const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        const images = m.content.filter((b) => b.type === "image").map((b) => b.data);
        return { role: m.role, content: text, ...(images.length ? { images } : {}) };
      }),
    ];

    let res;
    try {
      res = await fetch(`${HOST()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: payload,
          stream: false,
          options: { temperature, num_predict: maxTokens },
        }),
      });
    } catch (cause) {
      const err = new Error(`Could not reach Ollama at ${HOST()}. Is it running?`);
      err.status = 503;
      throw err;
    }

    if (!res.ok) {
      const detail = await res.text();
      const err = new Error(detail.slice(0, 300));
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    return data.message?.content || "";
  },
};
