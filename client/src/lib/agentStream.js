import { accessToken } from "./supabase.js";

const BASE = import.meta.env.VITE_API_URL || "";

/**
 * Runs the agent and yields each step as it arrives.
 *
 * EventSource cannot send an Authorization header or a POST body, so this reads
 * the SSE stream off fetch directly. Returns an abort function — navigating away
 * should stop the reader, though the run itself continues server-side and is
 * recorded either way.
 */
export function streamAgent(task, { onEvent, onError, onClose }) {
  const controller = new AbortController();

  (async () => {
    try {
      const token = await accessToken();

      const res = await fetch(`${BASE}/api/agent/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ task }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `The agent could not start (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; a partial frame stays buffered.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            onEvent(JSON.parse(line.slice(5).trim()));
          } catch {
            /* A malformed frame should not kill the run. */
          }
        }
      }

      onClose?.();
    } catch (err) {
      if (err.name !== "AbortError") onError?.(err.message);
    }
  })();

  return () => controller.abort();
}
