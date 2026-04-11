# LLM-Assisted Health Clearance Upload — Design Document

## 1. Architecture Overview

### Pipeline

```
User selects dog → uploads PDF
       │
       ▼
┌─────────────────────┐
│  Client-side         │  Browser renders PDF pages to PNG via pdf.js
│  PDF → images        │  Uploads: original PDF + page images as multipart
└────────┬────────────┘
         ▼
┌─────────────────────┐
│  POST /api/health/  │  Single Hono route handler.
│  dogs/:id/extract   │  1. Stores PDF to R2 (certificate_url)
│                     │  2. Sends page images to classifier
│                     │  3. For each matched pair, runs extractor
│                     │  4. Runs dog identity verifier
│                     │  5. Returns draft clearance(s) + flags
└────────┬────────────┘
         ▼
┌─────────────────────┐
│  Client-side        │  User reviews pre-filled form:
│  draft review       │  - fields pre-populated from extraction
│                     │  - confidence highlighting per field
│                     │  - verification flags displayed
│                     │  - user can edit any field
│                     │  User confirms → calls existing batch submit
└────────┬────────────┘
         ▼
┌─────────────────────┐
│  POST /api/health/  │  Existing endpoint. Unchanged.
│  dogs/:id/clearances│  Inserts as status="pending".
│  /batch             │  Enters existing admin approval queue.
└─────────────────────┘
```

### Why synchronous, not async

The extraction endpoint does all LLM work inline in a single request/response cycle. Rationale:

1. **MVP scope is single-result genetic certs.** One PDF page, one classification call, one extraction call, one verification call. Total: ~3 LLM calls, each under 2 seconds with Haiku. Total latency: 3-8 seconds. Acceptable per user expectation ("a few seconds").
2. **Cloudflare Workers have a 30-second CPU time limit** (unbundled) / 6 minutes wall clock for paid plans. The pipeline fits within this.
3. **No queue table, no polling worker, no new infrastructure.** The user uploads, waits a few seconds, gets a pre-filled form.
4. **Failure is simple:** if any LLM call fails or times out, return a partial result with what we got and let the user fall through to manual entry. No orphaned jobs to clean up.

For v2+ (multi-page panels, 10+ extraction calls), we may need to move to `waitUntil()` + a status polling endpoint or Durable Objects. The architecture supports this — the extraction pipeline is a pure function from `(images, dog, catalog)` → `ExtractionResult[]`, so moving it behind a queue is mechanical.

### State between stages

All state is in-memory within the request handler. The stages are function calls, not separate services:

```typescript
// In the route handler:
const certKey = await storePdf(env.CERTIFICATES_BUCKET, clubId, file);
const pageImages = extractImagesFromRequest(c);  // already rendered client-side
const catalog = await loadTestOrgCatalog(db, clubId);
const dog = await loadDog(db, dogId);

const classification = await classifyCert(llm, pageImages, catalog);
const extractions = await extractResults(llm, pageImages, classification, catalog);
const verification = await verifyDogIdentity(llm, pageImages, dog);

return c.json({ drafts: buildDraftRows(extractions, verification, certKey) });
```

### Failure and retries

- **LLM call timeout/error:** Each call gets one retry with the same model. If both fail, that stage returns `null` and the field gets `confidence: 0`.
- **Classification failure:** Return `{ matched: false, reason: "classification_failed" }`. Client falls through to manual entry with the cert already uploaded to R2.
- **Extraction partial failure:** Return whatever fields were extracted. Missing fields get `confidence: 0`. Client shows the manual form pre-filled with partial data.
- **The user is always the final gate.** The extraction endpoint never writes to `dogHealthClearances`. It returns drafts; the user submits them through the existing batch endpoint.

---

## 2. Cert Classification Design

### What the classifier receives

1. **First page image** of the cert (PNG, base64). For MVP single-result certs, page 1 is always sufficient.
2. **The club's `(test_type, organization)` catalog**, formatted as a compact reference table.

### Catalog format sent to the model

```json
{
  "pairs": [
    { "id": "dm:ofa", "test": "Degenerative Myelopathy (DM)", "org": "OFA", "org_type": "health_testing", "category": "genetic" },
    { "id": "dm:embark", "test": "Degenerative Myelopathy (DM)", "org": "Embark", "org_type": "health_testing", "category": "genetic" },
    { "id": "mdr1:ofa", "test": "MDR1", "org": "OFA", "org_type": "health_testing", "category": "genetic" },
    ...
  ]
}
```

Each `id` is `{healthTestType.id}:{organization.id}` (actual UUIDs). The human-readable names and category are there for the model to match against visual content. The IDs are opaque tokens for the model to return.

### Prompt template

```
You are a veterinary health certificate classifier. Given an image of a dog health certificate, identify which test(s) and issuing organization(s) it represents.

CATALOG of recognized (test, organization) pairs:
{{catalog_json}}

INSTRUCTIONS:
1. Examine the certificate image carefully.
2. Identify the issuing organization (lab name, logo, header).
3. Identify which health test(s) are reported.
4. Match each test to the closest entry in the CATALOG above.
5. If the cert contains multiple test results (panel), return all matching pairs.
6. If no catalog entry matches, return an empty matches array.

RESPOND with this exact JSON structure:
{
  "matches": [
    {
      "pair_id": "<test_type_id>:<org_id>",
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
- Ignore owner names, addresses, veterinarian info, and any PII.
```

### Escalation rules

| Condition | Action |
|-----------|--------|
| All matches have confidence >= 0.85 | Accept. Use Haiku result. |
| Any match has confidence 0.5-0.84 | Re-run classification with Sonnet. Use Sonnet result. |
| Any match has confidence < 0.5 from Haiku | Re-run with Sonnet. If Sonnet also < 0.5, fall through to manual. |
| Zero matches from Haiku | Re-run with Sonnet. If still zero, fall through to manual. |
| `cert_type` is `"panel"` or `"imaging_report"` | For MVP, fall through to manual. Log for v2 prioritization. |
| `cert_type` is `"unknown"` | Fall through to manual. |

### Fallthrough-to-manual criteria

Return `{ matched: false, reason }` to the client when:
- Sonnet returns zero matches.
- All Sonnet matches have confidence < 0.5.
- `cert_type` is not `"single_result"` (MVP scope).

The client shows the existing manual form. The cert PDF is already uploaded to R2, so the user just fills in the fields.

---

## 3. Per-`ResultSchema`-Variant Extraction Prompts

Each prompt is parameterized by the concrete `result_schema` instance from `healthTestTypeOrgs`. The prompt explicitly tells the model the exact output shape.

### Common preamble (prepended to all extraction prompts)

```
You are extracting structured health test results from a veterinary certificate image.

CONTEXT:
- Dog's registered name (expected): {{dog.registered_name}}
- Test: {{test_type.name}} ({{test_type.short_name}})
- Organization: {{organization.name}}

RULES:
- Extract ONLY the fields specified below. Do not invent data.
- Dates MUST be ISO 8601 format (YYYY-MM-DD) regardless of how they appear on the certificate.
- "test_date" is the date of the biological sample or imaging study, NOT the report-issued date. Look for: "Date of Study", "Date Xrayed", "Sample Date", "Collection Date". Fall back to report date only if study date is absent.
- "certificate_number" is the cert/report/case ID number, NOT a registration number.
- Ignore all PII: owner names, addresses, emails, phone numbers, vet contact info, lab signatories.
- For each extracted field, report a confidence score (0.0 to 1.0).
- If a field is not visible on the certificate, set its value to null and confidence to 0.
```

### Variant: `enum`

```
{{preamble}}

This test uses an ENUM result. The valid options are:
{{JSON.stringify(schema.options)}}

Extract the test result and match it to the closest valid option above.

RESPOND with this exact JSON:
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
Include your mapping reasoning in raw_result_text.
```

### Variant: `numeric_lr`

```
{{preamble}}

This test uses BILATERAL NUMERIC measurements. Extract left and right values for these fields:
{{#each schema.fields}}
- {{this.label}} (key: "{{this.key}}"{{#if this.unit}}, unit: {{this.unit}}{{/if}}{{#if this.min}}, range: {{this.min}}-{{this.max}}{{/if}}{{#if this.step}}, precision: {{this.step}}{{/if}})
{{/each}}

RESPOND with this exact JSON:
{
  "result_data": {
    "left": { {{#each schema.fields}}"{{this.key}}": <number or null>{{#unless @last}}, {{/unless}}{{/each}} },
    "right": { {{#each schema.fields}}"{{this.key}}": <number or null>{{#unless @last}}, {{/unless}}{{/each}} }
  },
  "field_confidences": {
    "left": { {{#each schema.fields}}"{{this.key}}": <0.0-1.0>{{#unless @last}}, {{/unless}}{{/each}} },
    "right": { {{#each schema.fields}}"{{this.key}}": <0.0-1.0>{{#unless @last}}, {{/unless}}{{/each}} }
  },
  "test_date": "<YYYY-MM-DD or null>",
  "test_date_confidence": <0.0-1.0>,
  "certificate_number": "<string or null>",
  "certificate_number_confidence": <0.0-1.0>,
  "cert_registered_name": "<dog name as printed on cert or null>",
  "cert_microchip": "<microchip as printed on cert or null>"
}

The left/right designation should match the certificate. If the certificate labels sides as "Left"/"Right", map directly. If it uses "L"/"R", map accordingly.
```

### Variant: `point_score_lr`

```
{{preamble}}

This test uses BILATERAL POINT SCORES with subcategories. Extract left and right scores for:
{{#each schema.subcategories}}
- {{this.label}} (key: "{{this.key}}", max: {{this.max}})
{{/each}}

RESPOND with this exact JSON:
{
  "result_data": {
    "left": { {{#each schema.subcategories}}"{{this.key}}": <integer 0-{{this.max}} or null>{{#unless @last}}, {{/unless}}{{/each}}, "total": <sum of left scores> },
    "right": { {{#each schema.subcategories}}"{{this.key}}": <integer 0-{{this.max}} or null>{{#unless @last}}, {{/unless}}{{/each}}, "total": <sum of right scores> },
    "total": <grand total of left + right>
  },
  "field_confidences": {
    "left": { {{#each schema.subcategories}}"{{this.key}}": <0.0-1.0>{{#unless @last}}, {{/unless}}{{/each}} },
    "right": { {{#each schema.subcategories}}"{{this.key}}": <0.0-1.0>{{#unless @last}}, {{/unless}}{{/each}} }
  },
  "test_date": "<YYYY-MM-DD or null>",
  "test_date_confidence": <0.0-1.0>,
  "certificate_number": "<string or null>",
  "certificate_number_confidence": <0.0-1.0>,
  "cert_registered_name": "<dog name as printed on cert or null>",
  "cert_microchip": "<microchip as printed on cert or null>"
}
```

### Variant: `elbow_lr`

```
{{preamble}}

This test uses BILATERAL ELBOW grading. Extract per-side measurements:
- mm_change: millimeters of change (integer)
- grade: elbow grade (0, 1, 2, or 3)
- uap: ununited anconeal process present (true/false)

RESPOND with this exact JSON:
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
}
```

### Variant: `enum_lr`

```
{{preamble}}

This test uses BILATERAL ENUM grading. Extract a left and right result from these options:
{{JSON.stringify(schema.options)}}

RESPOND with this exact JSON:
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

Map the certificate's wording to the closest valid option. If the certificate uses a different grading system, include your mapping reasoning in the extracted value.
```

### Prompt construction at runtime

```typescript
// api/src/lib/extraction/prompts.ts

function buildExtractionPrompt(
  schema: ResultSchema,
  testType: { name: string; short_name: string },
  org: { name: string },
  dog: { registered_name: string }
): string {
  const preamble = buildPreamble(testType, org, dog);
  switch (schema.type) {
    case "enum":       return preamble + buildEnumPrompt(schema);
    case "numeric_lr": return preamble + buildNumericLRPrompt(schema);
    case "point_score_lr": return preamble + buildPointScoreLRPrompt(schema);
    case "elbow_lr":   return preamble + buildElbowLRPrompt();
    case "enum_lr":    return preamble + buildEnumLRPrompt(schema);
  }
}
```

---

## 4. Verification Flag Taxonomy

### Flag types

| Flag Code | Severity | Meaning |
|-----------|----------|---------|
| `name_mismatch` | `warning` | Cert's registered name does not match the dog record |
| `name_partial_match` | `info` | Cert name is a substring/variant of the dog record name |
| `chip_mismatch` | `warning` | Cert microchip does not match the dog record |
| `chip_length_anomaly` | `info` | Cert microchip differs in length (likely leading zero issue) |
| `chip_not_on_cert` | `info` | No microchip found on the certificate |
| `date_future` | `error` | Extracted test_date is in the future |
| `date_implausible` | `warning` | Test date is before the dog's date_of_birth, or > 20 years ago |
| `low_extraction_confidence` | `warning` | One or more extracted fields have confidence < 0.7 |
| `classifier_uncertain` | `warning` | The classifier matched this pair with confidence < 0.85 |
| `result_not_in_options` | `error` | Extracted enum result doesn't match any valid option |
| `model_escalated` | `info` | Extraction was escalated from Haiku to Sonnet |

### Data shape

```typescript
interface VerificationFlag {
  code: string;           // one of the flag codes above
  severity: "info" | "warning" | "error";
  message: string;        // human-readable explanation
  field?: string;         // which field this flag relates to (e.g., "result", "test_date", "microchip")
  expected?: string;      // what the dog record has
  extracted?: string;     // what the cert shows
}
```

### Storage

Flags are **not** stored in the database. They are returned in the extraction API response and consumed by the client-side review UI. When the user confirms and submits through the existing batch endpoint, the flags are discarded — they served their purpose during draft review.

Rationale: Flags are transient review aids. The admin approval queue already has the cert PDF inline; the admin reviewer doesn't need machine-generated flags (they look at the cert). Adding a jsonb column to `dogHealthClearances` for flags would be schema churn with no durable value.

### How the review UI displays them

Each flag renders as a small pill/badge next to the relevant field:
- `error` flags: red background, blocks "Submit" until the user edits the field
- `warning` flags: yellow background, shows on hover/click with `message` text
- `info` flags: gray background, informational only

Example for `chip_length_anomaly`:
> **Microchip** `990000011618984` (from dog record)
> [!] Cert shows `99000011618984` (14 digits vs 15 — possible leading zero)

---

## 5. Confidence Model

### Per-field confidence

The LLM reports confidence per extracted field as a float 0.0-1.0. This comes directly from the extraction prompt's response.

### Field-level thresholds

| Confidence | Display | Meaning |
|------------|---------|---------|
| >= 0.9 | Green (no highlight) | High confidence. Field is pre-filled, no special treatment. |
| 0.7 - 0.89 | Yellow highlight | Moderate confidence. Field is pre-filled but highlighted for review. |
| < 0.7 | Orange highlight + icon | Low confidence. Field is pre-filled but flagged. Generates `low_extraction_confidence` flag. |
| 0 (null) | Empty field, red border | Not extracted. User must fill manually. |

### Row-level confidence

Aggregate confidence for a draft row is:

```typescript
function rowConfidence(fieldConfidences: Record<string, number>): number {
  const values = Object.values(fieldConfidences);
  if (values.length === 0) return 0;
  // Minimum confidence across all fields — a chain is as strong as its weakest link.
  return Math.min(...values);
}
```

### Escalation threshold

If Haiku returns **any** field with confidence < 0.6, or the row-level confidence is < 0.7, re-run the extraction call with Sonnet for that pair. Use the Sonnet result.

This is per-pair, not per-request. If the classifier matched 3 pairs (v2 panel scenario), only the low-confidence pairs escalate.

### Fallthrough threshold

If after Sonnet escalation the row-level confidence is still < 0.4, return the draft as-is but set `extraction_reliable: false`. The client shows the manual form pre-filled with whatever was extracted, but with a banner: "We couldn't confidently read this certificate. Please verify all fields."

---

## 6. Draft-Row Construction

### Column mapping

| `dogHealthClearances` column | Source | Missing/default |
|------------------------------|--------|-----------------|
| `dog_id` | Request parameter (already selected by user) | Required, never missing |
| `health_test_type_id` | From classifier match → `pair_id` split | Required; if classifier fails, no draft |
| `organization_id` | From classifier match → `pair_id` split | Required; if classifier fails, no draft |
| `result` | **Enum variant:** extractor's `result` field mapped to schema option. **LR variants:** computed by `computeResultSummary()` from `result_data`. | If extraction fails, empty string — user must fill |
| `result_data` | **Enum variant:** `null` (no structured data). **LR variants:** extractor's `result_data` object. | `null` if extraction fails |
| `result_detail` | Not extracted by LLM. Always `null` in draft. | `null` |
| `result_score` | Computed server-side by `computeResultScores()` from `result` and `result_data`. Not LLM-generated. | `null` if `result` is empty |
| `result_score_left` | Same as above, for LR variants. | `null` |
| `result_score_right` | Same as above, for LR variants. | `null` |
| `test_date` | Extractor's `test_date` field. ISO 8601. | `null` — user must fill |
| `expiration_date` | Not extracted by LLM. Computed client-side or left null. | `null` |
| `certificate_number` | Extractor's `certificate_number` field. | `null` if not found |
| `certificate_url` | R2 key from the upload step (set before extraction begins). | Always present |
| `status` | Not set in draft. Set to `"pending"` by the batch submit endpoint. | N/A |
| `submitted_by` | Not set in draft. Set by the batch submit endpoint from auth. | N/A |
| `notes` | Not extracted. User can add manually. | `null` |

### `result_data` shape per variant

These shapes match exactly what the existing `ResultForms.tsx` components produce and what `computeResultScores()` consumes:

**`enum`**: `result_data` is `null`. The result is the enum string in `result`.

**`numeric_lr`**: 
```json
{
  "left": { "di": 0.38 },
  "right": { "di": 0.42 }
}
```
Keys come from `schema.fields[].key`. Values are numbers.

**`point_score_lr`**:
```json
{
  "left": { "norberg_angle": 3, "subluxation": 2, ..., "total": 12 },
  "right": { "norberg_angle": 2, "subluxation": 1, ..., "total": 8 },
  "total": 20
}
```
Keys come from `schema.subcategories[].key`. Each side has a `total` (sum of subcategories). Top-level `total` is left + right.

**`elbow_lr`**:
```json
{
  "left": { "mm_change": 0, "grade": 0, "uap": false },
  "right": { "mm_change": 0, "grade": 0, "uap": false }
}
```

**`enum_lr`**:
```json
{
  "left": { "value": "A1" },
  "right": { "value": "A2" }
}
```

### Draft response shape

```typescript
interface ExtractionResponse {
  /** R2 key for the uploaded certificate */
  certificate_url: string;

  /** Array of draft clearance rows. One per matched (test, org) pair. */
  drafts: ExtractionDraft[];

  /** True if classifier couldn't match or cert_type isn't MVP-eligible. */
  fallback_to_manual: boolean;
  fallback_reason?: string;
}

interface ExtractionDraft {
  health_test_type_id: string;
  health_test_type_name: string;
  health_test_type_short_name: string;
  organization_id: string;
  organization_name: string;

  result: string;
  result_data: Record<string, unknown> | null;
  test_date: string | null;
  certificate_number: string | null;

  /** Per-field confidence scores. Keys match the fields above. */
  field_confidences: Record<string, number>;

  /** Row-level aggregate confidence. */
  row_confidence: number;

  /** True if Sonnet was used for this pair's extraction. */
  escalated: boolean;

  /** True if row_confidence >= 0.4 after all attempts. */
  extraction_reliable: boolean;

  /** Verification and quality flags. */
  flags: VerificationFlag[];

  /** The raw result text from the cert (for the enum case). */
  raw_result_text?: string;
}
```

### Score computation

Scores are **not** computed in the extraction response. They are computed server-side by the existing `computeResultScores()` when the user submits through `POST /api/health/dogs/:id/clearances/batch`. This avoids duplicating scoring logic and keeps the extraction endpoint stateless.

However, the client can compute preview scores for display using the same logic that exists in `ResultForms.tsx` / `computeResultSummary()`.

---

## 7. Review UI Changes

### New flow: "Upload Certificate" button in AddHealthCertificateModal

Add a new entry path at the **category** step of the existing modal. Instead of choosing a category, the user can click "Upload Certificate" which triggers:

1. Dog selection (existing step, or pre-selected from context)
2. File picker (PDF/JPEG/PNG)
3. Client-side PDF → image rendering (using `pdfjs-dist`)
4. Upload to extraction endpoint
5. Loading spinner ("Reading certificate...")
6. **Draft review step** (new)

### Draft review step

When the extraction endpoint returns successfully with `fallback_to_manual: false`:

- Show the matched test type and organization (read-only, but with an "Edit" link that switches to manual mode).
- For each field, show the extracted value in the existing form component (`ResultFormRouter`) with confidence highlighting.
- Show verification flag pills next to relevant fields.
- Show the cert image/PDF inline (same as the existing review queue) so the user can cross-reference.
- "Submit" button calls the existing `POST /api/health/dogs/:id/clearances/batch`.

When `fallback_to_manual: false` but some fields have low confidence:
- Same as above, but with a banner: "Some fields need verification. Please check highlighted fields."

When `fallback_to_manual: true`:
- Show the existing manual flow (category → org → results → upload), with `certificate_url` already set from the upload.
- If partial data was extracted, pre-fill what's available.

### Changes to existing HealthQueuePage (admin review)

**Minimal changes.** The admin sees the same approval card as today. The clearance row in the database is identical whether it came from manual entry or LLM extraction.

One optional addition: if the clearance `notes` field contains extraction metadata (e.g., "Submitted via certificate scan"), the admin can see that it was auto-extracted. But the approval/rejection flow is completely unchanged.

**Decision: Do not modify the admin review UI for MVP.** The extraction metadata (confidence, flags) is consumed by the submitting user's review step. By the time it reaches the admin queue, the user has already verified the data. The admin's job is to verify against the cert PDF, which they already do.

### File changes summary

| File | Change |
|------|--------|
| `app/src/components/health/AddHealthCertificateModal.tsx` | Add "Upload Certificate" button at category step. Add draft review step. Add PDF rendering logic. |
| `app/src/components/health/CertDraftReview.tsx` | **New file.** Draft review component with confidence highlighting and flag display. |
| `app/src/components/health/PdfRenderer.tsx` | **New file.** Client-side PDF→image rendering using `pdfjs-dist`. |
| `app/src/lib/api.ts` | Add `api.extractCert()` helper for the extraction endpoint. |
| `api/src/routes/health.ts` | Add `POST /dogs/:dog_id/extract` endpoint. |
| `api/src/lib/extraction/` | **New directory.** Classifier, extractor, verifier, prompt builders, LLM client abstraction. |

---

## 8. Implementation Plan

### Phase 1: LLM client abstraction and infrastructure

**Task 1.1: LLM client interface** (Sonnet)
- Create `api/src/lib/llm/types.ts` — define `LLMProvider` interface:
  ```typescript
  interface LLMProvider {
    chat(params: {
      model: string;
      messages: Array<{ role: string; content: string | Array<{ type: string; [k: string]: unknown }> }>;
      max_tokens: number;
      temperature?: number;
    }): Promise<{ content: string; usage: { input_tokens: number; output_tokens: number } }>;
  }
  ```
- Create `api/src/lib/llm/anthropic.ts` — implement `AnthropicProvider` using `fetch()` against `https://api.anthropic.com/v1/messages`. No SDK dependency; raw HTTP with the Anthropic API (Workers-compatible).
- Create `api/src/lib/llm/index.ts` — factory function `createLLMProvider(config)` that returns the provider based on env config.
- Verify: unit test with a mock provider.

**Task 1.2: Env and config** (Haiku)
- Add `LLM_API_KEY` and `LLM_PROVIDER` to `Env` interface in `api/src/lib/types.ts`.
- Add `LLM_API_KEY` to wrangler.toml secrets comment list.
- Add `LLM_PROVIDER` to wrangler.toml `[vars]` (default: `"anthropic"`).
- Add `LLM_MODEL_FAST` and `LLM_MODEL_STRONG` to `[vars]` (defaults: `"claude-haiku-4-5-20250315"`, `"claude-sonnet-4-6-20250514"`).

**Task 1.3: Client-side PDF rendering** (Sonnet)
- Add `pdfjs-dist` to `app/package.json`.
- Create `app/src/components/health/PdfRenderer.tsx`:
  - Accept a `File` object.
  - Render each page to a `<canvas>`, export as PNG `Blob`.
  - Return `{ pages: Blob[], pageCount: number }`.
  - Make this an async function, not a visual component.
- Create `app/src/lib/pdf-to-images.ts` with the core rendering function, pluggable — accepts a `renderPdf(file: File) => Promise<Blob[]>` interface so it can be swapped later (e.g., for server-side rendering in v2).
- Verify: render a sample PDF in dev, check PNG output.

### Phase 2: Extraction pipeline

**Task 2.1: Catalog loader** (Haiku)
- Create `api/src/lib/extraction/catalog.ts`.
- Function `loadTestOrgCatalog(db, clubId)` queries `healthTestTypes` + `healthTestTypeOrgs` + `organizations` and returns the classifier-ready catalog format.
- Verify: log output with `make dev`, check that WSSCA's 12 test types and their org pairings are all present.

**Task 2.2: Classifier** (Sonnet)
- Create `api/src/lib/extraction/classifier.ts`.
- Function `classifyCert(llm, pageImages, catalog, modelConfig)`:
  - Builds the classification prompt from template + catalog.
  - Sends first page image as a base64-encoded `image/png` content block.
  - Parses JSON response.
  - Implements retry (1 retry on failure).
  - Implements escalation logic (Haiku → Sonnet on low confidence).
  - Returns `ClassificationResult` with matches, cert_type, flags.
- Verify: test with a fixture OFA eCert image.

**Task 2.3: Prompt builders** (Sonnet)
- Create `api/src/lib/extraction/prompts.ts`.
- Implement `buildExtractionPrompt(schema, testType, org, dog)` dispatching to per-variant builders.
- Each builder produces the prompt string from the templates in section 3.
- Verify: snapshot test — render prompts for each WSSCA schema variant, eyeball for correctness.

**Task 2.4: Extractor** (Sonnet)
- Create `api/src/lib/extraction/extractor.ts`.
- Function `extractResult(llm, pageImages, match, catalog, dog, modelConfig)`:
  - Looks up the `result_schema` for the matched `(test_type, org)` pair.
  - Builds the prompt.
  - Sends image + prompt to the model.
  - Parses the JSON response.
  - Validates the extracted result against the schema (e.g., enum result is a valid option).
  - Implements retry and escalation.
  - Returns `ExtractionResult` with structured data + per-field confidences.
- Verify: test with fixture OFA DM cert, check that result maps to "Normal/Clear".

**Task 2.5: Dog identity verifier** (Haiku)
- Create `api/src/lib/extraction/verifier.ts`.
- Function `verifyDogIdentity(extractionResult, dog)`:
  - Pure function, no LLM call. Compares `cert_registered_name` to `dog.registered_name` (case-insensitive, whitespace-normalized).
  - Compares `cert_microchip` to `dog.microchip_number`.
  - Generates verification flags.
  - Microchip comparison: exact match → no flag. Different length → `chip_length_anomaly`. Different value → `chip_mismatch`. Not on cert → `chip_not_on_cert`.
  - Name comparison: exact match (normalized) → no flag. Substring match → `name_partial_match`. No match → `name_mismatch`.
- Date validation: `test_date` in future → `date_future`. Before `dog.date_of_birth` → `date_implausible`.
- Verify: unit test with known name/chip pairs including the 14-vs-15 digit case.

**Task 2.6: Draft row builder** (Haiku)
- Create `api/src/lib/extraction/draft-builder.ts`.
- Function `buildDraftRows(classification, extractions, verification, certKey)`:
  - Assembles `ExtractionDraft[]` from the extraction and verification results.
  - Computes `row_confidence` as min of field confidences.
  - Sets `extraction_reliable` based on thresholds.
  - Attaches flags from verifier + classifier.
- Verify: unit test with mock extraction output.

**Task 2.7: Extraction route handler** (Sonnet)
- Add `POST /dogs/:dog_id/extract` to `api/src/routes/health.ts`.
- Accepts `multipart/form-data` with fields:
  - `file` (the original PDF)
  - `pages` (one or more PNG images, rendered client-side)
- Handler flow:
  1. Auth check (same as existing clearance submission).
  2. Store PDF to R2 → get `certificate_url`.
  3. Read page images from multipart.
  4. Load catalog.
  5. Load dog record.
  6. Run classifier → extractor → verifier → draft builder.
  7. Return `ExtractionResponse`.
- Verify: end-to-end test with `curl` and a fixture cert.

### Phase 3: Frontend integration

**Task 3.1: API helper** (Haiku)
- Add `api.extractCert(dogId, file, pageImages)` to `app/src/lib/api.ts`.
- Builds multipart form with the PDF and page PNGs.
- Returns typed `ExtractionResponse`.

**Task 3.2: Draft review component** (Sonnet)
- Create `app/src/components/health/CertDraftReview.tsx`.
- Accepts `ExtractionDraft[]`, `certificate_url`, dog info.
- For each draft:
  - Shows test type + org (read-only).
  - Renders the result form using existing `ResultFormRouter` with values pre-filled.
  - Adds confidence highlighting: yellow/orange border on fields below thresholds.
  - Renders flag pills next to flagged fields.
  - Shows cert image inline (using existing `PdfViewer` or `<img>` tag).
- "Submit" button calls existing batch submit mutation.
- "Edit manually" link switches to the existing manual flow.
- Verify: visual test with mock extraction data.

**Task 3.3: Modal integration** (Sonnet)
- Modify `app/src/components/health/AddHealthCertificateModal.tsx`:
  - Add "Upload Certificate" option at the category step (or as a toggle alongside the manual flow).
  - On file select: run `pdfToImages()`, show loading state, call `api.extractCert()`.
  - On success: render `CertDraftReview`.
  - On failure/fallthrough: switch to manual flow with cert already uploaded.
- Verify: full flow in dev with a fixture cert.

### Phase 4: Hardening

**Task 4.1: Error handling and edge cases** (Haiku)
- Handle oversized PDFs (> 10MB — reject before upload).
- Handle non-PDF images (JPEG/PNG certs — skip PDF rendering, send directly).
- Handle LLM rate limits (429 → retry with backoff).
- Handle malformed LLM JSON responses (parse failure → return `fallback_to_manual: true`).

**Task 4.2: Typecheck and lint** (Haiku)
- Run `npm run typecheck` and `npm run lint` from `breed_club/`.
- Fix all errors.

---

## 9. Test Plan

### Fixture certs

Use the sample certificates in `~/src/wssca/clearances/`. Copy a representative subset into a test fixtures directory:

```
breed_club/api/src/lib/extraction/__fixtures__/
  ofa-dm-clear.png          # OFA DM eCert, result: Normal/Clear
  ofa-mdr1-carrier.png      # OFA MDR1 eCert, result: Normal/Mutant
  animalabs-dm.png           # AnimaLabs DM cert (broken font encoding)
  pawprint-dm-clear.png      # Paw Print DM cert, result: WT/WT
```

These are pre-rendered page images (PNG), not PDFs. This avoids needing PDF rendering in the test environment and lets us version-control the fixtures.

### Unit tests (no LLM calls)

| Test | What it verifies |
|------|-----------------|
| `verifier.test.ts` | Name matching (exact, partial, mismatch). Microchip matching (exact, length anomaly, mismatch, missing). Date validation (future, pre-birth). |
| `draft-builder.test.ts` | Row assembly from mock extraction data. Row confidence computation. Flag aggregation. |
| `catalog.test.ts` | Catalog loader returns correct shape from seeded WSSCA data. |
| `prompts.test.ts` | Snapshot tests for each prompt variant — render with WSSCA's actual schemas, verify the prompt text is well-formed. |

### Integration tests (with LLM calls, gated behind env var)

These tests call the real Anthropic API and use real fixture images. They are expensive (a few cents each) and should only run when `RUN_LLM_TESTS=true` is set.

| Test | What it verifies |
|------|-----------------|
| `classifier.integration.test.ts` | Given an OFA DM cert image, classifier returns the correct `(DM, OFA)` pair with confidence >= 0.85. |
| `extractor.integration.test.ts` | Given an OFA DM cert image + the DM enum schema, extractor returns `"Normal/Clear"` with confidence >= 0.8. |
| `pipeline.integration.test.ts` | End-to-end: given a fixture cert, the full pipeline returns a draft with correct test type, org, result, and no error flags. |

### Manual QA checklist

For each cert family in the fixture set:
- [ ] Upload → extraction returns within 10 seconds
- [ ] Test type and org correctly identified
- [ ] Result matches the cert
- [ ] Test date correctly extracted in ISO 8601
- [ ] Certificate number correctly extracted
- [ ] Dog name mismatch correctly flagged (test with a wrong dog)
- [ ] Microchip mismatch correctly flagged
- [ ] User can edit any pre-filled field
- [ ] Submit goes through existing batch endpoint
- [ ] Clearance appears in admin approval queue

### Cost tracking

Log `usage.input_tokens` and `usage.output_tokens` from each LLM call. For MVP, add a simple `console.log` with the model name, token counts, and estimated cost. We can add structured cost tracking later.

Expected per-cert cost for a single-result genetic cert (MVP):
- Classifier: ~300 input tokens (prompt) + ~2000 (image) + ~100 output = Haiku ≈ $0.003
- Extractor: ~400 input tokens + ~2000 (image) + ~150 output = Haiku ≈ $0.003
- Total: ~$0.006 per cert without escalation, ~$0.03 if escalated to Sonnet.

---

## 10. Open Questions and Risks

### Open questions

1. **Image resolution for vision API.** The Anthropic vision API accepts images up to ~1600 tokens per image (varies by resolution). What resolution should `pdfjs-dist` render at? Proposal: 150 DPI (typical PDF page becomes ~1275x1650 pixels). This is sufficient for text extraction and stays under the token budget. Need to verify with AnimaLabs certs which have small text.

2. **Max pages to send.** MVP sends only page 1. For v2 panels (Embark = 5 pages), we'll need to send multiple pages. The architecture supports this (the extraction endpoint accepts multiple page images), but the classifier prompt and cost model change. Not blocking for MVP.

3. **JPEG/PNG cert handling.** Some users upload photo scans (JPEG) instead of PDFs. The PDF rendering step should be skipped; the image goes directly to the LLM. The upload endpoint already accepts JPEG/PNG. The extraction endpoint should detect the file type and skip rendering. This is straightforward but should be explicit in the implementation.

### Risks

1. **AnimaLabs broken font encoding.** The prompt mandates vision-only (no text extraction), which should handle this. Risk: if the visual rendering of the broken fonts is also garbled in the PNG (e.g., glyph substitution produces wrong characters), the model may misread results. Mitigation: test with real AnimaLabs fixtures early. If vision fails, AnimaLabs certs may need to stay manual-only in MVP.

2. **LLM JSON parsing reliability.** Vision models occasionally produce malformed JSON or add markdown fencing. Mitigation: strip markdown fences before parsing; retry once on parse failure; fall through to manual on second failure.

3. **Cloudflare Workers wall clock timeout.** With Haiku, the pipeline should complete in 5-8 seconds. With Sonnet escalation, it could hit 15-20 seconds. The Workers unbounded wall clock limit is 6 minutes (paid plan). If on the free plan, the 30-second limit is tight with escalation. Confirm the plan tier before implementation. Mitigation if free: skip escalation on timeout and return Haiku result with low confidence.

4. **Cost if users upload irrelevant files.** Every upload burns classifier tokens even if it's not a health cert. Mitigation: the 10MB size limit already exists. The classifier cost is ~$0.003 per attempt, which is negligible. If abuse becomes an issue, add rate limiting per member.

5. **Prompt injection via cert content.** A malicious cert could contain text that confuses the model. Risk is low because: (a) the model output is validated against the schema, (b) the user reviews before submission, (c) the admin reviews before approval. There's no code execution path from LLM output. The worst case is garbage data that the user sees and corrects.
