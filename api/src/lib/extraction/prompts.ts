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

ORGANIZATION MATCHING RULES — read carefully before matching:
- "OFA" (Orthopedic Foundation for Animals) issues US certs. Look for "OFA" logo/text and a result code like "WSS-HD123/4F-VPI".
  - OFA also issues PRELIMINARY (Consultation) Reports for dogs under 24 months. These say "Preliminary (Consultation) Report" in the title and have an "application number" instead of an OFA certificate number. IMPORTANT: OFA Preliminary reports typically contain BOTH hip AND elbow evaluations on a single page. Look for BOTH the "HIP JOINT CONFORMATION" section AND the "ELBOW JOINTS" section — if both are present, return TWO matches (one for hips, one for elbows). Match these to the SAME OFA catalog entries for Hip Dysplasia and Elbow Dysplasia.
- "FCI" grading applies to certs from ANY national kennel club or veterinary practice in an FCI member country that uses the A/B/C/D/E hip grade system. This includes:
    - Hungarian forms (e.g., "Kutyabaj & Macskajaj Állatorvosi Rendelő", "Csípő-dysplasia vizsgálati lap")
    - Finnish forms (FTBS stamp, "Lonkkakuvaustulos")
    - German SV forms — BUT only if the catalog has an "SV" entry; otherwise use "FCI"
    - Any four-language (HU/EN/DE/FR) checkbox form with Norberg angle measurements
    - Any form using the FCI A/B/C/D/E or A1/A2/B1/B2 grading scale
- "BVA/KC" is the UK scheme (British Veterinary Association). Results are per-feature numeric scores summed to a total. Issued by UK vets.
- "Vet Scoring" / "ANKC" is the Australian scheme (vetscoring.com or Dogs Australia). Also numeric per-feature scores. Issued by Australian vets. DO NOT confuse with FCI checkbox forms.
- "PennHIP" certs show a Distraction Index (decimal number, e.g. 0.38) per hip. Issued by PennHIP/Antech/AIS.
- "INCOC" is the Finnish Kennel Club's own orthopedic program, distinct from FCI grading.

GENERAL RULES:
- Only return matches for tests that are explicitly present on the certificate with results.
- confidence 0.9+ means the match is unambiguous.
- confidence 0.5-0.89 means plausible but uncertain.
- confidence below 0.5 means you are guessing — include it but flag it.
- Do NOT extract results in this step. Only classify.
- Ignore owner names, addresses, veterinarian info, and any PII.`;
}

// ─── Extraction Preamble ────────────────────────────────────────────────────

// Per-organization extraction hints injected into the preamble.
const ORG_HINTS: Record<string, string> = {
  OFA: `ORG-SPECIFIC NOTES (OFA):
- OFA issues both FINAL certificates and PRELIMINARY (Consultation) reports.
- If the title reads "Preliminary (Consultation) Report", set is_preliminary = true.
- Preliminary reports have an "application number" (numeric, e.g. 1900325) instead of an OFA certificate number (which follows the format "WSS-HD123/4F-VPI"). Set certificate_number = null and application_number = the application number.
- "test_date" is the "date of report" printed on the form.
- "age_at_eval_months" is the "age at evaluation in months" field on the prelim report.`,

  FCI: `ORG-SPECIFIC NOTES (FCI):
- This cert uses the FCI A/B/C/D/E grading system, possibly with sub-grades (A1, A2, B1, B2, etc.).
- The form may be in Hungarian, Finnish, German, French, or English — or all four simultaneously.
- Hungarian grade terms: "mentes" = free (A), "majdnem mentes" = nearly free (B), "enyhe HD" = mild HD (C), "közepes HD" = moderate HD (D), "súlyos HD" = severe HD (E).
- Finnish grade terms: "vapaa" = free (A), "lähes vapaa" = nearly free (B).
- The FINAL grade is the veterinarian's overall assessment (last page, "vélemény" / "statement" section), NOT the per-feature checkbox observations on earlier pages.
- The result you extract should be the per-side FINAL grade (e.g., "A1" right, "B1" left), not the individual checkbox findings.
- "test_date" is the date the X-ray was taken ("Röntgenfelvétel készítésének dátuma" / "Date of X-ray"). This appears on the first or last page.
- "certificate_number" is the stud book / törzskönyvi number or the evaluating body's case number.`,

  PennHIP: `ORG-SPECIFIC NOTES (PennHIP):
- Extract the Distraction Index (DI) as a decimal number (e.g., 0.38) for each hip.
- "test_date" is the date of the study / X-ray session, NOT the report date.
- Do not confuse the DI with percentile rank numbers.`,

  "Vet Scoring": `ORG-SPECIFIC NOTES (Vet Scoring / ANKC):
- This is the Australian BVA-equivalent scheme. Results are per-feature numeric scores.
- Extract each sub-score per side; the total is the sum.
- "test_date" is the date the radiographs were taken.`,

  "BVA/KC": `ORG-SPECIFIC NOTES (BVA/KC):
- This is the UK British Veterinary Association scheme.
- Extract each sub-score per side; the total is the sum.
- "test_date" is the date the radiographs were taken.`,

  INCOC: `ORG-SPECIFIC NOTES (INCOC):
- Finnish Kennel Club orthopedic program. Results use A/B/C/D/E grades.
- The form may be primarily in Finnish.`,
};

function buildPreamble(
  testType: { name: string; short_name: string },
  org: { name: string },
  dog: { registered_name: string }
): string {
  const orgHint = ORG_HINTS[org.name] ? `\n${ORG_HINTS[org.name]}\n` : "";

  return `You are extracting structured health test results from a veterinary certificate image.

CONTEXT:
- Dog's registered name (expected): ${dog.registered_name}
- Test: ${testType.name} (${testType.short_name})
- Organization: ${org.name}
${orgHint}
RULES:
- Extract ONLY the fields specified below. Do not invent data.
- Dates MUST be ISO 8601 format (YYYY-MM-DD) regardless of how they appear on the certificate.
- "test_date" is the date of the biological sample or imaging study, NOT the report-issued date. Look for: "Date of Study", "Date Xrayed", "Sample Date", "Collection Date", "Születési idő" (that is date of birth — ignore it), "Röntgenfelvétel" date. Fall back to report date only if study date is absent.
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

/**
 * Extended enum prompt for OFA HIP DYSPLASIA extractions.
 * Handles both FINAL OFA certificates and PRELIMINARY (Consultation) Reports.
 * The LLM determines which type by inspecting the certificate content.
 */
function buildOfaPrelimHipPrompt(schema: ResultSchemaEnum): string {
  return `This is an OFA certificate for HIP DYSPLASIA. It may be either a FINAL OFA certificate or a PRELIMINARY (Consultation) Report.

DETERMINING CERTIFICATE TYPE:
- If the title says "Preliminary (Consultation) Report", set is_preliminary = true
- If it shows a standard OFA number (e.g., "WSS-HD123/4F-VPI") and no "Preliminary" label, set is_preliminary = false

The valid hip grade options are:
${JSON.stringify(schema.options)}

EXTRACTION INSTRUCTIONS:
1. The hip grade (one checked option from the list above).
2. If this is a PRELIMINARY report, also extract the "RADIOGRAPHIC FINDINGS — HIP JOINTS" checkboxes and the application number.
3. If this is a FINAL certificate, extract the OFA certificate number.

RESPOND with this exact JSON (no markdown fencing):
{
  "result": "<one of the valid hip grade options, exactly as listed>",
  "result_confidence": <0.0-1.0>,
  "raw_result_text": "<exact text of the checked hip grade on the certificate>",
  "is_preliminary": <true if "Preliminary (Consultation) Report", false otherwise>,
  "application_number": "<numeric application number if preliminary, otherwise null>",
  "age_at_eval_months": <integer age in months if shown, otherwise null>,
  "result_data": {
    "hip_grade": "<same as result field above>",
    "age_at_eval_months": <integer or null>,
    "findings": {
      "subluxation": <true if checked, false if blank or not present>,
      "remodeling_femoral_head_neck": <true/false>,
      "osteoarthritis_djd": <true/false>,
      "shallow_acetabula": <true/false>,
      "acetabular_rim_edge_change": <true/false>,
      "unilateral_pathology_left": <true/false>,
      "unilateral_pathology_right": <true/false>,
      "transitional_vertebra": <true/false>,
      "spondylosis": <true/false>,
      "panosteitis": <free-text note if any written next to the checkbox, otherwise null>,
      "other": <free-text note if any written next to "other", otherwise null>
    }
  },
  "test_date": "<YYYY-MM-DD or null — use date of report>",
  "test_date_confidence": <0.0-1.0>,
  "certificate_number": "<OFA number if final cert, null if preliminary>",
  "certificate_number_confidence": <0.0-1.0, or 0 if preliminary>,
  "cert_registered_name": "<dog name as printed on cert or null>",
  "cert_microchip": "<microchip/tattoo as printed on cert or null>"
}

IMPORTANT:
- For PRELIMINARY reports: certificate_number must be null, use application_number instead.
- For FINAL certificates: application_number should be null, use certificate_number.
- For FINAL certificates: the findings section may still be populated if visible, or set all to false.`;
}

/**
 * Extended enum prompt for OFA ELBOW DYSPLASIA extractions.
 * Handles both FINAL OFA certificates and PRELIMINARY (Consultation) Reports.
 */
function buildOfaPrelimElbowPrompt(schema: ResultSchemaEnum): string {
  return `This is an OFA certificate for ELBOW DYSPLASIA. It may be either a FINAL OFA certificate or a PRELIMINARY (Consultation) Report.

DETERMINING CERTIFICATE TYPE:
- If the title says "Preliminary (Consultation) Report", set is_preliminary = true
- If it shows a standard OFA number and no "Preliminary" label, set is_preliminary = false

The valid elbow result options are:
${JSON.stringify(schema.options)}

EXTRACTION INSTRUCTIONS:
1. The elbow evaluation (negative or grade I/II/III, per side L and R).
2. If this is a PRELIMINARY report, also extract the "RADIOGRAPHIC FINDINGS — ELBOW JOINTS" checkboxes (per side) and the application number.
3. If this is a FINAL certificate, extract the OFA certificate number.

RESPOND with this exact JSON (no markdown fencing):
{
  "result": "<one of the valid options above, e.g. 'Normal' if both sides negative>",
  "result_confidence": <0.0-1.0>,
  "raw_result_text": "<exact text from the elbow section>",
  "is_preliminary": <true if "Preliminary (Consultation) Report", false otherwise>,
  "application_number": "<numeric application number if preliminary, otherwise null>",
  "age_at_eval_months": <integer age in months if shown, otherwise null>,
  "result_data": {
    "negative_left": <true if "negative for elbow dysplasia" checked for left side>,
    "negative_right": <true if checked for right side>,
    "grade_left": <1, 2, 3, or null if negative/unchecked>,
    "grade_right": <1, 2, 3, or null if negative/unchecked>,
    "findings_left": {
      "djd": <true/false — degenerative joint disease>,
      "uap": <true/false — ununited anconeal process>,
      "fcp": <true/false — fragmented coronoid process>,
      "osteochondrosis": <true/false>
    },
    "findings_right": {
      "djd": <true/false>,
      "uap": <true/false>,
      "fcp": <true/false>,
      "osteochondrosis": <true/false>
    }
  },
  "test_date": "<YYYY-MM-DD or null — use date of report>",
  "test_date_confidence": <0.0-1.0>,
  "certificate_number": "<OFA number if final cert, null if preliminary>",
  "certificate_number_confidence": <0.0-1.0, or 0 if preliminary>,
  "cert_registered_name": "<dog name as printed on cert or null>",
  "cert_microchip": "<microchip/tattoo as printed on cert or null>"
}

IMPORTANT:
- For PRELIMINARY reports: certificate_number must be null, use application_number instead.
- For FINAL certificates: application_number should be null, use certificate_number.
- For the result field, match to the closest valid option. Use "Normal" if both sides are negative.`;
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
 *
 * @param isPrelimHint - When true and schema is enum + OFA org + orthopedic test,
 *   uses the extended OFA prelim prompt that extracts radiographic findings checkboxes.
 *   The LLM will also self-detect prelim status from the cert image regardless of this flag.
 */
export function buildExtractionPrompt(
  schema: ResultSchema,
  testType: { name: string; short_name: string; category?: string },
  org: { name: string },
  dog: { registered_name: string },
  isPrelimHint?: boolean
): string {
  const preamble = buildPreamble(testType, org, dog);

  // Use extended prelim prompts for OFA orthopedic tests when prelim is detected
  // or when the hint is provided (e.g., from classifier detecting "Preliminary" in title)
  if (schema.type === "enum" && org.name === "OFA" && (isPrelimHint || testType.category === "orthopedic")) {
    const isHipTest = testType.name.toLowerCase().includes("hip") || testType.short_name.toLowerCase() === "hips";
    const isElbowTest = testType.name.toLowerCase().includes("elbow") || testType.short_name.toLowerCase() === "elbows";
    if (isHipTest) {
      return preamble + buildOfaPrelimHipPrompt(schema);
    }
    if (isElbowTest) {
      return preamble + buildOfaPrelimElbowPrompt(schema);
    }
  }

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
