// Central place for configuration. Read lazily so scripts can load .env first.

export function env() {
  return {
    llmBaseUrl: (process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/").replace(/\/+$/, ""),
    llmApiKey: process.env.LLM_API_KEY || "",
    llmModel: process.env.LLM_MODEL || "gemini-3.6-flash",
    llmFallbackModels: (process.env.LLM_FALLBACK_MODELS || "gemini-3.5-flash,gemini-3.5-flash-lite")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    embedModel: process.env.EMBED_MODEL || "gemini-embedding-001",
    embedDimensions: Number(process.env.EMBED_DIMENSIONS || 768),
    upstashUrl: process.env.UPSTASH_REDIS_REST_URL || "",
    upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN || "",
  };
}
