/**
 * Server-side form_data validation and label snapshotting.
 * Shared by both public and authenticated application endpoints.
 */

import type { FormDataEntry } from "../db/schema.js";

interface FormFieldConfig {
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
}

/**
 * Validate submitted form_data against configured form fields.
 * - Rejects unknown field_keys
 * - Enforces required fields
 * - Snapshots label/field_type from DB (don't trust client values)
 *
 * Returns the sanitized form_data array with server-side labels.
 */
export function validateFormData(
  submitted: FormDataEntry[] | null | undefined,
  configuredFields: FormFieldConfig[]
): FormDataEntry[] | null {
  if (!submitted || submitted.length === 0) {
    // Check if any required fields exist
    const missingRequired = configuredFields.filter((f) => f.required);
    if (missingRequired.length > 0) {
      const fieldNames = missingRequired.map((f) => f.label).join(", ");
      throw new FormDataValidationError(
        `Required form fields are missing: ${fieldNames}`
      );
    }
    return null;
  }

  const fieldMap = new Map(configuredFields.map((f) => [f.field_key, f]));
  const sanitized: FormDataEntry[] = [];

  for (const entry of submitted) {
    const config = fieldMap.get(entry.field_key);
    if (!config) {
      // Skip unknown fields silently (don't error, just ignore)
      continue;
    }

    // Snapshot label and field_type from server config
    sanitized.push({
      field_key: entry.field_key,
      label: config.label,
      field_type: config.field_type,
      value: entry.value,
    });
  }

  // Check required fields have non-empty values
  for (const field of configuredFields) {
    if (!field.required) continue;
    const entry = sanitized.find((e) => e.field_key === field.field_key);
    if (!entry || isEmpty(entry.value)) {
      throw new FormDataValidationError(
        `"${field.label}" is required`
      );
    }
  }

  return sanitized.length > 0 ? sanitized : null;
}

function isEmpty(value: string | string[] | boolean | null): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false; // booleans (even false) are not empty
}

export class FormDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormDataValidationError";
  }
}
