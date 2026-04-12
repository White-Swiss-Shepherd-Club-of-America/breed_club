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
 * Handles markdown code fences, leading/trailing prose, and extracts the
 * first complete JSON object or array from the response.
 */
export function parseLLMJson<T>(raw: string): T {
  let cleaned = raw.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  // Use a lenient regex that tolerates multiple newlines after the opening fence
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // If it already parses, we're done
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through to extraction heuristics
  }

  // Extract the first JSON object {...} or array [...] from the text.
  // This handles cases where the model adds prose before or after the JSON.
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);

  // Pick whichever appears first in the string
  let candidate: string | null = null;
  if (objMatch && arrMatch) {
    candidate = cleaned.indexOf(objMatch[0]) <= cleaned.indexOf(arrMatch[0]) ? objMatch[0] : arrMatch[0];
  } else if (objMatch) {
    candidate = objMatch[0];
  } else if (arrMatch) {
    candidate = arrMatch[0];
  }

  if (candidate) {
    return JSON.parse(candidate) as T;
  }

  // Nothing worked — let JSON.parse throw its own error with the original content
  return JSON.parse(cleaned) as T;
}
