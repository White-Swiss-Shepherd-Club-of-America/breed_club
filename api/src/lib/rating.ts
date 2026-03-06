import { eq, and, max, lte } from "drizzle-orm";
import { computeResultScores } from "./scoring.js";
import type { Database } from "../db/client.js";
import {
  dogs,
  dogHealthClearances,
  healthTestTypes,
  healthTestTypeOrgs,
  healthRatingConfigs,
  healthCertVersions,
} from "../db/schema.js";
import type { RatingThresholds, HealthRating, HealthRatingColor, ScoreThresholds } from "../db/schema.js";

// ─── Default Config ──────────────────────────────────────────────────────────

const DEFAULT_CATEGORY_WEIGHTS: Record<string, number> = {
  hips: 20,
  genetics: 20,
  elbows: 15,
  vision: 12,
  spine: 10,
  cardiac: 8,
  patella: 5,
  dentition: 3,
  temperament: 5,
  other: 2,
};

const DEFAULT_CRITICAL_CATEGORIES = new Set(["hips", "genetics", "elbows"]);

const DEFAULT_SCORE_THRESHOLDS: ScoreThresholds = {
  red: 20,
  orange: 40,
  yellow: 60,
  green: 95, // blue requires near-perfect combined scores (e.g., OFA Excellent everywhere)
};

// ─── Types for pure computation ──────────────────────────────────────────────

export interface ClearanceInput {
  health_test_type_id: string;
  organization_id: string;
  result_score: number | null;
  result_score_left: number | null;
  result_score_right: number | null;
  status: string;
}

export interface TestTypeInput {
  id: string;
  is_required: boolean;
  rating_category: string | null;
  category: string;
}

export interface RatingConfig {
  category_weights: Record<string, number>;
  critical_categories: Set<string>;
  score_thresholds: ScoreThresholds;
}

// ─── Pure computation ────────────────────────────────────────────────────────

/**
 * Get the effective score for a clearance.
 * For bilateral tests (L/R), uses the worse (lower) side.
 * For single-value tests, uses result_score.
 */
function getEffectiveScore(c: ClearanceInput): number | null {
  if (c.result_score != null) return c.result_score;
  if (c.result_score_left != null && c.result_score_right != null) {
    return Math.min(c.result_score_left, c.result_score_right);
  }
  if (c.result_score_left != null) return c.result_score_left;
  if (c.result_score_right != null) return c.result_score_right;
  return null;
}

/**
 * Map a 0-100 score through thresholds to a rating level.
 */
function scoreToRatingLevel(
  score: number,
  thresholds: RatingThresholds
): "auto_dq" | "poor" | "fair" | "good" | "excellent" {
  if (score <= thresholds.auto_dq) return "auto_dq";
  if (score <= thresholds.poor) return "poor";
  if (score <= thresholds.fair) return "fair";
  if (score <= thresholds.good) return "good";
  return "excellent";
}

/**
 * Convert an overall weighted score to a color using the club's score thresholds.
 */
function scoreToColor(score: number, thresholds: ScoreThresholds): HealthRatingColor {
  if (score <= thresholds.red) return "red";
  if (score <= thresholds.orange) return "orange";
  if (score <= thresholds.yellow) return "yellow";
  if (score <= thresholds.green) return "green";
  return "blue";
}

/**
 * Get the rating_category for a test type, falling back to category.
 */
function getCategory(tt: TestTypeInput): string {
  return tt.rating_category ?? tt.category;
}

export interface CertVersionInfo {
  id: string;
  name: string;
}

/**
 * Pure computation of health rating from inputs.
 * No database access — fully testable.
 */
export function computeHealthRating(
  clearances: ClearanceInput[],
  testTypes: TestTypeInput[],
  orgThresholds: Map<string, RatingThresholds | null>, // key: `${testTypeId}:${orgId}`
  config: RatingConfig,
  certVersion?: CertVersionInfo | null
): HealthRating {
  const now = new Date().toISOString();

  // Filter to approved clearances only
  const approved = clearances.filter((c) => c.status === "approved");

  // Build test type lookup
  const testTypeMap = new Map(testTypes.map((tt) => [tt.id, tt]));

  // Determine which test types have been tested (with approved clearances)
  const testedTestTypeIds = new Set(approved.map((c) => c.health_test_type_id));

  // Check required completeness
  const requiredTypes = testTypes.filter((tt) => tt.is_required);
  const requiredComplete = requiredTypes.every((tt) => testedTestTypeIds.has(tt.id));

  // No approved clearances at all
  if (approved.length === 0) {
    return {
      color: "red",
      score: 0,
      saturation: 0,
      computed_at: now,
      required_complete: requiredComplete,
      auto_dq: false,
      category_scores: {},
      cert_version_id: certVersion?.id ?? null,
      cert_version_name: certVersion?.name ?? null,
    };
  }

  // Per-clearance: compute rating level via thresholds
  let hasAutoDq = false;
  const criticalCategoryIsPoorOrWorse = new Set<string>();

  // Group best scores by category
  // For each category, track the best (highest) effective score
  const categoryBestScores: Record<string, { score: number; count: number }> = {};

  for (const c of approved) {
    const tt = testTypeMap.get(c.health_test_type_id);
    if (!tt) continue;

    const effectiveScore = getEffectiveScore(c);
    if (effectiveScore == null) continue;

    const cat = getCategory(tt);
    const thresholdKey = `${c.health_test_type_id}:${c.organization_id}`;
    const thresholds = orgThresholds.get(thresholdKey);

    // Evaluate rating level if thresholds are configured
    if (thresholds) {
      const level = scoreToRatingLevel(effectiveScore, thresholds);
      if (level === "auto_dq") {
        hasAutoDq = true;
      }
      if ((level === "auto_dq" || level === "poor") && config.critical_categories.has(cat)) {
        criticalCategoryIsPoorOrWorse.add(cat);
      }
    }

    // Track best score per category
    if (!categoryBestScores[cat]) {
      categoryBestScores[cat] = { score: effectiveScore, count: 1 };
    } else {
      categoryBestScores[cat].score = Math.max(categoryBestScores[cat].score, effectiveScore);
      categoryBestScores[cat].count += 1;
    }
  }

  // Categories covered by any approved clearance (regardless of numeric score).
  // Used for saturation and completeness ratio so pass/fail tests aren't invisible.
  const coveredCategories = new Set(
    approved
      .map((c) => testTypeMap.get(c.health_test_type_id))
      .filter((tt): tt is NonNullable<typeof tt> => tt != null)
      .map((tt) => getCategory(tt))
  );

  // Auto-DQ: immediate Red
  if (hasAutoDq) {
    const categoryScores: HealthRating["category_scores"] = {};
    for (const [cat, data] of Object.entries(categoryBestScores)) {
      categoryScores[cat] = {
        color: scoreToColor(data.score, config.score_thresholds),
        score: data.score,
        test_count: data.count,
      };
    }
    const totalCategories = new Set(testTypes.map((tt) => getCategory(tt))).size;
    const testedCategories = coveredCategories.size;

    return {
      color: "red",
      score: 0,
      saturation: totalCategories > 0 ? Math.round((testedCategories / totalCategories) * 100) : 0,
      computed_at: now,
      required_complete: requiredComplete,
      auto_dq: true,
      category_scores: categoryScores,
      cert_version_id: certVersion?.id ?? null,
      cert_version_name: certVersion?.name ?? null,
    };
  }

  // For covered categories that have no numeric score (pass/fail tests, or numeric tests
  // whose result_score couldn't be backfilled), assign a default "good passing" score.
  // Without this, those categories are excluded from rawScore entirely, causing it to
  // stay artificially high (e.g., 100) when every other test happens to score perfectly.
  const DEFAULT_UNSCORED_PASS = 90;
  for (const cat of coveredCategories) {
    if (!(cat in categoryBestScores)) {
      categoryBestScores[cat] = { score: DEFAULT_UNSCORED_PASS, count: 0 };
    }
  }

  // Compute weighted score
  // Only sum weights for categories represented by the test types in scope.
  // When a cert version is active, testTypes is pre-filtered to that version's tests,
  // so this ensures totalWeight matches usedWeight's denominator (no phantom category penalty).
  const representedCategories = new Set(testTypes.map((tt) => getCategory(tt)));
  const totalWeight = [...representedCategories].reduce(
    (sum, cat) => sum + (config.category_weights[cat] ?? config.category_weights["other"] ?? 0),
    0
  );
  let weightedSum = 0;
  let usedWeight = 0;

  for (const [cat, data] of Object.entries(categoryBestScores)) {
    const weight = config.category_weights[cat] ?? config.category_weights["other"] ?? 0;
    weightedSum += data.score * weight;
    usedWeight += weight;
  }

  // rawScore = quality average over only numerically-scored categories
  const rawScore = usedWeight > 0 ? weightedSum / usedWeight : 0;
  // completenessRatio = fraction of cert categories covered by ANY approved clearance.
  // Pass/fail tests (no numeric score) still count as "covered" so they don't tank the score.
  const coveredWeight = [...coveredCategories].reduce(
    (sum, cat) => sum + (config.category_weights[cat] ?? config.category_weights["other"] ?? 0),
    0
  );
  const completenessRatio = totalWeight > 0 ? coveredWeight / totalWeight : 0;
  const overallScore = Math.round(rawScore * completenessRatio);

  // Build category scores
  const categoryScores: HealthRating["category_scores"] = {};
  for (const [cat, data] of Object.entries(categoryBestScores)) {
    categoryScores[cat] = {
      color: scoreToColor(data.score, config.score_thresholds),
      score: data.score,
      test_count: data.count,
    };
  }

  // Compute saturation from covered categories (any approved clearance, not just numeric scores)
  const totalCategories = new Set(testTypes.map((tt) => getCategory(tt))).size;
  const testedCategories = coveredCategories.size;
  const saturation = totalCategories > 0 ? Math.round((testedCategories / totalCategories) * 100) : 0;

  // Determine color from score
  let color = scoreToColor(overallScore, config.score_thresholds);

  // Apply caps
  // Critical category penalty: if any critical category is poor or worse, cap at yellow
  if (criticalCategoryIsPoorOrWorse.size > 0) {
    const capOrder: HealthRatingColor[] = ["red", "orange", "yellow"];
    if (!capOrder.includes(color)) {
      color = "yellow";
    }
  }

  // Required completeness cap: if missing required tests, cap at yellow
  if (!requiredComplete) {
    const capOrder: HealthRatingColor[] = ["red", "orange", "yellow"];
    if (!capOrder.includes(color)) {
      color = "yellow";
    }
  }

  return {
    color,
    score: overallScore,
    saturation,
    computed_at: now,
    required_complete: requiredComplete,
    auto_dq: false,
    category_scores: categoryScores,
    cert_version_id: certVersion?.id ?? null,
    cert_version_name: certVersion?.name ?? null,
  };
}

// ─── Database wrapper ────────────────────────────────────────────────────────

/**
 * Determine which cert version applies to a dog based on:
 * - Deceased dogs: version active at date_of_death
 * - Living dogs: version active at the dog's most recent approved test_date
 * - No clearances + alive: version active today
 * Returns null if no cert versions exist (fall back to current club config).
 */
async function determineCertVersion(
  db: Database,
  clubId: string,
  dateOfDeath: string | null,
  dogId: string
) {
  // Determine the evaluation date
  let evaluationDate: string;

  if (dateOfDeath) {
    // Deceased dog: cap at date of death
    evaluationDate = dateOfDeath;
  } else {
    // Living dog: use most recent approved test_date
    const [latestTest] = await db
      .select({ latest: max(dogHealthClearances.test_date) })
      .from(dogHealthClearances)
      .where(
        and(
          eq(dogHealthClearances.dog_id, dogId),
          eq(dogHealthClearances.status, "approved")
        )
      );
    evaluationDate = latestTest?.latest ?? new Date().toISOString().split("T")[0];
  }

  // Find the cert version with the latest effective_date <= evaluationDate
  const version = await db.query.healthCertVersions.findFirst({
    where: and(
      eq(healthCertVersions.club_id, clubId),
      eq(healthCertVersions.is_active, true),
      lte(healthCertVersions.effective_date, evaluationDate)
    ),
    orderBy: (v, { desc }) => [desc(v.effective_date)],
  });

  return version ?? null;
}

/**
 * Fetch all necessary data, compute health rating, and update the dog record.
 * Uses cert version system if versions exist for the club.
 */
export async function recomputeHealthRating(
  db: Database,
  dogId: string
): Promise<HealthRating | null> {
  // Get the dog's club_id and date_of_death
  const dog = await db.query.dogs.findFirst({
    where: eq(dogs.id, dogId),
    columns: { club_id: true, date_of_death: true },
  });
  if (!dog) return null;

  // Determine applicable cert version
  const certVersion = await determineCertVersion(
    db,
    dog.club_id,
    dog.date_of_death,
    dogId
  );

  // Build config: use cert version snapshot if available, else club config / defaults
  let config: RatingConfig;
  if (certVersion) {
    config = {
      category_weights: certVersion.category_weights,
      critical_categories: new Set(certVersion.critical_categories),
      score_thresholds: certVersion.score_thresholds,
    };
  } else {
    const ratingConfig = await db.query.healthRatingConfigs.findFirst({
      where: eq(healthRatingConfigs.club_id, dog.club_id),
    });
    config = {
      category_weights: ratingConfig?.category_weights ?? DEFAULT_CATEGORY_WEIGHTS,
      critical_categories: new Set(ratingConfig?.critical_categories ?? DEFAULT_CRITICAL_CATEGORIES),
      score_thresholds: ratingConfig?.score_thresholds ?? DEFAULT_SCORE_THRESHOLDS,
    };
  }

  // Fetch all active test types for this club
  const allTestTypes = await db
    .select({
      id: healthTestTypes.id,
      is_required: healthTestTypes.is_required,
      rating_category: healthTestTypes.rating_category,
      category: healthTestTypes.category,
    })
    .from(healthTestTypes)
    .where(and(eq(healthTestTypes.club_id, dog.club_id), eq(healthTestTypes.is_active, true)));

  // If cert version exists, scope test types to only those in the version's snapshot
  const requiredIdSet = certVersion
    ? new Set(certVersion.required_test_type_ids)
    : null;

  const testTypesForRating: TestTypeInput[] = (
    requiredIdSet
      ? allTestTypes.filter((tt) => requiredIdSet.has(tt.id))
      : allTestTypes
  ).map((tt) => ({
    ...tt,
    // All tests in the cert version are required by definition; otherwise use the test type's own flag
    is_required: requiredIdSet ? true : tt.is_required,
  }));

  // Fetch all clearances for this dog (include result/result_data for score backfill)
  const allClearances = await db
    .select({
      health_test_type_id: dogHealthClearances.health_test_type_id,
      organization_id: dogHealthClearances.organization_id,
      result_score: dogHealthClearances.result_score,
      result_score_left: dogHealthClearances.result_score_left,
      result_score_right: dogHealthClearances.result_score_right,
      result: dogHealthClearances.result,
      result_data: dogHealthClearances.result_data,
      status: dogHealthClearances.status,
    })
    .from(dogHealthClearances)
    .where(eq(dogHealthClearances.dog_id, dogId));

  // Fetch thresholds and result_schema for relevant test type + org combos
  const testTypeIds = allTestTypes.map((tt) => tt.id);
  const orgLinks =
    testTypeIds.length > 0
      ? await db
          .select({
            health_test_type_id: healthTestTypeOrgs.health_test_type_id,
            organization_id: healthTestTypeOrgs.organization_id,
            thresholds: healthTestTypeOrgs.thresholds,
            result_schema: healthTestTypeOrgs.result_schema,
          })
          .from(healthTestTypeOrgs)
      : [];

  const orgThresholds = new Map<string, RatingThresholds | null>();
  const orgSchemas = new Map<string, unknown>();
  for (const link of orgLinks) {
    const key = `${link.health_test_type_id}:${link.organization_id}`;
    orgThresholds.set(key, link.thresholds as RatingThresholds | null);
    orgSchemas.set(key, link.result_schema);
  }

  // Back-fill result_score for clearances where it is null but can be derived from
  // the stored result string + org result_schema (handles clearances created before
  // scoring was implemented, or via import paths that skipped computeResultScores).
  const clearancesWithScores = allClearances.map((c) => {
    if (c.result_score != null || c.result_score_left != null || c.result_score_right != null) {
      return c; // already scored
    }
    const schema = orgSchemas.get(`${c.health_test_type_id}:${c.organization_id}`);
    if (!schema || !c.result) return c;
    const computed = computeResultScores(
      c.result,
      c.result_data as Record<string, unknown> | null,
      schema as Parameters<typeof computeResultScores>[2]
    );
    return { ...c, ...computed };
  });

  // When a cert version is active, only score clearances for tests in that version
  const clearancesForRating = requiredIdSet
    ? clearancesWithScores.filter((c) => requiredIdSet.has(c.health_test_type_id))
    : clearancesWithScores;

  // Compute with version info
  const versionInfo: CertVersionInfo | null = certVersion
    ? { id: certVersion.id, name: certVersion.version_name }
    : null;

  const rating = computeHealthRating(
    clearancesForRating,
    testTypesForRating,
    orgThresholds,
    config,
    versionInfo
  );

  // Update dog record
  await db.update(dogs).set({ health_rating: rating }).where(eq(dogs.id, dogId));

  return rating;
}

/**
 * Recompute health ratings for all dogs in a club.
 * Called when cert versions are created/updated/deleted so cached ratings stay current.
 */
export async function recomputeAllClubRatings(
  db: Database,
  clubId: string
): Promise<number> {
  const clubDogs = await db
    .select({ id: dogs.id })
    .from(dogs)
    .where(eq(dogs.club_id, clubId));

  for (const dog of clubDogs) {
    await recomputeHealthRating(db, dog.id);
  }

  return clubDogs.length;
}
