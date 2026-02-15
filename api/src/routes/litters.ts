/**
 * Litter routes.
 *
 * - POST   /                    — register litter (requires is_breeder)
 * - GET    /                    — list own litters
 * - GET    /:id                 — litter detail with pups
 * - PATCH  /:id                 — update litter
 * - POST   /:id/pups            — add pup to litter
 * - PATCH  /:id/pups/:pid       — update pup
 * - POST   /:id/pups/:pid/sell  — sell pup (creates contact + dog + sends invite)
 */

import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { requireAuth } from "../middleware/auth.js";
import { requireTier, requireFlag } from "../middleware/rbac.js";
import {
  litters,
  litterPups,
  contacts,
  dogs,
  members,
} from "../db/schema.js";
import { notFound, badRequest, forbidden } from "../lib/errors.js";
import {
  createLitterSchema,
  createLitterPupSchema,
  sellPupSchema,
  paginationSchema,
} from "@breed-club/shared/validation.js";

type Variables = {
  clubId: string;
  db: Database;
  clerkUserId: string | null;
  auth: AuthContext | null;
};

const litterRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * POST / — register a new litter.
 * Requires is_breeder flag.
 * Auto-approved if verified_breeder=true, otherwise goes to approval queue.
 */
litterRoutes.post("/", requireAuth, requireFlag("is_breeder"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const body = await c.req.json();
  const litterData = createLitterSchema.parse(body);

  // Get breeder's contact record
  const breederContact = await db.query.contacts.findFirst({
    where: eq(contacts.member_id, auth.member.id),
  });

  if (!breederContact) {
    throw badRequest("Breeder contact record not found");
  }

  // Auto-approve for verified breeders
  const autoApprove = auth.member.verified_breeder;

  const [litter] = await db
    .insert(litters)
    .values({
      ...litterData,
      club_id: clubId,
      breeder_id: breederContact.id,
      approved: autoApprove,
      approved_by: autoApprove ? auth.member.id : null,
      approved_at: autoApprove ? new Date() : null,
    })
    .returning();

  return c.json(litter, 201);
});

/**
 * GET / — list own litters.
 */
litterRoutes.get("/", requireAuth, requireFlag("is_breeder"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  // Get breeder's contact record
  const breederContact = await db.query.contacts.findFirst({
    where: eq(contacts.member_id, auth.member.id),
  });

  if (!breederContact) {
    return c.json({ data: [] });
  }

  const results = await db.query.litters.findMany({
    where: and(
      eq(litters.club_id, clubId),
      eq(litters.breeder_id, breederContact.id)
    ),
    with: {
      sire: true,
      dam: true,
      breeder: true,
      pups: {
        with: {
          buyer: true,
          dog: true,
        },
      },
    },
    orderBy: [desc(litters.created_at)],
  });

  return c.json({ data: results });
});

/**
 * GET /:id — litter detail with pups.
 */
litterRoutes.get("/:id", requireAuth, requireFlag("is_breeder"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const litterId = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const litter = await db.query.litters.findFirst({
    where: and(eq(litters.id, litterId), eq(litters.club_id, clubId)),
    with: {
      sire: true,
      dam: true,
      breeder: true,
      pups: {
        with: {
          buyer: true,
          dog: true,
        },
      },
    },
  });

  if (!litter) {
    throw notFound("Litter");
  }

  // Verify ownership (unless admin)
  if (auth.member.tier !== "admin") {
    const breederContact = await db.query.contacts.findFirst({
      where: eq(contacts.member_id, auth.member.id),
    });

    if (!breederContact || litter.breeder_id !== breederContact.id) {
      throw forbidden("You can only view your own litters");
    }
  }

  return c.json(litter);
});

/**
 * PATCH /:id — update litter.
 */
litterRoutes.patch("/:id", requireAuth, requireFlag("is_breeder"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const litterId = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const litter = await db.query.litters.findFirst({
    where: and(eq(litters.id, litterId), eq(litters.club_id, clubId)),
  });

  if (!litter) {
    throw notFound("Litter");
  }

  // Verify ownership
  const breederContact = await db.query.contacts.findFirst({
    where: eq(contacts.member_id, auth.member.id),
  });

  if (!breederContact || litter.breeder_id !== breederContact.id) {
    throw forbidden("You can only update your own litters");
  }

  const body = await c.req.json();
  const updates = createLitterSchema.partial().parse(body);

  const [updated] = await db
    .update(litters)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(litters.id, litterId))
    .returning();

  return c.json(updated);
});

/**
 * POST /:id/pups — add pup to litter.
 */
litterRoutes.post("/:id/pups", requireAuth, requireFlag("is_breeder"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const litterId = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const litter = await db.query.litters.findFirst({
    where: and(eq(litters.id, litterId), eq(litters.club_id, clubId)),
  });

  if (!litter) {
    throw notFound("Litter");
  }

  // Verify ownership
  const breederContact = await db.query.contacts.findFirst({
    where: eq(contacts.member_id, auth.member.id),
  });

  if (!breederContact || litter.breeder_id !== breederContact.id) {
    throw forbidden("You can only add pups to your own litters");
  }

  // Only allow adding pups to approved litters
  if (!litter.approved) {
    throw badRequest("Cannot add pups to unapproved litter");
  }

  const body = await c.req.json();
  const pupData = createLitterPupSchema.parse(body);

  const [pup] = await db
    .insert(litterPups)
    .values({
      ...pupData,
      litter_id: litterId,
      status: "available",
    })
    .returning();

  return c.json(pup, 201);
});

/**
 * PATCH /:id/pups/:pid — update pup.
 */
litterRoutes.patch("/:id/pups/:pid", requireAuth, requireFlag("is_breeder"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const litterId = c.req.param("id");
  const pupId = c.req.param("pid");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const litter = await db.query.litters.findFirst({
    where: and(eq(litters.id, litterId), eq(litters.club_id, clubId)),
  });

  if (!litter) {
    throw notFound("Litter");
  }

  // Verify ownership
  const breederContact = await db.query.contacts.findFirst({
    where: eq(contacts.member_id, auth.member.id),
  });

  if (!breederContact || litter.breeder_id !== breederContact.id) {
    throw forbidden("You can only update pups in your own litters");
  }

  const pup = await db.query.litterPups.findFirst({
    where: eq(litterPups.id, pupId),
  });

  if (!pup || pup.litter_id !== litterId) {
    throw notFound("Pup");
  }

  const body = await c.req.json();
  const updates = createLitterPupSchema.partial().parse(body);

  const [updated] = await db
    .update(litterPups)
    .set(updates)
    .where(eq(litterPups.id, pupId))
    .returning();

  return c.json(updated);
});

/**
 * POST /:id/pups/:pid/sell — sell pup.
 * Creates buyer contact, creates dog record (pending approval), updates pup status.
 *
 * Future enhancement: Send email invitation to buyer.
 */
litterRoutes.post("/:id/pups/:pid/sell", requireAuth, requireFlag("is_breeder"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const litterId = c.req.param("id");
  const pupId = c.req.param("pid");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const litter = await db.query.litters.findFirst({
    where: and(eq(litters.id, litterId), eq(litters.club_id, clubId)),
    with: {
      sire: true,
      dam: true,
    },
  });

  if (!litter) {
    throw notFound("Litter");
  }

  // Verify ownership
  const breederContact = await db.query.contacts.findFirst({
    where: eq(contacts.member_id, auth.member.id),
  });

  if (!breederContact || litter.breeder_id !== breederContact.id) {
    throw forbidden("You can only sell pups from your own litters");
  }

  const pup = await db.query.litterPups.findFirst({
    where: eq(litterPups.id, pupId),
  });

  if (!pup || pup.litter_id !== litterId) {
    throw notFound("Pup");
  }

  if (pup.status === "sold") {
    throw badRequest("Pup already sold");
  }

  const body = await c.req.json();
  const { buyer_email, buyer_name, registered_name } = sellPupSchema.parse(body);

  // Check if buyer contact already exists
  let buyerContact = await db.query.contacts.findFirst({
    where: and(eq(contacts.club_id, clubId), eq(contacts.email, buyer_email)),
  });

  // Create buyer contact if doesn't exist
  if (!buyerContact) {
    [buyerContact] = await db
      .insert(contacts)
      .values({
        club_id: clubId,
        full_name: buyer_name,
        email: buyer_email,
      })
      .returning();
  }

  // Create dog record for the pup
  const [dog] = await db
    .insert(dogs)
    .values({
      club_id: clubId,
      registered_name,
      call_name: pup.call_name,
      sex: pup.sex,
      color: pup.color,
      coat_type: pup.coat_type,
      date_of_birth: litter.whelp_date,
      sire_id: litter.sire_id,
      dam_id: litter.dam_id,
      owner_id: buyerContact.id,
      breeder_id: breederContact.id,
      status: "pending",
      submitted_by: auth.member.id,
      is_public: false,
    })
    .returning();

  // Update pup record
  await db
    .update(litterPups)
    .set({
      status: "sold",
      dog_id: dog.id,
      buyer_contact_id: buyerContact.id,
    })
    .where(eq(litterPups.id, pupId));

  // TODO: Send email invitation to buyer
  // This would use Cloudflare Email Routing or a service like Resend
  // For now, we just return the created records

  return c.json({
    dog,
    buyer: buyerContact,
    pup: {
      ...pup,
      status: "sold",
      dog_id: dog.id,
      buyer_contact_id: buyerContact.id,
    },
  });
});

export { litterRoutes };
