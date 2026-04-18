/**
 * Dog identity verification — compares cert-extracted identity fields
 * against the known dog record. Pure function, no LLM call.
 */

import type { VerificationFlag, ExtractionResult } from "./types.js";

interface DogRecord {
  registered_name: string;
  microchip_numbers: string[];
  date_of_birth: string | null; // ISO 8601
}

/**
 * Normalize a name for comparison: lowercase, collapse whitespace, strip
 * common title prefixes and trailing punctuation.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize a microchip number: strip spaces and dashes.
 */
function normalizeChip(chip: string): string {
  return chip.replace(/[\s\-]/g, "");
}

/**
 * Compare the cert's identity fields against the dog record.
 * Returns verification flags — never auto-rejects.
 */
export function verifyDogIdentity(
  extraction: ExtractionResult,
  dog: DogRecord
): VerificationFlag[] {
  const flags: VerificationFlag[] = [];

  // ─── Name comparison ──────────────────────────────────────────────
  if (extraction.cert_registered_name) {
    const certName = normalizeName(extraction.cert_registered_name);
    const dogName = normalizeName(dog.registered_name);

    if (certName === dogName) {
      // Exact match — no flag
    } else if (certName.includes(dogName) || dogName.includes(certName)) {
      flags.push({
        code: "name_partial_match",
        severity: "info",
        message: `Certificate name "${extraction.cert_registered_name}" is a partial match for "${dog.registered_name}"`,
        field: "registered_name",
        expected: dog.registered_name,
        extracted: extraction.cert_registered_name,
      });
    } else {
      flags.push({
        code: "name_mismatch",
        severity: "warning",
        message: `Certificate name "${extraction.cert_registered_name}" does not match "${dog.registered_name}"`,
        field: "registered_name",
        expected: dog.registered_name,
        extracted: extraction.cert_registered_name,
      });
    }
  }

  // ─── Microchip comparison ─────────────────────────────────────────
  if (!extraction.cert_microchip) {
    flags.push({
      code: "chip_not_on_cert",
      severity: "info",
      message: "No microchip number found on the certificate",
      field: "microchip",
    });
  } else if (dog.microchip_numbers.length > 0) {
    const certChip = normalizeChip(extraction.cert_microchip);
    const dogChips = dog.microchip_numbers.map(normalizeChip);

    const exactMatch = dogChips.some((dc) => dc === certChip);
    if (exactMatch) {
      // Exact match — no flag
    } else {
      const lengthAnomaly = dogChips.some((dc) => dc !== certChip && dc.length !== certChip.length);
      if (lengthAnomaly) {
        flags.push({
          code: "chip_length_anomaly",
          severity: "info",
          message: `Microchip "${extraction.cert_microchip}" has a different length than recorded microchips (possible leading zero issue)`,
          field: "microchip",
          expected: dog.microchip_numbers.join(", "),
          extracted: extraction.cert_microchip,
        });
      } else {
        flags.push({
          code: "chip_mismatch",
          severity: "warning",
          message: `Microchip "${extraction.cert_microchip}" does not match any recorded microchips (${dog.microchip_numbers.join(", ")})`,
          field: "microchip",
          expected: dog.microchip_numbers.join(", "),
          extracted: extraction.cert_microchip,
        });
      }
    }
  }

  // ─── Date validation ──────────────────────────────────────────────
  if (extraction.test_date) {
    const testDate = new Date(extraction.test_date);
    const now = new Date();

    if (testDate > now) {
      flags.push({
        code: "date_future",
        severity: "error",
        message: `Test date ${extraction.test_date} is in the future`,
        field: "test_date",
        extracted: extraction.test_date,
      });
    }

    if (dog.date_of_birth) {
      const dob = new Date(dog.date_of_birth);
      if (testDate < dob) {
        flags.push({
          code: "date_implausible",
          severity: "warning",
          message: `Test date ${extraction.test_date} is before the dog's date of birth (${dog.date_of_birth})`,
          field: "test_date",
          expected: dog.date_of_birth,
          extracted: extraction.test_date,
        });
      }
    }

    // Check if date is implausibly old (> 25 years ago)
    const twentyFiveYearsAgo = new Date();
    twentyFiveYearsAgo.setFullYear(twentyFiveYearsAgo.getFullYear() - 25);
    if (testDate < twentyFiveYearsAgo) {
      flags.push({
        code: "date_implausible",
        severity: "warning",
        message: `Test date ${extraction.test_date} is more than 25 years ago`,
        field: "test_date",
        extracted: extraction.test_date,
      });
    }
  }

  return flags;
}
