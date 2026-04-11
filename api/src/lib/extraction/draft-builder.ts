/**
 * Draft row builder — assembles ExtractionDraft[] from extraction
 * and verification results.
 */

import type {
  ClassificationResult,
  ExtractionResult,
  VerificationFlag,
  ExtractionDraft,
} from "./types.js";

const RELIABLE_THRESHOLD = 0.4;

/**
 * Compute row-level confidence as the minimum of all field confidences.
 */
function rowConfidence(fieldConfidences: Record<string, number>): number {
  const values = Object.values(fieldConfidences);
  if (values.length === 0) return 0;
  return Math.min(...values);
}

/**
 * Build draft clearance rows from the extraction pipeline output.
 */
export function buildDraftRows(
  classification: ClassificationResult,
  extractions: ExtractionResult[],
  verificationFlagsByPair: Map<string, VerificationFlag[]>,
  certificateUrl: string
): ExtractionDraft[] {
  return extractions.map((ext) => {
    const verificationFlags = verificationFlagsByPair.get(ext.pair_id) || [];

    // Add classifier confidence flag if uncertain
    const classMatch = classification.matches.find((m) => m.pair_id === ext.pair_id);
    const allFlags: VerificationFlag[] = [...verificationFlags];

    if (classMatch && classMatch.confidence < 0.85) {
      allFlags.push({
        code: "classifier_uncertain",
        severity: "warning",
        message: `Classifier matched this test with ${Math.round(classMatch.confidence * 100)}% confidence: ${classMatch.reasoning}`,
        field: "test_type",
      });
    }

    // Add escalation info flag
    if (ext.escalated || classification.escalated) {
      allFlags.push({
        code: "model_escalated",
        severity: "info",
        message: "A more capable model was used for this extraction due to initial low confidence",
      });
    }

    // Check for low extraction confidence
    const lowConfFields = Object.entries(ext.field_confidences)
      .filter(([, conf]) => conf > 0 && conf < 0.7)
      .map(([field]) => field);

    if (lowConfFields.length > 0) {
      allFlags.push({
        code: "low_extraction_confidence",
        severity: "warning",
        message: `Low confidence on: ${lowConfFields.join(", ")}`,
        field: lowConfFields[0],
      });
    }

    // Check for result not in options (for enum types)
    if (ext.result && ext.field_confidences.result === 0 && !ext.result_data) {
      allFlags.push({
        code: "result_not_in_options",
        severity: "error",
        message: `Extracted result "${ext.result}" does not match any valid option`,
        field: "result",
        extracted: ext.result,
      });
    }

    const conf = rowConfidence(ext.field_confidences);

    return {
      health_test_type_id: ext.health_test_type_id,
      health_test_type_name: ext.test_name,
      health_test_type_short_name: ext.test_short_name,
      organization_id: ext.organization_id,
      organization_name: ext.org_name,
      result: ext.result,
      result_data: ext.result_data,
      test_date: ext.test_date,
      certificate_number: ext.certificate_number,
      field_confidences: ext.field_confidences,
      row_confidence: conf,
      escalated: ext.escalated || classification.escalated,
      extraction_reliable: conf >= RELIABLE_THRESHOLD,
      flags: allFlags,
      raw_result_text: ext.raw_result_text,
    };
  });
}
