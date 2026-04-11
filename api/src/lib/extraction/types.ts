/**
 * Shared types for the cert extraction pipeline.
 */

import type { ResultSchema } from "../../db/schema.js";

// ─── Catalog ────────────────────────────────────────────────────────────────

export interface CatalogPair {
  id: string; // "{healthTestTypeId}:{organizationId}"
  health_test_type_id: string;
  organization_id: string;
  test_name: string;
  test_short_name: string;
  org_name: string;
  org_type: string;
  category: string;
  result_schema: ResultSchema | null;
}

export interface TestOrgCatalog {
  pairs: CatalogPair[];
}

// ─── Classification ─────────────────────────────────────────────────────────

export interface ClassificationMatch {
  pair_id: string;
  confidence: number;
  reasoning: string;
}

export interface ClassificationResult {
  matches: ClassificationMatch[];
  cert_type: "single_result" | "panel" | "imaging_report" | "unknown";
  issuing_org_name: string;
  unmatched_tests: string[];
  escalated: boolean;
}

// ─── Extraction ─────────────────────────────────────────────────────────────

/** Raw extraction output from the LLM for an enum-type schema. */
export interface EnumExtractionRaw {
  result: string;
  result_confidence: number;
  raw_result_text: string;
  test_date: string | null;
  test_date_confidence: number;
  certificate_number: string | null;
  certificate_number_confidence: number;
  cert_registered_name: string | null;
  cert_microchip: string | null;
}

/** Raw extraction output from the LLM for LR-type schemas. */
export interface LRExtractionRaw {
  result_data: Record<string, unknown>;
  field_confidences: Record<string, Record<string, number>>;
  test_date: string | null;
  test_date_confidence: number;
  certificate_number: string | null;
  certificate_number_confidence: number;
  cert_registered_name: string | null;
  cert_microchip: string | null;
}

export interface ExtractionResult {
  pair_id: string;
  health_test_type_id: string;
  organization_id: string;
  test_name: string;
  test_short_name: string;
  org_name: string;

  result: string;
  result_data: Record<string, unknown> | null;
  test_date: string | null;
  certificate_number: string | null;
  raw_result_text?: string;

  /** Flat map of field name → confidence (0-1). */
  field_confidences: Record<string, number>;

  /** Info extracted for dog identity verification. */
  cert_registered_name: string | null;
  cert_microchip: string | null;

  escalated: boolean;
}

// ─── Verification Flags ─────────────────────────────────────────────────────

export interface VerificationFlag {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  field?: string;
  expected?: string;
  extracted?: string;
}

// ─── Draft Response ─────────────────────────────────────────────────────────

export interface ExtractionDraft {
  health_test_type_id: string;
  health_test_type_name: string;
  health_test_type_short_name: string;
  organization_id: string;
  organization_name: string;

  result: string;
  result_data: Record<string, unknown> | null;
  test_date: string | null;
  certificate_number: string | null;

  field_confidences: Record<string, number>;
  row_confidence: number;
  escalated: boolean;
  extraction_reliable: boolean;
  flags: VerificationFlag[];
  raw_result_text?: string;
}

export interface ExtractionResponse {
  certificate_url: string;
  drafts: ExtractionDraft[];
  fallback_to_manual: boolean;
  fallback_reason?: string;
}
