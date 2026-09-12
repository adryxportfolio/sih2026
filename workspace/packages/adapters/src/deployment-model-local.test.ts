import { describe, expect, it } from "vitest";
import { resolveDeploymentModel } from "./deployment-model.js";

describe("resolveDeploymentModel with a local model server", () => {
  it("treats a declared local model as configured despite having no API key", () => {
    // Ollama ignores auth entirely. Without this, a working local deployment
    // reports itself unconfigured and every run is refused with "Connect a model".
    const resolved = resolveDeploymentModel({
      PI_DEFAULT_PROVIDER: "local",
      PI_DEFAULT_MODEL: "qwen3:1.7b",
      SAMIKSHA_LOCAL_MODELS: "qwen3:1.7b",
    } as NodeJS.ProcessEnv);

    expect(resolved.provider).toBe("local");
    expect(resolved.model).toBe("qwen3:1.7b");
    expect(resolved.key).toBe("local");
  });

  it("falls back to the first declared model when no default is named", () => {
    const resolved = resolveDeploymentModel({
      PI_DEFAULT_PROVIDER: "local",
      SAMIKSHA_LOCAL_MODELS: " qwen3:1.7b , llama3.2:3b ",
    } as NodeJS.ProcessEnv);

    expect(resolved.model).toBe("qwen3:1.7b");
  });

  it("stays unconfigured when local is selected but no model is declared", () => {
    // A mistyped provider should fail loudly rather than look configured.
    const resolved = resolveDeploymentModel({
      PI_DEFAULT_PROVIDER: "local",
      SAMIKSHA_LOCAL_MODELS: "",
    } as NodeJS.ProcessEnv);

    expect(resolved.key).toBeUndefined();
  });

  it("does not hand the local placeholder to a hosted provider", () => {
    const resolved = resolveDeploymentModel({
      PI_DEFAULT_PROVIDER: "openrouter",
      SAMIKSHA_LOCAL_MODELS: "qwen3:1.7b",
    } as NodeJS.ProcessEnv);

    expect(resolved.key).toBeUndefined();
  });
});
