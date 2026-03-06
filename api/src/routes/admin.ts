/**
 * Admin routes.
 *
 * - GET    /members              — list all members
 * - GET    /members/:id          — get member detail
 * - PATCH  /members/:id          — update member (tier, flags, etc.)
 * - GET    /dogs/pending         — list dogs awaiting approval
 * - POST   /dogs/:id/approve     — approve dog
 * - POST   /dogs/:id/reject      — reject dog
 * - PATCH  /dogs/:id             — update dog (admin/approver)
 * - GET    /organizations        — list organizations
 * - POST   /organizations        — create organization
 * - GET    /health-test-types    — list health test types
 * - POST   /health-test-types    — create health test type
 * - GET    /export/dogs          — export dogs to CSV
 * - GET    /export/health        — export health clearances to CSV
 */

import { Hono } from "hono";
import { eq, and, sql, ilike, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { requirePermission, requireTier } from "../middleware/rbac.js";
import {
  members,
  contacts,
  organizations,
  healthTestTypes,
  healthTestTypeOrgs,
  dogs,
  dogHealthClearances,
  dogOwnershipTransfers,
  healthCertVersions,
} from "../db/schema.js";
import { notFound, badRequest, forbidden } from "../lib/errors.js";
import { resolvePedigreeTree } from "../lib/pedigree.js";
import { recomputeHealthRating, recomputeAllClubRatings } from "../lib/rating.js";
import {
  updateMemberSchema,
  updateDogSchema,
  createOrganizationSchema,
  createHealthTestTypeSchema,
  createCertVersionSchema,
  updateCertVersionSchema,
  paginationSchema,
} from "@breed-club/shared/validation.js";

type Variables = {
  clubId: string;
  db: Database;
  clerkUserId: string | null;
  auth: AuthContext | null;
};

const adminRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// All admin routes require admin tier (or specific permissions)

// ─── Members ─────────────────────────────────────────────────────────────────

/**
 * GET /members — list all members (admin only).
 */
adminRoutes.get("/members", requireTier("admin"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const query = paginationSchema.parse(c.req.query());

  const where = eq(members.club_id, clubId);

  const [data, countResult] = await Promise.all([
    db.query.members.findMany({
      where,
      with: { contact: true },
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    }),
    db.select({ count: sql<number>`count(*)` }).from(members).where(where),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return c.json({
    data,
    meta: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
  });
});

/**
 * GET /members/:id — get member detail (admin only).
 */
adminRoutes.get("/members/:id", requireTier("admin"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const member = await db.query.members.findFirst({
    where: and(eq(members.id, id), eq(members.club_id, clubId)),
    with: { contact: true },
  });

  if (!member) {
    throw notFound("Member");
  }

  return c.json({ member });
});

/**
 * PATCH /members/:id — update member tier, flags, status (admin only).
 */
adminRoutes.patch("/members/:id", requirePermission("members:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const body = await c.req.json();
  const data = updateMemberSchema.parse(body);

  if (Object.keys(data).length === 0) {
    throw badRequest("No fields to update");
  }

  const member = await db.query.members.findFirst({
    where: and(eq(members.id, id), eq(members.club_id, clubId)),
  });

  if (!member) {
    throw notFound("Member");
  }

  // Convert string dates to Date objects for Drizzle
  const updateData: Record<string, unknown> = { ...data, updated_at: new Date() };
  if (data.membership_expires === null) {
    updateData.membership_expires = null; // Never expires
  } else if (data.membership_expires) {
    updateData.membership_expires = new Date(data.membership_expires);
  }

  await db
    .update(members)
    .set(updateData as any)
    .where(eq(members.id, id));

  const updated = await db.query.members.findFirst({
    where: eq(members.id, id),
    with: { contact: true },
  });

  return c.json({ member: updated });
});

/**
 * DELETE /members/:id — suspend a member (soft delete).
 */
adminRoutes.delete("/members/:id", requirePermission("members:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  // Cannot delete yourself
  if (auth?.member?.id === id) {
    throw badRequest("Cannot delete your own account");
  }

  const member = await db.query.members.findFirst({
    where: and(eq(members.id, id), eq(members.club_id, clubId)),
  });

  if (!member) {
    throw notFound("Member");
  }

  await db
    .update(members)
    .set({
      membership_status: "suspended",
      tier: "non_member",
      can_approve_members: false,
      can_approve_clearances: false,
      is_breeder: false,
      verified_breeder: false,
      show_in_directory: false,
      updated_at: new Date(),
    })
    .where(eq(members.id, id));

  return c.json({ message: "Member suspended" });
});

// ─── Dogs ───────────────────────────────────────────────────────────────────

/**
 * GET /dogs/pending — list dogs awaiting approval.
 * Requires can_approve_clearances permission (same permission used for dog approvals).
 */
adminRoutes.get("/dogs/pending", requirePermission("clearances:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const query = paginationSchema.parse(c.req.query());

  const where = and(
    eq(dogs.club_id, clubId),
    eq(dogs.status, "pending"),
  );

  const [data, countResult] = await Promise.all([
    db.query.dogs.findMany({
      where,
      with: {
        owner: true,
        breeder: true,
        sire: { columns: { id: true, registered_name: true, call_name: true } },
        dam: { columns: { id: true, registered_name: true, call_name: true } },
        registrations: {
          with: { organization: true },
        },
      },
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      orderBy: (d, { asc }) => [asc(d.created_at)],
    }),
    db.select({ count: sql<number>`count(*)` }).from(dogs).where(where),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return c.json({
    data,
    meta: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
  });
});

/**
 * POST /dogs/:id/approve — approve a pending dog.
 */
adminRoutes.post("/dogs/:id/approve", requirePermission("clearances:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
  });

  if (!dog) {
    throw notFound("Dog");
  }

  if (dog.status !== "pending") {
    throw badRequest("Dog is not pending approval");
  }

  await db
    .update(dogs)
    .set({
      status: "approved",
      approved_by: auth.member.id,
      approved_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(dogs.id, id));

  const updated = await db.query.dogs.findFirst({
    where: eq(dogs.id, id),
  });

  return c.json({ dog: updated });
});

/**
 * POST /dogs/:id/reject — reject a pending dog.
 */
adminRoutes.post("/dogs/:id/reject", requirePermission("clearances:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
  });

  if (!dog) {
    throw notFound("Dog");
  }

  if (dog.status !== "pending") {
    throw badRequest("Dog is not pending approval");
  }

  await db
    .update(dogs)
    .set({
      status: "rejected",
      approved_by: auth.member.id,
      approved_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(dogs.id, id));

  const updated = await db.query.dogs.findFirst({
    where: eq(dogs.id, id),
  });

  return c.json({ dog: updated });
});

/**
 * POST /dogs/:id/recalculate — force-recompute a dog's health rating.
 */
adminRoutes.post("/dogs/:id/recalculate", requirePermission("clearances:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
  });

  if (!dog) {
    throw notFound("Dog");
  }

  const rating = await recomputeHealthRating(db, id);

  return c.json({ health_rating: rating });
});

/**
 * PATCH /dogs/:id — update a dog (admin/approver, no status restrictions).
 */
adminRoutes.patch("/dogs/:id", requirePermission("dogs:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const body = await c.req.json();
  const { registrations, pedigree, sire_id: rawSireId, dam_id: rawDamId, ...dogData } = updateDogSchema.parse(body);

  let sire_id: string | null | undefined;
  let dam_id: string | null | undefined;

  if (pedigree) {
    // Full pedigree tree — resolve recursively
    const resolved = await resolvePedigreeTree(db, clubId, pedigree, auth.member.id);
    sire_id = resolved.sire_id;
    dam_id = resolved.dam_id;
  } else {
    // Legacy: resolve parent refs individually
    sire_id = typeof rawSireId === "string" ? rawSireId : rawSireId === null ? null : undefined;
    dam_id = typeof rawDamId === "string" ? rawDamId : rawDamId === null ? null : undefined;

    if (rawSireId && typeof rawSireId === "object" && "registered_name" in rawSireId) {
      const [stubSire] = await db
        .insert(dogs)
        .values({
          registered_name: rawSireId.registered_name,
          sex: "male",
          club_id: clubId,
          status: "approved",
          owner_id: null,
          submitted_by: null,
          is_public: false,
          is_historical: true,
        })
        .returning();
      sire_id = stubSire.id;
    }

    if (rawDamId && typeof rawDamId === "object" && "registered_name" in rawDamId) {
      const [stubDam] = await db
        .insert(dogs)
        .values({
          registered_name: rawDamId.registered_name,
          sex: "female",
          club_id: clubId,
          status: "approved",
          owner_id: null,
          submitted_by: null,
          is_public: false,
          is_historical: true,
        })
        .returning();
      dam_id = stubDam.id;
    }
  }

  const updateFields = { ...dogData, ...(sire_id !== undefined ? { sire_id } : {}), ...(dam_id !== undefined ? { dam_id } : {}) };

  if (Object.keys(updateFields).length === 0 && !pedigree) {
    throw badRequest("No fields to update");
  }

  const existing = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
  });

  if (!existing) {
    throw notFound("Dog");
  }

  await db
    .update(dogs)
    .set({ ...updateFields, updated_at: new Date() })
    .where(eq(dogs.id, id));

  const updated = await db.query.dogs.findFirst({
    where: eq(dogs.id, id),
    with: {
      owner: true,
      breeder: true,
      sire: { columns: { id: true, registered_name: true, call_name: true } },
      dam: { columns: { id: true, registered_name: true, call_name: true } },
    },
  });

  return c.json({ dog: updated });
});

// ─── Organizations ──────────────────────────────────────────────────────────

/**
 * GET /organizations — list all organizations for this club.
 */
adminRoutes.get("/organizations", requireTier("admin"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const data = await db.query.organizations.findMany({
    where: eq(organizations.club_id, clubId),
    orderBy: (orgs, { asc }) => [asc(orgs.sort_order)],
  });

  return c.json({ data });
});

/**
 * POST /organizations — create a new organization.
 */
adminRoutes.post("/organizations", requirePermission("orgs:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const body = await c.req.json();
  const data = createOrganizationSchema.parse(body);

  const [org] = await db
    .insert(organizations)
    .values({ ...data, club_id: clubId })
    .returning();

  return c.json({ organization: org }, 201);
});

/**
 * PATCH /organizations/:id — update an organization.
 */
adminRoutes.patch("/organizations/:id", requirePermission("orgs:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const body = await c.req.json();
  const data = createOrganizationSchema.partial().parse(body);

  const org = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, id), eq(organizations.club_id, clubId)),
  });

  if (!org) throw notFound("Organization");

  await db.update(organizations).set(data as any).where(eq(organizations.id, id));

  const updated = await db.query.organizations.findFirst({ where: eq(organizations.id, id) });
  return c.json({ organization: updated });
});

/**
 * DELETE /organizations/:id — deactivate an organization (soft delete).
 */
adminRoutes.delete("/organizations/:id", requirePermission("orgs:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const org = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, id), eq(organizations.club_id, clubId)),
  });

  if (!org) throw notFound("Organization");

  await db.update(organizations).set({ is_active: false }).where(eq(organizations.id, id));
  return c.json({ message: "Organization deactivated" });
});

// ─── Health Test Types ──────────────────────────────────────────────────────

/**
 * GET /health-test-types — list all health test types for this club.
 */
adminRoutes.get("/health-test-types", requireTier("admin"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const data = await db.query.healthTestTypes.findMany({
    where: eq(healthTestTypes.club_id, clubId),
    with: {
      orgLinks: {
        with: { organization: true },
      },
    },
    orderBy: (tt, { asc }) => [asc(tt.sort_order)],
  });

  // Reshape: flatten orgLinks into grading_orgs array with result_schema + confidence
  const result = data.map((tt) => ({
    ...tt,
    grading_orgs: tt.orgLinks.map((link) => ({
      ...link.organization,
      result_schema: link.result_schema,
      confidence: link.confidence,
    })),
    orgLinks: undefined,
  }));

  return c.json({ data: result });
});

/**
 * POST /health-test-types — create a new health test type.
 */
adminRoutes.post("/health-test-types", requirePermission("test_types:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const body = await c.req.json();
  const { grading_org_ids, grading_orgs, ...data } = createHealthTestTypeSchema.parse(body);

  const [testType] = await db
    .insert(healthTestTypes)
    .values({ ...data, club_id: clubId })
    .returning();

  // Link grading organizations with result schemas
  if (testType) {
    if (grading_orgs && grading_orgs.length > 0) {
      await db.insert(healthTestTypeOrgs).values(
        grading_orgs.map((org) => ({
          health_test_type_id: testType.id,
          organization_id: org.organization_id,
          result_schema: org.result_schema ?? null,
          confidence: org.confidence ?? null,
        }))
      );
    } else if (grading_org_ids && grading_org_ids.length > 0) {
      await db.insert(healthTestTypeOrgs).values(
        grading_org_ids.map((orgId) => ({
          health_test_type_id: testType.id,
          organization_id: orgId,
        }))
      );
    }
  }

  return c.json({ health_test_type: testType }, 201);
});

/**
 * PATCH /health-test-types/:id — update a health test type.
 */
adminRoutes.patch("/health-test-types/:id", requirePermission("test_types:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const body = await c.req.json();
  const { grading_org_ids, grading_orgs, ...data } = createHealthTestTypeSchema.partial().parse(body);

  const testType = await db.query.healthTestTypes.findFirst({
    where: and(eq(healthTestTypes.id, id), eq(healthTestTypes.club_id, clubId)),
  });

  if (!testType) throw notFound("Health test type");

  if (Object.keys(data).length > 0) {
    await db.update(healthTestTypes).set(data as any).where(eq(healthTestTypes.id, id));
  }

  // Update org links if provided (prefer grading_orgs with schemas over legacy grading_org_ids)
  if (grading_orgs !== undefined) {
    await db.delete(healthTestTypeOrgs).where(eq(healthTestTypeOrgs.health_test_type_id, id));
    if (grading_orgs && grading_orgs.length > 0) {
      await db.insert(healthTestTypeOrgs).values(
        grading_orgs.map((org) => ({
          health_test_type_id: id,
          organization_id: org.organization_id,
          result_schema: org.result_schema ?? null,
          confidence: org.confidence ?? null,
        }))
      );
    }
  } else if (grading_org_ids !== undefined) {
    await db.delete(healthTestTypeOrgs).where(eq(healthTestTypeOrgs.health_test_type_id, id));
    if (grading_org_ids && grading_org_ids.length > 0) {
      await db.insert(healthTestTypeOrgs).values(
        grading_org_ids.map((orgId) => ({
          health_test_type_id: id,
          organization_id: orgId,
        }))
      );
    }
  }

  const updated = await db.query.healthTestTypes.findFirst({
    where: eq(healthTestTypes.id, id),
    with: { orgLinks: { with: { organization: true } } },
  });

  return c.json({
    health_test_type: updated
      ? {
          ...updated,
          grading_orgs: updated.orgLinks.map((l) => ({
            ...l.organization,
            result_schema: l.result_schema,
            confidence: l.confidence,
          })),
          orgLinks: undefined,
        }
      : null,
  });
});

/**
 * DELETE /health-test-types/:id — deactivate a health test type (soft delete).
 */
adminRoutes.delete("/health-test-types/:id", requirePermission("test_types:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const testType = await db.query.healthTestTypes.findFirst({
    where: and(eq(healthTestTypes.id, id), eq(healthTestTypes.club_id, clubId)),
  });

  if (!testType) throw notFound("Health test type");

  await db.update(healthTestTypes).set({ is_active: false }).where(eq(healthTestTypes.id, id));
  return c.json({ message: "Health test type deactivated" });
});

// ─── Health Clearances ──────────────────────────────────────────────────────

/**
 * GET /clearances/pending — list clearances awaiting verification.
 */
adminRoutes.get("/clearances/pending", requirePermission("clearances:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const query = paginationSchema.parse(c.req.query());

  // Get pending clearances for dogs in this club
  const where = eq(dogHealthClearances.status, "pending");

  const [data, countResult] = await Promise.all([
    db.query.dogHealthClearances.findMany({
      where,
      with: {
        dog: {
          columns: {
            id: true,
            club_id: true,
            registered_name: true,
            call_name: true,
            photo_url: true,
          },
          with: {
            owner: {
              columns: {
                id: true,
                full_name: true,
                email: true,
              },
            },
          },
        },
        healthTestType: {
          columns: {
            id: true,
            name: true,
            short_name: true,
            category: true,
          },
        },
        organization: {
          columns: {
            id: true,
            name: true,
            type: true,
          },
        },
        submitter: {
          columns: {
            id: true,
          },
          with: {
            contact: {
              columns: {
                full_name: true,
                email: true,
              },
            },
          },
        },
      },
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      orderBy: (c, { asc }) => [asc(c.created_at)],
    }),
    db.select({ count: sql<number>`count(*)` })
      .from(dogHealthClearances)
      .innerJoin(dogs, and(eq(dogHealthClearances.dog_id, dogs.id), eq(dogs.club_id, clubId)))
      .where(where),
  ]);

  // Filter to only clearances for dogs in this club
  const filteredData = data.filter((c) => c.dog?.club_id === clubId);

  const total = Number(countResult[0]?.count ?? 0);

  return c.json({
    data: filteredData,
    meta: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
  });
});

/**
 * POST /clearances/:id/approve — verify/approve a clearance.
 */
adminRoutes.post("/clearances/:id/approve", requirePermission("clearances:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const clearance = await db.query.dogHealthClearances.findFirst({
    where: eq(dogHealthClearances.id, id),
    with: { dog: { columns: { club_id: true } } },
  });

  if (!clearance) {
    throw notFound("Clearance");
  }

  // Verify clearance belongs to a dog in this club
  if (clearance.dog.club_id !== clubId) {
    throw notFound("Clearance");
  }

  if (clearance.status !== "pending") {
    throw badRequest("Clearance is not pending verification");
  }

  // Parse optional score overrides from request body
  const scoreOverrideSchema = z.object({
    result_score: z.number().int().min(0).max(100).nullish(),
    result_score_left: z.number().int().min(0).max(100).nullish(),
    result_score_right: z.number().int().min(0).max(100).nullish(),
  });
  const body = await c.req.json().catch(() => ({}));
  const overrides = scoreOverrideSchema.parse(body);

  await db
    .update(dogHealthClearances)
    .set({
      status: "approved",
      verified_by: auth.member.id,
      verified_at: new Date(),
      ...(overrides.result_score != null ? { result_score: overrides.result_score } : {}),
      ...(overrides.result_score_left != null ? { result_score_left: overrides.result_score_left } : {}),
      ...(overrides.result_score_right != null ? { result_score_right: overrides.result_score_right } : {}),
    })
    .where(eq(dogHealthClearances.id, id));

  const updated = await db.query.dogHealthClearances.findFirst({
    where: eq(dogHealthClearances.id, id),
  });

  // Recompute health rating after approval (async, don't block response)
  recomputeHealthRating(db, clearance.dog_id).catch(() => {});

  return c.json({ clearance: updated });
});

/**
 * POST /clearances/:id/reject — reject a clearance.
 */
adminRoutes.post("/clearances/:id/reject", requirePermission("clearances:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const clearance = await db.query.dogHealthClearances.findFirst({
    where: eq(dogHealthClearances.id, id),
    with: { dog: { columns: { club_id: true } } },
  });

  if (!clearance) {
    throw notFound("Clearance");
  }

  // Verify clearance belongs to a dog in this club
  if (clearance.dog.club_id !== clubId) {
    throw notFound("Clearance");
  }

  if (clearance.status !== "pending") {
    throw badRequest("Clearance is not pending verification");
  }

  await db
    .update(dogHealthClearances)
    .set({
      status: "rejected",
      verified_by: auth.member.id,
      verified_at: new Date(),
    })
    .where(eq(dogHealthClearances.id, id));

  const updated = await db.query.dogHealthClearances.findFirst({
    where: eq(dogHealthClearances.id, id),
  });

  // Recompute health rating after rejection (async, don't block response)
  recomputeHealthRating(db, clearance.dog_id).catch(() => {});

  return c.json({ clearance: updated });
});

// ─── CSV Exports ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/export/dogs?format=csv — export all dogs to CSV
 */
adminRoutes.get("/export/dogs", requireTier("admin"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const format = c.req.query("format") || "csv";

  if (format !== "csv") {
    throw badRequest("Only CSV format is supported");
  }

  // Fetch all approved dogs with related data
  const allDogs = await db.query.dogs.findMany({
    where: and(eq(dogs.club_id, clubId), eq(dogs.status, "approved")),
    with: {
      owner: true,
      breeder: true,
      sire: {
        columns: { registered_name: true },
      },
      dam: {
        columns: { registered_name: true },
      },
      registrations: {
        with: {
          organization: true,
        },
      },
    },
  });

  // Build CSV header
  const headers = [
    "ID",
    "Registered Name",
    "Call Name",
    "Sex",
    "Date of Birth",
    "Color",
    "Sire",
    "Dam",
    "Owner Name",
    "Owner Email",
    "Breeder Name",
    "Breeder Email",
    "Registrations",
    "Status",
    "Historical",
    "Created At",
  ];

  // Build CSV rows
  const rows = allDogs.map((dog) => {
    const registrations = dog.registrations
      .map((r) => `${r.organization.name}: ${r.registration_number}`)
      .join("; ");

    return [
      dog.id,
      dog.registered_name || "",
      dog.call_name || "",
      dog.sex,
      dog.date_of_birth || "",
      dog.color || "",
      dog.sire?.registered_name || "",
      dog.dam?.registered_name || "",
      dog.owner?.full_name || "",
      dog.owner?.email || "",
      dog.breeder?.full_name || "",
      dog.breeder?.email || "",
      registrations,
      dog.status,
      dog.is_historical ? "Yes" : "No",
      dog.created_at?.toISOString() || "",
    ];
  });

  // Convert to CSV string
  const csvContent = [
    headers.map((h) => `"${h}"`).join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  return c.text(csvContent, 200, {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="dogs-export-${new Date().toISOString().split("T")[0]}.csv"`,
  });
});

/**
 * GET /api/admin/export/health?format=csv — export all health clearances to CSV
 */
adminRoutes.get("/export/health", requireTier("admin"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const format = c.req.query("format") || "csv";

  if (format !== "csv") {
    throw badRequest("Only CSV format is supported");
  }

  // Fetch all approved clearances
  const allClearances = await db
    .select({
      clearance_id: dogHealthClearances.id,
      dog_id: dogs.id,
      dog_name: dogs.registered_name,
      dog_call_name: dogs.call_name,
      test_type_name: healthTestTypes.name,
      test_type_short: healthTestTypes.short_name,
      organization_name: organizations.name,
      result: dogHealthClearances.result,
      result_detail: dogHealthClearances.result_detail,
      test_date: dogHealthClearances.test_date,
      expiration_date: dogHealthClearances.expiration_date,
      certificate_number: dogHealthClearances.certificate_number,
      certificate_url: dogHealthClearances.certificate_url,
      status: dogHealthClearances.status,
      verified_at: dogHealthClearances.verified_at,
      created_at: dogHealthClearances.created_at,
    })
    .from(dogHealthClearances)
    .innerJoin(dogs, eq(dogHealthClearances.dog_id, dogs.id))
    .innerJoin(healthTestTypes, eq(dogHealthClearances.health_test_type_id, healthTestTypes.id))
    .innerJoin(organizations, eq(dogHealthClearances.organization_id, organizations.id))
    .where(and(eq(dogs.club_id, clubId), eq(dogHealthClearances.status, "approved")));

  // Build CSV header
  const headers = [
    "Clearance ID",
    "Dog ID",
    "Dog Registered Name",
    "Dog Call Name",
    "Test Type",
    "Test Short Name",
    "Organization",
    "Result",
    "Result Detail",
    "Test Date",
    "Expiration Date",
    "Certificate Number",
    "Certificate URL",
    "Status",
    "Verified At",
    "Submitted At",
  ];

  // Build CSV rows
  const rows = allClearances.map((c) => [
    c.clearance_id,
    c.dog_id,
    c.dog_name || "",
    c.dog_call_name || "",
    c.test_type_name,
    c.test_type_short || "",
    c.organization_name,
    c.result,
    c.result_detail || "",
    c.test_date || "",
    c.expiration_date || "",
    c.certificate_number || "",
    c.certificate_url || "",
    c.status,
    c.verified_at?.toISOString() || "",
    c.created_at?.toISOString() || "",
  ]);

  // Convert to CSV string
  const csvContent = [
    headers.map((h) => `"${h}"`).join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  return c.text(csvContent, 200, {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="health-clearances-export-${new Date().toISOString().split("T")[0]}.csv"`,
  });
});

// ─── Ownership Transfers ──────────────────────────────────────────────────────

/**
 * GET /transfers/pending — list pending ownership transfers.
 */
adminRoutes.get("/transfers/pending", requirePermission("dogs:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const query = paginationSchema.parse(c.req.query());

  const transfers = await db.query.dogOwnershipTransfers.findMany({
    where: eq(dogOwnershipTransfers.status, "pending"),
    with: {
      dog: {
        columns: { id: true, registered_name: true, call_name: true, club_id: true },
      },
      fromOwner: { columns: { id: true, full_name: true, kennel_name: true } },
      toOwner: { columns: { id: true, full_name: true, kennel_name: true } },
    },
    limit: query.limit,
    offset: (query.page - 1) * query.limit,
    orderBy: (t, { desc }) => [desc(t.created_at)],
  });

  // Filter to transfers for dogs in this club
  const filtered = transfers.filter((t) => t.dog?.club_id === clubId);

  return c.json({
    data: filtered,
    meta: { page: query.page, limit: query.limit, total: filtered.length, pages: 1 },
  });
});

/**
 * POST /transfers/:id/approve — approve a pending ownership transfer.
 */
adminRoutes.post("/transfers/:id/approve", requirePermission("dogs:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) throw forbidden("Member record required");

  const transfer = await db.query.dogOwnershipTransfers.findFirst({
    where: eq(dogOwnershipTransfers.id, id),
    with: {
      dog: { columns: { id: true, club_id: true } },
    },
  });

  if (!transfer || transfer.dog?.club_id !== clubId) {
    throw notFound("Transfer");
  }

  if (transfer.status !== "pending") {
    throw badRequest("Transfer is not pending");
  }

  // Update transfer status
  const [updated] = await db
    .update(dogOwnershipTransfers)
    .set({
      status: "approved",
      approved_by: auth.member.id,
      approved_at: new Date(),
    })
    .where(eq(dogOwnershipTransfers.id, id))
    .returning();

  // Update dog owner
  await db
    .update(dogs)
    .set({
      owner_id: transfer.to_owner_id,
      updated_at: new Date(),
    })
    .where(eq(dogs.id, transfer.dog_id));

  return c.json({ transfer: updated });
});

/**
 * POST /transfers/:id/reject — reject a pending ownership transfer.
 */
adminRoutes.post("/transfers/:id/reject", requirePermission("dogs:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) throw forbidden("Member record required");

  const transfer = await db.query.dogOwnershipTransfers.findFirst({
    where: eq(dogOwnershipTransfers.id, id),
    with: {
      dog: { columns: { id: true, club_id: true } },
    },
  });

  if (!transfer || transfer.dog?.club_id !== clubId) {
    throw notFound("Transfer");
  }

  if (transfer.status !== "pending") {
    throw badRequest("Transfer is not pending");
  }

  const [updated] = await db
    .update(dogOwnershipTransfers)
    .set({
      status: "rejected",
      approved_by: auth.member.id,
      approved_at: new Date(),
    })
    .where(eq(dogOwnershipTransfers.id, id))
    .returning();

  return c.json({ transfer: updated });
});

// ─── Health Cert Versions ──────────────────────────────────────────────────

/**
 * GET /cert-versions — list all cert versions for this club.
 */
adminRoutes.get("/cert-versions", requireTier("admin"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const data = await db.query.healthCertVersions.findMany({
    where: eq(healthCertVersions.club_id, clubId),
    orderBy: (v, { desc }) => [desc(v.effective_date)],
  });

  return c.json({ data });
});

/**
 * POST /cert-versions — create a new cert version.
 */
adminRoutes.post("/cert-versions", requirePermission("test_types:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const body = await c.req.json();
  const data = createCertVersionSchema.parse(body);

  const [version] = await db
    .insert(healthCertVersions)
    .values({ ...data, club_id: clubId })
    .returning();

  // Recompute all dog ratings so the new cert version takes effect
  recomputeAllClubRatings(db, clubId).catch(() => {});

  return c.json({ cert_version: version }, 201);
});

/**
 * PATCH /cert-versions/:id — update a cert version.
 */
adminRoutes.patch("/cert-versions/:id", requirePermission("test_types:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const existing = await db.query.healthCertVersions.findFirst({
    where: and(eq(healthCertVersions.id, id), eq(healthCertVersions.club_id, clubId)),
  });
  if (!existing) throw notFound("Cert version");

  const body = await c.req.json();
  const data = updateCertVersionSchema.parse(body);

  const [updated] = await db
    .update(healthCertVersions)
    .set({ ...data, updated_at: new Date() })
    .where(eq(healthCertVersions.id, id))
    .returning();

  // Recompute all dog ratings so updated cert version takes effect
  recomputeAllClubRatings(db, clubId).catch(() => {});

  return c.json({ cert_version: updated });
});

/**
 * DELETE /cert-versions/:id — soft-delete a cert version (set is_active=false).
 */
adminRoutes.delete("/cert-versions/:id", requirePermission("test_types:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const existing = await db.query.healthCertVersions.findFirst({
    where: and(eq(healthCertVersions.id, id), eq(healthCertVersions.club_id, clubId)),
  });
  if (!existing) throw notFound("Cert version");

  await db
    .update(healthCertVersions)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(healthCertVersions.id, id));

  // Recompute all dog ratings so deactivation takes effect
  recomputeAllClubRatings(db, clubId).catch(() => {});

  return c.json({ success: true });
});

export { adminRoutes };
