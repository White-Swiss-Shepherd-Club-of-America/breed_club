import type { ResultSchema } from "../db/schema.js";

export interface ScoreResult {
  result_score: number | null;
  result_score_left: number | null;
  result_score_right: number | null;
}

const EMPTY: ScoreResult = { result_score: null, result_score_left: null, result_score_right: null };

/**
 * Find score from sorted ranges (ascending by max).
 * Returns the score for the first range where value <= max.
 */
function scoreFromRanges(
  value: number | undefined | null,
  ranges: Array<{ max: number; score: number }>
): number | null {
  if (value == null) return null;
  for (const range of ranges) {
    if (value <= range.max) return range.score;
  }
  // Exceeds all ranges — return last range's score (worst case)
  return ranges.length > 0 ? ranges[ranges.length - 1].score : null;
}

/**
 * Compute result scores (0-100) from structured result_data and the org's result_schema.
 *
 * For enum schemas: sets result_score (single value).
 * For bilateral schemas (numeric_lr, point_score_lr, elbow_lr): sets result_score_left/right.
 * Returns all nulls if no score_config is defined (graceful degradation).
 */
export function computeResultScores(
  result: string,
  resultData: Record<string, unknown> | null | undefined,
  resultSchema: ResultSchema | null | undefined
): ScoreResult {
  if (!resultSchema) return EMPTY;

  switch (resultSchema.type) {
    case "enum": {
      const config = resultSchema.score_config;
      if (!config) return EMPTY;
      const score = config.score_map[result];
      return { result_score: score ?? null, result_score_left: null, result_score_right: null };
    }

    case "numeric_lr": {
      const config = resultSchema.score_config;
      if (!config || !resultData) return EMPTY;
      const left = (resultData.left as Record<string, number> | undefined)?.[config.field];
      const right = (resultData.right as Record<string, number> | undefined)?.[config.field];
      return {
        result_score: null,
        result_score_left: scoreFromRanges(left, config.ranges),
        result_score_right: scoreFromRanges(right, config.ranges),
      };
    }

    case "point_score_lr": {
      const config = resultSchema.score_config;
      if (!config || !resultData) return EMPTY;
      const leftTotal = (resultData.left as Record<string, number> | undefined)?.total;
      const rightTotal = (resultData.right as Record<string, number> | undefined)?.total;
      return {
        result_score: null,
        result_score_left: scoreFromRanges(leftTotal, config.ranges),
        result_score_right: scoreFromRanges(rightTotal, config.ranges),
      };
    }

    case "elbow_lr": {
      const config = resultSchema.score_config;
      if (!config || !resultData) return EMPTY;
      const leftGrade = String((resultData.left as Record<string, unknown> | undefined)?.grade ?? "");
      const rightGrade = String((resultData.right as Record<string, unknown> | undefined)?.grade ?? "");
      return {
        result_score: null,
        result_score_left: leftGrade ? (config.score_map[leftGrade] ?? null) : null,
        result_score_right: rightGrade ? (config.score_map[rightGrade] ?? null) : null,
      };
    }

    case "enum_lr": {
      const config = resultSchema.score_config;
      if (!config || !resultData) return EMPTY;
      const leftValue = String((resultData.left as Record<string, unknown> | undefined)?.value ?? "");
      const rightValue = String((resultData.right as Record<string, unknown> | undefined)?.value ?? "");
      return {
        result_score: null,
        result_score_left: leftValue ? (config.score_map[leftValue] ?? null) : null,
        result_score_right: rightValue ? (config.score_map[rightValue] ?? null) : null,
      };
    }

    default:
      return EMPTY;
  }
}
