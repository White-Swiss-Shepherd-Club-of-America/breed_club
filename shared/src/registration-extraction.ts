/**
 * Shared Zod schemas and TypeScript types for the registration document
 * extraction pipeline. Used by both the API (extraction endpoint) and the
 * frontend (draft review component).
 */

import { z } from "zod";

// ─── Pedigree Ancestor ─────────────────────────────────────────────────────

export const pedigreeAncestorSchema = z.object({
  registered_name: z.string(),
  registration_number: z.string().nullish(),
  titles: z.string().nullish(),
});

export type PedigreeAncestor = z.infer<typeof pedigreeAncestorSchema>;

// ─── Extracted Pedigree Tree (from export pedigree documents) ──────────────

export const extractedPedigreeSchema = z.object({
  sire: pedigreeAncestorSchema.nullish(),
  dam: pedigreeAncestorSchema.nullish(),
  sire_sire: pedigreeAncestorSchema.nullish(),
  sire_dam: pedigreeAncestorSchema.nullish(),
  dam_sire: pedigreeAncestorSchema.nullish(),
  dam_dam: pedigreeAncestorSchema.nullish(),
  sire_sire_sire: pedigreeAncestorSchema.nullish(),
  sire_sire_dam: pedigreeAncestorSchema.nullish(),
  sire_dam_sire: pedigreeAncestorSchema.nullish(),
  sire_dam_dam: pedigreeAncestorSchema.nullish(),
  dam_sire_sire: pedigreeAncestorSchema.nullish(),
  dam_sire_dam: pedigreeAncestorSchema.nullish(),
  dam_dam_sire: pedigreeAncestorSchema.nullish(),
  dam_dam_dam: pedigreeAncestorSchema.nullish(),
});

export type ExtractedPedigree = z.infer<typeof extractedPedigreeSchema>;

// ─── Cross-reference to another registry ───────────────────────────────────

export const crossReferenceSchema = z.object({
  registry: z.string(),
  number: z.string(),
});

export type CrossReference = z.infer<typeof crossReferenceSchema>;

// ─── Per-Document Extraction Result ────────────────────────────────────────

export const regDocExtractionSchema = z.object({
  /** Index of this document in the uploaded batch (0-based). */
  document_index: z.number().int().min(0),

  // Registry identification
  registry_name: z.string(),           // e.g. "American Kennel Club"
  registry_abbreviation: z.string(),   // e.g. "AKC"
  registry_country: z.string(),        // ISO 3166-1 alpha-2, e.g. "US"
  document_type: z.enum(["registration", "export_pedigree", "pedigree"]),

  // Dog identity
  registered_name: z.string(),
  registration_number: z.string(),
  breed: z.string(),
  sex: z.enum(["male", "female"]).nullish(),
  date_of_birth: z.string().nullish(),  // ISO date or null
  color: z.string().nullish(),
  microchip_number: z.string().nullish(),
  tattoo: z.string().nullish(),
  dna_number: z.string().nullish(),

  // Lineage
  sire_name: z.string().nullish(),
  sire_registration_number: z.string().nullish(),
  dam_name: z.string().nullish(),
  dam_registration_number: z.string().nullish(),

  // People
  owner_name: z.string().nullish(),
  owner_address: z.string().nullish(),
  breeder_name: z.string().nullish(),

  // Certificate metadata
  certificate_date: z.string().nullish(),

  // References to other registries found on the document
  cross_references: z.array(crossReferenceSchema).optional(),

  // Full pedigree tree (populated for export_pedigree documents)
  pedigree: extractedPedigreeSchema.nullish(),

  // Confidence scores
  field_confidences: z.record(z.string(), z.number()),
  overall_confidence: z.number(),
  model_used: z.enum(["fast", "strong"]),

  // Verification flags for this document
  flags: z.array(z.object({
    code: z.string(),
    severity: z.enum(["info", "warning", "error"]),
    message: z.string(),
    field: z.string().optional(),
  })),
});

export type RegDocExtraction = z.infer<typeof regDocExtractionSchema>;

// ─── Conflict: a field where multiple documents disagree ───────────────────

export const regConflictValueSchema = z.object({
  value: z.string(),
  source_document: z.number().int(),
  registry: z.string(), // abbreviation
});

export const regConflictSchema = z.object({
  field: z.string(),
  values: z.array(regConflictValueSchema),
});

export type RegConflict = z.infer<typeof regConflictSchema>;

// ─── Merged Registration ───────────────────────────────────────────────────

export const mergedRegistrationSchema = z.object({
  /** Matched to an existing organization in the DB, if found. */
  organization_id: z.string().uuid().nullish(),
  /** Name as identified by the LLM — used for auto-creating unknown orgs. */
  organization_name: z.string(),
  organization_abbreviation: z.string(),
  organization_country: z.string(),
  registration_number: z.string(),
  /** Which uploaded document this came from. */
  document_index: z.number().int(),
});

export type MergedRegistration = z.infer<typeof mergedRegistrationSchema>;

// ─── Suggested (merged) Dog Fields ─────────────────────────────────────────

export const suggestedDogFieldsSchema = z.object({
  registered_name: z.string(),
  date_of_birth: z.string().nullish(),
  sex: z.enum(["male", "female"]).nullish(),
  color: z.string().nullish(),
  microchip_number: z.string().nullish(),
  sire_name: z.string().nullish(),
  sire_registration_number: z.string().nullish(),
  dam_name: z.string().nullish(),
  dam_registration_number: z.string().nullish(),
  owner_name: z.string().nullish(),
  breeder_name: z.string().nullish(),
  /** Best pedigree extracted (from the doc with the deepest tree). */
  pedigree: extractedPedigreeSchema.nullish(),
});

export type SuggestedDogFields = z.infer<typeof suggestedDogFieldsSchema>;

// ─── Top-Level Extraction Response ─────────────────────────────────────────

export const registrationExtractionResponseSchema = z.object({
  /** Per-document raw extractions. */
  documents: z.array(regDocExtractionSchema),

  /** Merged/suggested values across all documents. */
  suggested: suggestedDogFieldsSchema,

  /** Fields where documents disagree — UI should ask the user to resolve. */
  conflicts: z.array(regConflictSchema),

  /** All registrations to create (one per doc, possibly across multiple orgs). */
  registrations: z.array(mergedRegistrationSchema),

  /** R2 keys for stored original files. */
  certificate_urls: z.array(z.string()),

  /** If true, extraction couldn't produce useful results — show manual form. */
  fallback_to_manual: z.boolean(),
  fallback_reason: z.string().optional(),
});

export type RegistrationExtractionResponse = z.infer<typeof registrationExtractionResponseSchema>;
