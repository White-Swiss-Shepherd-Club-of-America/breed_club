import { describe, expect, it } from "vitest";
import { computeResultScores } from "./scoring.js";
import type { ResultSchemaEnum, ResultSchemaNumericLR } from "../db/schema.js";

const hipEnum: ResultSchemaEnum = {
  type: "enum",
  options: ["Excellent", "Good", "Fair", "Dysplastic"],
  score_config: {
    score_map: { Excellent: 100, Good: 85, Fair: 60, Dysplastic: 0 },
  },
};

describe("computeResultScores", () => {
  it("maps an enum result through score_map into result_score", () => {
    expect(computeResultScores("Good", null, hipEnum)).toEqual({
      result_score: 85,
      result_score_left: null,
      result_score_right: null,
    });
  });

  it("scores a mapped value of 0 rather than coercing it to null", () => {
    expect(computeResultScores("Dysplastic", null, hipEnum).result_score).toBe(0);
  });

  it("returns a null result_score for a value absent from score_map", () => {
    expect(computeResultScores("Borderline", null, hipEnum)).toEqual({
      result_score: null,
      result_score_left: null,
      result_score_right: null,
    });
  });

  it("scores bilateral numeric results per side from the range table", () => {
    const elbowDepth: ResultSchemaNumericLR = {
      type: "numeric_lr",
      fields: [{ label: "Depth", key: "depth", unit: "mm" }],
      score_config: {
        field: "depth",
        ranges: [
          { max: 1, score: 100 },
          { max: 3, score: 70 },
          { max: 5, score: 30 },
        ],
      },
    };

    expect(
      computeResultScores("n/a", { left: { depth: 0.5 }, right: { depth: 2 } }, elbowDepth)
    ).toEqual({
      result_score: null,
      result_score_left: 100,
      result_score_right: 70,
    });
  });

  it("clamps a numeric value above every range to the worst range score", () => {
    const elbowDepth: ResultSchemaNumericLR = {
      type: "numeric_lr",
      fields: [{ label: "Depth", key: "depth" }],
      score_config: {
        field: "depth",
        ranges: [
          { max: 1, score: 100 },
          { max: 3, score: 70 },
        ],
      },
    };

    expect(
      computeResultScores("n/a", { left: { depth: 99 }, right: {} }, elbowDepth)
    ).toEqual({
      result_score: null,
      result_score_left: 70,
      result_score_right: null,
    });
  });

  it("degrades to all-null when the org link has no result_schema", () => {
    expect(computeResultScores("Good", null, null)).toEqual({
      result_score: null,
      result_score_left: null,
      result_score_right: null,
    });
  });
});
