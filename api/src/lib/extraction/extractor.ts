/**
 * Per-pair result extractor — given a classified (test, org) pair,
 * extract structured results from the cert image using the pair's result_schema.
 */

import type { LLMProvider, LLMModelConfig, LLMContentBlock } from "../llm/types.js";
import { parseLLMJson } from "../llm/index.js";
import { buildExtractionPrompt } from "./prompts.js";
import { findCatalogPair } from "./catalog.js";
import { buildImageBlocks } from "./image-utils.js";
import type { ResultSchema } from "../../db/schema.js";
import type {
  TestOrgCatalog,
  ClassificationMatch,
  ExtractionResult,
  EnumExtractionRaw,
  LRExtractionRaw,
} from "./types.js";

/**
 * Extract results for all classified matches.
 */
export async function extractResults(
  llm: LLMProvider,
  pageImages: string[], // base64-encoded PNGs
  matches: ClassificationMatch[],
  catalog: TestOrgCatalog,
  dog: { registered_name: string },
  models: LLMModelConfig
): Promise<ExtractionResult[]> {
  const results: ExtractionResult[] = [];

  for (const match of matches) {
    const pair = findCatalogPair(catalog, match.pair_id);
    if (!pair) continue;

    const schema = pair.result_schema;
    if (!schema) {
      // No schema configured — can't extract structured data
      console.warn(`[extractor] No result_schema for pair ${match.pair_id}, skipping`);
      continue;
    }

    const result = await extractSingleResult(
      llm,
      pageImages,
      pair,
      schema,
      dog,
      models
    );

    if (result) {
      results.push(result);
    }
  }

  return results;
}

async function extractSingleResult(
  llm: LLMProvider,
  pageImages: string[],
  pair: { id: string; health_test_type_id: string; organization_id: string; test_name: string; test_short_name: string; org_name: string; category?: string },
  schema: ResultSchema,
  dog: { registered_name: string },
  models: LLMModelConfig
): Promise<ExtractionResult | null> {
  const prompt = buildExtractionPrompt(
    schema,
    { name: pair.test_name, short_name: pair.test_short_name, category: pair.category },
    { name: pair.org_name },
    dog
  );

  // Send all rendered pages — for panels a test result may be on any page.
  const imageBlocks: LLMContentBlock[] = buildImageBlocks(pageImages);

  const content: LLMContentBlock[] = [
    ...imageBlocks,
    { type: "text", text: prompt },
  ];

  // Try with fast model
  let raw = await callExtractor(llm, models.fast, content);
  let escalated = false;

  if (raw && shouldEscalateExtraction(raw, schema)) {
    console.log(`[extractor] Escalating ${pair.id} from fast to strong model`);
    const strongResult = await callExtractor(llm, models.strong, content);
    if (strongResult) {
      raw = strongResult;
      escalated = true;
    }
  }

  if (!raw) {
    return null;
  }

  return normalizeExtraction(raw, schema, pair, escalated);
}

async function callExtractor(
  llm: LLMProvider,
  model: string,
  content: LLMContentBlock[]
): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await llm.chat({
        model,
        messages: [{ role: "user", content }],
        max_tokens: 2048,
        temperature: 0,
      });

      console.log(
        `[extractor] model=${model} tokens_in=${result.usage.input_tokens} tokens_out=${result.usage.output_tokens}`
      );

      const parsed = parseLLMJson<Record<string, unknown>>(result.content);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }

      console.warn("[extractor] Invalid response shape, retrying...");
    } catch (err) {
      console.warn(
        `[extractor] Attempt ${attempt + 1} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return null;
}

function shouldEscalateExtraction(
  raw: Record<string, unknown>,
  schema: ResultSchema
): boolean {
  if (schema.type === "enum") {
    const enumRaw = raw as Partial<EnumExtractionRaw>;
    // Low result confidence
    if (typeof enumRaw.result_confidence === "number" && enumRaw.result_confidence < 0.6) {
      return true;
    }
    // No result extracted
    if (!enumRaw.result) return true;
  } else {
    const lrRaw = raw as Partial<LRExtractionRaw>;
    // Check field confidences for any value < 0.6
    if (lrRaw.field_confidences) {
      for (const side of Object.values(lrRaw.field_confidences)) {
        if (typeof side === "object" && side) {
          for (const conf of Object.values(side as Record<string, number>)) {
            if (typeof conf === "number" && conf < 0.6) return true;
          }
        }
      }
    }
    // No result_data
    if (!lrRaw.result_data) return true;
  }

  // Low date confidence
  const dateConf = raw.test_date_confidence;
  if (typeof dateConf === "number" && dateConf < 0.6) return true;

  return false;
}

/**
 * Normalize the raw LLM extraction output into a consistent ExtractionResult.
 */
function normalizeExtraction(
  raw: Record<string, unknown>,
  schema: ResultSchema,
  pair: { id: string; health_test_type_id: string; organization_id: string; test_name: string; test_short_name: string; org_name: string },
  escalated: boolean
): ExtractionResult {
  const testDate = typeof raw.test_date === "string" ? raw.test_date : null;
  const certNumber = typeof raw.certificate_number === "string" ? raw.certificate_number : null;
  const certName = typeof raw.cert_registered_name === "string" ? raw.cert_registered_name : null;
  const certChip = typeof raw.cert_microchip === "string" ? raw.cert_microchip : null;

  const testDateConfidence = typeof raw.test_date_confidence === "number" ? raw.test_date_confidence : 0;
  const certNumConfidence = typeof raw.certificate_number_confidence === "number" ? raw.certificate_number_confidence : 0;

  if (schema.type === "enum") {
    const enumRaw = raw as Partial<EnumExtractionRaw>;
    const result = typeof enumRaw.result === "string" ? enumRaw.result : "";
    const resultConfidence = typeof enumRaw.result_confidence === "number" ? enumRaw.result_confidence : 0;

    // Validate result is in schema options
    let validatedResult = result;
    let resultConf = resultConfidence;
    if (result && !schema.options.includes(result)) {
      // Try case-insensitive match
      const match = schema.options.find(
        (opt) => opt.toLowerCase() === result.toLowerCase()
      );
      if (match) {
        validatedResult = match;
      } else {
        // Result not in options — keep it but flag confidence as 0
        resultConf = 0;
      }
    }

    // Check for OFA prelim fields (set by buildOfaPrelimHipPrompt / buildOfaPrelimElbowPrompt)
    const isPrelim = enumRaw.is_preliminary === true;
    const applicationNumber = typeof enumRaw.application_number === "string" ? enumRaw.application_number : null;
    if (isPrelim) {
      console.log(`[extractor] OFA prelim detected: is_preliminary=${isPrelim}, application_number=${applicationNumber}`);
    }
    // For prelim reports the LLM returns result_data with findings — preserve it
    const prelimResultData = (isPrelim && raw.result_data && typeof raw.result_data === "object")
      ? raw.result_data as Record<string, unknown>
      : null;

    return {
      pair_id: pair.id,
      health_test_type_id: pair.health_test_type_id,
      organization_id: pair.organization_id,
      test_name: pair.test_name,
      test_short_name: pair.test_short_name,
      org_name: pair.org_name,
      result: validatedResult,
      result_data: prelimResultData,
      test_date: testDate,
      certificate_number: isPrelim ? null : certNumber,
      raw_result_text: typeof enumRaw.raw_result_text === "string" ? enumRaw.raw_result_text : undefined,
      field_confidences: {
        result: resultConf,
        test_date: testDateConfidence,
        certificate_number: isPrelim ? 0 : certNumConfidence,
      },
      cert_registered_name: certName,
      cert_microchip: certChip,
      escalated,
      ...(isPrelim && { is_preliminary: true, application_number: applicationNumber }),
    };
  }

  // LR variants
  const lrRaw = raw as Partial<LRExtractionRaw>;
  const resultData = (lrRaw.result_data && typeof lrRaw.result_data === "object")
    ? lrRaw.result_data
    : {};

  // Flatten field confidences into a single map
  const fieldConfidences: Record<string, number> = {
    test_date: testDateConfidence,
    certificate_number: certNumConfidence,
  };

  if (lrRaw.field_confidences && typeof lrRaw.field_confidences === "object") {
    for (const [side, fields] of Object.entries(lrRaw.field_confidences)) {
      if (typeof fields === "object" && fields) {
        for (const [key, conf] of Object.entries(fields as Record<string, number>)) {
          fieldConfidences[`${side}.${key}`] = typeof conf === "number" ? conf : 0;
        }
      }
    }
  }

  // Compute result summary for LR types (same logic as server-side computeResultSummary)
  const resultSummary = computeLRResultSummary(resultData, schema);

  return {
    pair_id: pair.id,
    health_test_type_id: pair.health_test_type_id,
    organization_id: pair.organization_id,
    test_name: pair.test_name,
    test_short_name: pair.test_short_name,
    org_name: pair.org_name,
    result: resultSummary,
    result_data: resultData,
    test_date: testDate,
    certificate_number: certNumber,
    field_confidences: fieldConfidences,
    cert_registered_name: certName,
    cert_microchip: certChip,
    escalated,
  };
}

/**
 * Compute a result summary string from LR result_data.
 * Mirrors the server-side computeResultSummary.
 */
function computeLRResultSummary(
  resultData: Record<string, unknown>,
  schema: ResultSchema
): string {
  switch (schema.type) {
    case "numeric_lr": {
      const left = resultData.left as Record<string, number> | undefined;
      const right = resultData.right as Record<string, number> | undefined;
      if (!left || !right) return "";
      const parts = schema.fields.map(
        (f) => `${f.label}: L=${left[f.key]}, R=${right[f.key]}`
      );
      return parts.join("; ");
    }
    case "point_score_lr": {
      const left = resultData.left as Record<string, number> | undefined;
      const right = resultData.right as Record<string, number> | undefined;
      const total = resultData.total as number | undefined;
      if (left?.total != null && right?.total != null && total != null) {
        return `${total} (R:${right.total}, L:${left.total})`;
      }
      return "";
    }
    case "elbow_lr": {
      const left = resultData.left as { grade?: number } | undefined;
      const right = resultData.right as { grade?: number } | undefined;
      if (left && right) {
        return `L: Grade ${left.grade ?? "?"}, R: Grade ${right.grade ?? "?"}`;
      }
      return "";
    }
    case "enum_lr": {
      const left = resultData.left as { value?: string } | undefined;
      const right = resultData.right as { value?: string } | undefined;
      if (left && right) {
        return `L: ${left.value ?? "?"}, R: ${right.value ?? "?"}`;
      }
      return "";
    }
    default:
      return "";
  }
}
