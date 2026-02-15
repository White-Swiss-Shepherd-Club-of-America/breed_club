import { Hono } from "hono";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { z } from "zod";
import type { Env, ApiContext } from "../lib/types.js";
import { ApiError } from "../lib/errors.js";
import { getDb } from "../db/client.js";
import {
  healthTestTypes,
  healthTestTypeOrgs,
  organizations,
  dogHealthClearances,
  healthConditions,
  dogs,
  members,
  clubs,
} from "../db/schema.js";

const healthRoutes = new Hono<{ Bindings: Env }>();

// ─── Schemas ────────────────────────────────────────────────────────────────

const createClearanceSchema = z.object({
  health_test_type_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  result: z.string().min(1),
  result_detail: z.string().optional(),
  test_date: z.string().optional(), // ISO date string
  expiration_date: z.string().optional(),
  certificate_number: z.string().optional(),
  certificate_url: z.string().url().optional(),
  notes: z.string().optional(),
});

const updateClearanceSchema = createClearanceSchema.partial();

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
  const { club } = c.var;
  if (!club) throw new ApiError("Club context required", 400);

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

  // Group orgs by test type
  const orgsByTestType = orgLinks.reduce(
    (acc, link) => {
      if (!acc[link.health_test_type_id]) {
        acc[link.health_test_type_id] = [];
      }
      acc[link.health_test_type_id].push(link.organization);
      return acc;
    },
    {} as Record<string, typeof orgLinks[0]["organization"][]>
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
  const { club, member } = c.var;
  if (!club || !member) throw new ApiError("Authentication required", 401);

  const dogId = c.req.param("dog_id");
  const body = await c.req.json();
  const data = createClearanceSchema.parse(body);

  const db = getDb(c.env);

  // Verify dog exists and user has permission
  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);

  if (!dog) throw new ApiError("Dog not found", 404);
  if (dog.club_id !== club.id) throw new ApiError("Dog not found", 404);

  // Check for duplicate clearance (one clearance per test type per dog)
  const existing = await db
    .select()
    .from(dogHealthClearances)
    .where(
      and(
        eq(dogHealthClearances.dog_id, dogId),
        eq(dogHealthClearances.health_test_type_id, data.health_test_type_id)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new ApiError("Clearance already exists for this test type", 409);
  }

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
      result: data.result,
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
  const { club } = c.var;
  if (!club) throw new ApiError("Club context required", 400);

  const dogId = c.req.param("dog_id");
  const db = getDb(c.env);

  // Verify dog exists
  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);

  if (!dog || dog.club_id !== club.id) {
    throw new ApiError("Dog not found", 404);
  }

  // Fetch clearances with test type and org details
  const clearances = await db
    .select({
      id: dogHealthClearances.id,
      result: dogHealthClearances.result,
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
  const { club, member } = c.var;
  if (!club || !member) throw new ApiError("Authentication required", 401);

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
    throw new ApiError("Clearance not found", 404);
  }

  // Check permissions — only submitter or approver can update
  const canEdit =
    clearance.submitted_by === member.id || member.can_approve_clearances;

  if (!canEdit) {
    throw new ApiError("Insufficient permissions", 403);
  }

  // Update clearance
  const [updated] = await db
    .update(dogHealthClearances)
    .set({
      ...data,
      // If updating after approval, reset status to pending
      ...(clearance.status === "approved" && { status: "pending", verified_by: null, verified_at: null }),
    })
    .where(eq(dogHealthClearances.id, clearanceId))
    .returning();

  return c.json({ clearance: updated });
});

// ─── POST /api/dogs/:id/conditions — report health condition ───────────────

healthRoutes.post("/dogs/:dog_id/conditions", async (c: ApiContext) => {
  const { club, member } = c.var;
  if (!club || !member) throw new ApiError("Authentication required", 401);

  const dogId = c.req.param("dog_id");
  const body = await c.req.json();
  const data = createConditionSchema.parse(body);

  const db = getDb(c.env);

  // Verify dog exists
  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);

  if (!dog || dog.club_id !== club.id) {
    throw new ApiError("Dog not found", 404);
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
  const { club } = c.var;
  if (!club) throw new ApiError("Club context required", 400);

  const dogId = c.req.param("dog_id");
  const db = getDb(c.env);

  // Verify dog exists
  const [dog] = await db.select().from(dogs).where(eq(dogs.id, dogId)).limit(1);

  if (!dog || dog.club_id !== club.id) {
    throw new ApiError("Dog not found", 404);
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
  const { club } = c.var;
  if (!club) throw new ApiError("Club context required", 400);

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
