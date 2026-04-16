/**
 * Cert classifier — determines which (test, org) pair(s) a cert represents.
 */

import type { LLMProvider, LLMModelConfig, LLMContentBlock } from "../llm/types.js";
import { parseLLMJson } from "../llm/index.js";
import { buildClassificationPrompt } from "./prompts.js";
import { formatCatalogForPrompt } from "./catalog.js";
import { buildImageBlocks } from "./image-utils.js";
import type { TestOrgCatalog, ClassificationResult, ClassificationMatch } from "./types.js";

interface ClassificationRaw {
  matches: Array<{
    pair_id: string;
    confidence: number;
    reasoning: string;
  }>;
  cert_type: string;
  issuing_org_name: string;
  unmatched_tests: string[];
}

/**
 * Classify a cert image against the club's (test, org) catalog.
 * Implements retry and Haiku→Sonnet escalation.
 */
export async function classifyCert(
  llm: LLMProvider,
  pageImages: string[], // base64-encoded PNGs
  catalog: TestOrgCatalog,
  models: LLMModelConfig
): Promise<ClassificationResult> {
  const catalogJson = formatCatalogForPrompt(catalog);
  const prompt = buildClassificationPrompt(catalogJson);

  // Build image content blocks — send all rendered pages so the classifier
  // can identify tests that appear on later pages (panels, combined reports).
  const imageBlocks: LLMContentBlock[] = buildImageBlocks(pageImages);

  const content: LLMContentBlock[] = [
    ...imageBlocks,
    { type: "text", text: prompt },
  ];

  // Try with fast model first
  let raw = await callClassifier(llm, models.fast, content);
  let escalated = false;

  if (raw && shouldEscalateClassification(raw, catalog)) {
    console.log("[classifier] Escalating from fast to strong model");
    const strongResult = await callClassifier(llm, models.strong, content);
    if (strongResult) {
      raw = strongResult;
      escalated = true;
    }
  }

  if (!raw) {
    return {
      matches: [],
      cert_type: "unknown",
      issuing_org_name: "",
      unmatched_tests: [],
      escalated,
    };
  }

  // Validate pair_ids exist in catalog
  const validPairIds = new Set(catalog.pairs.map((p) => p.id));
  const validMatches = raw.matches.filter((m) => validPairIds.has(m.pair_id));

  const certType = normalizeCertType(raw.cert_type);

  return {
    matches: validMatches,
    cert_type: certType,
    issuing_org_name: raw.issuing_org_name || "",
    unmatched_tests: raw.unmatched_tests || [],
    escalated,
  };
}

async function callClassifier(
  llm: LLMProvider,
  model: string,
  content: LLMContentBlock[]
): Promise<ClassificationRaw | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await llm.chat({
        model,
        messages: [{ role: "user", content }],
        max_tokens: 1024,
        temperature: 0,
      });

      console.log(
        `[classifier] model=${model} tokens_in=${result.usage.input_tokens} tokens_out=${result.usage.output_tokens}`
      );

      const parsed = parseLLMJson<ClassificationRaw>(result.content);
      if (parsed && Array.isArray(parsed.matches)) {
        return parsed;
      }

      console.warn("[classifier] Invalid response shape, retrying...");
    } catch (err) {
      console.warn(
        `[classifier] Attempt ${attempt + 1} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return null;
}

function shouldEscalateClassification(
  raw: ClassificationRaw,
  catalog: TestOrgCatalog
): boolean {
  // No matches at all
  if (raw.matches.length === 0) return true;

  // Any match below 0.85 confidence
  if (raw.matches.some((m) => m.confidence < 0.85)) return true;

  // Any pair_id not in catalog (hallucinated)
  const validPairIds = new Set(catalog.pairs.map((p) => p.id));
  if (raw.matches.some((m) => !validPairIds.has(m.pair_id))) return true;

  return false;
}

function normalizeCertType(
  raw: string
): "single_result" | "panel" | "imaging_report" | "unknown" {
  switch (raw) {
    case "single_result":
    case "panel":
    case "imaging_report":
      return raw;
    default:
      return "unknown";
  }
}
