/**
 * Member routes.
 *
 * - GET  /me            — current member profile
 * - POST /register      — auto-register on first sign-in (creates contact + member)
 * - PATCH /me           — update own profile (contact fields)
 * - PATCH /me/breeder   — update breeder preferences (colors, logo, pup status)
 * - GET  /directory     — breeder directory (public-ish)
 */

import { Hono } from "hono";
import { eq, and, ilike, sql } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { requireAuth } from "../middleware/auth.js";
import { requireLevel } from "../middleware/rbac.js";
import { members, contacts, membershipTiers } from "../db/schema.js";
import { notFound, conflict, badRequest } from "../lib/errors.js";
import { updateContactSchema, updateBreederPrefsSchema, paginationSchema } from "@breed-club/shared/validation.js";

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

  return c.json({ member: { ...member, tierLevel: auth.tierLevel } });
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
  let { full_name, email } = body as { full_name?: string; email?: string };

  // If full_name not provided, fetch it from Clerk
  if (!full_name) {
    const clerkRes = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
      headers: { Authorization: `Bearer ${c.env.CLERK_SECRET_KEY}` },
    });
    if (clerkRes.ok) {
      const clerkUser = await clerkRes.json() as {
        first_name?: string;
        last_name?: string;
        email_addresses?: { email_address: string }[];
      };
      const parts = [clerkUser.first_name, clerkUser.last_name].filter(Boolean);
      full_name = parts.join(" ") || undefined;
      if (!email) {
        email = clerkUser.email_addresses?.[0]?.email_address;
      }
    }
  }

  if (!full_name) {
    throw badRequest("Could not determine full_name — provide it explicitly or complete your Clerk profile");
  }

  // Check for existing contact by email (e.g. created via sell-pup) that isn't linked to a member yet
  let contact;
  if (email) {
    const existingContact = await db.query.contacts.findFirst({
      where: and(eq(contacts.club_id, clubId), eq(contacts.email, email)),
    });
    if (existingContact && !existingContact.member_id) {
      // Reuse existing unlinked contact, update name if needed
      contact = existingContact;
      if (full_name && full_name !== existingContact.full_name) {
        await db
          .update(contacts)
          .set({ full_name, updated_at: new Date() })
          .where(eq(contacts.id, existingContact.id));
      }
    }
  }

  // Create new contact if no reusable one found
  if (!contact) {
    [contact] = await db
      .insert(contacts)
      .values({
        club_id: clubId,
        full_name,
        email: email || null,
      })
      .returning();
  }

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
 * PATCH /me/breeder — update breeder preferences.
 * Splits contact fields (kennel_name, website_url) from member fields (colors, logo, pup status).
 */
memberRoutes.patch("/me/breeder", requireAuth, async (c) => {
  const auth = c.get("auth");
  if (!auth) throw notFound("Member");
  if (!auth.flags.is_breeder) throw badRequest("Breeder flag is not set on your account");

  const db = c.get("db");
  const body = await c.req.json();
  const parsed = updateBreederPrefsSchema.parse(body);

  const contactFields: Record<string, unknown> = {};
  const memberFields: Record<string, unknown> = {};

  if (parsed.kennel_name !== undefined) contactFields.kennel_name = parsed.kennel_name;
  if (parsed.website_url !== undefined) contactFields.website_url = parsed.website_url;
  if (parsed.logo_url !== undefined) memberFields.logo_url = parsed.logo_url;
  if (parsed.banner_url !== undefined) memberFields.banner_url = parsed.banner_url;
  if (parsed.primary_color !== undefined) memberFields.primary_color = parsed.primary_color;
  if (parsed.accent_color !== undefined) memberFields.accent_color = parsed.accent_color;
  if (parsed.pup_status !== undefined) memberFields.pup_status = parsed.pup_status;
  if (parsed.pup_expected_date !== undefined) memberFields.pup_expected_date = parsed.pup_expected_date;
  if (parsed.show_in_directory !== undefined) memberFields.show_in_directory = parsed.show_in_directory;

  // Clear expected date if status is not "expected"
  if (parsed.pup_status && parsed.pup_status !== "expected") {
    memberFields.pup_expected_date = null;
  }

  if (Object.keys(contactFields).length > 0) {
    await db
      .update(contacts)
      .set({ ...contactFields, updated_at: new Date() })
      .where(eq(contacts.id, auth.contactId));
  }

  if (Object.keys(memberFields).length > 0) {
    await db
      .update(members)
      .set({ ...memberFields, updated_at: new Date() })
      .where(eq(members.id, auth.memberId));
  }

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
