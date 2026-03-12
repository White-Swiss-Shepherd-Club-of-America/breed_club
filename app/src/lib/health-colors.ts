/**
 * Shared health rating color utilities.
 * Mirrors the color/threshold logic from api/src/lib/rating.ts.
 */

import type { HealthRating, DogHealthClearance } from "@breed-club/shared";
import { parseLocalDate } from "./utils";

export type HealthRatingColor = "red" | "orange" | "yellow" | "green" | "blue" | "gray";

export const RATING_COLORS: Record<HealthRatingColor, string> = {
  red: "#dc3545",
  orange: "#fd7e14",
  yellow: "#ffc107",
  green: "#28a745",
  blue: "#0d6efd",
  gray: "#6c757d",
};

export const RATING_BG_CLASSES: Record<HealthRatingColor, string> = {
  red: "bg-red-100 text-red-800",
  orange: "bg-orange-100 text-orange-800",
  yellow: "bg-yellow-100 text-yellow-800",
  green: "bg-green-100 text-green-800",
  blue: "bg-blue-100 text-blue-800",
  gray: "bg-gray-100 text-gray-500",
};

export const RATING_LABELS: Record<HealthRatingColor, string> = {
  red: "Incomplete",
  orange: "Below Standard",
  yellow: "Developing",
  green: "Good",
  blue: "Excellent",
  gray: "Not Rated",
};

const DEFAULT_THRESHOLDS = { red: 20, orange: 40, yellow: 60, green: 95 };

/** Map a numeric 0-100 score to a rating color. */
export function scoreToColor(score: number): HealthRatingColor {
  if (score <= DEFAULT_THRESHOLDS.red) return "red";
  if (score <= DEFAULT_THRESHOLDS.orange) return "orange";
  if (score <= DEFAULT_THRESHOLDS.yellow) return "yellow";
  if (score <= DEFAULT_THRESHOLDS.green) return "green";
  return "blue";
}

/** Get the hex color for a HealthRating (or gray if null). */
export function ratingToHex(rating: HealthRating | null | undefined): string {
  return RATING_COLORS[rating?.color ?? "gray"];
}

/** Get the Tailwind bg class for a HealthRating (or gray if null). */
export function ratingBgClass(rating: HealthRating | null | undefined): string {
  return RATING_BG_CLASSES[rating?.color ?? "gray"];
}

/**
 * Compute the effective score for a clearance.
 * For bilateral tests: worst (lower) side.
 * For single-sided: result_score.
 * Returns null if no scores available.
 */
export function effectiveScore(c: DogHealthClearance): number | null {
  if (c.result_score_left != null && c.result_score_right != null) {
    return Math.min(c.result_score_left, c.result_score_right);
  }
  if (c.result_score_left != null) return c.result_score_left;
  if (c.result_score_right != null) return c.result_score_right;
  if (c.result_score != null) return c.result_score;
  return null;
}

/** Score color for an individual clearance. */
export function clearanceColor(c: DogHealthClearance): HealthRatingColor {
  const score = effectiveScore(c);
  return score != null ? scoreToColor(score) : "gray";
}

/** Format age difference as "Xy Zm". */
export function formatAge(dob: string, testDate: string): string {
  const birth = parseLocalDate(dob);
  const test = parseLocalDate(testDate);
  if (!birth || !test) return "\u2014";
  let years = test.getFullYear() - birth.getFullYear();
  let months = test.getMonth() - birth.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years < 0) return "\u2014";
  if (years === 0) return `${months}m`;
  return `${years}y ${months}m`;
}
