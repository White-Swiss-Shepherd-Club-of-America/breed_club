/**
 * Registration document extractor — given a classified document,
 * extract structured dog identity, registration, and pedigree data.
 *
 * Uses Haiku first, escalates to Sonnet for low confidence or complex documents.
 */

import type { LLMProvider, LLMModelConfig, LLMContentBlock } from "../llm/types.js";
import { parseLLMJson } from "../llm/index.js";
import { buildRegExtractionPrompt } from "./reg-prompts.js";
import { buildImageBlocks } from "./image-utils.js";
import type { ExtractedPedigree, CrossReference } from "@breed-club/shared";
import type {
  RegClassificationResult,
  RegExtractionRaw,
  RegExtractionResult,
} from "./reg-types.js";

/**
 * Extract structured fields from a classified registration document.
 */
export async function extractRegDoc(
  llm: LLMProvider,
  pageImages: string[],
  classification: RegClassificationResult,
  models: LLMModelConfig
): Promise<RegExtractionResult | null> {
  const prompt = buildRegExtractionPrompt({
    registry_name: classification.registry_name,
    registry_abbreviation: classification.registry_abbreviation,
    document_type: classification.document_type,
    language: classification.language,
  });

  const imageBlocks: LLMContentBlock[] = buildImageBlocks(pageImages);

  const content: LLMContentBlock[] = [
    ...imageBlocks,
    { type: "text", text: prompt },
  ];

  // Decide initial model: use strong model directly for export pedigrees
  // (they're complex, multilingual, and have dense pedigree trees)
  const initialModel = classification.document_type === "export_pedigree"
    ? models.strong
    : models.fast;

  let raw = await callRegExtractor(llm, initialModel, content);
  let escalated = initialModel === models.strong;
  let modelUsed: "fast" | "strong" = initialModel === models.strong ? "strong" : "fast";

  // Escalate simple registrations if needed
  if (raw && !escalated && shouldEscalateRegExtraction(raw)) {
    console.log("[reg-extractor] Escalating from fast to strong model");
    const strongResult = await callRegExtractor(llm, models.strong, content);
    if (strongResult) {
      raw = strongResult;
      escalated = true;
      modelUsed = "strong";
    }
  }

  if (!raw) {
    return null;
  }

  return normalizeRegExtraction(raw, classification, escalated, modelUsed);
}

async function callRegExtractor(
  llm: LLMProvider,
  model: string,
  content: LLMContentBlock[]
): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await llm.chat({
        model,
        messages: [{ role: "user", content }],
        max_tokens: 4096, // larger for pedigree trees
        temperature: 0,
      });

      console.log(
        `[reg-extractor] model=${model} tokens_in=${result.usage.input_tokens} tokens_out=${result.usage.output_tokens}`
      );

      const parsed = parseLLMJson<Record<string, unknown>>(result.content);
      if (parsed && typeof parsed.registered_name === "string") {
        return parsed;
      }

      console.warn("[reg-extractor] Invalid response shape, retrying...");
    } catch (err) {
      console.warn(
        `[reg-extractor] Attempt ${attempt + 1} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return null;
}

function shouldEscalateRegExtraction(raw: Record<string, unknown>): boolean {
  // Low confidence on key fields
  const nameConf = raw.registered_name_confidence;
  if (typeof nameConf === "number" && nameConf < 0.6) return true;

  const regConf = raw.registration_number_confidence;
  if (typeof regConf === "number" && regConf < 0.6) return true;

  // No registration number extracted
  if (!raw.registration_number) return true;

  // No name extracted
  if (!raw.registered_name) return true;

  return false;
}

function normalizeRegExtraction(
  raw: Record<string, unknown>,
  classification: RegClassificationResult,
  escalated: boolean,
  modelUsed: "fast" | "strong"
): RegExtractionResult {
  // Extract field confidences into a flat map
  const fieldConfidences: Record<string, number> = {};
  const confFields = [
    "registered_name", "registration_number", "breed", "sex",
    "date_of_birth", "color", "microchip",
  ];
  for (const f of confFields) {
    const key = f === "microchip" ? "microchip_confidence" : `${f}_confidence`;
    const val = raw[key];
    fieldConfidences[f] = typeof val === "number" ? val : 0;
  }

  // Compute overall confidence as average of key fields
  const keyFields = ["registered_name", "registration_number", "breed"];
  const keyConfs = keyFields.map((f) => fieldConfidences[f] || 0);
  const overallConfidence = keyConfs.length > 0
    ? keyConfs.reduce((a, b) => a + b, 0) / keyConfs.length
    : 0;

  // Normalize pedigree if present
  let pedigree: ExtractedPedigree | null = null;
  if (raw.pedigree && typeof raw.pedigree === "object") {
    pedigree = normalizePedigree(raw.pedigree as Record<string, unknown>);
  }

  // Normalize cross references
  let crossRefs: CrossReference[] = [];
  if (Array.isArray(raw.cross_references)) {
    crossRefs = raw.cross_references
      .filter((cr: unknown) => cr && typeof cr === "object")
      .map((cr: Record<string, unknown>) => ({
        registry: String(cr.registry || ""),
        number: String(cr.number || ""),
      }))
      .filter((cr) => cr.registry && cr.number);
  }

  return {
    registry_name: classification.registry_name,
    registry_abbreviation: classification.registry_abbreviation,
    registry_country: classification.registry_country,
    document_type: classification.document_type,

    registered_name: str(raw.registered_name) || "",
    registration_number: str(raw.registration_number) || "",
    breed: str(raw.breed) || "",
    sex: normalizeSex(raw.sex),
    date_of_birth: str(raw.date_of_birth),
    color: str(raw.color),
    microchip_number: str(raw.microchip_number),
    tattoo: str(raw.tattoo),
    dna_number: str(raw.dna_number),

    sire_name: str(raw.sire_name),
    sire_registration_number: str(raw.sire_registration_number),
    dam_name: str(raw.dam_name),
    dam_registration_number: str(raw.dam_registration_number),

    owner_name: str(raw.owner_name),
    owner_address: str(raw.owner_address),
    breeder_name: str(raw.breeder_name),

    certificate_date: str(raw.certificate_date),
    cross_references: crossRefs,
    pedigree,

    field_confidences: fieldConfidences,
    overall_confidence: overallConfidence,
    escalated,
    model_used: modelUsed,
  };
}

/**
 * Normalize a raw pedigree object from LLM output into our typed structure.
 */
function normalizePedigree(raw: Record<string, unknown>): ExtractedPedigree {
  const slots = [
    "sire", "dam",
    "sire_sire", "sire_dam", "dam_sire", "dam_dam",
    "sire_sire_sire", "sire_sire_dam", "sire_dam_sire", "sire_dam_dam",
    "dam_sire_sire", "dam_sire_dam", "dam_dam_sire", "dam_dam_dam",
  ] as const;

  const result: Record<string, { registered_name: string; registration_number?: string | null; titles?: string | null } | null> = {};

  for (const slot of slots) {
    const entry = raw[slot];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const e = entry as Record<string, unknown>;
      const name = str(e.registered_name);
      if (name) {
        result[slot] = {
          registered_name: name,
          registration_number: str(e.registration_number) || null,
          titles: str(e.titles) || null,
        };
      } else {
        result[slot] = null;
      }
    } else {
      result[slot] = null;
    }
  }

  return result as ExtractedPedigree;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function str(val: unknown): string | null {
  if (typeof val === "string" && val.trim()) return val.trim();
  return null;
}

function normalizeSex(val: unknown): "male" | "female" | null {
  if (typeof val !== "string") return null;
  const lower = val.toLowerCase().trim();
  if (["male", "macho", "dog", "hane", "кобель", "rüde", "mâle"].includes(lower)) return "male";
  if (["female", "hembra", "bitch", "hona", "сука", "hündin", "femelle"].includes(lower)) return "female";
  return null;
}
