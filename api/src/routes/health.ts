import { Hono } from "hono";
import { eq, and, desc, asc, sql, count, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Env, ApiContext } from "../lib/types.js";
import { notFound, unauthorized, badRequest, conflict, forbidden } from "../lib/errors.js";
import { isDogOwner } from "../lib/ownership.js";
import { getDb } from "../db/client.js";
import {
  healthTestTypes,
  healthTestTypeOrgs,
  organizations,
  dogHealthClearances,
  dogOwnershipTransfers,
  healthConditions,
  dogs,
  memberHealthStatsCache,
} from "../db/schema.js";
import type { ResultSchema } from "../db/schema.js";
import { computeResultScores } from "../lib/scoring.js";
import { recomputeHealthRating } from "../lib/rating.js";
import { healthStatisticsCache } from "../db/schema.js";
import { computeHealthStatistics, refreshHealthStatisticsCache } from "../lib/compute-health-stats.js";
import { computeMemberHealthStats, refreshMemberHealthStatsCache } from "../lib/compute-member-health-stats.js";

const healthRoutes = new Hono<{ Bindings: Env }>();

// ─── Schemas ────────────────────────────────────────────────────────────────

const createClearanceSchema = z.object({
  health_test_type_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  result: z.string().min(1),
  result_data: z.record(z.unknown()).nullish(),
  result_detail: z.string().optional(),
  test_date: z.string(), // ISO date string, required
  expiration_date: z.string().optional(),
  certificate_number: z.string().optional(),
  certificate_url: z.string().max(500).optional(),
  notes: z.string().optional(),
});

const updateClearanceSchema = createClearanceSchema.partial();

const batchClearanceItemSchema = z.object({
  health_test_type_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  result: z.string().min(1),
  result_data: z.record(z.unknown()).nullish(),
  result_detail: z.string().optional(),
  test_date: z.string(),
  expiration_date: z.string().optional(),
  certificate_number: z.string().optional(),
  notes: z.string().optional(),
});

const batchClearanceSchema = z.object({
  clearances: z.array(batchClearanceItemSchema).min(1).max(20),
  certificate_url: z.string().max(500).optional(),
});

const myClearanceQuerySchema = z.object({
  status: z.enum(["all", "pending", "approved", "rejected"]).default("all"),
  breeding_status: z
    .enum(["all", "not_published", "altered", "retired", "breeding"])
    .default("all"),
  sort_by: z.enum(["created_at", "test_date", "status", "dog_name", "test_type"]).default("created_at"),
  sort_dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Result Summary Helpers ─────────────────────────────────────────────────

/**
 * Compute a human-readable result summary string from structured result_data.
 * Falls back to the provided result string if result_data is null.
 */
function computeResultSummary(
  result: string,
  resultData: Record<string, unknown> | null | undefined,
  resultSchema: { type: string } | null | undefined
): string {
  if (!resultData || !resultSchema) return result;

  switch (resultSchema.type) {
    case "numeric_lr": {
      const left = resultData.left as Record<string, number> | undefined;
      const right = resultData.right as Record<string, number> | undefined;
      if (!left || !right) return result;
      const keys = Object.keys(left);
      const parts = keys.map((k) => `${k.toUpperCase()}: L=${left[k]}, R=${right[k]}`);
      return parts.join("; ");
    }
    case "point_score_lr": {
      const left = resultData.left as Record<string, number> | undefined;
      const right = resultData.right as Record<string, number> | undefined;
      const total = resultData.total as number | undefined;
      if (left?.total != null && right?.total != null && total != null) {
        return `${total} (R:${right.total}, L:${left.total})`;
      }
      return result;
    }
    case "elbow_lr": {
      const left = resultData.left as { grade?: number } | undefined;
      const right = resultData.right as { grade?: number } | undefined;
      if (left && right) {
        return `L: Grade ${left.grade ?? "?"}, R: Grade ${right.grade ?? "?"}`;
      }
      return result;
    }
    case "enum_lr": {
      const left = resultData.left as { value?: string } | undefined;
      const right = resultData.right as { value?: string } | undefined;
      if (left && right) {
        return `L: ${left.value ?? "?"}, R: ${right.value ?? "?"}`;
      }
      return result;
    }
    default:
      return result;
  }
}

const createConditionSchema = z.object({
  condition_name: z.string().min(1),
  category: z.string().optional(),
  diagnosis_date: z.string().optional(),
  resolved_date: z.string().optional(),
  severity: z.string().optional(),
  notes: z.string().optional(),
});

const updateConditionSchema = createConditionSchema.partial();

// ─── GET /api/health/test-types — catalog of all test types with orgs ──────

healthRoutes.get("/test-types", async (c: ApiContext) => {
  const club = c.get("club");
  if (!club) throw badRequest("Club context required");

  const db = await getDb(c.env);

  // Fetch all test types for this club with their linked organizations
  const testTypes = await db
    .select({
      id: healthTestTypes.id,
      name: healthTestTypes.name,
      short_name: healthTestTypes.short_name,
      category: healthTestTypes.category,
      result_options: healthTestTypes.result_options,
      is_required: healthTestTypes.is_required,
      rating_category: healthTestTypes.rating_category,
      description: healthTestTypes.description,
      sort_order: healthTestTypes.sort_order,
      is_active: healthTestTypes.is_active,
    })
    .from(healthTestTypes)
    .where(and(eq(healthTestTypes.club_id, club.id), eq(healthTestTypes.is_active, true)))
    .orderBy(healthTestTypes.sort_order, healthTestTypes.name);

  // Fetch org links for each test type
  const testTypeIds = testTypes.map((t) => t.id);

  const orgLinks = await db
    .select({
      health_test_type_id: healthTestTypeOrgs.health_test_type_id,
      result_schema: healthTestTypeOrgs.result_schema,
      confidence: healthTestTypeOrgs.confidence,
      thresholds: healthTestTypeOrgs.thresholds,
      organization: {
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
        country: organizations.country,
        website_url: organizations.website_url,
      },
    })
    .from(healthTestTypeOrgs)
    .innerJoin(organizations, eq(healthTestTypeOrgs.organization_id, organizations.id))
    .where(eq(organizations.is_active, true));

  // Group orgs by test type, including result_schema and confidence
  const orgsByTestType = orgLinks.reduce(
    (acc, link) => {
      if (!acc[link.health_test_type_id]) {
        acc[link.health_test_type_id] = [];
      }
      acc[link.health_test_type_id].push({
        ...link.organization,
        result_schema: link.result_schema,
        confidence: link.confidence,
        thresholds: link.thresholds,
      });
      return acc;
    },
    {} as Record<string, Array<typeof orgLinks[0]["organization"] & { result_schema: unknown; confidence: number | null; thresholds: unknown }>>
  );

  const result = testTypes.map((tt) => ({
    ...tt,
    organizations: orgsByTestType[tt.id] || [],
  }));

  return c.json({ test_types: result });
});

// ─── POST /api/dogs/:id/clearances — submit clearance ──────────────────────
//
// Payment flow:
// - Checks club fee configuration
// - If fee is $0 for user's tier: creates clearance immediately
// - If fee > $0: returns requiresPayment flag (frontend should call /api/payments/create-session)

healthRoutes.post("/dogs/:dog_id/clearances", async (c: ApiContext) => {
  const club = c.get("club");
  const auth = c.get("auth");
  if (!club || !auth?.member) throw unauthorized();

  const member = auth.member;
  const dogId = c.req.param("dog_id");
  const body = await c.req.json();
  const data = createClearanceSchema.parse(body);

  const db = await getDb(c.env);

  // Verify dog exists and user has permission
  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);

  if (!dog) throw notFound("Dog");
  if (dog.club_id !== club.id) throw notFound("Dog");

  // Only owner or admin can submit clearances
  if (!isDogOwner(auth, dog, club.settings as Record<string, unknown>)) {
    throw forbidden("You can only submit clearances for dogs you own");
  }

  // Block if dog has a pending ownership transfer
  const [pendingTransfer] = await db
    .select()
    .from(dogOwnershipTransfers)
    .where(
      and(
        eq(dogOwnershipTransfers.dog_id, dogId),
        eq(dogOwnershipTransfers.status, "pending")
      )
    )
    .limit(1);

  if (pendingTransfer) {
    throw forbidden("Dog has a pending ownership transfer and is locked");
  }

  // Check for duplicate clearance (one per dog + test type + org + date)
  const existing = await db
    .select()
    .from(dogHealthClearances)
    .where(
      and(
        eq(dogHealthClearances.dog_id, dogId),
        eq(dogHealthClearances.health_test_type_id, data.health_test_type_id),
        eq(dogHealthClearances.organization_id, data.organization_id),
        eq(dogHealthClearances.test_date, data.test_date)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw conflict("Clearance already exists for this test type, organization, and date");
  }

  // Look up result_schema for this test type + org to auto-compute result summary
  const [orgLink] = await db
    .select({ result_schema: healthTestTypeOrgs.result_schema })
    .from(healthTestTypeOrgs)
    .where(
      and(
        eq(healthTestTypeOrgs.health_test_type_id, data.health_test_type_id),
        eq(healthTestTypeOrgs.organization_id, data.organization_id)
      )
    )
    .limit(1);

  const resultSchema = orgLink?.result_schema as ResultSchema | null;

  const computedResult = computeResultSummary(
    data.result,
    data.result_data,
    resultSchema
  );

  const scores = computeResultScores(data.result, data.result_data, resultSchema);

  // Check if payment is required
  const feeConfig = club.settings as any;
  const fees = feeConfig?.fees || {};
  const tierFees = fees.add_clearance || { non_member: 500, member: 0 };

  const amountCents = member.skip_fees
    ? 0
    : auth.tierLevel >= 20
    ? tierFees.member || 0
    : tierFees.non_member || 500;

  // If payment required, return payment info instead of creating clearance
  if (amountCents > 0) {
    return c.json(
      {
        requiresPayment: true,
        amountCents,
        description: "Health Clearance Submission Fee",
        // Frontend should call /api/payments/create-session with this metadata
        metadata: {
          resource_type: "clearance_submit",
          dog_id: dogId,
          ...data,
        },
      },
      402 // 402 Payment Required
    );
  }

  // No payment required - create clearance immediately
  const [clearance] = await db
    .insert(dogHealthClearances)
    .values({
      dog_id: dogId,
      health_test_type_id: data.health_test_type_id,
      organization_id: data.organization_id,
      result: computedResult,
      result_data: data.result_data ?? null,
      result_detail: data.result_detail,
      result_score: scores.result_score,
      result_score_left: scores.result_score_left,
      result_score_right: scores.result_score_right,
      test_date: data.test_date,
      expiration_date: data.expiration_date,
      certificate_number: data.certificate_number,
      certificate_url: data.certificate_url,
      notes: data.notes,
      status: "pending",
      submitted_by: member.id,
    })
    .returning();

  // Recompute health rating (async, don't block response)
  recomputeHealthRating(db, dogId).catch(() => {});

  return c.json({ clearance }, 201);
});

// ─── POST /api/dogs/:id/clearances/batch — submit multiple clearances ─────

healthRoutes.post("/dogs/:dog_id/clearances/batch", async (c: ApiContext) => {
  const club = c.get("club");
  const auth = c.get("auth");
  if (!club || !auth?.member) throw unauthorized();

  const member = auth.member;
  const dogId = c.req.param("dog_id");
  const body = await c.req.json();
  const { clearances: items, certificate_url } = batchClearanceSchema.parse(body);

  const db = await getDb(c.env);

  // Verify dog exists and user has permission
  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);
  if (!dog) throw notFound("Dog");
  if (dog.club_id !== club.id) throw notFound("Dog");

  if (!isDogOwner(auth, dog, club.settings as Record<string, unknown>)) {
    throw forbidden("You can only submit clearances for dogs you own");
  }

  // Block if dog has a pending ownership transfer
  const [pendingTransfer] = await db
    .select()
    .from(dogOwnershipTransfers)
    .where(
      and(
        eq(dogOwnershipTransfers.dog_id, dogId),
        eq(dogOwnershipTransfers.status, "pending")
      )
    )
    .limit(1);

  if (pendingTransfer) {
    throw forbidden("Dog has a pending ownership transfer and is locked");
  }

  // Check for intra-batch duplicates (same test_type + org + date)
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const key = `${items[i].health_test_type_id}:${items[i].organization_id}:${items[i].test_date}`;
    if (seen.has(key)) {
      throw badRequest(`Duplicate test in batch at index ${i} (same test type, organization, and date)`);
    }
    seen.add(key);
  }

  // Validate each item: check DB duplicates, look up schemas, compute scores
  const prepared: Array<{
    item: typeof items[0];
    computedResult: string;
    scores: { result_score: number | null; result_score_left: number | null; result_score_right: number | null };
  }> = [];

  for (const item of items) {
    // Check for existing duplicate in DB
    const existing = await db
      .select()
      .from(dogHealthClearances)
      .where(
        and(
          eq(dogHealthClearances.dog_id, dogId),
          eq(dogHealthClearances.health_test_type_id, item.health_test_type_id),
          eq(dogHealthClearances.organization_id, item.organization_id),
          eq(dogHealthClearances.test_date, item.test_date)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw conflict(`Clearance already exists for test type ${item.health_test_type_id}, organization ${item.organization_id}, and date ${item.test_date}`);
    }

    // Look up result_schema
    const [orgLink] = await db
      .select({ result_schema: healthTestTypeOrgs.result_schema })
      .from(healthTestTypeOrgs)
      .where(
        and(
          eq(healthTestTypeOrgs.health_test_type_id, item.health_test_type_id),
          eq(healthTestTypeOrgs.organization_id, item.organization_id)
        )
      )
      .limit(1);

    const resultSchema = orgLink?.result_schema as ResultSchema | null;
    const computedResult = computeResultSummary(item.result, item.result_data, resultSchema);
    const scores = computeResultScores(item.result, item.result_data, resultSchema);

    prepared.push({ item, computedResult, scores });
  }

  // Check if payment is required
  const feeConfig = club.settings as any;
  const fees = feeConfig?.fees || {};
  const tierFees = fees.add_clearance || { non_member: 500, member: 0 };

  const perClearance = member.skip_fees
    ? 0
    : auth.tierLevel >= 20
    ? tierFees.member || 0
    : tierFees.non_member || 500;

  const totalAmountCents = perClearance * items.length;

  if (totalAmountCents > 0) {
    return c.json(
      {
        requiresPayment: true,
        amountCents: totalAmountCents,
        description: `Health Clearance Submission Fee (${items.length} test${items.length > 1 ? "s" : ""})`,
        metadata: {
          resource_type: "clearance_batch_submit",
          dog_id: dogId,
          clearances: items,
          certificate_url,
        },
      },
      402
    );
  }

  // No payment required — insert all in a transaction
  const created = await db.transaction(async (tx) => {
    const results = [];
    for (const { item, computedResult, scores } of prepared) {
      const [clearance] = await tx
        .insert(dogHealthClearances)
        .values({
          dog_id: dogId,
          health_test_type_id: item.health_test_type_id,
          organization_id: item.organization_id,
          result: computedResult,
          result_data: item.result_data ?? null,
          result_detail: item.result_detail,
          result_score: scores.result_score,
          result_score_left: scores.result_score_left,
          result_score_right: scores.result_score_right,
          test_date: item.test_date,
          expiration_date: item.expiration_date,
          certificate_number: item.certificate_number,
          certificate_url,
          notes: item.notes,
          status: "pending",
          submitted_by: member.id,
        })
        .returning();
      results.push(clearance);
    }
    return results;
  });

  // Recompute health rating once
  recomputeHealthRating(db, dogId).catch(() => {});

  return c.json({ clearances: created }, 201);
});

// ─── GET /api/health/clearances — list current user's submitted clearances ──

healthRoutes.get("/clearances", async (c: ApiContext) => {
  const club = c.get("club");
  const auth = c.get("auth");
  if (!club || !auth?.member || !auth.contactId) throw unauthorized();

  const db = await getDb(c.env);

  const query = myClearanceQuerySchema.parse({
    status: c.req.query("status") ?? "all",
    breeding_status: c.req.query("breeding_status") ?? "all",
    sort_by: c.req.query("sort_by") ?? "created_at",
    sort_dir: c.req.query("sort_dir") ?? "desc",
    page: c.req.query("page") ?? 1,
    limit: c.req.query("limit") ?? 20,
  });

  // Filter to dogs the current member owns within this club.
  const dogFilters = [
    eq(dogs.club_id, club.id),
    eq(dogs.owner_id, auth.contactId),
    eq(dogs.is_historical, false),
  ];

  if (query.breeding_status !== "all") {
    dogFilters.push(eq(dogs.breeding_status, query.breeding_status));
  }

  // Clearance status filter restricts to dogs with at least one matching clearance.
  if (query.status !== "all") {
    dogFilters.push(
      sql`EXISTS (SELECT 1 FROM ${dogHealthClearances} WHERE ${dogHealthClearances.dog_id} = ${dogs.id} AND ${dogHealthClearances.status} = ${query.status})`
    );
  }

  // Sort dogs. Clearance-level sorts fall back to dog name (the dog list is
  // the primary unit of pagination; clearances are nested below).
  const dogSortColumn =
    query.sort_by === "dog_name"
      ? dogs.registered_name
      : query.sort_by === "created_at"
        ? dogs.created_at
        : dogs.registered_name;
  const dogSortOrder = query.sort_dir === "asc" ? asc(dogSortColumn) : desc(dogSortColumn);

  const [countResult] = await db
    .select({ value: count() })
    .from(dogs)
    .where(and(...dogFilters));
  const total = Number(countResult?.value || 0);
  const pages = Math.max(1, Math.ceil(total / query.limit));
  const page = Math.min(query.page, pages);

  const dogRows = await db
    .select({
      id: dogs.id,
      registered_name: dogs.registered_name,
      call_name: dogs.call_name,
      health_rating: dogs.health_rating,
      breeding_status: dogs.breeding_status,
    })
    .from(dogs)
    .where(and(...dogFilters))
    .orderBy(dogSortOrder, asc(dogs.id))
    .limit(query.limit)
    .offset((page - 1) * query.limit);

  const dogIds = dogRows.map((d) => d.id);

  // Order clearances within a dog by the requested clearance-level field.
  const clearanceOrderMap = {
    created_at: dogHealthClearances.created_at,
    test_date: dogHealthClearances.test_date,
    status: dogHealthClearances.status,
    dog_name: dogHealthClearances.created_at,
    test_type: healthTestTypes.short_name,
  } as const;
  const clearanceSortColumn = clearanceOrderMap[query.sort_by];
  const clearanceSortOrder =
    query.sort_dir === "asc" ? asc(clearanceSortColumn) : desc(clearanceSortColumn);

  const clearanceFilters = [inArray(dogHealthClearances.dog_id, dogIds)];
  if (query.status !== "all") {
    clearanceFilters.push(eq(dogHealthClearances.status, query.status));
  }

  const clearances =
    dogIds.length === 0
      ? []
      : await db
          .select({
            id: dogHealthClearances.id,
            dog_id: dogHealthClearances.dog_id,
            result: dogHealthClearances.result,
            result_data: dogHealthClearances.result_data,
            result_detail: dogHealthClearances.result_detail,
            result_score: dogHealthClearances.result_score,
            result_score_left: dogHealthClearances.result_score_left,
            result_score_right: dogHealthClearances.result_score_right,
            test_date: dogHealthClearances.test_date,
            expiration_date: dogHealthClearances.expiration_date,
            certificate_number: dogHealthClearances.certificate_number,
            certificate_url: dogHealthClearances.certificate_url,
            status: dogHealthClearances.status,
            verified_at: dogHealthClearances.verified_at,
            notes: dogHealthClearances.notes,
            created_at: dogHealthClearances.created_at,
            can_edit: sql<boolean>`${dogHealthClearances.status} <> 'approved'`,
            dog: {
              id: dogs.id,
              registered_name: dogs.registered_name,
              call_name: dogs.call_name,
              health_rating: dogs.health_rating,
            },
            test_type: {
              id: healthTestTypes.id,
              name: healthTestTypes.name,
              short_name: healthTestTypes.short_name,
              category: healthTestTypes.category,
            },
            organization: {
              id: organizations.id,
              name: organizations.name,
              type: organizations.type,
            },
          })
          .from(dogHealthClearances)
          .innerJoin(dogs, eq(dogHealthClearances.dog_id, dogs.id))
          .innerJoin(healthTestTypes, eq(dogHealthClearances.health_test_type_id, healthTestTypes.id))
          .innerJoin(organizations, eq(dogHealthClearances.organization_id, organizations.id))
          .where(and(...clearanceFilters))
          .orderBy(clearanceSortOrder, desc(dogHealthClearances.created_at));

  return c.json({
    dogs: dogRows,
    clearances,
    meta: {
      page,
      limit: query.limit,
      total,
      pages,
    },
  });
});

// ─── GET /api/dogs/:id/clearances — list clearances ────────────────────────

healthRoutes.get("/dogs/:dog_id/clearances", async (c: ApiContext) => {
  const club = c.get("club");
  const auth = c.get("auth");
  if (!club || !auth?.member) throw unauthorized();

  const member = auth.member;
  const dogId = c.req.param("dog_id");
  const db = await getDb(c.env);

  // Verify dog exists
  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);

  if (!dog || dog.club_id !== club.id) {
    throw notFound("Dog");
  }

  const canManageDog = isDogOwner(auth, dog, club.settings as Record<string, unknown>);

  // Fetch clearances with test type and org details
  const clearances = await db
    .select({
      id: dogHealthClearances.id,
      result: dogHealthClearances.result,
      result_data: dogHealthClearances.result_data,
      result_detail: dogHealthClearances.result_detail,
      result_score: dogHealthClearances.result_score,
      result_score_left: dogHealthClearances.result_score_left,
      result_score_right: dogHealthClearances.result_score_right,
      test_date: dogHealthClearances.test_date,
      expiration_date: dogHealthClearances.expiration_date,
      certificate_number: dogHealthClearances.certificate_number,
      certificate_url: dogHealthClearances.certificate_url,
      status: dogHealthClearances.status,
      verified_at: dogHealthClearances.verified_at,
      notes: dogHealthClearances.notes,
      created_at: dogHealthClearances.created_at,
      submitted_by: dogHealthClearances.submitted_by,
      test_type: {
        id: healthTestTypes.id,
        name: healthTestTypes.name,
        short_name: healthTestTypes.short_name,
        category: healthTestTypes.category,
      },
      organization: {
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
      },
    })
    .from(dogHealthClearances)
    .innerJoin(healthTestTypes, eq(dogHealthClearances.health_test_type_id, healthTestTypes.id))
    .innerJoin(organizations, eq(dogHealthClearances.organization_id, organizations.id))
    .where(eq(dogHealthClearances.dog_id, dogId))
    .orderBy(desc(dogHealthClearances.created_at));

  const hasSubmittedForDog = clearances.some((c2) => c2.submitted_by === member.id);
  if (!canManageDog && !hasSubmittedForDog) {
    throw forbidden("Insufficient permissions");
  }

  const sanitized = clearances.map((clearance) => {
    const { submitted_by: _submittedBy, ...rest } = clearance;
    return {
      ...rest,
      certificate_url:
        canManageDog || clearance.submitted_by === member.id ? clearance.certificate_url : null,
    };
  });

  return c.json({ clearances: sanitized });
});

// ─── PATCH /api/dogs/:dog_id/clearances/:id — update clearance ─────────────

healthRoutes.patch("/dogs/:dog_id/clearances/:clearance_id", async (c: ApiContext) => {
  const club = c.get("club");
  const auth = c.get("auth");
  if (!club || !auth?.member) throw unauthorized();

  const member = auth.member;
  const dogId = c.req.param("dog_id");
  const clearanceId = c.req.param("clearance_id");

  const body = await c.req.json();
  const data = updateClearanceSchema.parse(body);

  const db = await getDb(c.env);

  // Fetch clearance
  const [clearance] = await db
    .select()
    .from(dogHealthClearances)
    .where(eq(dogHealthClearances.id, clearanceId))
    .limit(1);

  if (!clearance || clearance.dog_id !== dogId) {
    throw notFound("Clearance");
  }

  // Check permissions — dog owner, clearance submitter, or approver can update
  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);
  if (!dog) throw notFound("Dog");

  const canEdit =
    isDogOwner(auth, dog, club.settings as Record<string, unknown>) ||
    clearance.submitted_by === member.id;

  if (!canEdit) {
    throw forbidden("Insufficient permissions");
  }

  if (clearance.status === "approved") {
    throw conflict("Approved clearances cannot be edited");
  }

  // Block if dog has a pending ownership transfer
  const [pendingTransfer] = await db
    .select()
    .from(dogOwnershipTransfers)
    .where(
      and(
        eq(dogOwnershipTransfers.dog_id, dogId),
        eq(dogOwnershipTransfers.status, "pending")
      )
    )
    .limit(1);

  if (pendingTransfer) {
    throw forbidden("Dog has a pending ownership transfer and is locked");
  }

  // If result_data is being updated, re-compute the result summary
  let updateData: Record<string, unknown> = { ...data };
  if (data.result_data !== undefined || data.result !== undefined) {
    const [orgLink] = await db
      .select({ result_schema: healthTestTypeOrgs.result_schema })
      .from(healthTestTypeOrgs)
      .where(
        and(
          eq(healthTestTypeOrgs.health_test_type_id, data.health_test_type_id ?? clearance.health_test_type_id),
          eq(healthTestTypeOrgs.organization_id, data.organization_id ?? clearance.organization_id)
        )
      )
      .limit(1);

    const resultData = data.result_data ?? clearance.result_data;
    const resultStr = data.result ?? clearance.result;
    const patchSchema = orgLink?.result_schema as ResultSchema | null;
    updateData.result = computeResultSummary(
      resultStr,
      resultData as Record<string, unknown> | null,
      patchSchema
    );

    const scores = computeResultScores(resultStr, resultData as Record<string, unknown> | null, patchSchema);
    updateData.result_score = scores.result_score;
    updateData.result_score_left = scores.result_score_left;
    updateData.result_score_right = scores.result_score_right;
  }

  // Update clearance
  const [updated] = await db
    .update(dogHealthClearances)
    .set(updateData)
    .where(eq(dogHealthClearances.id, clearanceId))
    .returning();

  // Recompute health rating (async, don't block response)
  recomputeHealthRating(db, dogId).catch(() => {});

  return c.json({ clearance: updated });
});

// ─── DELETE /api/dogs/:dog_id/clearances/:id — delete clearance ─────────────

healthRoutes.delete("/dogs/:dog_id/clearances/:clearance_id", async (c: ApiContext) => {
  const club = c.get("club");
  const auth = c.get("auth");
  if (!club || !auth?.member) throw unauthorized();

  const member = auth.member;
  const dogId = c.req.param("dog_id");
  const clearanceId = c.req.param("clearance_id");
  const db = await getDb(c.env);

  const [clearance] = await db
    .select()
    .from(dogHealthClearances)
    .where(eq(dogHealthClearances.id, clearanceId))
    .limit(1);

  if (!clearance || clearance.dog_id !== dogId) {
    throw notFound("Clearance");
  }

  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);
  if (!dog) throw notFound("Dog");

  const canDelete =
    isDogOwner(auth, dog, club.settings as Record<string, unknown>) ||
    clearance.submitted_by === member.id;

  if (!canDelete) {
    throw forbidden("Insufficient permissions");
  }

  if (clearance.status === "approved") {
    throw conflict("Approved clearances cannot be deleted");
  }

  const [pendingTransfer] = await db
    .select()
    .from(dogOwnershipTransfers)
    .where(
      and(
        eq(dogOwnershipTransfers.dog_id, dogId),
        eq(dogOwnershipTransfers.status, "pending")
      )
    )
    .limit(1);

  if (pendingTransfer) {
    throw forbidden("Dog has a pending ownership transfer and is locked");
  }

  await db.delete(dogHealthClearances).where(eq(dogHealthClearances.id, clearanceId));

  recomputeHealthRating(db, dogId).catch(() => {});

  return c.json({ ok: true });
});

// ─── POST /api/dogs/:id/conditions — report health condition ───────────────

healthRoutes.post("/dogs/:dog_id/conditions", async (c: ApiContext) => {
  const club = c.get("club");
  const auth = c.get("auth");
  if (!club || !auth?.member) throw unauthorized();

  const member = auth.member;
  const dogId = c.req.param("dog_id");
  const body = await c.req.json();
  const data = createConditionSchema.parse(body);

  const db = await getDb(c.env);

  // Verify dog exists
  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);

  if (!dog || dog.club_id !== club.id) {
    throw notFound("Dog");
  }

  // Only owner or admin can report conditions
  if (!isDogOwner(auth, dog, (club?.settings ?? {}) as Record<string, unknown>)) {
    throw forbidden("Only the owner or an admin can report health conditions");
  }

  // Insert condition
  const [condition] = await db
    .insert(healthConditions)
    .values({
      dog_id: dogId,
      condition_name: data.condition_name,
      category: data.category,
      diagnosis_date: data.diagnosis_date,
      resolved_date: data.resolved_date,
      severity: data.severity,
      notes: data.notes,
      reported_by: member.id,
    })
    .returning();

  return c.json({ condition }, 201);
});

// ─── GET /api/dogs/:id/conditions — list conditions ────────────────────────

healthRoutes.get("/dogs/:dog_id/conditions", async (c: ApiContext) => {
  const club = c.get("club");
  if (!club) throw badRequest("Club context required");

  const dogId = c.req.param("dog_id");
  const db = await getDb(c.env);

  // Verify dog exists
  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);

  if (!dog || dog.club_id !== club.id) {
    throw notFound("Dog");
  }

  const conditions = await db
    .select()
    .from(healthConditions)
    .where(eq(healthConditions.dog_id, dogId))
    .orderBy(desc(healthConditions.created_at));

  return c.json({ conditions });
});

// ─── PATCH /api/dogs/:id/conditions/:condition_id — update condition ────────

healthRoutes.patch("/dogs/:dog_id/conditions/:condition_id", async (c: ApiContext) => {
  const club = c.get("club");
  const auth = c.get("auth");
  if (!club || !auth?.member) throw unauthorized();

  const dogId = c.req.param("dog_id");
  const conditionId = c.req.param("condition_id");
  const db = await getDb(c.env);

  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);
  if (!dog || dog.club_id !== club.id) throw notFound("Dog");

  const [condition] = await db
    .select()
    .from(healthConditions)
    .where(and(eq(healthConditions.id, conditionId), eq(healthConditions.dog_id, dogId)))
    .limit(1);

  if (!condition) throw notFound("Health condition");

  // Reporter or dog owner/admin can update
  const isReporter = condition.reported_by === auth.member.id;
  const isOwner = isDogOwner(auth, dog, (club?.settings ?? {}) as Record<string, unknown>);
  if (!isReporter && !isOwner) {
    throw forbidden("Only the reporter or dog owner can update this condition");
  }

  const body = await c.req.json();
  const data = updateConditionSchema.parse(body);

  const [updated] = await db
    .update(healthConditions)
    .set(data)
    .where(eq(healthConditions.id, conditionId))
    .returning();

  return c.json({ condition: updated });
});

// ─── DELETE /api/dogs/:id/conditions/:condition_id — delete condition ───────

healthRoutes.delete("/dogs/:dog_id/conditions/:condition_id", async (c: ApiContext) => {
  const club = c.get("club");
  const auth = c.get("auth");
  if (!club || !auth?.member) throw unauthorized();

  const dogId = c.req.param("dog_id");
  const conditionId = c.req.param("condition_id");
  const db = await getDb(c.env);

  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);
  if (!dog || dog.club_id !== club.id) throw notFound("Dog");

  const [condition] = await db
    .select()
    .from(healthConditions)
    .where(and(eq(healthConditions.id, conditionId), eq(healthConditions.dog_id, dogId)))
    .limit(1);

  if (!condition) throw notFound("Health condition");

  const isReporter = condition.reported_by === auth.member.id;
  const isOwner = isDogOwner(auth, dog, (club?.settings ?? {}) as Record<string, unknown>);
  if (!isReporter && !isOwner) {
    throw forbidden("Only the reporter or dog owner can delete this condition");
  }

  await db.delete(healthConditions).where(eq(healthConditions.id, conditionId));

  return c.json({ ok: true });
});

// ─── GET /api/health/statistics — aggregate health stats ───────────────────

healthRoutes.get("/statistics", async (c: ApiContext) => {
  const club = c.get("club");
  if (!club) throw badRequest("Club context required");

  const db = await getDb(c.env);

  // Try to serve from cache
  const cached = await db
    .select()
    .from(healthStatisticsCache)
    .limit(1);

  if (cached.length > 0) {
    return c.json({
      ...cached[0].data as Record<string, unknown>,
      _cached_at: cached[0].computed_at,
    });
  }

  // Cache miss (first load) — compute live and cache for next time
  const data = await computeHealthStatistics(db, club.id);
  c.executionCtx.waitUntil(refreshHealthStatisticsCache(db, club.id));

  return c.json(data);
});

// ─── GET /api/health/my-stats — per-member health stats (cached) ────────────

healthRoutes.get("/my-stats", async (c: ApiContext) => {
  const club = c.get("club");
  if (!club) throw badRequest("Club context required");

  const auth = c.get("auth") as { memberId: string; contactId: string; flags: { is_breeder: boolean } } | null;
  if (!auth) throw unauthorized("Authentication required");

  const db = await getDb(c.env);

  const cached = await db
    .select()
    .from(memberHealthStatsCache)
    .where(eq(memberHealthStatsCache.member_id, auth.memberId))
    .limit(1);

  if (cached.length > 0) {
    return c.json({
      ...cached[0].data as Record<string, unknown>,
      _cached_at: cached[0].computed_at,
    });
  }

  const data = await computeMemberHealthStats(db, club.id, auth.memberId, auth.contactId, auth.flags.is_breeder);
  c.executionCtx.waitUntil(refreshMemberHealthStatsCache(db, auth.memberId, club.id, auth.contactId, auth.flags.is_breeder));

  return c.json(data);
});

export { healthRoutes };
