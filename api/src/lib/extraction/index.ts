/**
 * Certificate extraction pipeline — public API.
 */

// ─── Health cert extraction (existing) ──────────────────────────────────────
export { loadTestOrgCatalog, findCatalogPair, formatCatalogForPrompt } from "./catalog.js";
export { classifyCert } from "./classifier.js";
export { extractResults } from "./extractor.js";
export { verifyDogIdentity } from "./verifier.js";
export { buildDraftRows } from "./draft-builder.js";
export { buildExtractionPrompt, buildClassificationPrompt } from "./prompts.js";
export type {
  TestOrgCatalog,
  CatalogPair,
  ClassificationResult,
  ClassificationMatch,
  ExtractionResult,
  ExtractionDraft,
  ExtractionResponse,
  VerificationFlag,
} from "./types.js";

// ─── Shared utilities ──────────────────────────────────────────────────────
export { buildImageBlocks, detectImageMediaType } from "./image-utils.js";

// ─── Registration document extraction (new) ────────────────────────────────
export { classifyRegDoc } from "./reg-classifier.js";
export { extractRegDoc } from "./reg-extractor.js";
export { verifySingleRegDoc, crossVerifyRegDocs } from "./reg-verifier.js";
export { mergeRegExtractions, autoCreateMissingOrgs } from "./reg-merger.js";
export { buildRegClassificationPrompt, buildRegExtractionPrompt } from "./reg-prompts.js";
export type {
  RegClassificationResult,
  RegExtractionResult,
  RegVerificationFlag,
} from "./reg-types.js";
