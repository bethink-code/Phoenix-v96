// Minimal OpenAI Chat Completions client. We don't need the full SDK for
// one call site — `fetch` to /v1/chat/completions is enough and keeps
// dependencies lean. Returns the parsed JSON response plus token counts
// for cost accounting.
//
// Used by the autoresearch orchestrator. The model is supplied per call
// so the operator can pick gpt-4o-mini for cheap exploration or gpt-4o
// for quality.

const OPENAI_BASE = "https://api.openai.com/v1";

// Per-1M-token pricing in USD. Used for cost accounting in the iteration
// rows. These are best-effort approximations — keep them in sync with
// platform.openai.com/docs/pricing if the rates change. The cost shown
// in the UI is informational, not billing-of-record (OpenAI bills you
// directly per their actual rates).
const PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10.0 },
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
  "gpt-4-turbo": { inputPerM: 10.0, outputPerM: 30.0 },
};

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export async function chat(args: {
  model: string;
  messages: ChatMessage[];
  // Forcing JSON mode means the model returns valid JSON we can parse
  // directly. We use this for the orchestrator's "propose next params"
  // call so we never have to wrestle with markdown fences or chatter.
  responseFormat?: "text" | "json_object";
  temperature?: number;
}): Promise<ChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to Doppler dev: " +
        "doppler secrets set OPENAI_API_KEY=sk-... --config dev"
    );
  }

  const body: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
    temperature: args.temperature ?? 0.7,
  };
  if (args.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Strip any "sk-..." substrings from the error body so the partial
    // key OpenAI sometimes echoes back doesn't end up persisted in the
    // iteration row or shown in the live feed.
    const sanitized = text.replace(/sk-[A-Za-z0-9_\-.*]+/g, "[redacted-key]").slice(0, 500);
    const err = new Error(`openai chat ${res.status}: ${sanitized}`) as Error & {
      status?: number;
      isPermanent?: boolean;
    };
    err.status = res.status;
    // Permanent failures (4xx that won't get better with retries):
    // 401 invalid key, 403 wrong perms, 400 bad request, 404 model
    // not found. The orchestrator uses isPermanent to abort the
    // session entirely instead of crashing every iteration in a row.
    err.isPermanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw err;
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string | null } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  const text = data.choices[0]?.message?.content ?? "";
  const inputTokens = data.usage.prompt_tokens;
  const outputTokens = data.usage.completion_tokens;
  const pricing = PRICING[args.model] ?? PRICING["gpt-4o"];
  const costUsd =
    (inputTokens / 1_000_000) * pricing.inputPerM +
    (outputTokens / 1_000_000) * pricing.outputPerM;

  return { text, inputTokens, outputTokens, costUsd };
}

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
