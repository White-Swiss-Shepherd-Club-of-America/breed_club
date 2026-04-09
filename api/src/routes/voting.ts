/**
 * Voting routes.
 *
 * Admin — Voting Tiers:
 * - GET    /tiers                    — list voting tiers
 * - POST   /tiers                    — create voting tier
 * - PATCH  /tiers/:id                — update voting tier
 * - DELETE /tiers/:id                — delete voting tier
 *
 * Admin — Tier Assignments:
 * - GET    /tiers/assignments        — list all member→tier assignments
 * - POST   /tiers/assign             — assign member to tier
 * - POST   /tiers/assign/bulk        — bulk assign members to tier
 * - DELETE /tiers/assignments/:memberId — remove assignment
 *
 * Admin — Elections:
 * - POST   /elections                — create election with questions/options
 * - PATCH  /elections/:id            — update election (upcoming only)
 * - DELETE /elections/:id            — delete election (upcoming only)
 * - GET    /elections/:id/participation — who voted (names only)
 *
 * Member — Elections:
 * - GET    /elections                — list elections
 * - GET    /elections/:id            — election detail
 * - POST   /elections/:id/vote       — cast ballot
 * - GET    /elections/:id/results    — results (closed only)
 */

import { Hono } from "hono";
import { eq, and, inArray, sql, count } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext, ElectionStatus } from "@breed-club/shared";
import { requireLevel } from "../middleware/rbac.js";
import { notFound, badRequest, forbidden, conflict } from "../lib/errors.js";
import {
  votingTiers,
  memberVotingTiers,
  membershipTiers,
  elections,
  voteQuestions,
  voteOptions,
  voteRecords,
  voteParticipation,
  members,
  contacts,
} from "../db/schema.js";
import {
  createVotingTierSchema,
  updateVotingTierSchema,
  assignVotingTierSchema,
  bulkAssignVotingTierSchema,
  createElectionSchema,
  updateElectionSchema,
  castBallotSchema,
} from "@breed-club/shared/validation.js";

type Variables = {
  clubId: string;
  db: Database;
  clerkUserId: string | null;
  auth: AuthContext | null;
};

export const votingRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeElectionStatus(starts_at: string | Date, ends_at: string | Date): ElectionStatus {
  const now = new Date();
  const start = new Date(starts_at);
  const end = new Date(ends_at);
  if (now < start) return "upcoming";
  if (now >= start && now < end) return "open";
  return "closed";
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — VOTING TIERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /tiers — list all voting tiers for the club.
 */
votingRoutes.get("/tiers", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const tiers = await db.query.votingTiers.findMany({
    where: eq(votingTiers.club_id, clubId),
    orderBy: votingTiers.sort_order,
    with: {
      assignments: true,
      membershipTier: true,
    },
  });

  // For tiers linked to a membership tier, count members at that tier slug.
  // For unlinked tiers, fall back to manual assignment count.
  const memberCountPromises = tiers.map(async (t) => {
    if (t.membershipTier) {
      const [row] = await db
        .select({ count: count() })
        .from(members)
        .where(and(
          eq(members.club_id, clubId),
          eq(members.tier, t.membershipTier.slug)
        ));
      return row?.count ?? 0;
    }
    return t.assignments.length;
  });

  const memberCounts = await Promise.all(memberCountPromises);

  return c.json(
    tiers.map((t, i) => ({
      ...t,
      member_count: memberCounts[i],
      assignments: undefined,
      membershipTier: undefined,
    }))
  );
});

/**
 * POST /tiers — create a voting tier.
 */
votingRoutes.post("/tiers", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const body = createVotingTierSchema.parse(await c.req.json());

  const [tier] = await db
    .insert(votingTiers)
    .values({ ...body, club_id: clubId })
    .returning();

  return c.json(tier, 201);
});

/**
 * PATCH /tiers/:id — update a voting tier.
 */
votingRoutes.patch("/tiers/:id", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");
  const body = updateVotingTierSchema.parse(await c.req.json());

  const existing = await db.query.votingTiers.findFirst({
    where: and(eq(votingTiers.id, id), eq(votingTiers.club_id, clubId)),
  });
  if (!existing) throw notFound("Voting tier");

  const [updated] = await db
    .update(votingTiers)
    .set({ ...body, updated_at: new Date() })
    .where(eq(votingTiers.id, id))
    .returning();

  return c.json(updated);
});

/**
 * DELETE /tiers/:id — delete a voting tier (reject if members assigned).
 */
votingRoutes.delete("/tiers/:id", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const existing = await db.query.votingTiers.findFirst({
    where: and(eq(votingTiers.id, id), eq(votingTiers.club_id, clubId)),
    with: { assignments: true },
  });
  if (!existing) throw notFound("Voting tier");

  if (existing.assignments.length > 0) {
    throw badRequest("Cannot delete a voting tier that has members assigned. Reassign or remove members first.");
  }

  await db.delete(votingTiers).where(eq(votingTiers.id, id));
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — TIER ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /tiers/assignments — list all member→tier assignments.
 */
votingRoutes.get("/tiers/assignments", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const assignments = await db.query.memberVotingTiers.findMany({
    with: {
      member: { with: { contact: true } },
      votingTier: true,
    },
  });

  // Filter to only assignments for this club's voting tiers
  const filtered = assignments.filter((a) => a.votingTier?.club_id === clubId);

  return c.json(
    filtered.map((a) => ({
      id: a.id,
      member_id: a.member_id,
      voting_tier_id: a.voting_tier_id,
      assigned_at: a.assigned_at,
      assigned_by: a.assigned_by,
      member_name: a.member?.contact?.full_name ?? null,
      member_email: a.member?.contact?.email ?? null,
      tier_name: a.votingTier?.name ?? null,
      tier_points: a.votingTier?.points ?? null,
    }))
  );
});

/**
 * POST /tiers/assign — assign a member to a voting tier.
 */
votingRoutes.post("/tiers/assign", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth")!;
  const body = assignVotingTierSchema.parse(await c.req.json());

  // Verify tier belongs to this club
  const tier = await db.query.votingTiers.findFirst({
    where: and(eq(votingTiers.id, body.voting_tier_id), eq(votingTiers.club_id, clubId)),
  });
  if (!tier) throw notFound("Voting tier");

  // Verify member belongs to this club
  const member = await db.query.members.findFirst({
    where: and(eq(members.id, body.member_id), eq(members.club_id, clubId)),
  });
  if (!member) throw notFound("Member");

  // Upsert — if already assigned, update the tier
  const existing = await db.query.memberVotingTiers.findFirst({
    where: eq(memberVotingTiers.member_id, body.member_id),
  });

  if (existing) {
    const [updated] = await db
      .update(memberVotingTiers)
      .set({
        voting_tier_id: body.voting_tier_id,
        assigned_at: new Date(),
        assigned_by: auth.memberId,
      })
      .where(eq(memberVotingTiers.id, existing.id))
      .returning();
    return c.json(updated);
  }

  const [assignment] = await db
    .insert(memberVotingTiers)
    .values({
      member_id: body.member_id,
      voting_tier_id: body.voting_tier_id,
      assigned_by: auth.memberId,
    })
    .returning();

  return c.json(assignment, 201);
});

/**
 * POST /tiers/assign/bulk — bulk assign members to a voting tier.
 */
votingRoutes.post("/tiers/assign/bulk", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth")!;
  const body = bulkAssignVotingTierSchema.parse(await c.req.json());

  // Verify tier belongs to this club
  const tier = await db.query.votingTiers.findFirst({
    where: and(eq(votingTiers.id, body.voting_tier_id), eq(votingTiers.club_id, clubId)),
  });
  if (!tier) throw notFound("Voting tier");

  // For each member: delete existing assignment, insert new one
  for (const memberId of body.member_ids) {
    await db.delete(memberVotingTiers).where(eq(memberVotingTiers.member_id, memberId));
    await db.insert(memberVotingTiers).values({
      member_id: memberId,
      voting_tier_id: body.voting_tier_id,
      assigned_by: auth.memberId,
    });
  }

  return c.json({ ok: true, assigned: body.member_ids.length });
});

/**
 * DELETE /tiers/assignments/:memberId — remove a member's voting tier.
 */
votingRoutes.delete("/tiers/assignments/:memberId", requireLevel(100), async (c) => {
  const db = c.get("db");
  const memberId = c.req.param("memberId");

  const existing = await db.query.memberVotingTiers.findFirst({
    where: eq(memberVotingTiers.member_id, memberId),
  });
  if (!existing) throw notFound("Voting tier assignment");

  await db.delete(memberVotingTiers).where(eq(memberVotingTiers.id, existing.id));
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ELECTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /elections — list elections.
 * Admin sees all; members see open + closed only.
 */
votingRoutes.get("/elections", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth")!;
  const isAdmin = auth.isAdmin;

  const allElections = await db.query.elections.findMany({
    where: eq(elections.club_id, clubId),
    with: { questions: { with: { options: true } } },
    orderBy: elections.starts_at,
  });

  // If member has voted on questions, annotate
  const result = await Promise.all(
    allElections.map(async (election) => {
      const status = computeElectionStatus(election.starts_at, election.ends_at);

      // Non-admins only see open + closed elections
      if (!isAdmin && status === "upcoming") return null;

      // Check which questions the member has already voted on
      const questionIds = election.questions.map((q) => q.id);
      let votedQuestionIds: string[] = [];
      if (questionIds.length > 0) {
        const participated = await db.query.voteParticipation.findMany({
          where: and(
            inArray(voteParticipation.question_id, questionIds),
            eq(voteParticipation.member_id, auth.memberId)
          ),
        });
        votedQuestionIds = participated.map((p) => p.question_id);
      }

      return {
        ...election,
        status,
        questions: election.questions.map((q) => ({
          ...q,
          has_voted: votedQuestionIds.includes(q.id),
        })),
      };
    })
  );

  return c.json(result.filter(Boolean));
});

/**
 * GET /elections/:id — election detail.
 */
votingRoutes.get("/elections/:id", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth")!;
  const id = c.req.param("id");

  const election = await db.query.elections.findFirst({
    where: and(eq(elections.id, id), eq(elections.club_id, clubId)),
    with: { questions: { with: { options: true } } },
  });
  if (!election) throw notFound("Election");

  const status = computeElectionStatus(election.starts_at, election.ends_at);

  // Check which questions the member has voted on
  const questionIds = election.questions.map((q) => q.id);
  let votedQuestionIds: string[] = [];
  if (questionIds.length > 0) {
    const participated = await db.query.voteParticipation.findMany({
      where: and(
        inArray(voteParticipation.question_id, questionIds),
        eq(voteParticipation.member_id, auth.memberId)
      ),
    });
    votedQuestionIds = participated.map((p) => p.question_id);
  }

  return c.json({
    ...election,
    status,
    questions: election.questions.map((q) => ({
      ...q,
      has_voted: votedQuestionIds.includes(q.id),
    })),
  });
});

/**
 * POST /elections — create an election with nested questions and options.
 */
votingRoutes.post("/elections", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth")!;
  const body = createElectionSchema.parse(await c.req.json());

  // Create election
  const [election] = await db
    .insert(elections)
    .values({
      club_id: clubId,
      title: body.title,
      description: body.description ?? null,
      starts_at: new Date(body.starts_at),
      ends_at: new Date(body.ends_at),
      created_by: auth.memberId,
    })
    .returning();

  // Create questions and options
  for (const q of body.questions) {
    const [question] = await db
      .insert(voteQuestions)
      .values({
        election_id: election.id,
        title: q.title,
        description: q.description ?? null,
        question_type: q.question_type,
        sort_order: q.sort_order,
      })
      .returning();

    if (q.question_type === "yes_no") {
      // Auto-create Yes/No options
      await db.insert(voteOptions).values([
        { question_id: question.id, label: "Yes", sort_order: 0 },
        { question_id: question.id, label: "No", sort_order: 1 },
      ]);
    } else if (q.options) {
      // Create custom options
      await db.insert(voteOptions).values(
        q.options.map((opt, idx) => ({
          question_id: question.id,
          label: opt.label,
          sort_order: opt.sort_order ?? idx,
        }))
      );
    }
  }

  // Reload with questions and options
  const full = await db.query.elections.findFirst({
    where: eq(elections.id, election.id),
    with: { questions: { with: { options: true } } },
  });

  return c.json(full, 201);
});

/**
 * PATCH /elections/:id — update an election (only if upcoming).
 */
votingRoutes.patch("/elections/:id", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");
  const body = updateElectionSchema.parse(await c.req.json());

  const election = await db.query.elections.findFirst({
    where: and(eq(elections.id, id), eq(elections.club_id, clubId)),
  });
  if (!election) throw notFound("Election");

  const status = computeElectionStatus(election.starts_at, election.ends_at);

  // Only allow title/description/dates changes on upcoming elections
  // results_visible can be toggled on any election
  if (status !== "upcoming") {
    const { results_visible, ...rest } = body;
    if (Object.keys(rest).length > 0) {
      throw badRequest("Can only update title, description, and dates on upcoming elections. Use results_visible to toggle result display.");
    }
  }

  const [updated] = await db
    .update(elections)
    .set({
      ...body,
      starts_at: body.starts_at ? new Date(body.starts_at) : undefined,
      ends_at: body.ends_at ? new Date(body.ends_at) : undefined,
      updated_at: new Date(),
    })
    .where(eq(elections.id, id))
    .returning();

  return c.json(updated);
});

/**
 * DELETE /elections/:id — delete an election (only if upcoming).
 */
votingRoutes.delete("/elections/:id", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const election = await db.query.elections.findFirst({
    where: and(eq(elections.id, id), eq(elections.club_id, clubId)),
  });
  if (!election) throw notFound("Election");

  const status = computeElectionStatus(election.starts_at, election.ends_at);
  if (status !== "upcoming") {
    throw badRequest("Can only delete upcoming elections");
  }

  // Cascade delete handles questions, options
  await db.delete(elections).where(eq(elections.id, id));
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// VOTE CASTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /elections/:id/vote — cast ballot.
 *
 * Anonymity: inserts into vote_records (what was voted) and
 * vote_participation (who voted) as separate, unjoinable records.
 */
votingRoutes.post("/elections/:id/vote", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth")!;
  const id = c.req.param("id");
  const body = castBallotSchema.parse(await c.req.json());

  // 1. Verify election exists and is open
  const election = await db.query.elections.findFirst({
    where: and(eq(elections.id, id), eq(elections.club_id, clubId)),
    with: { questions: { with: { options: true } } },
  });
  if (!election) throw notFound("Election");

  const status = computeElectionStatus(election.starts_at, election.ends_at);
  if (status !== "open") {
    throw badRequest("This election is not currently open for voting");
  }

  // 2. Resolve voting points: manual override first, then membership tier → voting tier
  let points: number | null = null;

  // Check for manual voting tier assignment (override)
  const manualAssignment = await db.query.memberVotingTiers.findFirst({
    where: eq(memberVotingTiers.member_id, auth.memberId),
    with: { votingTier: true },
  });
  if (manualAssignment?.votingTier?.is_active) {
    points = manualAssignment.votingTier.points;
  }

  // Fallback: membership tier → linked voting tier
  if (points === null && auth.member?.tier) {
    const memberTier = await db.query.membershipTiers.findFirst({
      where: and(
        eq(membershipTiers.club_id, clubId),
        eq(membershipTiers.slug, auth.member.tier)
      ),
    });
    if (memberTier) {
      const linkedVotingTier = await db.query.votingTiers.findFirst({
        where: and(
          eq(votingTiers.club_id, clubId),
          eq(votingTiers.membership_tier_id, memberTier.id),
          eq(votingTiers.is_active, true)
        ),
      });
      if (linkedVotingTier) {
        points = linkedVotingTier.points;
      }
    }
  }

  if (points === null) {
    throw forbidden("Your membership tier does not have voting rights configured. Contact an administrator.");
  }

  // 3. Build lookup maps for validation
  const questionMap = new Map(election.questions.map((q) => [q.id, q]));

  // 4. Validate each vote
  for (const vote of body.votes) {
    const question = questionMap.get(vote.question_id);
    if (!question) {
      throw badRequest(`Question ${vote.question_id} does not belong to this election`);
    }
    const validOptionIds = question.options?.map((o) => o.id) ?? [];
    if (!validOptionIds.includes(vote.option_id)) {
      throw badRequest(`Option ${vote.option_id} does not belong to question ${vote.question_id}`);
    }
  }

  // 5. Check that member hasn't already voted on any of these questions
  const questionIds = body.votes.map((v) => v.question_id);
  const existingParticipation = await db.query.voteParticipation.findMany({
    where: and(
      inArray(voteParticipation.question_id, questionIds),
      eq(voteParticipation.member_id, auth.memberId)
    ),
  });
  if (existingParticipation.length > 0) {
    const alreadyVoted = existingParticipation.map((p) => p.question_id);
    throw conflict(`You have already voted on question(s): ${alreadyVoted.join(", ")}`);
  }

  // 6. Insert vote records and participation in a transaction
  // vote_records: anonymous (no member_id)
  // vote_participation: tracking (no option_id, no points)
  await db.insert(voteRecords).values(
    body.votes.map((v) => ({
      question_id: v.question_id,
      option_id: v.option_id,
      points,
    }))
  );

  await db.insert(voteParticipation).values(
    body.votes.map((v) => ({
      question_id: v.question_id,
      member_id: auth.memberId,
    }))
  );

  return c.json({ ok: true, voted: body.votes.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /elections/:id/results — aggregated results (closed or results_visible only).
 */
votingRoutes.get("/elections/:id/results", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const election = await db.query.elections.findFirst({
    where: and(eq(elections.id, id), eq(elections.club_id, clubId)),
    with: { questions: { with: { options: true } } },
  });
  if (!election) throw notFound("Election");

  const status = computeElectionStatus(election.starts_at, election.ends_at);

  if (status !== "closed" && !election.results_visible) {
    throw forbidden("Results are not yet available. Voting is still in progress.");
  }

  // Aggregate results per question
  const questionResults = await Promise.all(
    election.questions.map(async (question) => {
      // Get vote counts per option
      const records = await db
        .select({
          option_id: voteRecords.option_id,
          vote_count: sql<number>`count(*)::int`,
          points_total: sql<number>`coalesce(sum(${voteRecords.points}), 0)::int`,
        })
        .from(voteRecords)
        .where(eq(voteRecords.question_id, question.id))
        .groupBy(voteRecords.option_id);

      // Get participation count
      const [{ participation_count }] = await db
        .select({ participation_count: sql<number>`count(*)::int` })
        .from(voteParticipation)
        .where(eq(voteParticipation.question_id, question.id));

      // Build option results map
      const recordMap = new Map(records.map((r) => [r.option_id, r]));
      const totalPoints = records.reduce((sum, r) => sum + r.points_total, 0);

      return {
        question_id: question.id,
        title: question.title,
        question_type: question.question_type,
        participation_count,
        total_points: totalPoints,
        options: (question.options ?? []).map((opt) => ({
          option_id: opt.id,
          label: opt.label,
          vote_count: recordMap.get(opt.id)?.vote_count ?? 0,
          points_total: recordMap.get(opt.id)?.points_total ?? 0,
        })),
      };
    })
  );

  return c.json({
    election_id: election.id,
    title: election.title,
    status,
    questions: questionResults,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — PARTICIPATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /elections/:id/participation — who voted (names only, not choices).
 */
votingRoutes.get("/elections/:id/participation", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const election = await db.query.elections.findFirst({
    where: and(eq(elections.id, id), eq(elections.club_id, clubId)),
    with: { questions: true },
  });
  if (!election) throw notFound("Election");

  const questionIds = election.questions.map((q) => q.id);
  if (questionIds.length === 0) {
    return c.json({ election_id: id, participants: [] });
  }

  const participation = await db.query.voteParticipation.findMany({
    where: inArray(voteParticipation.question_id, questionIds),
    with: {
      member: { with: { contact: true } },
    },
  });

  // Deduplicate by member (they may have voted on multiple questions)
  const memberMap = new Map<string, { member_id: string; name: string; voted_at: string; questions_voted: number }>();

  for (const p of participation) {
    const existing = memberMap.get(p.member_id);
    if (existing) {
      existing.questions_voted++;
    } else {
      memberMap.set(p.member_id, {
        member_id: p.member_id,
        name: p.member?.contact?.full_name ?? "Unknown",
        voted_at: new Date(p.voted_at).toISOString().split("T")[0], // date only
        questions_voted: 1,
      });
    }
  }

  return c.json({
    election_id: id,
    total_questions: election.questions.length,
    participants: Array.from(memberMap.values()),
  });
});
