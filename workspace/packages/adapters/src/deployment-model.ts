export const DEFAULT_OPENROUTER_MODEL_ID = "openai/gpt-5.6-luna";

/**
 * The deployment-wide model default: which provider a run falls back to when no user
 * credential applies, and the key for that provider.
 *
 * Vendor env names and model ids live here, in the adapter layer, not in core.
 */
export function resolveDeploymentModel(env: NodeJS.ProcessEnv = process.env) {
  const provider = env.PI_DEFAULT_PROVIDER?.trim() || "openrouter";
  // A row per provider that ships a deployment key. A third one adds a row here, not a
  // branch at each call site — and an unknown provider gets no key rather than another
  // vendor's, which a ternary on one provider would not give.
  const localModels = (env.SAMIKSHA_LOCAL_MODELS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const keys: Record<string, string | undefined> = {
    openrouter: env.OPENROUTER_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    // A local OpenAI-compatible server (Ollama, LM Studio) authenticates
    // nothing — it ignores the header entirely. But "has a deployment model"
    // is decided by whether this key is set, so leaving it undefined makes a
    // working Ollama deployment report itself as unconfigured and refuse every
    // run with "Connect a model". The provider already uses the literal
    // "local" as its placeholder credential, so reuse it here rather than
    // inventing a second sentinel. Gate on a model actually being declared:
    // a mistyped provider should fail loudly, not silently look configured.
    local: localModels.length > 0 ? "local" : undefined,
  };
  const models: Record<string, string> = {
    openrouter: DEFAULT_OPENROUTER_MODEL_ID,
    anthropic: "claude-sonnet-5",
  };
  // There is no sensible default model id for a local server — it serves
  // whatever the operator pulled — so fall back to the first declared one.
  const fallback = provider === "local" ? localModels[0] : undefined;
  return {
    provider,
    model: env.PI_DEFAULT_MODEL?.trim() || fallback || models[provider] || models.openrouter!,
    key: keys[provider],
  };
}
