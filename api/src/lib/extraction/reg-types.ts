/**
 * Internal types for the registration document extraction pipeline.
 * These are used within the API only; the shared response types are in
 * @breed-club/shared/registration-extraction.
 */

import type { ExtractedPedigree, CrossReference } from "@breed-club/shared";

// ─── Classification ─────────────────────────────────────────────────────────

/** Raw LLM output from the registration classifier. */
export interface RegClassificationRaw {
  registry_name: string;
  registry_abbreviation: string;
  registry_country: string;
  document_type: "registration" | "export_pedigree" | "pedigree";
  language: string;
  confidence: number;
  reasoning: string;
}

export interface RegClassificationResult {
  registry_name: string;
  registry_abbreviation: string;
  registry_country: string;
  document_type: "registration" | "export_pedigree" | "pedigree";
  language: string;
  confidence: number;
  escalated: boolean;
}

// ─── Extraction ─────────────────────────────────────────────────────────────

/** Raw LLM output from the registration extractor. */
export interface RegExtractionRaw {
  registered_name: string;
  registration_number: string;
  breed: string;
  sex: "male" | "female" | null;
  date_of_birth: string | null;
  color: string | null;
  microchip_number: string | null;
  tattoo: string | null;
  dna_number: string | null;

  sire_name: string | null;
  sire_registration_number: string | null;
  dam_name: string | null;
  dam_registration_number: string | null;

  owner_name: string | null;
  owner_address: string | null;
  breeder_name: string | null;

  certificate_date: string | null;
  cross_references: CrossReference[];

  pedigree: ExtractedPedigree | null;

  field_confidences: Record<string, number>;
}

/** Fully normalized extraction result for one document. */
export interface RegExtractionResult {
  // Classification info (carried forward)
  registry_name: string;
  registry_abbreviation: string;
  registry_country: string;
  document_type: "registration" | "export_pedigree" | "pedigree";

  // Extracted fields
  registered_name: string;
  registration_number: string;
  breed: string;
  sex: "male" | "female" | null;
  date_of_birth: string | null;
  color: string | null;
  microchip_number: string | null;
  tattoo: string | null;
  dna_number: string | null;

  sire_name: string | null;
  sire_registration_number: string | null;
  dam_name: string | null;
  dam_registration_number: string | null;

  owner_name: string | null;
  owner_address: string | null;
  breeder_name: string | null;

  certificate_date: string | null;
  cross_references: CrossReference[];
  pedigree: ExtractedPedigree | null;

  // Confidence
  field_confidences: Record<string, number>;
  overall_confidence: number;
  escalated: boolean;
  model_used: "fast" | "strong";
}

// ─── Verification Flags ─────────────────────────────────────────────────────

export interface RegVerificationFlag {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  field?: string;
}
