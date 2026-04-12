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
import { eq, and, desc, inArray } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { requireAuth } from "../middleware/auth.js";
import { requireLevel, requireFlag } from "../middleware/rbac.js";
import {
  litters,
  litterPups,
  contacts,
  dogs,
  members,
  clubs,
} from "../db/schema.js";
import { notFound, badRequest, forbidden } from "../lib/errors.js";
import {
  createLitterSchema,
  createLitterPupSchema,
  sellPupSchema,
  sireApprovalSchema,
  paginationSchema,
} from "@breed-club/shared/validation.js";
import { sendEmail, sireApprovalRequestEmail } from "../lib/email.js";

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

  // Determine sire approval status
  let sireApprovalStatus = "not_required";
  let sireOwnerContact: typeof breederContact | null = null;

  if (litterData.sire_id) {
    const sire = await db.query.dogs.findFirst({
      where: eq(dogs.id, litterData.sire_id),
      with: { owner: true },
    });

    if (sire && sire.owner_id && sire.owner_id !== breederContact.id) {
      sireApprovalStatus = "pending";
      sireOwnerContact = sire.owner ?? null;
    }
  }

  const [litter] = await db
    .insert(litters)
    .values({
      ...litterData,
      club_id: clubId,
      breeder_id: breederContact.id,
      sire_approval_status: sireApprovalStatus,
    })
    .returning();

  // Send sire approval request email (fire-and-forget)
  if (sireApprovalStatus === "pending" && sireOwnerContact?.email) {
    const club = await db.query.clubs.findFirst({ where: eq(clubs.id, clubId) });
    const sire = await db.query.dogs.findFirst({ where: eq(dogs.id, litterData.sire_id!) });

    if (club && sire) {
      const dashboardUrl = `${c.env.APP_URL}/dashboard`;
      c.executionCtx.waitUntil(
        sendEmail(
          {
            to: sireOwnerContact.email,
            subject: `Sire Approval Request — ${sire.call_name || sire.registered_name}`,
            html: sireApprovalRequestEmail({
              sireOwnerName: sireOwnerContact.full_name,
              sireName: sire.call_name || sire.registered_name,
              breederName: breederContact.kennel_name || breederContact.full_name,
              litterName: litterData.litter_name ?? null,
              whelpDate: litterData.whelp_date ?? null,
              dashboardUrl,
              clubName: club.name,
            }),
          },
          c.env.RESEND_API_KEY,
          c.env.EMAIL_FROM
        ).catch((err) => console.error("Failed to send sire approval email:", err))
      );
    }
  }

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
 * GET /sire-approvals — pending sire approvals for the current user.
 */
litterRoutes.get("/sire-approvals", requireAuth, async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  // Get user's contact record
  const userContact = await db.query.contacts.findFirst({
    where: eq(contacts.member_id, auth.member.id),
  });

  if (!userContact) {
    return c.json({ data: [] });
  }

  // Find all dogs owned by user
  const ownedDogs = await db.query.dogs.findMany({
    where: and(eq(dogs.club_id, clubId), eq(dogs.owner_id, userContact.id)),
    columns: { id: true },
  });

  if (ownedDogs.length === 0) {
    return c.json({ data: [] });
  }

  const ownedDogIds = ownedDogs.map((d) => d.id);

  // Query litters where sire is one of user's dogs and approval is pending
  const results = await db.query.litters.findMany({
    where: and(
      eq(litters.club_id, clubId),
      eq(litters.sire_approval_status, "pending"),
      inArray(litters.sire_id, ownedDogIds)
    ),
    with: {
      sire: true,
      dam: true,
      breeder: true,
    },
    orderBy: [desc(litters.created_at)],
  });

  return c.json({ data: results });
});

/**
 * POST /:id/sire-approve — approve or reject sire usage for a litter.
 */
litterRoutes.post("/:id/sire-approve", requireAuth, async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const litterId = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const litter = await db.query.litters.findFirst({
    where: and(eq(litters.id, litterId), eq(litters.club_id, clubId)),
    with: { sire: { with: { owner: true } } },
  });

  if (!litter) {
    throw notFound("Litter");
  }

  if (litter.sire_approval_status !== "pending") {
    throw badRequest("Sire approval is not pending for this litter");
  }

  // Verify the current user owns the sire
  const userContact = await db.query.contacts.findFirst({
    where: eq(contacts.member_id, auth.member.id),
  });

  if (!userContact || litter.sire?.owner_id !== userContact.id) {
    throw forbidden("You can only approve/reject litters using your own sire");
  }

  const body = await c.req.json();
  const { status, notes } = sireApprovalSchema.parse(body);

  const updateData: Record<string, unknown> = {
    sire_approval_status: status,
    sire_approval_by: auth.member.id,
    sire_approval_at: new Date(),
    updated_at: new Date(),
  };

  if (notes) {
    updateData.notes = notes;
  }

  const [updated] = await db
    .update(litters)
    .set(updateData)
    .where(eq(litters.id, litterId))
    .returning();

  return c.json(updated);
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
  if (auth.tierLevel < 100) {
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
 * DELETE /:id — delete a pending litter (breeder only, hard delete).
 */
litterRoutes.delete("/:id", requireAuth, requireFlag("is_breeder"), async (c) => {
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
    throw forbidden("You can only delete your own litters");
  }

  if (litter.approved) {
    throw badRequest("Cannot delete an approved litter");
  }

  await db.delete(litters).where(eq(litters.id, litterId));

  return c.json({ success: true });
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

  if (litter.approved) {
    throw badRequest("Cannot edit an approved litter");
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
  const { buyer_contact_id, buyer_email, buyer_name, registered_name } = sellPupSchema.parse(body);

  let buyerContact;

  if (buyer_contact_id) {
    // Use existing contact
    buyerContact = await db.query.contacts.findFirst({
      where: and(eq(contacts.club_id, clubId), eq(contacts.id, buyer_contact_id)),
    });
    if (!buyerContact) {
      throw notFound("Buyer contact");
    }
  } else {
    // Find or create by email
    buyerContact = await db.query.contacts.findFirst({
      where: and(eq(contacts.club_id, clubId), eq(contacts.email, buyer_email!)),
    });

    if (!buyerContact) {
      [buyerContact] = await db
        .insert(contacts)
        .values({
          club_id: clubId,
          full_name: buyer_name!,
          email: buyer_email!,
        })
        .returning();
    }
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
