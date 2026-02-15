/**
 * Admin routes.
 *
 * - GET    /members              — list all members
 * - GET    /members/:id          — get member detail
 * - PATCH  /members/:id          — update member (tier, flags, etc.)
 * - GET    /dogs/pending         — list dogs awaiting approval
 * - POST   /dogs/:id/approve     — approve dog
 * - POST   /dogs/:id/reject      — reject dog
 * - GET    /organizations        — list organizations
 * - POST   /organizations        — create organization
 * - GET    /health-test-types    — list health test types
 * - POST   /health-test-types    — create health test type
 * - GET    /export/dogs          — export dogs to CSV
 * - GET    /export/health        — export health clearances to CSV
 */

import { Hono } from "hono";
import { eq, and, sql, ilike } from "drizzle-orm";
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
} from "../db/schema.js";
import { notFound, badRequest, forbidden } from "../lib/errors.js";
import {
  updateMemberSchema,
  createOrganizationSchema,
  createHealthTestTypeSchema,
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

  const where = and(eq(dogs.club_id, clubId), eq(dogs.status, "pending"));

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

  // Reshape: flatten orgLinks into grading_orgs array
  const result = data.map((tt) => ({
    ...tt,
    grading_orgs: tt.orgLinks.map((link) => link.organization),
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
  const { grading_org_ids, ...data } = createHealthTestTypeSchema.parse(body);

  const [testType] = await db
    .insert(healthTestTypes)
    .values({ ...data, club_id: clubId })
    .returning();

  // Link grading organizations
  if (grading_org_ids && grading_org_ids.length > 0 && testType) {
    await db.insert(healthTestTypeOrgs).values(
      grading_org_ids.map((orgId) => ({
        health_test_type_id: testType.id,
        organization_id: orgId,
      }))
    );
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
  const { grading_org_ids, ...data } = createHealthTestTypeSchema.partial().parse(body);

  const testType = await db.query.healthTestTypes.findFirst({
    where: and(eq(healthTestTypes.id, id), eq(healthTestTypes.club_id, clubId)),
  });

  if (!testType) throw notFound("Health test type");

  if (Object.keys(data).length > 0) {
    await db.update(healthTestTypes).set(data as any).where(eq(healthTestTypes.id, id));
  }

  // Update org links if provided
  if (grading_org_ids !== undefined) {
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
      ? { ...updated, grading_orgs: updated.orgLinks.map((l) => l.organization), orgLinks: undefined }
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
    db.select({ count: sql<number>`count(*)` }).from(dogHealthClearances).where(where),
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

  await db
    .update(dogHealthClearances)
    .set({
      status: "approved",
      verified_by: auth.member.id,
      verified_at: new Date(),
    })
    .where(eq(dogHealthClearances.id, id));

  const updated = await db.query.dogHealthClearances.findFirst({
    where: eq(dogHealthClearances.id, id),
  });

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
      dog.owner?.name || "",
      dog.owner?.email || "",
      dog.breeder?.name || "",
      dog.breeder?.email || "",
      registrations,
      dog.status,
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

export { adminRoutes };
