/**
 * Admin routes for managing membership form fields.
 *
 * - GET    /          — list all fields (active + inactive)
 * - POST   /          — create a new field
 * - PATCH  /:id       — update a field
 * - DELETE /:id       — soft delete (set is_active=false)
 * - PUT    /reorder   — bulk update sort_order
 */

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { requireTier } from "../middleware/rbac.js";
import { membershipFormFields } from "../db/schema.js";
import { notFound, conflict } from "../lib/errors.js";
import {
  createFormFieldSchema,
  updateFormFieldSchema,
  reorderFormFieldsSchema,
} from "@breed-club/shared/validation.js";

type Variables = {
  clubId: string;
  db: Database;
  clerkUserId: string | null;
  auth: AuthContext | null;
};

const formFieldRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET / — list all form fields (active + inactive), ordered by sort_order.
 */
formFieldRoutes.get("/", requireTier("admin"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const data = await db.query.membershipFormFields.findMany({
    where: eq(membershipFormFields.club_id, clubId),
    orderBy: (f, { asc }) => [asc(f.sort_order)],
  });

  return c.json({ data });
});

/**
 * POST / — create a new form field.
 */
formFieldRoutes.post("/", requireTier("admin"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const body = await c.req.json();
  const data = createFormFieldSchema.parse(body);

  // Check for duplicate field_key in this club
  const existing = await db.query.membershipFormFields.findFirst({
    where: and(
      eq(membershipFormFields.club_id, clubId),
      eq(membershipFormFields.field_key, data.field_key)
    ),
  });

  if (existing) {
    throw conflict(`A form field with key "${data.field_key}" already exists`);
  }

  const [field] = await db
    .insert(membershipFormFields)
    .values({
      club_id: clubId,
      ...data,
    })
    .returning();

  return c.json({ data: field }, 201);
});

/**
 * PATCH /:id — update a form field.
 * field_key cannot be changed (to preserve historical form_data references).
 */
formFieldRoutes.patch("/:id", requireTier("admin"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const body = await c.req.json();
  const data = updateFormFieldSchema.parse(body);

  const existing = await db.query.membershipFormFields.findFirst({
    where: and(
      eq(membershipFormFields.id, id),
      eq(membershipFormFields.club_id, clubId)
    ),
  });

  if (!existing) {
    throw notFound("Form field");
  }

  const [updated] = await db
    .update(membershipFormFields)
    .set({ ...data, updated_at: new Date() })
    .where(eq(membershipFormFields.id, id))
    .returning();

  return c.json({ data: updated });
});

/**
 * DELETE /:id — soft delete (set is_active=false).
 */
formFieldRoutes.delete("/:id", requireTier("admin"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const existing = await db.query.membershipFormFields.findFirst({
    where: and(
      eq(membershipFormFields.id, id),
      eq(membershipFormFields.club_id, clubId)
    ),
  });

  if (!existing) {
    throw notFound("Form field");
  }

  await db
    .update(membershipFormFields)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(membershipFormFields.id, id));

  return c.json({ success: true });
});

/**
 * PUT /reorder — bulk update sort_order from ordered array of field IDs.
 */
formFieldRoutes.put("/reorder", requireTier("admin"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const body = await c.req.json();
  const { field_ids } = reorderFormFieldsSchema.parse(body);

  // Update each field's sort_order based on array position
  await Promise.all(
    field_ids.map((id, index) =>
      db
        .update(membershipFormFields)
        .set({ sort_order: index, updated_at: new Date() })
        .where(
          and(
            eq(membershipFormFields.id, id),
            eq(membershipFormFields.club_id, clubId)
          )
        )
    )
  );

  return c.json({ success: true });
});

export { formFieldRoutes };
