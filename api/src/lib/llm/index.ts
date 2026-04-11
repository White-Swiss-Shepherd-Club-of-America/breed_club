import type { LLMProvider, LLMModelConfig } from "./types.js";
import { AnthropicProvider } from "./anthropic.js";

export type { LLMProvider, LLMModelConfig, LLMMessage, LLMContentBlock, LLMChatParams, LLMChatResult } from "./types.js";

interface LLMConfig {
  provider: string;
  apiKey: string;
  modelFast: string;
  modelStrong: string;
}

/**
 * Create an LLM provider from environment config.
 * Throws if provider is unknown or apiKey is missing.
 */
export function createLLMProvider(config: LLMConfig): LLMProvider {
  if (!config.apiKey) {
    throw new Error("LLM_API_KEY is not configured");
  }

  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(config.apiKey);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

/**
 * Build model config from environment variables.
 */
export function getModelConfig(env: {
  LLM_MODEL_FAST?: string;
  LLM_MODEL_STRONG?: string;
}): LLMModelConfig {
  return {
    fast: env.LLM_MODEL_FAST || "claude-haiku-4-5-20251001",
    strong: env.LLM_MODEL_STRONG || "claude-sonnet-4-6",
  };
}

/**
 * Parse an LLM response that should be JSON.
 * Strips markdown code fences if present, retries parse on failure.
 */
export function parseLLMJson<T>(raw: string): T {
  let cleaned = raw.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  return JSON.parse(cleaned) as T;
}
