import type { LLMProvider, LLMChatParams, LLMChatResult, LLMContentBlock } from "./types.js";

/**
 * Anthropic Messages API provider.
 * Uses raw fetch() — no SDK dependency, Workers-compatible.
 */
export class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://api.anthropic.com") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async chat(params: LLMChatParams): Promise<LLMChatResult> {
    const body = {
      model: params.model,
      max_tokens: params.max_tokens,
      temperature: params.temperature ?? 0,
      messages: params.messages.map((msg) => ({
        role: msg.role,
        content: typeof msg.content === "string"
          ? msg.content
          : msg.content.map((block) => this.toAnthropicBlock(block)),
      })),
    };

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(
        `Anthropic API error ${response.status}: ${errorText}`
      );
    }

    const result = await response.json() as {
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const textContent = result.content
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text!)
      .join("");

    return {
      content: textContent,
      usage: result.usage,
    };
  }

  private toAnthropicBlock(
    block: LLMContentBlock
  ): Record<string, unknown> {
    if (block.type === "text") {
      return { type: "text", text: block.text };
    }
    // Image block → Anthropic's image format
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: block.media_type,
        data: block.data,
      },
    };
  }
}
