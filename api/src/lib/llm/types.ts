/**
 * Provider-agnostic LLM client interface.
 *
 * Clubs can swap providers by implementing this interface and setting
 * LLM_PROVIDER in their environment config.
 */

export interface LLMMessage {
  role: "user" | "assistant";
  content: string | LLMContentBlock[];
}

export type LLMContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; media_type: string; data: string }; // base64

export interface LLMChatParams {
  model: string;
  messages: LLMMessage[];
  max_tokens: number;
  temperature?: number;
}

export interface LLMChatResult {
  content: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface LLMProvider {
  chat(params: LLMChatParams): Promise<LLMChatResult>;
}

export interface LLMModelConfig {
  fast: string;   // cheap model for easy cases (e.g., Haiku)
  strong: string; // expensive model for hard cases (e.g., Sonnet)
}
