# Result Schema System

The result schema system defines how health test results are structured, entered, scored, and displayed. Each grading organization can define its own `result_schema` for a given test type, controlling the form UI and scoring behavior.

## Schema Types

### `enum` — Single categorical result

A single value selected from a list of options. Used when the test produces one overall grade.

**Example:** OFA Hips (Excellent/Good/Fair/Borderline/Mild/Moderate/Severe)

```json
{
  "type": "enum",
  "options": ["Excellent", "Good", "Fair", "Borderline", "Mild", "Moderate", "Severe"],
  "score_config": {
    "score_map": { "Excellent": 100, "Good": 90, "Fair": 70, "Borderline": 50, "Mild": 30, "Moderate": 15, "Severe": 0 }
  }
}
```

**result_data:** Not used (null). The `result` string field holds the selected value directly.

**Scoring:** `result_score` = `score_map[result]`. No left/right scores.

---

### `enum_lr` — Bilateral categorical result (left/right)

Same as `enum`, but each side (left hip, right hip, etc.) is graded independently. Used when an enum-style test must record separate grades per side.

**Example:** A hypothetical grading system that rates each side A/B/C/D

```json
{
  "type": "enum_lr",
  "options": ["A", "B", "C", "D"],
  "score_config": {
    "score_map": { "A": 100, "B": 70, "C": 40, "D": 0 }
  }
}
```

**result_data:**
```json
{ "left": { "value": "A" }, "right": { "value": "C" } }
```

**result (summary):** `"L: A, R: C"`

**Scoring:** `result_score_left` = `score_map[left.value]`, `result_score_right` = `score_map[right.value]`. The rating engine uses `Math.min(left, right)` as the effective score.

---

### `numeric_lr` — Bilateral numeric measurements

One or more numeric fields measured on each side. Used for tests that produce continuous numeric values per side.

**Example:** PennHIP Distraction Index

```json
{
  "type": "numeric_lr",
  "fields": [
    { "label": "Distraction Index", "key": "di", "min": 0, "max": 1, "step": 0.01 }
  ],
  "score_config": {
    "field": "di",
    "ranges": [
      { "max": 0.30, "score": 100 },
      { "max": 0.40, "score": 80 },
      { "max": 0.50, "score": 60 },
      { "max": 0.60, "score": 40 },
      { "max": 0.70, "score": 20 },
      { "max": 1.00, "score": 0 }
    ]
  }
}
```

**Field properties:** `label` (display name), `key` (data key), `unit` (optional display unit), `min`/`max`/`step` (input constraints).

**result_data:**
```json
{ "left": { "di": 0.35 }, "right": { "di": 0.42 } }
```

**result (summary):** `"DI: L=0.35, R=0.42"`

**Scoring:** The `score_config.field` specifies which field to score. Ranges are sorted ascending by `max`; the score for the first range where `value <= max` is used. Each side scored independently → `result_score_left`, `result_score_right`.

---

### `point_score_lr` — Bilateral point scoring with subcategories

Multiple subcategories scored on each side, with per-side totals and an overall total. Used for detailed scoring systems with many measured aspects.

**Example:** BVA/ANKC Hips (9 subcategories, max 53 per side)

```json
{
  "type": "point_score_lr",
  "subcategories": [
    { "label": "Norberg Angle", "key": "norberg_angle", "max": 6 },
    { "label": "Subluxation", "key": "subluxation", "max": 6 }
  ],
  "score_config": {
    "ranges": [
      { "max": 5, "score": 100 },
      { "max": 10, "score": 90 },
      { "max": 15, "score": 75 },
      { "max": 25, "score": 50 },
      { "max": 35, "score": 25 },
      { "max": 53, "score": 0 }
    ]
  }
}
```

**result_data:**
```json
{
  "left": { "norberg_angle": 3, "subluxation": 2, "total": 5 },
  "right": { "norberg_angle": 4, "subluxation": 3, "total": 7 },
  "total": 12
}
```

**result (summary):** `"12 (R:7, L:5)"`

**Scoring:** Ranges applied to each side's `total`. Each side scored independently → `result_score_left`, `result_score_right`.

---

### `elbow_lr` — Bilateral elbow grading

Specialized schema for BVA/ANKC-style elbow grading with mm of change, grade (0-3), and UAP (ununited anconeal process) flag per side.

```json
{
  "type": "elbow_lr",
  "score_config": {
    "score_map": { "0": 100, "1": 66, "2": 33, "3": 0 }
  }
}
```

**result_data:**
```json
{
  "left": { "mm_change": 0, "grade": 0, "uap": false },
  "right": { "mm_change": 1, "grade": 1, "uap": false }
}
```

**result (summary):** `"L: Grade 0, R: Grade 1"`

**Scoring:** `score_map[grade]` for each side → `result_score_left`, `result_score_right`.

---

## Score Config Types

| Schema Type | Score Config | Mechanism |
|------------|-------------|-----------|
| `enum` | `{ score_map: Record<string, number> }` | Direct lookup: `score_map[result_value]` |
| `enum_lr` | `{ score_map: Record<string, number> }` | Direct lookup per side: `score_map[side.value]` |
| `numeric_lr` | `{ field: string, ranges: [{max, score}] }` | Range lookup on specified field per side |
| `point_score_lr` | `{ ranges: [{max, score}] }` | Range lookup on per-side total |
| `elbow_lr` | `{ score_map: Record<string, number> }` | Direct lookup on grade per side |

**Range scoring:** Ranges must be sorted ascending by `max`. The first range where `value <= max` determines the score. If value exceeds all ranges, the last range's score is used (worst case).

**All score configs are optional.** If omitted, the clearance is recorded without numeric scores and receives a default unscored pass value (90) in the rating engine.

## How Bilateral Scoring Feeds Into Ratings

For all `_lr` schema types, the rating engine uses `Math.min(result_score_left, result_score_right)` as the effective score for that test. This means the worse side determines the dog's score for that test.

## Adding a New Preset

Presets are defined in `app/src/pages/admin/HealthTestsPage.tsx` in the `RESULT_SCHEMA_PRESETS` array. Each preset has:

```typescript
{
  value: "unique_key",        // Internal identifier
  label: "Display Label",     // Shown in the admin dropdown
  schema: { ... }             // The ResultSchema object (or null for "Default")
}
```

To add a new preset:

1. Add the entry to `RESULT_SCHEMA_PRESETS` in `HealthTestsPage.tsx`
2. If it uses an existing schema type, no other changes needed
3. If it needs a new schema type, you must also update:
   - `shared/src/types.ts` — add the type definition and union member
   - `shared/src/validation.ts` — add to the zod discriminated union
   - `api/src/db/schema.ts` — duplicate the type (API has its own copy)
   - `api/src/lib/scoring.ts` — add scoring case in `computeResultScores()`
   - `api/src/routes/health.ts` — add summary case in `computeResultSummary()`
   - `app/src/pages/HealthPage.tsx` — add form component and wire it into rendering
   - `getPresetForSchema()` in `HealthTestsPage.tsx` — map new type to preset key

## Key Files

| File | Purpose |
|------|---------|
| `shared/src/types.ts` | TypeScript type definitions for all schema types |
| `shared/src/validation.ts` | Zod validators for schema input |
| `api/src/db/schema.ts` | API-side type definitions (duplicated from shared) |
| `api/src/lib/scoring.ts` | `computeResultScores()` — converts result_data to 0-100 scores |
| `api/src/lib/rating.ts` | Rating engine — aggregates scores into health ratings |
| `api/src/routes/health.ts` | API-side `computeResultSummary()` — generates human-readable result strings |
| `app/src/pages/HealthPage.tsx` | Form components for each schema type + result display |
| `app/src/pages/admin/HealthTestsPage.tsx` | Admin preset configuration UI |
