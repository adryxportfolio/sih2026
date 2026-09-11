/**
 * OpenRouter gateway.
 *
 * Everything the app asks of an LLM goes through here so that:
 *   · the API key never leaves the server,
 *   · model choice is a routing decision, not scattered string literals,
 *   · every call is retried, fallen back, cost-accounted and audited.
 *
 * Tier routing rationale
 * ─────────────────────────────────────────────────────────────────────────
 *  fast       deepseek/deepseek-v4-flash   1M ctx, ~$0.09/M in. Text only.
 *             Bulk work: MCQ generation, summarisation, flashcard writing.
 *             The 1M window means a whole textbook fits in one call.
 *
 *  balanced   moonshotai/kimi-k2.5         262K ctx, VISION. ~$0.45/M in.
 *             Anything with pixels: scanned PDFs, diagrams, handwriting.
 *
 *  reasoning  moonshotai/kimi-k2.6         262K ctx, VISION, strongest.
 *             Judgement calls: competency diagnosis, learning-path planning,
 *             video quality vetting.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type ModelTier = "fast" | "balanced" | "reasoning";

function modelFor(tier: ModelTier): string {
  switch (tier) {
    case "fast":
      return Deno.env.get("MODEL_FAST") ?? "deepseek/deepseek-v4-flash";
    case "balanced":
      return Deno.env.get("MODEL_BALANCED") ?? "moonshotai/kimi-k2.5";
    case "reasoning":
      return Deno.env.get("MODEL_REASONING") ?? "moonshotai/kimi-k2.6";
  }
}

/** If the primary model fails hard, try this next. Vision-capable tiers stay vision-capable. */
function fallbackFor(tier: ModelTier): string | null {
  switch (tier) {
    case "fast":
      return Deno.env.get("MODEL_BALANCED") ?? "moonshotai/kimi-k2.5";
    case "balanced":
      return Deno.env.get("MODEL_REASONING") ?? "moonshotai/kimi-k2.6";
    case "reasoning":
      return Deno.env.get("MODEL_BALANCED") ?? "moonshotai/kimi-k2.5";
  }
}

export type ImagePart = { type: "image_url"; image_url: { url: string } };
export type TextPart = { type: "text"; text: string };
export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ChatOptions {
  tier?: ModelTier;
  model?: string;               // explicit override, skips tier routing
  messages: ChatMessage[];
  /** JSON Schema for strict structured output. Strongly preferred over prose parsing. */
  schema?: { name: string; schema: Record<string, unknown> };
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
  /** Audit context */
  task: string;
  userId?: string | null;
}

export interface ChatResult<T = unknown> {
  content: string;
  parsed: T | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
}

class UpstreamError extends Error {
  constructor(message: string, readonly status: number, readonly retryable: boolean) {
    super(message);
  }
}

async function callOnce(
  model: string,
  opts: ChatOptions,
  signal: AbortSignal,
): Promise<{ raw: any; latencyMs: number }> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new UpstreamError(
      "OPENROUTER_API_KEY is not configured on the server. Add it via `supabase secrets set`.",
      500,
      false,
    );
  }

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 4096,
    // Ask OpenRouter to return real accounting rather than us estimating it
    usage: { include: true },
  };

  if (opts.schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: opts.schema.name, strict: true, schema: opts.schema.schema },
    };
  }

  const started = Date.now();
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    signal,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/adryxportfolio/sih2026",
      "X-Title": "Samiksha - MoSPI Capacity Building",
    },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - started;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // 429 / 5xx are worth another go; 4xx generally are not.
    const retryable = res.status === 429 || res.status >= 500;
    throw new UpstreamError(`OpenRouter ${res.status}: ${text.slice(0, 500)}`, res.status, retryable);
  }

  return { raw: await res.json(), latencyMs };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Extract JSON from a model response. With strict schemas the content is
 * already clean JSON, but models occasionally wrap it in a fenced block —
 * so we degrade gracefully rather than throwing away a good answer.
 */
export function extractJson<T>(content: string): T | null {
  const attempts: string[] = [content];

  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) attempts.push(fence[1]);

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(content.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = content.indexOf("[");
  const lastBracket = content.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    attempts.push(content.slice(firstBracket, lastBracket + 1));
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate.trim()) as T;
    } catch { /* try the next shape */ }
  }
  return null;
}

export async function chat<T = unknown>(opts: ChatOptions): Promise<ChatResult<T>> {
  const tier = opts.tier ?? "fast";
  const primary = opts.model ?? modelFor(tier);
  const fallback = opts.model ? null : fallbackFor(tier);
  const maxRetries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 90_000;

  const models = fallback ? [primary, fallback] : [primary];
  let lastError: unknown = null;

  for (const model of models) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const { raw, latencyMs } = await callOnce(model, opts, controller.signal);
        clearTimeout(timer);

        const content: string = raw?.choices?.[0]?.message?.content ?? "";
        const usage = raw?.usage ?? {};
        const result: ChatResult<T> = {
          content,
          parsed: opts.schema ? extractJson<T>(content) : null,
          model: raw?.model ?? model,
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          costUsd: typeof usage.cost === "number" ? usage.cost : 0,
          latencyMs,
        };

        // A schema was requested but nothing parseable came back — treat as
        // a failed generation so retry/fallback gets a chance.
        if (opts.schema && result.parsed === null) {
          throw new UpstreamError(
            `Model ${model} returned unparseable JSON for schema "${opts.schema.name}"`,
            502,
            true,
          );
        }

        return result;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;

        const retryable = err instanceof UpstreamError
          ? err.retryable
          : (err as Error)?.name === "AbortError";

        if (!retryable || attempt === maxRetries) break;

        // Exponential backoff with jitter — avoids thundering herd on 429s
        const backoff = Math.min(8000, 500 * 2 ** attempt) + Math.random() * 300;
        console.warn(`[openrouter] ${model} attempt ${attempt + 1} failed, retrying in ${Math.round(backoff)}ms`);
        await sleep(backoff);
      }
    }
    if (fallback && model === primary) {
      console.warn(`[openrouter] primary ${primary} exhausted, falling back to ${fallback}`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("OpenRouter call failed");
}

/** Fire-and-forget audit write. Never let logging failure break the request. */
export async function logGeneration(
  admin: { from: (t: string) => any },
  entry: {
    userId?: string | null;
    task: string;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    costUsd?: number;
    latencyMs?: number;
    success: boolean;
    errorMessage?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("ai_generations").insert({
      user_id: entry.userId ?? null,
      task: entry.task,
      model: entry.model,
      prompt_tokens: entry.promptTokens ?? null,
      completion_tokens: entry.completionTokens ?? null,
      total_cost_usd: entry.costUsd ?? null,
      latency_ms: entry.latencyMs ?? null,
      success: entry.success,
      error_message: entry.errorMessage ?? null,
      meta: entry.meta ?? {},
    });
  } catch (e) {
    console.error("[audit] failed to log generation", e);
  }
}
