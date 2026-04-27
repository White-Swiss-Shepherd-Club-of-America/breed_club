/**
 * Admin routes.
 *
 * - GET    /members              — list all members
 * - GET    /members/:id          — get member detail
 * - PATCH  /members/:id          — update member (tier, flags, etc.)
 * - GET    /dogs/pending              — list dogs awaiting approval
 * - GET    /dogs/:id/delete-preview  — preview cascade impact of deletion
 * - POST   /dogs/:id/approve         — approve dog
 * - POST   /dogs/:id/reject          — reject dog
 * - DELETE /dogs/:id                 — permanently delete dog (admin only)
 * - PATCH  /dogs/:id                 — update dog (admin/approver)
 * - DELETE /clearances/:id           — permanently delete clearance (admin only)
 * - GET    /organizations        — list organizations
 * - POST   /organizations        — create organization
 * - GET    /health-test-types    — list health test types
 * - POST   /health-test-types    — create health test type
 * - GET    /export/dogs          — export dogs to CSV
 * - GET    /export/health        — export health clearances to CSV
 */

import { Hono } from "hono";
import { eq, and, or, sql, ilike, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { requirePermission, requireLevel } from "../middleware/rbac.js";
import {
  members,
  contacts,
  organizations,
  healthTestTypes,
  healthTestTypeOrgs,
  dogs,
  dogAuditLogs,
  dogHealthClearances,
  dogOwnershipTransfers,
  healthCertVersions,
  litters,
  litterPups,
  dogRegistrations,
  healthConditions,
  healthConditionTypes,
  clubs,
  membershipTiers,
  membershipApplications,
} from "../db/schema.js";
import { createMembershipTierSchema, updateMembershipTierSchema } from "@breed-club/shared";
import { notFound, badRequest, forbidden } from "../lib/errors.js";
import { logDogAudit, logDogDeletion, logClearanceDeletion } from "../lib/audit.js";
import { resolvePedigreeTree, findOrCreateHistoricalStub } from "../lib/pedigree.js";
import { recomputeHealthRating, recomputeAllClubRatings } from "../lib/rating.js";
import { refreshHealthStatisticsCache } from "../lib/compute-health-stats.js";
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
adminRoutes.get("/members", requireLevel(100), async (c) => {
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
adminRoutes.get("/members/:id", requireLevel(100), async (c) => {
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
  const auth = c.get("auth");
  const id = c.req.param("id");

  const body = await c.req.json();
  const data = updateMemberSchema.parse(body);

  // Don't let an admin revoke their own is_admin flag (avoid self-lockout).
  if (data.is_admin === false && auth?.member?.id === id) {
    throw badRequest("Cannot revoke your own admin access");
  }

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
adminRoutes.get("/dogs/pending", requirePermission("health:verify"), async (c) => {
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
        microchips: true,
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
adminRoutes.post("/dogs/:id/approve", requirePermission("health:verify"), async (c) => {
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

  // Audit trail
  await logDogAudit(db, {
    clubId,
    dogId: id,
    memberId: auth.member.id,
    action: "approve",
    before: dog as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });

  return c.json({ dog: updated });
});

/**
 * POST /dogs/:id/reject — reject a pending dog.
 */
adminRoutes.post("/dogs/:id/reject", requirePermission("health:verify"), async (c) => {
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

  // Audit trail
  await logDogAudit(db, {
    clubId,
    dogId: id,
    memberId: auth.member.id,
    action: "reject",
    before: dog as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });

  return c.json({ dog: updated });
});

/**
 * POST /dogs/:id/recalculate — force-recompute a dog's health rating.
 */
adminRoutes.post("/dogs/:id/recalculate", requirePermission("health:verify"), async (c) => {
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
 * GET /dogs/:id/delete-preview — preview cascade impact of deleting a dog.
 */
adminRoutes.get("/dogs/:id/delete-preview", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
    columns: { id: true, registered_name: true, call_name: true },
  });

  if (!dog) {
    throw notFound("Dog");
  }

  const [clearances, registrations, conditions, transfers, littersRef, pups, children] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(dogHealthClearances).where(eq(dogHealthClearances.dog_id, id)),
      db.select({ count: sql<number>`count(*)` }).from(dogRegistrations).where(eq(dogRegistrations.dog_id, id)),
      db.select({ count: sql<number>`count(*)` }).from(healthConditions).where(eq(healthConditions.dog_id, id)),
      db.select({ count: sql<number>`count(*)` }).from(dogOwnershipTransfers).where(eq(dogOwnershipTransfers.dog_id, id)),
      db.select({ count: sql<number>`count(*)` }).from(litters).where(or(eq(litters.sire_id, id), eq(litters.dam_id, id))),
      db.select({ count: sql<number>`count(*)` }).from(litterPups).where(eq(litterPups.dog_id, id)),
      db.select({ count: sql<number>`count(*)` }).from(dogs).where(and(ne(dogs.id, id), or(eq(dogs.sire_id, id), eq(dogs.dam_id, id)))),
    ]);

  return c.json({
    dog,
    counts: {
      clearances: Number(clearances[0]?.count ?? 0),
      registrations: Number(registrations[0]?.count ?? 0),
      conditions: Number(conditions[0]?.count ?? 0),
      transfers: Number(transfers[0]?.count ?? 0),
      litters: Number(littersRef[0]?.count ?? 0),
      pups: Number(pups[0]?.count ?? 0),
      children: Number(children[0]?.count ?? 0),
    },
  });
});

/**
 * DELETE /dogs/:id — permanently delete a dog (admin only, hard delete).
 * Cascades to clearances, registrations, conditions, transfers.
 * Nullifies litter and pedigree references.
 */
adminRoutes.delete("/dogs/:id", requireLevel(100), async (c) => {
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

  await db.transaction(async (tx) => {
    // Nullify litter references
    await tx.update(litters).set({ sire_id: null }).where(eq(litters.sire_id, id));
    await tx.update(litters).set({ dam_id: null }).where(eq(litters.dam_id, id));

    // Nullify litter pup links
    await tx.update(litterPups).set({ dog_id: null }).where(eq(litterPups.dog_id, id));

    // Nullify pedigree parent references on other dogs
    await tx.update(dogs).set({ sire_id: null }).where(eq(dogs.sire_id, id));
    await tx.update(dogs).set({ dam_id: null }).where(eq(dogs.dam_id, id));

    // Audit log (inserted before delete; dog_id will be SET NULL by cascade)
    await logDogDeletion(tx as unknown as Database, {
      clubId,
      dogId: id,
      memberId: auth.member!.id,
      snapshot: dog as unknown as Record<string, unknown>,
    });

    // Hard delete — cascades to clearances, registrations, conditions, transfers
    await tx.delete(dogs).where(eq(dogs.id, id));
  });

  return c.json({ success: true, deleted: { id, registered_name: dog.registered_name } });
});

/**
 * PATCH /dogs/:id — update a dog (admin/approver, no status restrictions).
 */
adminRoutes.patch("/dogs/:id", requirePermission("dogs:edit"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const body = await c.req.json();
  const { registrations, microchips: _microchips, pedigree, sire_id: rawSireId, dam_id: rawDamId, ...dogData } = updateDogSchema.parse(body);

  // Validate color/coat_type against club breed settings
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  const clubSettings = (club?.settings ?? {}) as Record<string, unknown>;
  const breedColors: string[] = (clubSettings.breed_colors as string[]) || [];
  const breedCoatTypes: string[] = (clubSettings.breed_coat_types as string[]) || [];

  if (breedColors.length > 0 && dogData.color && !breedColors.includes(dogData.color)) {
    throw badRequest(`Invalid color "${dogData.color}". Allowed: ${breedColors.join(", ")}`);
  }
  if (breedCoatTypes.length > 0 && dogData.coat_type && !breedCoatTypes.includes(dogData.coat_type)) {
    throw badRequest(`Invalid coat type "${dogData.coat_type}". Allowed: ${breedCoatTypes.join(", ")}`);
  }

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
      sire_id = await findOrCreateHistoricalStub(db, clubId, rawSireId.registered_name, "male");
    }

    if (rawDamId && typeof rawDamId === "object" && "registered_name" in rawDamId) {
      dam_id = await findOrCreateHistoricalStub(db, clubId, rawDamId.registered_name, "female");
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

  // Audit trail
  await logDogAudit(db, {
    clubId,
    dogId: id,
    memberId: auth.member.id,
    action: "update",
    before: existing as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });

  return c.json({ dog: updated });
});

/**
 * GET /dogs/:id/audit-log — get edit history for a dog.
 */
adminRoutes.get("/dogs/:id/audit-log", requirePermission("dogs:edit"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
    columns: { id: true },
  });

  if (!dog) {
    throw notFound("Dog");
  }

  const logs = await db.query.dogAuditLogs.findMany({
    where: and(eq(dogAuditLogs.dog_id, id), eq(dogAuditLogs.club_id, clubId)),
    orderBy: (log, { desc }) => [desc(log.created_at)],
    with: {
      member: {
        with: {
          contact: { columns: { full_name: true } },
        },
      },
    },
  });

  const data = logs.map((log) => ({
    id: log.id,
    dog_id: log.dog_id,
    member_id: log.member_id,
    action: log.action,
    changes: log.changes,
    created_at: log.created_at,
    member_name: log.member?.contact?.full_name ?? "Unknown",
  }));

  return c.json({ data });
});

// ─── Organizations ──────────────────────────────────────────────────────────

/**
 * GET /organizations — list all organizations for this club.
 */
adminRoutes.get("/organizations", requireLevel(100), async (c) => {
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
adminRoutes.get("/health-test-types", requireLevel(100), async (c) => {
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
adminRoutes.get("/clearances/pending", requirePermission("health:verify"), async (c) => {
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
adminRoutes.post("/clearances/:id/approve", requirePermission("health:verify"), async (c) => {
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
  c.executionCtx.waitUntil(refreshHealthStatisticsCache(db, clubId));

  return c.json({ clearance: updated });
});

/**
 * POST /clearances/:id/reject — reject a clearance.
 */
adminRoutes.post("/clearances/:id/reject", requirePermission("health:verify"), async (c) => {
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
  c.executionCtx.waitUntil(refreshHealthStatisticsCache(db, clubId));

  return c.json({ clearance: updated });
});

/**
 * DELETE /clearances/:id — permanently delete a clearance (admin only).
 * Works for any status including approved. Triggers health rating recompute.
 */
adminRoutes.delete("/clearances/:id", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const clearance = await db.query.dogHealthClearances.findFirst({
    where: eq(dogHealthClearances.id, id),
    with: {
      dog: { columns: { club_id: true } },
      healthTestType: { columns: { name: true } },
    },
  });

  if (!clearance) {
    throw notFound("Clearance");
  }

  if (clearance.dog.club_id !== clubId) {
    throw notFound("Clearance");
  }

  await logClearanceDeletion(db, {
    clubId,
    dogId: clearance.dog_id,
    memberId: auth.member.id,
    snapshot: clearance as unknown as Record<string, unknown>,
  });

  await db.delete(dogHealthClearances).where(eq(dogHealthClearances.id, id));

  recomputeHealthRating(db, clearance.dog_id).catch(() => {});
  c.executionCtx.waitUntil(refreshHealthStatisticsCache(db, clubId));

  return c.json({ success: true });
});

// ─── CSV Exports ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/export/dogs?format=csv — export all dogs to CSV
 */
adminRoutes.get("/export/dogs", requireLevel(100), async (c) => {
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
      microchips: true,
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
    "Microchips",
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
    const microchips = dog.microchips
      .map((m) => m.microchip_number)
      .join("; ");

    return [
      dog.id,
      dog.registered_name || "",
      dog.call_name || "",
      dog.sex,
      dog.date_of_birth || "",
      dog.color || "",
      microchips,
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
adminRoutes.get("/export/health", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const format = c.req.query("format") || "csv";

  if (format !== "csv") {
    throw badRequest("Only CSV format is supported");
  }

  // Fetch all approved clearances (includes preliminary results)
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
      is_preliminary: dogHealthClearances.is_preliminary,
      certificate_number: dogHealthClearances.certificate_number,
      application_number: dogHealthClearances.application_number,
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
    "Preliminary",
    "Certificate Number",
    "Application Number",
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
    c.is_preliminary ? "Yes" : "No",
    c.certificate_number || "",
    c.application_number || "",
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
adminRoutes.get("/cert-versions", requireLevel(100), async (c) => {
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

// ─── Litters ──────────────────────────────────────────────────────────────

/**
 * GET /litters — list all litters with optional status filter.
 */
adminRoutes.get("/litters", requirePermission("dogs:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const query = paginationSchema.parse(c.req.query());
  const statusFilter = c.req.query("status") || "all";

  const conditions = [eq(litters.club_id, clubId)];
  if (statusFilter === "pending") conditions.push(eq(litters.approved, false));
  if (statusFilter === "approved") conditions.push(eq(litters.approved, true));
  const where = and(...conditions);

  const [data, countResult] = await Promise.all([
    db.query.litters.findMany({
      where,
      with: {
        sire: { columns: { id: true, registered_name: true, call_name: true } },
        dam: { columns: { id: true, registered_name: true, call_name: true } },
        breeder: true,
      },
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      orderBy: (l, { desc }) => [desc(l.created_at)],
    }),
    db.select({ count: sql<number>`count(*)` }).from(litters).where(where),
  ]);

  const total = Number(countResult[0].count);

  return c.json({
    data,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  });
});

/**
 * GET /litters/pending — list litters awaiting club approval.
 */
adminRoutes.get("/litters/pending", requirePermission("dogs:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const query = paginationSchema.parse(c.req.query());

  const where = and(
    eq(litters.club_id, clubId),
    eq(litters.approved, false),
    // Only show litters where sire approval is done (or not required)
    inArray(litters.sire_approval_status, ["not_required", "approved"]),
  );

  const [data, countResult] = await Promise.all([
    db.query.litters.findMany({
      where,
      with: {
        sire: { columns: { id: true, registered_name: true, call_name: true } },
        dam: { columns: { id: true, registered_name: true, call_name: true } },
        breeder: true,
      },
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      orderBy: (l, { desc }) => [desc(l.created_at)],
    }),
    db.select({ count: sql<number>`count(*)` }).from(litters).where(where),
  ]);

  const total = Number(countResult[0].count);

  return c.json({
    data,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  });
});

/**
 * POST /litters/:id/approve — approve a pending litter.
 */
adminRoutes.post("/litters/:id/approve", requirePermission("dogs:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) throw forbidden("Member record required");

  const litter = await db.query.litters.findFirst({
    where: and(eq(litters.id, id), eq(litters.club_id, clubId)),
  });

  if (!litter) throw notFound("Litter");
  if (litter.approved) throw badRequest("Litter is already approved");

  const [updated] = await db
    .update(litters)
    .set({
      approved: true,
      approved_by: auth.member.id,
      approved_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(litters.id, id))
    .returning();

  return c.json({ litter: updated });
});

/**
 * POST /litters/:id/reject — reject a pending litter (deletes it).
 */
adminRoutes.post("/litters/:id/reject", requirePermission("dogs:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) throw forbidden("Member record required");

  const litter = await db.query.litters.findFirst({
    where: and(eq(litters.id, id), eq(litters.club_id, clubId)),
  });

  if (!litter) throw notFound("Litter");
  if (litter.approved) throw badRequest("Cannot reject an approved litter");

  const [updated] = await db
    .update(litters)
    .set({
      approved: false,
      approved_by: auth.member.id,
      approved_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(litters.id, id))
    .returning();

  return c.json({ litter: updated });
});

/**
 * PATCH /settings — update club settings (jsonb merge).
 */
adminRoutes.patch("/settings", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const body = await c.req.json();

  // Validate expected shape
  const socialIntegrationSchema = z.object({
    enabled: z.boolean(),
    page_id: z.string().max(255).nullish(),
    account_id: z.string().max(255).nullish(),
    handle: z.string().max(255).nullish(),
  }).partial().optional();

  const settingsUpdate = z.object({
    banner_width: z.number().int().min(100).max(2000).optional(),
    banner_height: z.number().int().min(50).max(1000).optional(),
    breed_colors: z.array(z.string().min(1).max(100)).max(50).optional(),
    breed_coat_types: z.array(z.string().min(1).max(50)).max(50).optional(),
    litter_ads: z.object({
      enabled: z.boolean().optional(),
      max_active_per_member: z.number().int().min(1).max(50).optional(),
      posting_cooldown_days: z.number().int().min(0).max(365).optional(),
      expiration_days: z.number().int().min(1).max(365).optional(),
      require_approval: z.boolean().optional(),
      fee_cents: z.number().int().min(0).optional(),
      ad_image_width: z.number().int().min(100).max(4000).optional(),
      ad_image_height: z.number().int().min(100).max(4000).optional(),
      sort_order: z.enum(["newest", "oldest", "priority"]).optional(),
    }).optional(),
    social_integrations: z.object({
      facebook: socialIntegrationSchema,
      instagram: socialIntegrationSchema,
      twitter: socialIntegrationSchema,
    }).optional(),
  }).parse(body);

  // Fetch current settings and merge
  const club = await db.query.clubs.findFirst({
    where: eq(clubs.id, clubId),
  });

  if (!club) throw notFound("Club");

  const currentSettings = (club.settings ?? {}) as Record<string, unknown>;
  const merged = { ...currentSettings, ...settingsUpdate };

  await db
    .update(clubs)
    .set({ settings: merged, updated_at: new Date() })
    .where(eq(clubs.id, clubId));

  return c.json({ settings: merged });
});

/**
 * GET /settings — get current club settings.
 */
adminRoutes.get("/settings", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.id, clubId),
  });

  if (!club) throw notFound("Club");

  return c.json({ settings: club.settings ?? {} });
});

// ─── Membership Tiers ──────────────────────────────────────────────────────

/**
 * GET /membership-tiers — list all membership tiers with member counts.
 */
adminRoutes.get("/membership-tiers", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const tiers = await db.query.membershipTiers.findMany({
    where: eq(membershipTiers.club_id, clubId),
    orderBy: (t, { asc }) => [asc(t.level)],
  });

  // Get member counts per tier slug
  const counts = await db
    .select({
      tier: members.tier,
      count: sql<number>`count(*)::int`,
    })
    .from(members)
    .where(eq(members.club_id, clubId))
    .groupBy(members.tier);

  const countMap = new Map(counts.map((r) => [r.tier, r.count]));

  const data = tiers.map((t) => ({
    ...t,
    member_count: countMap.get(t.slug) ?? 0,
  }));

  return c.json({ data });
});

/**
 * POST /membership-tiers — create a new membership tier.
 */
adminRoutes.post("/membership-tiers", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const body = await c.req.json();
  const data = createMembershipTierSchema.parse(body);

  const [tier] = await db
    .insert(membershipTiers)
    .values({
      club_id: clubId,
      ...data,
      color: data.color ?? null,
    })
    .returning();

  return c.json({ tier }, 201);
});

/**
 * PATCH /membership-tiers/:id — update a membership tier.
 */
adminRoutes.patch("/membership-tiers/:id", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const existing = await db.query.membershipTiers.findFirst({
    where: and(eq(membershipTiers.id, id), eq(membershipTiers.club_id, clubId)),
  });

  if (!existing) throw notFound("Membership tier");

  // Cannot change level of admin tier
  const body = await c.req.json();
  const data = updateMembershipTierSchema.parse(body);

  if (existing.is_system && data.level !== undefined && data.level !== existing.level) {
    throw badRequest("Cannot change the level of a system tier");
  }

  const [updated] = await db
    .update(membershipTiers)
    .set({ ...data, color: data.color ?? existing.color, updated_at: new Date() })
    .where(eq(membershipTiers.id, id))
    .returning();

  return c.json({ tier: updated });
});

/**
 * DELETE /membership-tiers/:id — delete a membership tier.
 */
adminRoutes.delete("/membership-tiers/:id", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const existing = await db.query.membershipTiers.findFirst({
    where: and(eq(membershipTiers.id, id), eq(membershipTiers.club_id, clubId)),
  });

  if (!existing) throw notFound("Membership tier");
  if (existing.is_system) throw badRequest("Cannot delete a system tier");

  // Check if any members are assigned this tier
  const memberCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(members)
    .where(and(eq(members.club_id, clubId), eq(members.tier, existing.slug)));

  if (memberCount[0].count > 0) {
    throw badRequest(`Cannot delete tier "${existing.label}" — ${memberCount[0].count} member(s) are assigned to it`);
  }

  await db.delete(membershipTiers).where(eq(membershipTiers.id, id));

  return c.json({ success: true });
});

// ─── Dashboard Counts ─────────────────────────────────────────────────────────

/**
 * GET /dashboard-counts — pending counts for all approval queues.
 * Available to anyone with any approval permission.
 */
adminRoutes.get("/dashboard-counts", requireLevel(20), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");

  if (!auth) return c.json({ error: { code: "FORBIDDEN", message: "Auth required" } }, 403);

  const hasAnyApproval =
    auth.isAdmin ||
    auth.flags.can_approve_members ||
    auth.flags.can_approve_clearances ||
    auth.flags.can_manage_registry;

  if (!hasAnyApproval) {
    return c.json({ applications: 0, dogs: 0, clearances: 0, litters: 0, transfers: 0 });
  }

  const [apps, pendingDogs, clearances, pendingLitters, transfers] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(membershipApplications)
      .where(and(eq(membershipApplications.club_id, clubId), eq(membershipApplications.status, "submitted"))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(dogs)
      .where(and(eq(dogs.club_id, clubId), eq(dogs.status, "pending"))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(dogHealthClearances)
      .innerJoin(dogs, eq(dogHealthClearances.dog_id, dogs.id))
      .where(and(eq(dogs.club_id, clubId), eq(dogHealthClearances.status, "pending"))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(litters)
      .where(
        and(
          eq(litters.club_id, clubId),
          eq(litters.approved, false),
          // Match the approvals page: only count litters where sire approval is resolved
          inArray(litters.sire_approval_status, ["not_required", "approved"])
        )
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(dogOwnershipTransfers)
      .innerJoin(dogs, eq(dogOwnershipTransfers.dog_id, dogs.id))
      .where(and(eq(dogs.club_id, clubId), eq(dogOwnershipTransfers.status, "pending"))),
  ]);

  return c.json({
    applications: apps[0]?.count ?? 0,
    dogs: pendingDogs[0]?.count ?? 0,
    clearances: clearances[0]?.count ?? 0,
    litters: pendingLitters[0]?.count ?? 0,
    transfers: transfers[0]?.count ?? 0,
  });
});

// ─── Admin Overview Stats ──────────────────────────────────────────────────────

/**
 * GET /overview-stats — club-wide stats for the admin overview card.
 * Admin only (level 100).
 */
adminRoutes.get("/overview-stats", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const [
    totalDogsResult,
    healthTestedResult,
    colorDistResult,
    membersByTierResult,
    littersResult,
    pendingAppsResult,
  ] = await Promise.all([
    // Total approved non-historical dogs
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(dogs)
      .where(
        and(
          eq(dogs.club_id, clubId),
          eq(dogs.status, "approved"),
          eq(dogs.is_historical, false)
        )
      ),

    // Dogs with at least one approved non-preliminary clearance
    db
      .select({ count: sql<number>`count(distinct ${dogs.id})::int` })
      .from(dogs)
      .innerJoin(dogHealthClearances, eq(dogHealthClearances.dog_id, dogs.id))
      .where(
        and(
          eq(dogs.club_id, clubId),
          eq(dogs.status, "approved"),
          eq(dogs.is_historical, false),
          eq(dogHealthClearances.status, "approved"),
          eq(dogHealthClearances.is_preliminary, false)
        )
      ),

    // Health color distribution for approved non-historical dogs
    db
      .select({
        color: sql<string>`${dogs.health_rating}->>'color'`,
        count: sql<number>`count(*)::int`,
      })
      .from(dogs)
      .where(
        and(
          eq(dogs.club_id, clubId),
          eq(dogs.status, "approved"),
          eq(dogs.is_historical, false)
        )
      )
      .groupBy(sql`${dogs.health_rating}->>'color'`),

    // Active members by tier (excluding non-members, level >= 20)
    db
      .select({
        label: membershipTiers.label,
        level: membershipTiers.level,
        count: sql<number>`count(*)::int`,
      })
      .from(members)
      .innerJoin(
        membershipTiers,
        and(
          eq(membershipTiers.club_id, clubId),
          eq(membershipTiers.slug, members.tier)
        )
      )
      .where(
        and(
          eq(members.club_id, clubId),
          eq(members.membership_status, "active"),
          ne(members.tier, "non_member")
        )
      )
      .groupBy(membershipTiers.label, membershipTiers.level)
      .orderBy(membershipTiers.level),

    // Approved litters + total puppies
    db
      .select({
        total: sql<number>`count(*)::int`,
        total_puppies: sql<number>`coalesce(sum(${litters.num_males} + ${litters.num_females}), 0)::int`,
      })
      .from(litters)
      .where(and(eq(litters.club_id, clubId), eq(litters.approved, true))),

    // Pending membership applications
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(membershipApplications)
      .where(
        and(
          eq(membershipApplications.club_id, clubId),
          sql`${membershipApplications.status} in ('submitted', 'under_review')`
        )
      ),
  ]);

  const totalDogs = totalDogsResult[0]?.count ?? 0;
  const healthTested = healthTestedResult[0]?.count ?? 0;
  const healthTestedPct = totalDogs > 0 ? Math.round((healthTested / totalDogs) * 100) : 0;

  // Build color distribution — null health_rating comes back as a null key
  const colorDist = { blue: 0, green: 0, yellow: 0, orange: 0, red: 0, unrated: 0 };
  for (const row of colorDistResult) {
    const col = row.color as keyof typeof colorDist | null;
    if (col === null || col === undefined) {
      colorDist.unrated += row.count;
    } else if (col in colorDist) {
      colorDist[col] += row.count;
    }
  }

  const totalActive = membersByTierResult.reduce((sum, r) => sum + r.count, 0);

  return c.json({
    dogs: {
      total: totalDogs,
      health_tested: healthTested,
      health_tested_pct: healthTestedPct,
      color_distribution: colorDist,
    },
    members: {
      total_active: totalActive,
      by_tier: membersByTierResult.map((r) => ({
        label: r.label,
        level: r.level,
        count: r.count,
      })),
    },
    litters: {
      total: littersResult[0]?.total ?? 0,
      total_puppies: littersResult[0]?.total_puppies ?? 0,
    },
    pending_applications: pendingAppsResult[0]?.count ?? 0,
  });
});

// ─── Health Condition Queue ───────────────────────────────────────────────────

/**
 * GET /health-conditions/queue — list pending conditions awaiting approval.
 */
adminRoutes.get("/health-conditions/queue", requirePermission("health:verify"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const conditions = await db
    .select({
      id: healthConditions.id,
      dog_id: healthConditions.dog_id,
      condition_type_id: healthConditions.condition_type_id,
      condition_name: healthConditions.condition_name,
      category: healthConditions.category,
      diagnosis_date: healthConditions.diagnosis_date,
      resolved_date: healthConditions.resolved_date,
      medical_severity: healthConditions.medical_severity,
      breeding_impact: healthConditions.breeding_impact,
      status: healthConditions.status,
      notes: healthConditions.notes,
      reported_by: healthConditions.reported_by,
      created_at: healthConditions.created_at,
      dog_registered_name: dogs.registered_name,
      dog_call_name: dogs.call_name,
    })
    .from(healthConditions)
    .innerJoin(dogs, eq(healthConditions.dog_id, dogs.id))
    .where(and(eq(healthConditions.status, "pending"), eq(dogs.club_id, clubId)))
    .orderBy(healthConditions.created_at);

  return c.json({ conditions });
});

/**
 * POST /health-conditions/:id/approve — approve a reported condition.
 */
adminRoutes.post("/health-conditions/:id/approve", requirePermission("health:verify"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const [condition] = await db
    .select({ id: healthConditions.id, status: healthConditions.status, dog_id: healthConditions.dog_id })
    .from(healthConditions)
    .innerJoin(dogs, eq(healthConditions.dog_id, dogs.id))
    .where(and(eq(healthConditions.id, id), eq(dogs.club_id, clubId)))
    .limit(1);

  if (!condition) throw notFound("Health condition");
  if (condition.status !== "pending") throw badRequest("Condition is not pending");

  await db
    .update(healthConditions)
    .set({ status: "approved" })
    .where(eq(healthConditions.id, id));

  c.executionCtx.waitUntil(refreshHealthStatisticsCache(db, clubId));

  return c.json({ ok: true });
});

/**
 * POST /health-conditions/:id/reject — reject a reported condition.
 */
adminRoutes.post("/health-conditions/:id/reject", requirePermission("health:verify"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const [condition] = await db
    .select({ id: healthConditions.id, status: healthConditions.status })
    .from(healthConditions)
    .innerJoin(dogs, eq(healthConditions.dog_id, dogs.id))
    .where(and(eq(healthConditions.id, id), eq(dogs.club_id, clubId)))
    .limit(1);

  if (!condition) throw notFound("Health condition");
  if (condition.status !== "pending") throw badRequest("Condition is not pending");

  await db
    .update(healthConditions)
    .set({ status: "rejected" })
    .where(eq(healthConditions.id, id));

  return c.json({ ok: true });
});

// ─── Health Condition Types (admin CRUD) ─────────────────────────────────────

const createConditionTypeSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().min(1).max(30),
  description: z.string().optional(),
  is_hereditary: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

/**
 * GET /condition-types — list all condition types for this club.
 */
adminRoutes.get("/condition-types", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const types = await db
    .select()
    .from(healthConditionTypes)
    .where(eq(healthConditionTypes.club_id, clubId))
    .orderBy(healthConditionTypes.category, healthConditionTypes.sort_order, healthConditionTypes.name);

  return c.json({ condition_types: types });
});

/**
 * POST /condition-types — create a condition type.
 */
adminRoutes.post("/condition-types", requirePermission("test_types:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const body = await c.req.json();
  const data = createConditionTypeSchema.parse(body);

  const [ct] = await db
    .insert(healthConditionTypes)
    .values({ ...data, club_id: clubId })
    .returning();

  return c.json({ condition_type: ct }, 201);
});

/**
 * PATCH /condition-types/:id — update a condition type.
 */
adminRoutes.patch("/condition-types/:id", requirePermission("test_types:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const existing = await db.query.healthConditionTypes.findFirst({
    where: and(eq(healthConditionTypes.id, id), eq(healthConditionTypes.club_id, clubId)),
  });
  if (!existing) throw notFound("Condition type");

  const body = await c.req.json();
  const data = createConditionTypeSchema.partial().parse(body);

  const [updated] = await db
    .update(healthConditionTypes)
    .set(data)
    .where(eq(healthConditionTypes.id, id))
    .returning();

  return c.json({ condition_type: updated });
});

/**
 * DELETE /condition-types/:id — soft-delete (set is_active=false).
 */
adminRoutes.delete("/condition-types/:id", requirePermission("test_types:manage"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const existing = await db.query.healthConditionTypes.findFirst({
    where: and(eq(healthConditionTypes.id, id), eq(healthConditionTypes.club_id, clubId)),
  });
  if (!existing) throw notFound("Condition type");

  await db
    .update(healthConditionTypes)
    .set({ is_active: false })
    .where(eq(healthConditionTypes.id, id));

  return c.json({ ok: true });
});

export { adminRoutes };
