/**
 * Prompt builders for cert classification and per-schema-variant extraction.
 */

import type { ResultSchema } from "../../db/schema.js";
import type {
  ResultSchemaEnum,
  ResultSchemaNumericLR,
  ResultSchemaPointScoreLR,
  ResultSchemaEnumLR,
} from "@breed-club/shared";

// ─── Classification Prompt ──────────────────────────────────────────────────

export function buildClassificationPrompt(catalogJson: string): string {
  return `You are a veterinary health certificate classifier. Given an image of a dog health certificate, identify which test(s) and issuing organization(s) it represents.

CATALOG of recognized (test, organization) pairs:
${catalogJson}

INSTRUCTIONS:
1. Examine the certificate image carefully.
2. Identify the issuing organization (lab name, logo, header).
3. Identify which health test(s) are reported.
4. Match each test to the closest entry in the CATALOG above.
5. If the cert contains multiple test results (panel), return all matching pairs.
6. If no catalog entry matches, return an empty matches array.

RESPOND with this exact JSON structure (no markdown fencing):
{
  "matches": [
    {
      "pair_id": "<id from catalog>",
      "confidence": <0.0 to 1.0>,
      "reasoning": "<one sentence>"
    }
  ],
  "cert_type": "single_result" | "panel" | "imaging_report" | "unknown",
  "issuing_org_name": "<organization name as printed on cert>",
  "unmatched_tests": ["<test name from cert not in catalog>"]
}

RULES:
- Only return matches for tests that are explicitly present on the certificate with results.
- confidence 0.9+ means the match is unambiguous.
- confidence 0.5-0.89 means plausible but uncertain.
- confidence below 0.5 means you are guessing — include it but flag it.
- Do NOT extract results in this step. Only classify.
- Ignore owner names, addresses, veterinarian info, and any PII.`;
}

// ─── Extraction Preamble ────────────────────────────────────────────────────

function buildPreamble(
  testType: { name: string; short_name: string },
  org: { name: string },
  dog: { registered_name: string }
): string {
  return `You are extracting structured health test results from a veterinary certificate image.

CONTEXT:
- Dog's registered name (expected): ${dog.registered_name}
- Test: ${testType.name} (${testType.short_name})
- Organization: ${org.name}

RULES:
- Extract ONLY the fields specified below. Do not invent data.
- Dates MUST be ISO 8601 format (YYYY-MM-DD) regardless of how they appear on the certificate.
- "test_date" is the date of the biological sample or imaging study, NOT the report-issued date. Look for: "Date of Study", "Date Xrayed", "Sample Date", "Collection Date". Fall back to report date only if study date is absent.
- "certificate_number" is the cert/report/case ID number, NOT a registration number.
- Ignore all PII: owner names, addresses, emails, phone numbers, vet contact info, lab signatories.
- For each extracted field, report a confidence score (0.0 to 1.0).
- If a field is not visible on the certificate, set its value to null and confidence to 0.

`;
}

// ─── Per-Variant Extraction Prompts ─────────────────────────────────────────

function buildEnumPrompt(schema: ResultSchemaEnum): string {
  return `This test uses an ENUM result. The valid options are:
${JSON.stringify(schema.options)}

Extract the test result and match it to the closest valid option above.

RESPOND with this exact JSON (no markdown fencing):
{
  "result": "<one of the valid options, exactly as listed>",
  "result_confidence": <0.0-1.0>,
  "raw_result_text": "<the exact text on the certificate>",
  "test_date": "<YYYY-MM-DD or null>",
  "test_date_confidence": <0.0-1.0>,
  "certificate_number": "<string or null>",
  "certificate_number_confidence": <0.0-1.0>,
  "cert_registered_name": "<dog name as printed on cert or null>",
  "cert_microchip": "<microchip as printed on cert or null>"
}

IMPORTANT: The result MUST be one of the exact option strings listed above. If the certificate uses different wording, map it to the closest option. For example:
- "N/N" or "Normal" or "CLEAR" → map to the clear/normal option
- "N/M" or "CARRIER" → map to the carrier option
- "M/M" or "AFFECTED" or "AT RISK" → map to the affected option
Include your mapping reasoning in raw_result_text.`;
}

function buildNumericLRPrompt(schema: ResultSchemaNumericLR): string {
  const fieldDescs = schema.fields
    .map((f) => {
      let desc = `- ${f.label} (key: "${f.key}"`;
      if (f.unit) desc += `, unit: ${f.unit}`;
      if (f.min != null) desc += `, range: ${f.min}-${f.max}`;
      if (f.step != null) desc += `, precision: ${f.step}`;
      desc += ")";
      return desc;
    })
    .join("\n");

  const fieldKeys = schema.fields.map((f) => `"${f.key}": <number or null>`).join(", ");
  const confKeys = schema.fields.map((f) => `"${f.key}": <0.0-1.0>`).join(", ");

  return `This test uses BILATERAL NUMERIC measurements. Extract left and right values for these fields:
${fieldDescs}

RESPOND with this exact JSON (no markdown fencing):
{
  "result_data": {
    "left": { ${fieldKeys} },
    "right": { ${fieldKeys} }
  },
  "field_confidences": {
    "left": { ${confKeys} },
    "right": { ${confKeys} }
  },
  "test_date": "<YYYY-MM-DD or null>",
  "test_date_confidence": <0.0-1.0>,
  "certificate_number": "<string or null>",
  "certificate_number_confidence": <0.0-1.0>,
  "cert_registered_name": "<dog name as printed on cert or null>",
  "cert_microchip": "<microchip as printed on cert or null>"
}

The left/right designation should match the certificate. If the certificate labels sides as "Left"/"Right", map directly. If it uses "L"/"R", map accordingly.`;
}

function buildPointScoreLRPrompt(schema: ResultSchemaPointScoreLR): string {
  const subcatDescs = schema.subcategories
    .map((sc) => `- ${sc.label} (key: "${sc.key}", max: ${sc.max})`)
    .join("\n");

  const subcatKeys = schema.subcategories
    .map((sc) => `"${sc.key}": <integer 0-${sc.max} or null>`)
    .join(", ");
  const confKeys = schema.subcategories
    .map((sc) => `"${sc.key}": <0.0-1.0>`)
    .join(", ");

  return `This test uses BILATERAL POINT SCORES with subcategories. Extract left and right scores for:
${subcatDescs}

RESPOND with this exact JSON (no markdown fencing):
{
  "result_data": {
    "left": { ${subcatKeys}, "total": <sum of left scores> },
    "right": { ${subcatKeys}, "total": <sum of right scores> },
    "total": <grand total of left + right>
  },
  "field_confidences": {
    "left": { ${confKeys} },
    "right": { ${confKeys} }
  },
  "test_date": "<YYYY-MM-DD or null>",
  "test_date_confidence": <0.0-1.0>,
  "certificate_number": "<string or null>",
  "certificate_number_confidence": <0.0-1.0>,
  "cert_registered_name": "<dog name as printed on cert or null>",
  "cert_microchip": "<microchip as printed on cert or null>"
}`;
}

function buildElbowLRPrompt(): string {
  return `This test uses BILATERAL ELBOW grading. Extract per-side measurements:
- mm_change: millimeters of change (integer)
- grade: elbow grade (0, 1, 2, or 3)
- uap: ununited anconeal process present (true/false)

RESPOND with this exact JSON (no markdown fencing):
{
  "result_data": {
    "left": { "mm_change": <integer or null>, "grade": <0-3 integer or null>, "uap": <boolean or null> },
    "right": { "mm_change": <integer or null>, "grade": <0-3 integer or null>, "uap": <boolean or null> }
  },
  "field_confidences": {
    "left": { "mm_change": <0.0-1.0>, "grade": <0.0-1.0>, "uap": <0.0-1.0> },
    "right": { "mm_change": <0.0-1.0>, "grade": <0.0-1.0>, "uap": <0.0-1.0> }
  },
  "test_date": "<YYYY-MM-DD or null>",
  "test_date_confidence": <0.0-1.0>,
  "certificate_number": "<string or null>",
  "certificate_number_confidence": <0.0-1.0>,
  "cert_registered_name": "<dog name as printed on cert or null>",
  "cert_microchip": "<microchip as printed on cert or null>"
}`;
}

function buildEnumLRPrompt(schema: ResultSchemaEnumLR): string {
  return `This test uses BILATERAL ENUM grading. Extract a left and right result from these options:
${JSON.stringify(schema.options)}

RESPOND with this exact JSON (no markdown fencing):
{
  "result_data": {
    "left": { "value": "<one of the options or null>" },
    "right": { "value": "<one of the options or null>" }
  },
  "field_confidences": {
    "left": { "value": <0.0-1.0> },
    "right": { "value": <0.0-1.0> }
  },
  "test_date": "<YYYY-MM-DD or null>",
  "test_date_confidence": <0.0-1.0>,
  "certificate_number": "<string or null>",
  "certificate_number_confidence": <0.0-1.0>,
  "cert_registered_name": "<dog name as printed on cert or null>",
  "cert_microchip": "<microchip as printed on cert or null>"
}

Map the certificate's wording to the closest valid option. If the certificate uses a different grading system, include your mapping reasoning in the extracted value.`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build the extraction prompt for a specific (test, org) pair.
 * Dispatches to the correct variant based on the result_schema type.
 */
export function buildExtractionPrompt(
  schema: ResultSchema,
  testType: { name: string; short_name: string },
  org: { name: string },
  dog: { registered_name: string }
): string {
  const preamble = buildPreamble(testType, org, dog);
  switch (schema.type) {
    case "enum":
      return preamble + buildEnumPrompt(schema);
    case "numeric_lr":
      return preamble + buildNumericLRPrompt(schema);
    case "point_score_lr":
      return preamble + buildPointScoreLRPrompt(schema);
    case "elbow_lr":
      return preamble + buildElbowLRPrompt();
    case "enum_lr":
      return preamble + buildEnumLRPrompt(schema);
  }
}
