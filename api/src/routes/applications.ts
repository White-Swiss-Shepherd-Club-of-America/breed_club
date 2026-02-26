/**
 * Membership application routes.
 *
 * - POST /                — submit application (requires Clerk auth, no member needed)
 * - GET  /                — list own applications
 * - GET  /queue           — pending applications (member_approver only)
 * - GET  /:id             — get single application
 * - PATCH /:id/review     — approve/reject (member_approver only)
 */

import { Hono } from "hono";
import { eq, and, desc, sql } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { membershipApplications, membershipFormFields, members, contacts } from "../db/schema.js";
import { notFound, badRequest, conflict } from "../lib/errors.js";
import { createApplicationSchema, paginationSchema } from "@breed-club/shared/validation.js";
import { validateFormData } from "../lib/form-data.js";
import { z } from "zod";

type Variables = {
  clubId: string;
  db: Database;
  clerkUserId: string | null;
  auth: AuthContext | null;
};

const applicationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const reviewSchema = z.object({
  status: z.enum(["approved", "rejected", "needs_revision"]),
  review_notes: z.string().max(2000).nullish(),
  // If approving, optionally set the tier + membership_type
  tier: z.enum(["non_member", "certificate", "member"]).optional(),
  membership_type: z.string().max(50).optional(),
});

/**
 * POST / — submit a membership application.
 * Requires Clerk auth but does NOT require an existing member record.
 */
applicationRoutes.post("/", requireAuth, async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const body = await c.req.json();
  const { form_data: rawFormData, ...data } = createApplicationSchema.parse(body);

  // Validate form_data against configured fields
  let formData = null;
  if (rawFormData) {
    const configuredFields = await db.query.membershipFormFields.findMany({
      where: and(
        eq(membershipFormFields.club_id, clubId),
        eq(membershipFormFields.is_active, true)
      ),
      columns: {
        field_key: true,
        label: true,
        field_type: true,
        required: true,
      },
    });
    formData = validateFormData(rawFormData, configuredFields);
  }

  // Check for duplicate pending application
  const existing = await db.query.membershipApplications.findFirst({
    where: and(
      eq(membershipApplications.club_id, clubId),
      eq(membershipApplications.applicant_email, data.applicant_email),
      eq(membershipApplications.status, "submitted")
    ),
  });

  if (existing) {
    throw conflict("You already have a pending application");
  }

  const [application] = await db
    .insert(membershipApplications)
    .values({
      club_id: clubId,
      ...data,
      form_data: formData,
      status: "submitted",
    })
    .returning();

  return c.json({ application }, 201);
});

/**
 * GET / — list own applications (by email match).
 */
applicationRoutes.get("/", requireAuth, async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");

  // If they have a member record, look up their contact email
  if (auth) {
    const contact = await db.query.contacts.findFirst({
      where: eq(contacts.id, auth.contactId),
    });

    if (contact?.email) {
      const apps = await db.query.membershipApplications.findMany({
        where: and(
          eq(membershipApplications.club_id, clubId),
          eq(membershipApplications.applicant_email, contact.email)
        ),
        orderBy: [desc(membershipApplications.created_at)],
      });
      return c.json({ data: apps });
    }
  }

  // No member or no email — return empty
  return c.json({ data: [] });
});

/**
 * GET /queue — pending applications for member approvers.
 */
applicationRoutes.get("/queue", requirePermission("members:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const query = paginationSchema.parse(c.req.query());

  const statusFilter = (c.req.query("status") as string) || "submitted";

  const where = and(
    eq(membershipApplications.club_id, clubId),
    eq(membershipApplications.status, statusFilter)
  );

  const [data, countResult] = await Promise.all([
    db.query.membershipApplications.findMany({
      where,
      orderBy: [desc(membershipApplications.created_at)],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(membershipApplications)
      .where(where),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

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
 * GET /:id — get a single application.
 */
applicationRoutes.get("/:id", requireAuth, async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const application = await db.query.membershipApplications.findFirst({
    where: and(
      eq(membershipApplications.id, id),
      eq(membershipApplications.club_id, clubId)
    ),
  });

  if (!application) {
    throw notFound("Application");
  }

  return c.json({ application });
});

/**
 * PATCH /:id/review — approve or reject an application.
 * On approval: creates contact + member records, upgrades tier.
 */
applicationRoutes.patch("/:id/review", requirePermission("members:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth")!;
  const id = c.req.param("id");

  const body = await c.req.json();
  const data = reviewSchema.parse(body);

  const application = await db.query.membershipApplications.findFirst({
    where: and(
      eq(membershipApplications.id, id),
      eq(membershipApplications.club_id, clubId)
    ),
  });

  if (!application) {
    throw notFound("Application");
  }

  if (application.status !== "submitted" && application.status !== "under_review") {
    throw badRequest(`Cannot review an application with status "${application.status}"`);
  }

  // Update application status
  await db
    .update(membershipApplications)
    .set({
      status: data.status,
      review_notes: data.review_notes || null,
      reviewed_by: auth.memberId,
      reviewed_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(membershipApplications.id, id));

  // If approved, we don't auto-create the member here — the applicant needs
  // to sign up via Clerk first. The application just records approval.
  // When they sign up (POST /register), the app can check for an approved
  // application and auto-upgrade their tier.
  //
  // However, if we know their Clerk user already exists (they have a member
  // record), we can upgrade them directly.
  if (data.status === "approved" && application.member_id) {
    const tier = data.tier || "member";
    await db
      .update(members)
      .set({
        tier,
        membership_type: data.membership_type || application.membership_type,
        membership_status: "active",
        updated_at: new Date(),
      })
      .where(eq(members.id, application.member_id));
  }

  const updated = await db.query.membershipApplications.findFirst({
    where: eq(membershipApplications.id, id),
  });

  return c.json({ application: updated });
});

export { applicationRoutes };
