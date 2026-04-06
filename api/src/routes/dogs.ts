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
import { eq, and, or, desc, asc, gte, lte, sql, ilike, inArray, isNotNull } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { requireAuth } from "../middleware/auth.js";
import { requireLevel } from "../middleware/rbac.js";
import { dogs, dogRegistrations, dogOwnershipTransfers, contacts, organizations, dogHealthClearances, healthTestTypes, clubs } from "../db/schema.js";
import { notFound, badRequest, forbidden, conflict } from "../lib/errors.js";
import { isDogOwner } from "../lib/ownership.js";
import { resolvePedigreeTree } from "../lib/pedigree.js";
import {
  createDogSchema,
  updateDogSchema,
  createDogRegistrationSchema,
  transferDogSchema,
  paginationSchema,
  updateBreedingMetadataSchema,
} from "@breed-club/shared/validation.js";

type Variables = {
  clubId: string;
  club: { id: string; settings: Record<string, unknown> | null };
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
dogRoutes.post("/", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const body = await c.req.json();
  const { registrations: inlineRegs, pedigree, ...dogData } = createDogSchema.parse(body);

  // Non-admin users must provide at least one external registration for non-historical dogs
  if (
    !dogData.is_historical &&
    auth.tierLevel < 100 &&
    (!inlineRegs || inlineRegs.length === 0)
  ) {
    throw badRequest("At least one external registration (e.g. AKC, UKC) is required");
  }

  // Check if payment is required
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);

  if (!club) {
    throw notFound("Club");
  }

  const feeConfig = club.settings as any;
  const fees = feeConfig?.fees || {};
  const tierFees = fees.create_dog || { certificate: 1500, member: 500 };

  // Check for fee bypass — admins always bypass fees
  const amountCents = auth.member.skip_fees || auth.tierLevel >= 100
    ? 0
    : auth.tierLevel >= 20
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
          pedigree,
          registrations: inlineRegs,
        },
      },
      402 // 402 Payment Required
    );
  }

  // Resolve parent refs
  let resolvedSireId: string | null = null;
  let resolvedDamId: string | null = null;

  if (pedigree) {
    // Full pedigree tree — resolve recursively (bottom-up)
    const resolved = await resolvePedigreeTree(db, clubId, pedigree, auth.member.id);
    resolvedSireId = resolved.sire_id;
    resolvedDamId = resolved.dam_id;
  } else {
    // Legacy: just sire_id and dam_id with inline stub creation
    resolvedSireId = typeof dogData.sire_id === "string" ? dogData.sire_id : null;
    resolvedDamId = typeof dogData.dam_id === "string" ? dogData.dam_id : null;

    if (dogData.sire_id && typeof dogData.sire_id === "object" && "registered_name" in dogData.sire_id) {
      const [stubSire] = await db
        .insert(dogs)
        .values({
          registered_name: dogData.sire_id.registered_name,
          sex: "male",
          club_id: clubId,
          status: "approved",
          owner_id: null,
          submitted_by: null,
          is_public: false,
          is_historical: true,
        })
        .returning();
      resolvedSireId = stubSire.id;
    }

    if (dogData.dam_id && typeof dogData.dam_id === "object" && "registered_name" in dogData.dam_id) {
      const [stubDam] = await db
        .insert(dogs)
        .values({
          registered_name: dogData.dam_id.registered_name,
          sex: "female",
          club_id: clubId,
          status: "approved",
          owner_id: null,
          submitted_by: null,
          is_public: false,
          is_historical: true,
        })
        .returning();
      resolvedDamId = stubDam.id;
    }
  }

  // Create dog
  const [dog] = await db
    .insert(dogs)
    .values({
      ...dogData,
      sire_id: resolvedSireId,
      dam_id: resolvedDamId,
      owner_id: dogData.owner_id ?? null,
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
dogRoutes.get("/search", requireLevel(20), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const query = c.req.query();

  const searchTerm = query.q || "";
  const sex = query.sex as "male" | "female" | undefined;
  const sireId = query.sire_id;
  const damId = query.dam_id;
  const page = parseInt(query.page || "1");
  const limit = Math.min(parseInt(query.limit || "50"), 100);

  const conditions = [eq(dogs.club_id, clubId), eq(dogs.status, "approved"), eq(dogs.is_historical, false)];

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
            healthTestType: true,
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
 * GET /filter-options — distinct coat_type and color values for filter dropdowns.
 */
dogRoutes.get("/filter-options", requireLevel(20), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const approvedInClub = and(eq(dogs.club_id, clubId), eq(dogs.status, "approved"));

  const [coatTypes, colors, breedingStatuses] = await Promise.all([
    db
      .selectDistinct({ value: dogs.coat_type })
      .from(dogs)
      .where(and(approvedInClub, isNotNull(dogs.coat_type)))
      .orderBy(asc(dogs.coat_type)),
    db
      .selectDistinct({ value: dogs.color })
      .from(dogs)
      .where(and(approvedInClub, isNotNull(dogs.color)))
      .orderBy(asc(dogs.color)),
    db
      .selectDistinct({ value: dogs.breeding_status })
      .from(dogs)
      .where(and(approvedInClub, isNotNull(dogs.breeding_status)))
      .orderBy(asc(dogs.breeding_status)),
  ]);

  return c.json({
    coat_types: coatTypes.map((r) => r.value).filter(Boolean),
    colors: colors.map((r) => r.value).filter(Boolean),
    breeding_statuses: breedingStatuses.map((r) => r.value).filter(Boolean),
  });
});

/**
 * GET / — list dogs.
 * - Certificate tier: own dogs only (where submitted_by = member.id)
 * - Member+ tier: all approved dogs
 */
dogRoutes.get("/", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const query = paginationSchema.parse(c.req.query());

  const sex = c.req.query("sex") as "male" | "female" | undefined;
  const includeHistorical = c.req.query("include_historical") === "true";
  const conditions = [eq(dogs.club_id, clubId)];

  // Text search on registered_name and call_name
  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(or(ilike(dogs.registered_name, term), ilike(dogs.call_name, term))!);
  }

  if (sex) {
    conditions.push(eq(dogs.sex, sex));
  }

  // --- Advanced filters ---

  const healthScoreMinParam = c.req.query("health_score_min");
  const healthScoreMaxParam = c.req.query("health_score_max");
  const dobFrom = c.req.query("dob_from");
  const dobTo = c.req.query("dob_to");
  const breederSearch = c.req.query("breeder");
  const ownerSearch = c.req.query("owner");
  const coatType = c.req.query("coat_type");
  const color = c.req.query("color");
  const breedingStatus = c.req.query("breeding_status");

  if (healthScoreMinParam) {
    const min = parseFloat(healthScoreMinParam);
    if (!isNaN(min)) {
      conditions.push(sql`(${dogs.health_rating}->>'score')::numeric >= ${min}`);
    }
  }
  if (healthScoreMaxParam) {
    const max = parseFloat(healthScoreMaxParam);
    if (!isNaN(max)) {
      conditions.push(sql`(${dogs.health_rating}->>'score')::numeric < ${max}`);
    }
  }
  if (dobFrom) {
    conditions.push(gte(dogs.date_of_birth, dobFrom));
  }
  if (dobTo) {
    conditions.push(lte(dogs.date_of_birth, dobTo));
  }
  if (breederSearch) {
    // Convert glob-style wildcards (* → %, ? → _); wrap in % if no wildcards given
    const hasWildcard = /[*?%_]/.test(breederSearch);
    const term = breederSearch.replace(/\*/g, "%").replace(/\?/g, "_");
    const ilikeTerm = hasWildcard ? term : `%${term}%`;
    conditions.push(
      sql`${dogs.breeder_id} IN (SELECT id FROM contacts WHERE club_id = ${clubId} AND (full_name ILIKE ${ilikeTerm} OR kennel_name ILIKE ${ilikeTerm}))`
    );
  }
  if (ownerSearch) {
    const hasWildcard = /[*?%_]/.test(ownerSearch);
    const term = ownerSearch.replace(/\*/g, "%").replace(/\?/g, "_");
    const ilikeTerm = hasWildcard ? term : `%${term}%`;
    conditions.push(
      sql`${dogs.owner_id} IN (SELECT id FROM contacts WHERE club_id = ${clubId} AND (full_name ILIKE ${ilikeTerm} OR kennel_name ILIKE ${ilikeTerm}))`
    );
  }
  if (coatType) {
    conditions.push(eq(dogs.coat_type, coatType));
  }
  if (color) {
    conditions.push(eq(dogs.color, color));
  }
  if (breedingStatus) {
    if (breedingStatus === "breeding") {
      conditions.push(
        or(
          eq(dogs.breeding_status, "breeding"),
          and(
            eq(dogs.frozen_semen_available, true),
            or(eq(dogs.breeding_status, "retired"), eq(dogs.is_deceased, true))!
          )!
        )!
      );
    } else {
      conditions.push(eq(dogs.breeding_status, breedingStatus));
    }
  }

  // --- Server-side sorting ---

  const ALLOWED_SORT_KEYS = ["registered_name", "sex", "date_of_birth", "health_score", "breeder"] as const;
  const sortByParam = c.req.query("sort_by") || "";
  const sortBy = (ALLOWED_SORT_KEYS as readonly string[]).includes(sortByParam) ? sortByParam : "registered_name";
  const sortDirParam = c.req.query("sort_dir");
  const sortDirection = sortDirParam === "desc" ? "DESC" : "ASC";

  let orderByClause;
  switch (sortBy) {
    case "health_score":
      orderByClause = sql`(${dogs.health_rating}->>'score')::numeric ${sql.raw(sortDirection)} NULLS LAST`;
      break;
    case "breeder":
      orderByClause = sql`(SELECT ${contacts.full_name} FROM ${contacts} WHERE ${contacts.id} = ${dogs.breeder_id}) ${sql.raw(sortDirection)} NULLS LAST`;
      break;
    case "sex":
      orderByClause = sortDirection === "ASC" ? asc(dogs.sex) : desc(dogs.sex);
      break;
    case "date_of_birth":
      orderByClause = sortDirection === "ASC"
        ? sql`${dogs.date_of_birth} ASC NULLS LAST`
        : sql`${dogs.date_of_birth} DESC NULLS LAST`;
      break;
    default:
      orderByClause = sortDirection === "ASC" ? asc(dogs.registered_name) : desc(dogs.registered_name);
  }

  // RBAC: ownedOnly takes priority (dashboard "My Dogs"), then tier-based access
  const ownedOnly = c.req.query("owned_only") === "true";

  if (ownedOnly) {
    // Dashboard / health-select: show only dogs the user owns
    conditions.push(eq(dogs.owner_id, auth!.contactId));
    if (!includeHistorical) {
      conditions.push(eq(dogs.is_historical, false));
    }
  } else if ((auth?.tierLevel ?? 0) < 20) {
    conditions.push(eq(dogs.submitted_by, auth!.member!.id));
  } else {
    // member+ tier: all approved dogs, plus their own pending submissions
    conditions.push(
      or(
        eq(dogs.status, "approved"),
        and(
          eq(dogs.status, "pending"),
          eq(dogs.submitted_by, auth!.member!.id),
        )!
      )!
    );
    if (!includeHistorical) {
      conditions.push(eq(dogs.is_historical, false));
    }
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
      orderBy: [orderByClause],
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
dogRoutes.get("/:id", requireLevel(10), async (c) => {
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
          healthTestType: true,
          organization: true,
        },
      },
    },
  });

  if (!dog) {
    throw notFound("Dog");
  }

  // RBAC: certificate tier can only view own dogs, member+ can view all approved dogs
  // Admins and members with can_approve_clearances can also view pending dogs
  if ((auth?.tierLevel ?? 0) < 20 && dog.submitted_by !== auth?.member?.id) {
    throw forbidden("You can only view your own dogs");
  }

  const canApprove = (auth?.tierLevel ?? 0) >= 100 || auth?.member?.can_approve_clearances;
  if ((auth?.tierLevel ?? 0) >= 20 && dog.status !== "approved" && !canApprove) {
    throw forbidden("Dog not yet approved");
  }

  const club = c.get("club");
  const canManageClearances = auth
    ? isDogOwner(auth, dog, (club?.settings ?? {}) as Record<string, unknown>)
    : false;

  // Check for pending ownership transfer
  const pendingTransfer = await db.query.dogOwnershipTransfers.findFirst({
    where: and(
      eq(dogOwnershipTransfers.dog_id, id),
      eq(dogOwnershipTransfers.status, "pending")
    ),
    with: {
      toOwner: { columns: { id: true, full_name: true, kennel_name: true } },
    },
  });

  return c.json({ dog, canManageClearances, pendingTransfer: pendingTransfer ?? null });
});

/**
 * PATCH /:id — update own dog (only if status is pending).
 */
dogRoutes.patch("/:id", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const body = await c.req.json();
  // Strip is_historical — only admins can set this via admin PATCH route
  const { is_historical: _, pedigree, ...data } = updateDogSchema.parse(body);

  if (Object.keys(data).length === 0 && !pedigree) {
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

  // Resolve parent refs
  const updatePayload: Record<string, unknown> = { ...data, updated_at: new Date() };

  if (pedigree) {
    const resolved = await resolvePedigreeTree(db, clubId, pedigree, auth.member.id);
    updatePayload.sire_id = resolved.sire_id;
    updatePayload.dam_id = resolved.dam_id;
  } else {
    if (data.sire_id && typeof data.sire_id === "object" && "registered_name" in data.sire_id) {
      const [stubSire] = await db
        .insert(dogs)
        .values({
          registered_name: data.sire_id.registered_name,
          sex: "male",
          club_id: clubId,
          status: "approved",
          owner_id: null,
          submitted_by: null,
          is_public: false,
          is_historical: true,
        })
        .returning();
      updatePayload.sire_id = stubSire.id;
    }

    if (data.dam_id && typeof data.dam_id === "object" && "registered_name" in data.dam_id) {
      const [stubDam] = await db
        .insert(dogs)
        .values({
          registered_name: data.dam_id.registered_name,
          sex: "female",
          club_id: clubId,
          status: "approved",
          owner_id: null,
          submitted_by: null,
          is_public: false,
          is_historical: true,
        })
        .returning();
      updatePayload.dam_id = stubDam.id;
    }
  }

  await db
    .update(dogs)
    .set(updatePayload)
    .where(eq(dogs.id, id));

  const updated = await db.query.dogs.findFirst({
    where: eq(dogs.id, id),
  });

  return c.json({ dog: updated });
});

/**
 * POST /:id/registrations — add external registration to a dog.
 */
dogRoutes.post("/:id/registrations", requireLevel(10), async (c) => {
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
 * PATCH /:id/photo — update dog photo.
 * Allowed for admin, clearance approvers, or the dog's owner.
 */
dogRoutes.patch("/:id/photo", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const club = c.get("club");
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

  if (!isDogOwner(auth, dog, (club?.settings ?? {}) as Record<string, unknown>)) {
    throw forbidden("Only the owner or an admin can update the photo");
  }

  const body = await c.req.json();
  const { photo_url } = body;

  if (typeof photo_url !== "string" || !photo_url) {
    throw badRequest("photo_url is required");
  }

  await db
    .update(dogs)
    .set({ photo_url, updated_at: new Date() })
    .where(eq(dogs.id, id));

  return c.json({ ok: true });
});

/**
 * GET /:id/pedigree — fetch pedigree tree (sire/dam ancestry).
 * Returns up to 3 generations by default (depth=3).
 */
dogRoutes.get("/:id/pedigree", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");
  const depth = Math.min(parseInt(c.req.query("depth") || "3"), 6); // Max 6 generations

  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
  });

  if (!dog) {
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
        health_rating: true,
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

/**
 * GET /:id/progeny — fetch descendants (children, grandchildren, etc.).
 * Returns dogs grouped by generation depth.
 * Query params:
 *   depth: max generations to fetch (1-4, default 1)
 */
dogRoutes.get("/:id/progeny", requireLevel(20), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");
  const depth = Math.min(parseInt(c.req.query("depth") || "1"), 4);

  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
  });

  if (!dog || dog.status !== "approved") {
    throw notFound("Dog");
  }

  // Breadth-first descendant fetch
  const generations: Array<{ generation: number; dogs: any[] }> = [];
  let currentParentIds = [id];

  for (let gen = 1; gen <= depth; gen++) {
    if (currentParentIds.length === 0) break;

    const children = await db.query.dogs.findMany({
      where: and(
        eq(dogs.club_id, clubId),
        or(eq(dogs.status, "approved"), eq(dogs.is_historical, true)),
        or(
          inArray(dogs.sire_id, currentParentIds),
          inArray(dogs.dam_id, currentParentIds)
        )
      ),
      columns: {
        id: true,
        registered_name: true,
        call_name: true,
        sex: true,
        date_of_birth: true,
        color: true,
        health_rating: true,
      },
      with: {
        owner: {
          columns: { id: true, full_name: true, kennel_name: true },
        },
      },
      orderBy: [desc(dogs.date_of_birth)],
    });

    if (children.length > 0) {
      generations.push({ generation: gen, dogs: children });
      currentParentIds = children.map((child) => child.id);
    } else {
      break;
    }
  }

  const totalCount = generations.reduce((sum, g) => sum + g.dogs.length, 0);

  return c.json({ generations, totalCount });
});

/**
 * POST /:id/transfer — request ownership transfer.
 * Only the current owner or admin can initiate. Creates a pending transfer
 * that must be approved by an admin before ownership changes.
 */
dogRoutes.post("/:id/transfer", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const club = c.get("club");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const body = await c.req.json();
  const data = transferDogSchema.parse(body);

  // Fetch the dog
  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
  });

  if (!dog) throw notFound("Dog");

  // Only owner or admin can transfer
  if (!isDogOwner(auth, dog, (club?.settings ?? {}) as Record<string, unknown>)) {
    throw forbidden("Only the dog's owner or an admin can transfer ownership");
  }

  // Verify new owner contact exists
  const [newOwner] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, data.new_owner_id), eq(contacts.club_id, clubId)))
    .limit(1);

  if (!newOwner) throw notFound("New owner contact");

  // Cannot transfer to the same owner
  if (dog.owner_id === data.new_owner_id) {
    throw badRequest("Dog is already owned by this contact");
  }

  // Check no pending transfer already exists
  const [existingTransfer] = await db
    .select()
    .from(dogOwnershipTransfers)
    .where(
      and(
        eq(dogOwnershipTransfers.dog_id, id),
        eq(dogOwnershipTransfers.status, "pending")
      )
    )
    .limit(1);

  if (existingTransfer) {
    throw conflict("A pending transfer already exists for this dog");
  }

  // Create pending transfer
  const [transfer] = await db
    .insert(dogOwnershipTransfers)
    .values({
      dog_id: id,
      from_owner_id: dog.owner_id,
      to_owner_id: data.new_owner_id,
      requested_by: auth.member.id,
      status: "pending",
      reason: data.reason,
      notes: data.notes,
    })
    .returning();

  return c.json({ transfer }, 201);
});

/**
 * GET /:id/transfers — ownership transfer history.
 */
dogRoutes.get("/:id/transfers", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
    columns: { id: true },
  });

  if (!dog) throw notFound("Dog");

  const transfers = await db.query.dogOwnershipTransfers.findMany({
    where: eq(dogOwnershipTransfers.dog_id, id),
    with: {
      fromOwner: { columns: { id: true, full_name: true, kennel_name: true } },
      toOwner: { columns: { id: true, full_name: true, kennel_name: true } },
    },
    orderBy: (t, { desc }) => [desc(t.created_at)],
  });

  return c.json({ transfers });
});

/**
 * PATCH /:id/breeding — update breeding metadata (owner-editable).
 * Allows the dog owner to set breeding_status, stud_service_available, frozen_semen_available.
 */
dogRoutes.patch("/:id/breeding", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const club = c.get("club");
  const id = c.req.param("id");

  if (!auth?.member) throw forbidden("Member required");

  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
  });

  if (!dog) throw notFound("Dog");

  const canEditBreeding =
    isDogOwner(auth, dog, (club?.settings ?? {}) as Record<string, unknown>) ||
    auth.member.can_manage_registry;

  if (!canEditBreeding) {
    throw forbidden("Only the owner or an admin can update breeding metadata");
  }

  const body = await c.req.json();
  const data = updateBreedingMetadataSchema.parse(body);

  // Stud/frozen semen fields only valid for males
  if ((data.stud_service_available || data.frozen_semen_available) && dog.sex !== "male") {
    throw badRequest("Stud service and frozen semen fields are only applicable to male dogs");
  }

  const [updated] = await db
    .update(dogs)
    .set({ ...data, updated_at: new Date() })
    .where(eq(dogs.id, id))
    .returning();

  return c.json({ dog: updated });
});

export { dogRoutes };
