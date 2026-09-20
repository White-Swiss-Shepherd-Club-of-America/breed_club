import { describe, expect, it } from "vitest";
import { castBallotSchema } from "@breed-club/shared/validation.js";

const Q1 = "11111111-1111-4111-8111-111111111111";
const Q2 = "22222222-2222-4222-8222-222222222222";
const OPT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("castBallotSchema", () => {
  it("rejects two votes on the same question", () => {
    const result = castBallotSchema.safeParse({
      votes: [
        { question_id: Q1, option_id: OPT_A },
        { question_id: Q1, option_id: OPT_B },
      ],
    });

    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    // Points at the offending element, not the whole array, so the client can
    // highlight the duplicate rather than discard the ballot.
    expect(issue.path).toEqual(["votes", 1, "question_id"]);
    expect(issue.message).toContain(Q1);
  });

  it("rejects a repeat of the identical vote, not just a changed option", () => {
    const result = castBallotSchema.safeParse({
      votes: [
        { question_id: Q1, option_id: OPT_A },
        { question_id: Q1, option_id: OPT_A },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("accepts one vote per question across different questions", () => {
    const result = castBallotSchema.safeParse({
      votes: [
        { question_id: Q1, option_id: OPT_A },
        { question_id: Q2, option_id: OPT_A },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data!.votes).toHaveLength(2);
  });

  it("still requires at least one vote", () => {
    expect(castBallotSchema.safeParse({ votes: [] }).success).toBe(false);
  });
});
