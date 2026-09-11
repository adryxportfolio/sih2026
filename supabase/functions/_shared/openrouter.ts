/**
 * OpenRouter gateway.
 *
 * TWO MODELS, WITH A CLEAR DIVISION OF LABOUR
 * ─────────────────────────────────────────────────────────────────────────
 *   TEXT    deepseek/deepseek-v4-flash    1M ctx · ~$0.09/M in · text only
 *   VISION  moonshotai/kimi-k2.5          262K ctx · ~$0.45/M in · sees images
 *
 * Everything that is words goes to DeepSeek. Its 1M window means an entire
 * training handbook fits in one call, so generated questions cannot
 * contradict each other across chunk boundaries, and at $0.09/M a full quiz
 * from a 150-page PDF costs well under a cent — which is what makes
 * per-learner, on-demand generation viable for a workforce of thousands.
 *
 * Kimi k2.5 is called for one job only: reading pages that have no text
 * layer. A large share of Indian government training material is scanned,
 * and a text-only pipeline would silently index those as empty documents and
 * then generate confident nonsense from nothing. Vision is 5× the price, so
 * it runs only when the cheap path has already demonstrably failed.
 *
 * Note that document *parsing* is not an AI problem and no model touches it:
 * PDFs go through unpdf's text layer, PPTX/DOCX are ZIP archives of XML that
 * we read directly. Using a vision model there would be slower, costlier and
 * less accurate than reading the file format.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Text workhorse. */
export function activeModel(): string {
  return Deno.env.get("MODEL_PRIMARY") ?? "deepseek/deepseek-v4-flash";
}

/** Vision specialist, used only for pages with no extractable text. */
export function visionModel(): string {
  return Deno.env.get("MODEL_VISION") ?? "moonshotai/kimi-k2.5";
}

export function modelSupportsVision(): boolean {
  return Boolean(visionModel());
}

export type ImagePart = { type: "image_url"; image_url: { url: string } };
export type TextPart = { type: "text"; text: string };
export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ChatOptions {
  /** Route to the vision model. Only set this when the payload has images. */
  vision?: boolean;
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
  const model = opts.vision ? visionModel() : activeModel();
  const maxRetries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 90_000;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const { raw, latencyMs } = await callOnce(model, opts, controller.signal);
      clearTimeout(timer);

      const msg = raw?.choices?.[0]?.message ?? {};
      // Reasoning models put the visible answer in `content` and their scratch
      // work in `reasoning_content`. Prefer content; fall back so a
      // reasoning-only response is never silently treated as empty.
      const content: string = msg.content ?? msg.reasoning_content ?? "";
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

      // A schema was requested but nothing parseable came back — treat as a
      // failed generation so the retry gets a chance.
      if (opts.schema && result.parsed === null) {
        throw new UpstreamError(
          `Model returned unparseable JSON for schema "${opts.schema.name}"`,
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

      // Exponential backoff with jitter — avoids hammering a rate limit.
      const backoff = Math.min(8000, 500 * 2 ** attempt) + Math.random() * 300;
      console.warn(`[openrouter] attempt ${attempt + 1} failed, retrying in ${Math.round(backoff)}ms`);
      await sleep(backoff);
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
