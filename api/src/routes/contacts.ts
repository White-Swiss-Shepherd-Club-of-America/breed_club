/**
 * Contact routes.
 *
 * - GET    /             — search/list contacts (typeahead)
 * - POST   /             — create contact
 * - GET    /:id          — get contact
 * - PATCH  /:id          — update contact
 */

import { Hono } from "hono";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { requireAuth } from "../middleware/auth.js";
import { requireTier } from "../middleware/rbac.js";
import { contacts } from "../db/schema.js";
import { notFound, badRequest } from "../lib/errors.js";
import { createContactSchema, updateContactSchema, paginationSchema } from "@breed-club/shared/validation.js";

type Variables = {
  clubId: string;
  db: Database;
  clerkUserId: string | null;
  auth: AuthContext | null;
};

const contactRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET / — search/list contacts. Supports typeahead via ?search= param.
 * Certificate+ tier required.
 */
contactRoutes.get("/", requireTier("certificate"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const query = paginationSchema.parse(c.req.query());

  const conditions = [eq(contacts.club_id, clubId)];

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(
        ilike(contacts.full_name, pattern),
        ilike(contacts.kennel_name, pattern),
        ilike(contacts.email, pattern)
      )!
    );
  }

  const where = and(...conditions);

  const [data, countResult] = await Promise.all([
    db.query.contacts.findMany({
      where,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    }),
    db.select({ count: sql<number>`count(*)` }).from(contacts).where(where),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return c.json({
    data,
    meta: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
  });
});

/**
 * POST / — create a new contact.
 */
contactRoutes.post("/", requireTier("certificate"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const body = await c.req.json();
  const data = createContactSchema.parse(body);

  const [contact] = await db
    .insert(contacts)
    .values({ ...data, club_id: clubId })
    .returning();

  return c.json({ contact }, 201);
});

/**
 * GET /:id — get a single contact.
 */
contactRoutes.get("/:id", requireTier("certificate"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, id), eq(contacts.club_id, clubId)),
  });

  if (!contact) {
    throw notFound("Contact");
  }

  return c.json({ contact });
});

/**
 * PATCH /:id — update a contact.
 */
contactRoutes.patch("/:id", requireTier("certificate"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const body = await c.req.json();
  const data = updateContactSchema.parse(body);

  if (Object.keys(data).length === 0) {
    throw badRequest("No fields to update");
  }

  const existing = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, id), eq(contacts.club_id, clubId)),
  });

  if (!existing) {
    throw notFound("Contact");
  }

  await db
    .update(contacts)
    .set({ ...data, updated_at: new Date() })
    .where(eq(contacts.id, id));

  const updated = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
  });

  return c.json({ contact: updated });
});

export { contactRoutes };
