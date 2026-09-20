import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  elections,
  voteOptions,
  voteParticipation,
  voteQuestions,
  voteRecords,
} from "../db/schema.js";
import { withClub, withRollback, type TestTx } from "../test/db.js";
import { hasDb } from "../test/setup.js";
import { recordBallot } from "./voting.js";

interface Ballot {
  questionId: string;
  optionAId: string;
  optionBId: string;
}

/** Seeds an open election with one question and two options. */
async function seedElection(tx: TestTx, clubId: string, memberId: string): Promise<Ballot> {
  const now = Date.now();
  const [election] = await tx
    .insert(elections)
    .values({
      club_id: clubId,
      title: "Ballot Integrity Test Election",
      starts_at: new Date(now - 60_000),
      ends_at: new Date(now + 3_600_000),
      created_by: memberId,
    })
    .returning({ id: elections.id });

  const [question] = await tx
    .insert(voteQuestions)
    .values({
      election_id: election.id,
      title: "Approve the amendment?",
      question_type: "yes_no",
    })
    .returning({ id: voteQuestions.id });

  const [optionA, optionB] = await tx
    .insert(voteOptions)
    .values([
      { question_id: question.id, label: "Yes", sort_order: 0 },
      { question_id: question.id, label: "No", sort_order: 1 },
    ])
    .returning({ id: voteOptions.id });

  return { questionId: question.id, optionAId: optionA.id, optionBId: optionB.id };
}

async function countRecords(tx: TestTx, questionId: string): Promise<number> {
  const rows = await tx.select().from(voteRecords).where(eq(voteRecords.question_id, questionId));
  return rows.length;
}

describe.skipIf(!hasDb)("recordBallot", () => {
  it("writes no weighted vote_records when the participation insert loses the race", async () => {
    await withRollback(async (tx) => {
      const { clubAId, memberAId } = await withClub(tx);
      const ballot = await seedElection(tx, clubAId, memberAId);

      // Stand in for a concurrent request that committed first: the pre-check
      // in the handler saw nothing, but by write time the unique index is
      // already occupied for (question_id, member_id).
      await tx
        .insert(voteParticipation)
        .values({ question_id: ballot.questionId, member_id: memberAId });

      await expect(
        recordBallot(
          tx,
          [{ question_id: ballot.questionId, option_id: ballot.optionAId }],
          memberAId,
          10
        )
      ).rejects.toThrow();

      // The whole point: the weighted row must not survive a rejected ballot.
      // Before the fix, vote_records was written first and left committed,
      // so the caller could replay the request and stack weight forever.
      expect(await countRecords(tx, ballot.questionId)).toBe(0);
    });
  });

  it("leaves no partial state when one vote in a multi-vote ballot conflicts", async () => {
    await withRollback(async (tx) => {
      const { clubAId, memberAId } = await withClub(tx);
      const first = await seedElection(tx, clubAId, memberAId);
      const second = await seedElection(tx, clubAId, memberAId);

      await tx
        .insert(voteParticipation)
        .values({ question_id: second.questionId, member_id: memberAId });

      await expect(
        recordBallot(
          tx,
          [
            { question_id: first.questionId, option_id: first.optionAId },
            { question_id: second.questionId, option_id: second.optionAId },
          ],
          memberAId,
          10
        )
      ).rejects.toThrow();

      // The clean question must be untouched too — the ballot is all-or-nothing.
      expect(await countRecords(tx, first.questionId)).toBe(0);
      expect(await countRecords(tx, second.questionId)).toBe(0);

      const participation = await tx
        .select()
        .from(voteParticipation)
        .where(
          and(
            eq(voteParticipation.question_id, first.questionId),
            eq(voteParticipation.member_id, memberAId)
          )
        );
      expect(participation).toHaveLength(0);
    });
  });

  it("commits participation and the weighted record together on the happy path", async () => {
    await withRollback(async (tx) => {
      const { clubAId, memberAId } = await withClub(tx);
      const ballot = await seedElection(tx, clubAId, memberAId);

      await recordBallot(
        tx,
        [{ question_id: ballot.questionId, option_id: ballot.optionBId }],
        memberAId,
        7
      );

      const records = await tx
        .select()
        .from(voteRecords)
        .where(eq(voteRecords.question_id, ballot.questionId));
      expect(records).toHaveLength(1);
      expect(records[0].option_id).toBe(ballot.optionBId);
      expect(records[0].points).toBe(7);

      const participation = await tx
        .select()
        .from(voteParticipation)
        .where(eq(voteParticipation.question_id, ballot.questionId));
      expect(participation).toHaveLength(1);
      expect(participation[0].member_id).toBe(memberAId);
    });
  });
});
