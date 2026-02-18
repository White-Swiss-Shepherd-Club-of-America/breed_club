import { Hono } from "hono";
import { eq, and, desc, sql, count } from "drizzle-orm";
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
} from "../db/schema.js";

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

// ─── GET /api/health/test-types — catalog of all test types with orgs ──────

healthRoutes.get("/test-types", async (c: ApiContext) => {
  const club = c.get("club");
  if (!club) throw badRequest("Club context required");

  const db = getDb(c.env);

  // Fetch all test types for this club with their linked organizations
  const testTypes = await db
    .select({
      id: healthTestTypes.id,
      name: healthTestTypes.name,
      short_name: healthTestTypes.short_name,
      category: healthTestTypes.category,
      result_options: healthTestTypes.result_options,
      is_required_for_chic: healthTestTypes.is_required_for_chic,
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

  // Group orgs by test type, including result_schema
  const orgsByTestType = orgLinks.reduce(
    (acc, link) => {
      if (!acc[link.health_test_type_id]) {
        acc[link.health_test_type_id] = [];
      }
      acc[link.health_test_type_id].push({
        ...link.organization,
        result_schema: link.result_schema,
      });
      return acc;
    },
    {} as Record<string, Array<typeof orgLinks[0]["organization"] & { result_schema: unknown }>>
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

  const db = getDb(c.env);

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

  const computedResult = computeResultSummary(
    data.result,
    data.result_data,
    orgLink?.result_schema as { type: string } | null
  );

  // Check if payment is required
  const feeConfig = club.settings as any;
  const fees = feeConfig?.fees || {};
  const tierFees = fees.add_clearance || { certificate: 500, member: 0 };

  // Check for fee bypass
  const amountCents = member.skip_fees
    ? 0
    : member.tier === "member" || member.tier === "admin"
    ? tierFees.member || 0
    : tierFees.certificate || 500;

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
      test_date: data.test_date,
      expiration_date: data.expiration_date,
      certificate_number: data.certificate_number,
      certificate_url: data.certificate_url,
      notes: data.notes,
      status: "pending",
      submitted_by: member.id,
    })
    .returning();

  return c.json({ clearance }, 201);
});

// ─── GET /api/dogs/:id/clearances — list clearances ────────────────────────

healthRoutes.get("/dogs/:dog_id/clearances", async (c: ApiContext) => {
  const club = c.get("club");
  if (!club) throw badRequest("Club context required");

  const dogId = c.req.param("dog_id");
  const db = getDb(c.env);

  // Verify dog exists
  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);

  if (!dog || dog.club_id !== club.id) {
    throw notFound("Dog");
  }

  // Fetch clearances with test type and org details
  const clearances = await db
    .select({
      id: dogHealthClearances.id,
      result: dogHealthClearances.result,
      result_data: dogHealthClearances.result_data,
      result_detail: dogHealthClearances.result_detail,
      test_date: dogHealthClearances.test_date,
      expiration_date: dogHealthClearances.expiration_date,
      certificate_number: dogHealthClearances.certificate_number,
      certificate_url: dogHealthClearances.certificate_url,
      status: dogHealthClearances.status,
      verified_at: dogHealthClearances.verified_at,
      notes: dogHealthClearances.notes,
      created_at: dogHealthClearances.created_at,
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

  return c.json({ clearances });
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

  const db = getDb(c.env);

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
    updateData.result = computeResultSummary(
      resultStr,
      resultData as Record<string, unknown> | null,
      orgLink?.result_schema as { type: string } | null
    );
  }

  // Update clearance
  const [updated] = await db
    .update(dogHealthClearances)
    .set({
      ...updateData,
      // If updating after approval, reset status to pending
      ...(clearance.status === "approved" && { status: "pending", verified_by: null, verified_at: null }),
    })
    .where(eq(dogHealthClearances.id, clearanceId))
    .returning();

  return c.json({ clearance: updated });
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

  const db = getDb(c.env);

  // Verify dog exists
  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);

  if (!dog || dog.club_id !== club.id) {
    throw notFound("Dog");
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
  const db = getDb(c.env);

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

// ─── GET /api/health/statistics — aggregate health stats ───────────────────

healthRoutes.get("/statistics", async (c: ApiContext) => {
  const club = c.get("club");
  if (!club) throw badRequest("Club context required");

  const db = getDb(c.env);

  // Get all test types for this club
  const testTypes = await db
    .select({
      id: healthTestTypes.id,
      name: healthTestTypes.name,
      short_name: healthTestTypes.short_name,
      category: healthTestTypes.category,
    })
    .from(healthTestTypes)
    .where(and(eq(healthTestTypes.club_id, club.id), eq(healthTestTypes.is_active, true)))
    .orderBy(healthTestTypes.sort_order, healthTestTypes.name);

  // For each test type, get result distribution
  const statistics = await Promise.all(
    testTypes.map(async (testType) => {
      // Count total dogs tested for this test type
      const totalTested = await db
        .select({ count: count() })
        .from(dogHealthClearances)
        .innerJoin(dogs, eq(dogHealthClearances.dog_id, dogs.id))
        .where(
          and(
            eq(dogHealthClearances.health_test_type_id, testType.id),
            eq(dogHealthClearances.status, "approved"),
            eq(dogs.club_id, club.id),
            eq(dogs.status, "approved")
          )
        );

      // Count by result
      const resultDistribution = await db
        .select({
          result: dogHealthClearances.result,
          count: count(),
        })
        .from(dogHealthClearances)
        .innerJoin(dogs, eq(dogHealthClearances.dog_id, dogs.id))
        .where(
          and(
            eq(dogHealthClearances.health_test_type_id, testType.id),
            eq(dogHealthClearances.status, "approved"),
            eq(dogs.club_id, club.id),
            eq(dogs.status, "approved")
          )
        )
        .groupBy(dogHealthClearances.result);

      return {
        test_type: testType,
        total_tested: totalTested[0]?.count || 0,
        result_distribution: resultDistribution.map((r) => ({
          result: r.result,
          count: Number(r.count),
        })),
      };
    })
  );

  // Overall statistics
  const totalDogs = await db
    .select({ count: count() })
    .from(dogs)
    .where(and(eq(dogs.club_id, club.id), eq(dogs.status, "approved")));

  const totalClearances = await db
    .select({ count: count() })
    .from(dogHealthClearances)
    .innerJoin(dogs, eq(dogHealthClearances.dog_id, dogs.id))
    .where(
      and(
        eq(dogHealthClearances.status, "approved"),
        eq(dogs.club_id, club.id),
        eq(dogs.status, "approved")
      )
    );

  return c.json({
    overview: {
      total_dogs: totalDogs[0]?.count || 0,
      total_clearances: totalClearances[0]?.count || 0,
    },
    by_test_type: statistics,
  });
});

export { healthRoutes };
