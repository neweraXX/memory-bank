// Thin client for any OpenAI-compatible API (default: Gemini).
// No SDK on purpose: two endpoints, plain fetch, easy to swap providers.

import { env } from "./env.ts";

export class LlmError extends Error {}

async function post(path: string, body: unknown, timeoutMs: number) {
  const { llmBaseUrl, llmApiKey } = env();
  if (!llmApiKey) throw new LlmError("LLM_API_KEY is not set");
  const res = await fetch(`${llmBaseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${llmApiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const retry = /"retryDelay":\s*"[\d.]+s"/.exec(text)?.[0] ?? "";
    throw new LlmError(`${path} ${res.status}: ${text.slice(0, 200)} ${retry}`);
  }
  return res.json();
}

export async function embed(texts: string[]): Promise<number[][]> {
  const { embedModel, embedDimensions } = env();
  const out: number[][] = [];
  // Gemini accepts up to 100 inputs per call.
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const data = await post("/embeddings", { model: embedModel, input: batch, dimensions: embedDimensions }, 60_000);
    for (const row of data.data) out.push(normalize(row.embedding));
  }
  return out;
}

function normalize(v: number[]) {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Ask for a JSON object. Tries the main model, then fallbacks: Gemini's free tier
// limits requests per minute PER MODEL, and returns 503 under load, so moving to
// the next model is usually faster than waiting. If every model is rate-limited,
// wait once for the delay the API asks for (capped) and go round again.
export async function chatJson<T>(
  messages: ChatMessage[],
  { timeoutMs = 60_000, maxWaitMs = 20_000 } = {},
): Promise<{ data: T; model: string }> {
  const { llmModel, llmFallbackModels } = env();
  const models = [llmModel, ...llmFallbackModels];
  let lastError: unknown;
  for (let round = 0; round < 2; round++) {
    let retryAfterMs = 0;
    for (const model of models) {
      try {
        const res = await post(
          "/chat/completions",
          { model, messages, temperature: 0.2, response_format: { type: "json_object" } },
          timeoutMs,
        );
        const content: string = res.choices?.[0]?.message?.content ?? "";
        return { data: JSON.parse(stripFences(content)) as T, model };
      } catch (err) {
        lastError = err;
        const msg = String(err);
        const delay = /retryDelay"?:\s*"(\d+(?:\.\d+)?)s/.exec(msg);
        if (delay) retryAfterMs = Math.max(retryAfterMs, Number(delay[1]) * 1000);
        const retryable = err instanceof SyntaxError || /\b(429|500|502|503|504)\b|timeout|aborted/i.test(msg);
        if (!retryable) throw new LlmError(msg);
      }
    }
    if (round === 0) await new Promise((r) => setTimeout(r, Math.min(maxWaitMs, retryAfterMs || 3000)));
  }
  throw new LlmError(`All models failed: ${String(lastError)}`);
}

function stripFences(s: string) {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
}
