/**
 * Cross-document verification for registration extractions.
 *
 * Compares fields across multiple extracted documents to detect
 * inconsistencies. Pure functions, no LLM calls.
 */

import type { RegExtractionResult, RegVerificationFlag } from "./reg-types.js";

/**
 * Verify a single extraction for internal consistency.
 * Checks date validity, missing critical fields, etc.
 */
export function verifySingleRegDoc(
  extraction: RegExtractionResult,
  documentIndex: number
): RegVerificationFlag[] {
  const flags: RegVerificationFlag[] = [];

  // ─── Missing critical fields ──────────────────────────────────────
  if (!extraction.registered_name) {
    flags.push({
      code: "missing_name",
      severity: "error",
      message: `Document ${documentIndex + 1}: Could not extract dog's registered name`,
      field: "registered_name",
    });
  }

  if (!extraction.registration_number) {
    flags.push({
      code: "missing_reg_number",
      severity: "error",
      message: `Document ${documentIndex + 1}: Could not extract registration number`,
      field: "registration_number",
    });
  }

  // ─── Date validation ──────────────────────────────────────────────
  if (extraction.date_of_birth) {
    const dob = new Date(extraction.date_of_birth);
    const now = new Date();

    if (isNaN(dob.getTime())) {
      flags.push({
        code: "invalid_dob",
        severity: "warning",
        message: `Document ${documentIndex + 1}: Date of birth "${extraction.date_of_birth}" is not a valid date`,
        field: "date_of_birth",
      });
    } else {
      if (dob > now) {
        flags.push({
          code: "dob_future",
          severity: "error",
          message: `Document ${documentIndex + 1}: Date of birth is in the future`,
          field: "date_of_birth",
        });
      }

      const thirtyYearsAgo = new Date();
      thirtyYearsAgo.setFullYear(thirtyYearsAgo.getFullYear() - 30);
      if (dob < thirtyYearsAgo) {
        flags.push({
          code: "dob_implausible",
          severity: "warning",
          message: `Document ${documentIndex + 1}: Date of birth is more than 30 years ago`,
          field: "date_of_birth",
        });
      }
    }
  }

  // ─── Low confidence warnings ──────────────────────────────────────
  const lowConfFields = Object.entries(extraction.field_confidences)
    .filter(([, conf]) => conf > 0 && conf < 0.7)
    .map(([field]) => field);

  if (lowConfFields.length > 0) {
    flags.push({
      code: "low_confidence",
      severity: "warning",
      message: `Document ${documentIndex + 1}: Low extraction confidence on: ${lowConfFields.join(", ")}`,
    });
  }

  // ─── Model escalation info ────────────────────────────────────────
  if (extraction.escalated) {
    flags.push({
      code: "model_escalated",
      severity: "info",
      message: `Document ${documentIndex + 1}: A more capable model was used due to initial low confidence`,
    });
  }

  return flags;
}

/**
 * Cross-verify multiple extractions against each other.
 * Detects disagreements in DOB, sex, and microchip across documents
 * that should be describing the same dog.
 */
export function crossVerifyRegDocs(
  extractions: RegExtractionResult[]
): RegVerificationFlag[] {
  if (extractions.length < 2) return [];

  const flags: RegVerificationFlag[] = [];

  // ─── DOB consistency ──────────────────────────────────────────────
  const dobs = extractions
    .map((e, i) => ({ dob: e.date_of_birth, idx: i, reg: e.registry_abbreviation }))
    .filter((e) => e.dob);

  if (dobs.length >= 2) {
    const uniqueDobs = new Set(dobs.map((d) => d.dob));
    if (uniqueDobs.size > 1) {
      const details = dobs.map((d) => `${d.reg}: ${d.dob}`).join(", ");
      flags.push({
        code: "dob_mismatch",
        severity: "error",
        message: `Date of birth differs across documents: ${details}`,
        field: "date_of_birth",
      });
    }
  }

  // ─── Sex consistency ──────────────────────────────────────────────
  const sexes = extractions
    .map((e, i) => ({ sex: e.sex, idx: i, reg: e.registry_abbreviation }))
    .filter((e) => e.sex);

  if (sexes.length >= 2) {
    const uniqueSexes = new Set(sexes.map((s) => s.sex));
    if (uniqueSexes.size > 1) {
      const details = sexes.map((s) => `${s.reg}: ${s.sex}`).join(", ");
      flags.push({
        code: "sex_mismatch",
        severity: "error",
        message: `Sex differs across documents: ${details}`,
        field: "sex",
      });
    }
  }

  // ─── Microchip consistency ────────────────────────────────────────
  const chips = extractions
    .map((e, i) => ({ chip: e.microchip_number, idx: i, reg: e.registry_abbreviation }))
    .filter((e) => e.chip);

  if (chips.length >= 2) {
    const normalized = chips.map((c) => ({
      ...c,
      normalized: normalizeChip(c.chip!),
    }));
    const uniqueChips = new Set(normalized.map((c) => c.normalized));
    if (uniqueChips.size > 1) {
      const details = chips.map((c) => `${c.reg}: ${c.chip}`).join(", ");
      flags.push({
        code: "chip_mismatch",
        severity: "warning",
        message: `Microchip number differs across documents: ${details}`,
        field: "microchip_number",
      });
    }
  }

  // ─── Name differences (informational — expected across registries) ─
  const names = extractions
    .map((e) => ({ name: e.registered_name, reg: e.registry_abbreviation }))
    .filter((e) => e.name);

  if (names.length >= 2) {
    const uniqueNames = new Set(names.map((n) => normalizeName(n.name)));
    if (uniqueNames.size > 1) {
      flags.push({
        code: "name_differs",
        severity: "info",
        message: "Registered name differs across documents — this is normal for different registries. You will be asked to choose or correct the official name.",
        field: "registered_name",
      });
    }
  }

  return flags;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeChip(chip: string): string {
  return chip.replace(/[\s\-]/g, "");
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}
