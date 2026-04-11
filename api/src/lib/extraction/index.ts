/**
 * Certificate extraction pipeline — public API.
 */

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
