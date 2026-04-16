/**
 * Registration document classifier — identifies the issuing kennel club
 * and document type from a certificate image.
 *
 * Uses Haiku first, escalates to Sonnet if confidence is low.
 */

import type { LLMProvider, LLMModelConfig, LLMContentBlock } from "../llm/types.js";
import { parseLLMJson } from "../llm/index.js";
import { buildRegClassificationPrompt } from "./reg-prompts.js";
import { buildImageBlocks } from "./image-utils.js";
import type { RegClassificationRaw, RegClassificationResult } from "./reg-types.js";

interface KnownRegistry {
  name: string;
  abbreviation: string;
  country: string;
}

/**
 * Classify a registration document image.
 *
 * @param llm - LLM provider
 * @param pageImages - base64-encoded PNG page images for this document
 * @param knownRegistries - registries already in the DB (for prompt context)
 * @param models - fast/strong model config
 */
export async function classifyRegDoc(
  llm: LLMProvider,
  pageImages: string[],
  knownRegistries: KnownRegistry[],
  models: LLMModelConfig
): Promise<RegClassificationResult> {
  const prompt = buildRegClassificationPrompt(knownRegistries);

  const imageBlocks: LLMContentBlock[] = buildImageBlocks(pageImages);

  const content: LLMContentBlock[] = [
    ...imageBlocks,
    { type: "text", text: prompt },
  ];

  // Try fast model first
  let raw = await callRegClassifier(llm, models.fast, content);
  let escalated = false;

  if (raw && shouldEscalateRegClassification(raw)) {
    console.log("[reg-classifier] Escalating from fast to strong model");
    const strongResult = await callRegClassifier(llm, models.strong, content);
    if (strongResult) {
      raw = strongResult;
      escalated = true;
    }
  }

  if (!raw) {
    return {
      registry_name: "Unknown",
      registry_abbreviation: "UNK",
      registry_country: "XX",
      document_type: "registration",
      language: "English",
      confidence: 0,
      escalated,
    };
  }

  return {
    registry_name: raw.registry_name || "Unknown",
    registry_abbreviation: raw.registry_abbreviation || "UNK",
    registry_country: normalizeCountryCode(raw.registry_country),
    document_type: normalizeDocType(raw.document_type),
    language: raw.language || "English",
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
    escalated,
  };
}

async function callRegClassifier(
  llm: LLMProvider,
  model: string,
  content: LLMContentBlock[]
): Promise<RegClassificationRaw | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await llm.chat({
        model,
        messages: [{ role: "user", content }],
        max_tokens: 512,
        temperature: 0,
      });

      console.log(
        `[reg-classifier] model=${model} tokens_in=${result.usage.input_tokens} tokens_out=${result.usage.output_tokens}`
      );

      const parsed = parseLLMJson<RegClassificationRaw>(result.content);
      if (parsed && typeof parsed.registry_name === "string") {
        return parsed;
      }

      console.warn("[reg-classifier] Invalid response shape, retrying...");
    } catch (err) {
      console.warn(
        `[reg-classifier] Attempt ${attempt + 1} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return null;
}

function shouldEscalateRegClassification(raw: RegClassificationRaw): boolean {
  // Low confidence
  if (typeof raw.confidence === "number" && raw.confidence < 0.8) return true;

  // No registry identified
  if (!raw.registry_name || raw.registry_name === "Unknown") return true;

  return false;
}

function normalizeDocType(
  raw: string
): "registration" | "export_pedigree" | "pedigree" {
  switch (raw) {
    case "registration":
    case "export_pedigree":
    case "pedigree":
      return raw;
    default:
      return "registration";
  }
}

function normalizeCountryCode(raw: string | undefined): string {
  if (!raw) return "XX";
  // Ensure 2-letter uppercase
  const code = raw.trim().toUpperCase().slice(0, 2);
  return code.length === 2 ? code : "XX";
}
