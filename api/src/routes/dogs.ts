/**
 * Dog routes.
 *
 * - POST   /                    — register new dog (certificate+, pending approval)
 * - GET    /                    — list dogs (own dogs for certificate+, all approved dogs for member+)
 * - GET    /search              — full-text search with filters (member+ only)
 * - GET    /:id                 — dog detail with registrations, clearances, pedigree links
 * - PATCH  /:id                 — update own dog (before approval)
 * - POST   /:id/registrations   — add external registration (AKC, UKC, etc.)
 * - GET    /:id/pedigree        — ancestry tree (sire/dam lineage)
 */

import { Hono } from "hono";
import { eq, and, or, desc, sql, ilike } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { requireAuth } from "../middleware/auth.js";
import { requireTier } from "../middleware/rbac.js";
import { dogs, dogRegistrations, contacts, organizations, dogHealthClearances, healthTestTypes, clubs } from "../db/schema.js";
import { notFound, badRequest, forbidden } from "../lib/errors.js";
import {
  createDogSchema,
  updateDogSchema,
  createDogRegistrationSchema,
  paginationSchema,
} from "@breed-club/shared/validation.js";

type Variables = {
  clubId: string;
  db: Database;
  clerkUserId: string | null;
  auth: AuthContext | null;
};

const dogRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * POST / — register a new dog.
 * Certificate+ tier required. Dog starts in "pending" status.
 *
 * Payment flow:
 * - Checks club fee configuration
 * - If fee is $0 for user's tier: creates dog immediately
 * - If fee > $0: returns requiresPayment flag (frontend should call /api/payments/create-session)
 */
dogRoutes.post("/", requireTier("certificate"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const body = await c.req.json();
  const { registrations: inlineRegs, ...dogData } = createDogSchema.parse(body);

  // Check if payment is required
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);

  if (!club) {
    throw notFound("Club");
  }

  const feeConfig = club.settings as any;
  const fees = feeConfig?.fees || {};
  const tierFees = fees.create_dog || { certificate: 1500, member: 500 };

  // Check for fee bypass
  const amountCents = auth.member.skip_fees
    ? 0
    : auth.member.tier === "member" || auth.member.tier === "admin"
    ? tierFees.member || 500
    : tierFees.certificate || 1500;

  // If payment required, return payment info instead of creating dog
  if (amountCents > 0) {
    return c.json(
      {
        requiresPayment: true,
        amountCents,
        description: "Dog Registration Fee",
        // Frontend should call /api/payments/create-session with this metadata
        metadata: {
          resource_type: "dog_create",
          ...dogData,
          registrations: inlineRegs,
        },
      },
      402 // 402 Payment Required
    );
  }

  // No payment required - create dog immediately
  const [dog] = await db
    .insert(dogs)
    .values({
      ...dogData,
      club_id: clubId,
      status: "pending",
      submitted_by: auth.member.id,
    })
    .returning();

  // Create inline registrations if provided
  if (inlineRegs && inlineRegs.length > 0) {
    await db.insert(dogRegistrations).values(
      inlineRegs.map((reg) => ({
        dog_id: dog.id,
        organization_id: reg.organization_id,
        registration_number: reg.registration_number,
        registration_url: reg.registration_url,
      }))
    );
  }

  return c.json({ dog }, 201);
});

/**
 * GET /search — full-text search with filters (member+ only).
 * Query params:
 * - q: search term (searches registered_name, call_name)
 * - sex: filter by sex (male/female)
 * - health_status: filter by health clearance status (clear/carrier/affected/tested/untested)
 * - sire_id: filter by sire
 * - dam_id: filter by dam
 * - page, limit: pagination
 */
dogRoutes.get("/search", requireTier("member"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const query = c.req.query();

  const searchTerm = query.q || "";
  const sex = query.sex as "male" | "female" | undefined;
  const sireId = query.sire_id;
  const damId = query.dam_id;
  const page = parseInt(query.page || "1");
  const limit = Math.min(parseInt(query.limit || "50"), 100);

  const conditions = [eq(dogs.club_id, clubId), eq(dogs.status, "approved")];

  // Full-text search on names
  if (searchTerm) {
    conditions.push(
      or(
        ilike(dogs.registered_name, `%${searchTerm}%`),
        ilike(dogs.call_name, `%${searchTerm}%`)
      )!
    );
  }

  // Filters
  if (sex) {
    conditions.push(eq(dogs.sex, sex));
  }
  if (sireId) {
    conditions.push(eq(dogs.sire_id, sireId));
  }
  if (damId) {
    conditions.push(eq(dogs.dam_id, damId));
  }

  const where = and(...conditions);

  const [data, countResult] = await Promise.all([
    db.query.dogs.findMany({
      where,
      with: {
        owner: true,
        breeder: true,
        sire: {
          columns: { id: true, registered_name: true, call_name: true },
        },
        dam: {
          columns: { id: true, registered_name: true, call_name: true },
        },
        healthClearances: {
          with: {
            testType: true,
            organization: true,
          },
        },
      },
      limit,
      offset: (page - 1) * limit,
      orderBy: [desc(dogs.created_at)],
    }),
    db.select({ count: sql<number>`count(*)` }).from(dogs).where(where),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return c.json({
    data,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * GET / — list dogs.
 * - Certificate tier: own dogs only (where submitted_by = member.id)
 * - Member+ tier: all approved dogs
 */
dogRoutes.get("/", requireTier("certificate"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const query = paginationSchema.parse(c.req.query());

  const conditions = [eq(dogs.club_id, clubId)];

  // RBAC: certificate tier sees only own dogs, member+ sees all approved dogs
  if (auth?.tier === "certificate") {
    conditions.push(eq(dogs.submitted_by, auth.member!.id));
  } else {
    // member+ tier
    conditions.push(eq(dogs.status, "approved"));
  }

  const where = and(...conditions);

  const [data, countResult] = await Promise.all([
    db.query.dogs.findMany({
      where,
      with: {
        owner: true,
        breeder: true,
        sire: {
          columns: { id: true, registered_name: true, call_name: true },
        },
        dam: {
          columns: { id: true, registered_name: true, call_name: true },
        },
      },
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      orderBy: [desc(dogs.created_at)],
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
 * GET /:id — dog detail with registrations, clearances, pedigree links.
 */
dogRoutes.get("/:id", requireTier("certificate"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
    with: {
      owner: true,
      breeder: true,
      sire: true,
      dam: true,
      registrations: {
        with: {
          organization: true,
        },
      },
      healthClearances: {
        with: {
          testType: true,
          organization: true,
        },
      },
    },
  });

  if (!dog) {
    throw notFound("Dog");
  }

  // RBAC: certificate tier can only view own dogs, member+ can view all approved dogs
  if (auth?.tier === "certificate" && dog.submitted_by !== auth.member?.id) {
    throw forbidden("You can only view your own dogs");
  }

  if (auth?.tier !== "certificate" && dog.status !== "approved") {
    throw forbidden("Dog not yet approved");
  }

  return c.json({ dog });
});

/**
 * PATCH /:id — update own dog (only if status is pending).
 */
dogRoutes.patch("/:id", requireTier("certificate"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const body = await c.req.json();
  const data = updateDogSchema.parse(body);

  if (Object.keys(data).length === 0) {
    throw badRequest("No fields to update");
  }

  const existing = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
  });

  if (!existing) {
    throw notFound("Dog");
  }

  // Only the submitter can update, and only if pending
  if (existing.submitted_by !== auth.member.id) {
    throw forbidden("You can only update your own dogs");
  }

  if (existing.status !== "pending") {
    throw forbidden("Cannot update dog after approval/rejection");
  }

  await db
    .update(dogs)
    .set({ ...data, updated_at: new Date() })
    .where(eq(dogs.id, id));

  const updated = await db.query.dogs.findFirst({
    where: eq(dogs.id, id),
  });

  return c.json({ dog: updated });
});

/**
 * POST /:id/registrations — add external registration to a dog.
 */
dogRoutes.post("/:id/registrations", requireTier("certificate"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const dogId = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const body = await c.req.json();
  const data = createDogRegistrationSchema.parse(body);

  // Verify dog exists and user owns it
  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, dogId), eq(dogs.club_id, clubId)),
  });

  if (!dog) {
    throw notFound("Dog");
  }

  if (dog.submitted_by !== auth.member.id) {
    throw forbidden("You can only add registrations to your own dogs");
  }

  // Check if registration already exists for this org
  const existing = await db.query.dogRegistrations.findFirst({
    where: and(eq(dogRegistrations.dog_id, dogId), eq(dogRegistrations.organization_id, data.organization_id)),
  });

  if (existing) {
    throw badRequest("Registration for this organization already exists");
  }

  const [registration] = await db
    .insert(dogRegistrations)
    .values({
      dog_id: dogId,
      ...data,
    })
    .returning();

  return c.json({ registration }, 201);
});

/**
 * GET /:id/pedigree — fetch pedigree tree (sire/dam ancestry).
 * Returns up to 3 generations by default (depth=3).
 */
dogRoutes.get("/:id/pedigree", requireTier("member"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");
  const depth = Math.min(parseInt(c.req.query("depth") || "3"), 5); // Max 5 generations

  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
  });

  if (!dog || dog.status !== "approved") {
    throw notFound("Dog");
  }

  // Recursively fetch ancestors
  const fetchAncestors = async (dogId: string | null, currentDepth: number): Promise<any> => {
    if (!dogId || currentDepth > depth) return null;

    const ancestor = await db.query.dogs.findFirst({
      where: eq(dogs.id, dogId),
      columns: {
        id: true,
        registered_name: true,
        call_name: true,
        sex: true,
        date_of_birth: true,
        sire_id: true,
        dam_id: true,
      },
    });

    if (!ancestor) return null;

    return {
      ...ancestor,
      sire: await fetchAncestors(ancestor.sire_id, currentDepth + 1),
      dam: await fetchAncestors(ancestor.dam_id, currentDepth + 1),
    };
  };

  const pedigree = {
    dog: {
      id: dog.id,
      registered_name: dog.registered_name,
      call_name: dog.call_name,
      sex: dog.sex,
      date_of_birth: dog.date_of_birth,
    },
    sire: await fetchAncestors(dog.sire_id, 1),
    dam: await fetchAncestors(dog.dam_id, 1),
  };

  return c.json({ pedigree });
});

export { dogRoutes };
