/**
 * Member routes.
 *
 * - GET  /me            — current member profile
 * - POST /register      — auto-register on first sign-in (creates contact + member)
 * - PATCH /me           — update own profile (contact fields)
 * - GET  /directory     — breeder directory (public-ish)
 */

import { Hono } from "hono";
import { eq, and, ilike, sql } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { requireAuth } from "../middleware/auth.js";
import { requireTier } from "../middleware/rbac.js";
import { members, contacts } from "../db/schema.js";
import { notFound, conflict, badRequest } from "../lib/errors.js";
import { updateContactSchema, paginationSchema } from "@breed-club/shared/validation.js";

type Variables = {
  clubId: string;
  db: Database;
  clerkUserId: string | null;
  auth: AuthContext | null;
};

const memberRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET /me — get current member + contact info.
 * Requires Clerk auth but NOT a member record (returns 404 if not registered).
 */
memberRoutes.get("/me", requireAuth, async (c) => {
  const auth = c.get("auth");
  if (!auth) {
    return c.json({ member: null }, 200);
  }

  const db = c.get("db");
  const member = await db.query.members.findFirst({
    where: and(eq(members.club_id, auth.clubId), eq(members.id, auth.memberId)),
    with: { contact: true },
  });

  if (!member) {
    throw notFound("Member");
  }

  return c.json({ member });
});

/**
 * POST /register — self-register on first sign-in.
 * Creates a contact record and a non_member member record.
 * Idempotent: if already registered, returns existing record.
 */
memberRoutes.post("/register", requireAuth, async (c) => {
  const clerkUserId = c.get("clerkUserId")!;
  const clubId = c.get("clubId");
  const db = c.get("db");

  // Check if already registered
  const existing = await db.query.members.findFirst({
    where: and(eq(members.club_id, clubId), eq(members.clerk_user_id, clerkUserId)),
    with: { contact: true },
  });

  if (existing) {
    return c.json({ member: existing }, 200);
  }

  const body = await c.req.json().catch(() => ({}));
  const { full_name, email } = body as { full_name?: string; email?: string };

  if (!full_name) {
    throw badRequest("full_name is required for registration");
  }

  // Create contact + member in a transaction-like flow
  // (Supabase doesn't support real transactions via HTTP pooler, but these are
  //  sequential inserts — if the member insert fails, we have an orphan contact
  //  which is fine as contacts are standalone entities anyway)
  const [contact] = await db
    .insert(contacts)
    .values({
      club_id: clubId,
      full_name,
      email: email || null,
    })
    .returning();

  const [member] = await db
    .insert(members)
    .values({
      club_id: clubId,
      clerk_user_id: clerkUserId,
      contact_id: contact!.id,
      tier: "non_member",
      membership_status: "active",
    })
    .returning();

  // Link contact back to member
  await db
    .update(contacts)
    .set({ member_id: member!.id, updated_at: new Date() })
    .where(eq(contacts.id, contact!.id));

  const result = await db.query.members.findFirst({
    where: eq(members.id, member!.id),
    with: { contact: true },
  });

  return c.json({ member: result }, 201);
});

/**
 * PATCH /me — update own profile (contact fields only).
 */
memberRoutes.patch("/me", requireAuth, async (c) => {
  const auth = c.get("auth");
  if (!auth) {
    throw notFound("Member");
  }

  const db = c.get("db");
  const body = await c.req.json();
  const parsed = updateContactSchema.parse(body);

  if (Object.keys(parsed).length === 0) {
    throw badRequest("No fields to update");
  }

  await db
    .update(contacts)
    .set({ ...parsed, updated_at: new Date() })
    .where(eq(contacts.id, auth.contactId));

  const member = await db.query.members.findFirst({
    where: eq(members.id, auth.memberId),
    with: { contact: true },
  });

  return c.json({ member });
});

/**
 * GET /directory — breeder directory.
 * Returns members where show_in_directory=true and is_breeder=true.
 * Accessible to non_member+.
 */
memberRoutes.get("/directory", async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const query = paginationSchema.parse(c.req.query());

  const where = and(
    eq(members.club_id, clubId),
    eq(members.show_in_directory, true),
    eq(members.is_breeder, true),
    eq(members.membership_status, "active")
  );

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
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  });
});

export { memberRoutes };
