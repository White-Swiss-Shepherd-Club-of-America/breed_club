/**
 * Dog routes.
 *
 * - POST   /                    — register new dog (non_member+, pending approval)
 * - GET    /                    — list dogs (own dogs for non_member+, all approved dogs for member+)
 * - GET    /search              — full-text search with filters (member+ only)
 * - GET    /:id                 — dog detail with registrations, clearances, pedigree links
 * - PATCH  /:id                 — update own dog (before approval)
 * - POST   /:id/registrations   — add external registration (AKC, UKC, etc.)
 * - GET    /:id/pedigree        — ancestry tree (sire/dam lineage)
 * - POST   /extract-registration — LLM-powered extraction from registration documents
 */

import { Hono } from "hono";
import { eq, and, or, desc, asc, gte, lte, sql, ilike, inArray, isNotNull } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import type { RegistrationExtractionResponse } from "@breed-club/shared";
import { requireAuth } from "../middleware/auth.js";
import { requireLevel } from "../middleware/rbac.js";
import { dogs, dogRegistrations, dogOwnershipTransfers, contacts, organizations, dogHealthClearances, healthTestTypes, clubs } from "../db/schema.js";
import { notFound, badRequest, forbidden, conflict } from "../lib/errors.js";
import { isDogOwner } from "../lib/ownership.js";
import { resolvePedigreeTree } from "../lib/pedigree.js";
import { createLLMProvider, getModelConfig } from "../lib/llm/index.js";
import { classifyRegDoc } from "../lib/extraction/reg-classifier.js";
import { extractRegDoc } from "../lib/extraction/reg-extractor.js";
import { verifySingleRegDoc, crossVerifyRegDocs } from "../lib/extraction/reg-verifier.js";
import { mergeRegExtractions, autoCreateMissingOrgs } from "../lib/extraction/reg-merger.js";
import type { RegExtractionResult, RegVerificationFlag } from "../lib/extraction/reg-types.js";
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
  const tierFees = fees.create_dog || { non_member: 1500, member: 500 };

  // Validate and auto-fill color/coat_type against club breed settings (skip for historical stubs)
  if (!dogData.is_historical) {
    const breedColors: string[] = feeConfig?.breed_colors || [];
    const breedCoatTypes: string[] = feeConfig?.breed_coat_types || [];

    // Auto-fill color if only one option and not provided
    if (breedColors.length === 1 && !dogData.color) {
      dogData.color = breedColors[0];
    }
    // Auto-fill coat_type if only one option and not provided
    if (breedCoatTypes.length === 1 && !dogData.coat_type) {
      dogData.coat_type = breedCoatTypes[0];
    }

    // Validate color against allowed list
    if (breedColors.length > 0 && dogData.color && !breedColors.includes(dogData.color)) {
      throw badRequest(`Invalid color "${dogData.color}". Allowed: ${breedColors.join(", ")}`);
    }
    // Validate coat_type against allowed list
    if (breedCoatTypes.length > 0 && dogData.coat_type && !breedCoatTypes.includes(dogData.coat_type)) {
      throw badRequest(`Invalid coat type "${dogData.coat_type}". Allowed: ${breedCoatTypes.join(", ")}`);
    }
  }

  const amountCents = auth.member.skip_fees || auth.isAdmin
    ? 0
    : auth.tierLevel >= 20
    ? tierFees.member || 500
    : tierFees.non_member || 1500;

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

  // RBAC: non-members can only view own dogs, member+ can view all approved dogs
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
 * PATCH /:id — update own dog.
 * - Pending dogs: submitter can update all basic fields.
 * - Approved dogs: owner can update call_name, breeding_status,
 *   stud_service_available, frozen_semen_available only.
 */
dogRoutes.patch("/:id", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const club = c.get("club");
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

  // Validate color/coat_type against club breed settings
  const clubSettings = (club?.settings ?? {}) as Record<string, unknown>;
  const breedColors: string[] = (clubSettings.breed_colors as string[]) || [];
  const breedCoatTypes: string[] = (clubSettings.breed_coat_types as string[]) || [];

  if (breedColors.length > 0 && data.color && !breedColors.includes(data.color)) {
    throw badRequest(`Invalid color "${data.color}". Allowed: ${breedColors.join(", ")}`);
  }
  if (breedCoatTypes.length > 0 && data.coat_type && !breedCoatTypes.includes(data.coat_type)) {
    throw badRequest(`Invalid coat type "${data.coat_type}". Allowed: ${breedCoatTypes.join(", ")}`);
  }

  const existing = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
  });

  if (!existing) {
    throw notFound("Dog");
  }

  const isOwner = isDogOwner(auth, existing, clubSettings);
  const isSubmitter = existing.submitted_by === auth.member.id;

  if (existing.status === "pending") {
    // Only the submitter can update pending dogs
    if (!isSubmitter) {
      throw forbidden("You can only update your own dogs");
    }
  } else if (existing.status === "approved") {
    // Owner can update a limited set of fields post-approval
    if (!isOwner) {
      throw forbidden("You can only update your own dogs");
    }
    // Parse breeding fields separately (they live in their own schema)
    const breedingData = updateBreedingMetadataSchema.parse(body);
    const ownerPatch: Record<string, unknown> = { updated_at: new Date() };
    if (data.call_name !== undefined) ownerPatch.call_name = data.call_name;
    if (breedingData.breeding_status !== undefined) ownerPatch.breeding_status = breedingData.breeding_status;
    if (breedingData.stud_service_available !== undefined) ownerPatch.stud_service_available = breedingData.stud_service_available;
    if (breedingData.frozen_semen_available !== undefined) ownerPatch.frozen_semen_available = breedingData.frozen_semen_available;

    await db.update(dogs).set(ownerPatch).where(eq(dogs.id, id));
    const updated = await db.query.dogs.findFirst({ where: eq(dogs.id, id) });
    return c.json({ dog: updated });
  } else {
    throw forbidden("Cannot update dog after rejection");
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
 * DELETE /:id — delete own pending dog (hard delete, submitter only).
 */
dogRoutes.delete("/:id", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const id = c.req.param("id");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  const existing = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, id), eq(dogs.club_id, clubId)),
  });

  if (!existing) {
    throw notFound("Dog");
  }

  if (existing.submitted_by !== auth.member.id) {
    throw forbidden("You can only delete your own dogs");
  }

  if (existing.status !== "pending") {
    throw conflict("Only pending dogs can be deleted");
  }

  await db.delete(dogs).where(eq(dogs.id, id));

  return c.json({ success: true });
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
 * DELETE /:id/registrations/:regId — remove an external registration.
 * Allowed for the dog's owner (pending dogs) or admins/clearance approvers.
 */
dogRoutes.delete("/:id/registrations/:regId", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");
  const dogId = c.req.param("id");
  const regId = c.req.param("regId");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  // Verify dog belongs to this club
  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, dogId), eq(dogs.club_id, clubId)),
  });

  if (!dog) throw notFound("Dog");

  const isAdmin = auth.isAdmin || auth.tierLevel >= 100 || auth.member.can_manage_registry;
  const isOwner = dog.submitted_by === auth.member.id;

  if (!isAdmin && !isOwner) {
    throw forbidden("You can only remove registrations from your own dogs");
  }

  // Find and delete the registration
  const existing = await db.query.dogRegistrations.findFirst({
    where: and(
      eq(dogRegistrations.id, regId),
      eq(dogRegistrations.dog_id, dogId)
    ),
  });

  if (!existing) throw notFound("Registration");

  await db.delete(dogRegistrations).where(eq(dogRegistrations.id, regId));

  return c.json({ success: true });
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

// ─── Registration Document Extraction ───────────────────────────────────────

/**
 * POST /extract-registration — extract dog identity, registrations, and pedigree
 * from uploaded registration certificate scans using LLM vision.
 *
 * Accepts 1+ files (PDF/JPEG/PNG) as multipart form data.
 * Returns a draft with suggested fields, detected conflicts, and matched registrations.
 * Does NOT write to the database — the frontend reviews and submits via POST /.
 */
dogRoutes.post("/extract-registration", requireLevel(10), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth");

  if (!auth?.member) {
    throw forbidden("Member record required");
  }

  // Check that LLM is configured
  if (!c.env.LLM_API_KEY) {
    throw badRequest("Registration extraction is not configured (LLM_API_KEY not set)");
  }

  // Parse multipart form data
  const formData = await c.req.formData();

  // Collect all uploaded files (supports "files[]" for multiple)
  const fileEntries = formData.getAll("files[]");
  const files: File[] = [];
  for (const entry of fileEntries) {
    if (entry instanceof File) {
      files.push(entry);
    }
  }
  // Also check singular "file" for single-upload compat
  const singleFile = formData.get("file");
  if (singleFile instanceof File && !files.some((f) => f.name === singleFile.name)) {
    files.push(singleFile);
  }

  if (files.length === 0) {
    throw badRequest("No registration documents uploaded");
  }

  if (files.length > 10) {
    throw badRequest("Maximum 10 documents per batch");
  }

  // Validate all files
  const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
  for (const file of files) {
    if (!allowedTypes.includes(file.type)) {
      throw badRequest(`File "${file.name}" must be PDF, JPEG, or PNG`);
    }
    if (file.size > 10 * 1024 * 1024) {
      throw badRequest(`File "${file.name}" must be under 10MB`);
    }
  }

  // Store originals to R2 and collect page images per document
  const certificateUrls: string[] = [];
  const perDocPageImages: string[][] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Store to R2
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const certKey = `registrations/${clubId}/${crypto.randomUUID()}.${ext}`;
    await c.env.CERTIFICATES_BUCKET.put(certKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        uploadedBy: auth.member.id,
        originalName: file.name,
      },
    });
    certificateUrls.push(certKey);

    // Collect pre-rendered page images for this document
    const pageImages: string[] = [];
    const pageEntries = formData.getAll(`pages[${i}][]`);
    for (const entry of pageEntries) {
      if (entry instanceof File) {
        const buffer = await entry.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ""
          )
        );
        pageImages.push(base64);
      }
    }

    // If no pre-rendered pages and it's an image, use the file itself
    if (pageImages.length === 0 && file.type.startsWith("image/")) {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );
      pageImages.push(base64);
    }

    perDocPageImages.push(pageImages);
  }

  // Check we have at least some page images
  const hasAnyPages = perDocPageImages.some((pages) => pages.length > 0);
  if (!hasAnyPages) {
    return c.json({
      documents: [],
      suggested: {
        registered_name: "",
        date_of_birth: null,
        sex: null,
        color: null,
        microchip_number: null,
        sire_name: null,
        sire_registration_number: null,
        dam_name: null,
        dam_registration_number: null,
        owner_name: null,
        breeder_name: null,
        pedigree: null,
      },
      conflicts: [],
      registrations: [],
      certificate_urls: certificateUrls,
      fallback_to_manual: true,
      fallback_reason: "No page images could be processed. Please ensure your browser rendered PDF pages to images.",
    } satisfies RegistrationExtractionResponse);
  }

  // Set up LLM
  const llm = createLLMProvider({
    provider: c.env.LLM_PROVIDER || "anthropic",
    apiKey: c.env.LLM_API_KEY,
    modelFast: c.env.LLM_MODEL_FAST || "claude-haiku-4-5-20251001",
    modelStrong: c.env.LLM_MODEL_STRONG || "claude-sonnet-4-6",
  });
  const models = getModelConfig(c.env);

  // Load known kennel club organizations for classification context
  const knownOrgs = await db
    .select({
      name: organizations.name,
      country: organizations.country,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.club_id, clubId),
        eq(organizations.type, "kennel_club"),
        eq(organizations.is_active, true)
      )
    );

  const knownRegistries = knownOrgs.map((org) => {
    // Extract abbreviation from name like "American Kennel Club (AKC)" or just use full name
    const abbrevMatch = org.name.match(/\(([^)]+)\)/);
    return {
      name: org.name,
      abbreviation: abbrevMatch ? abbrevMatch[1] : org.name,
      country: org.country || "XX",
    };
  });

  // ─── Process each document: classify + extract ─────────────────
  const extractions: RegExtractionResult[] = [];
  const perDocFlags: RegVerificationFlag[][] = [];

  for (let i = 0; i < files.length; i++) {
    const pageImages = perDocPageImages[i];
    if (pageImages.length === 0) {
      console.warn(`[extract-registration] Document ${i} has no page images, skipping`);
      perDocFlags.push([{
        code: "no_pages",
        severity: "warning",
        message: `Document ${i + 1}: No page images available for processing`,
      }]);
      continue;
    }

    // Classify
    const classification = await classifyRegDoc(llm, pageImages, knownRegistries, models);
    console.log(
      `[extract-registration] Doc ${i}: classified as ${classification.registry_abbreviation} ` +
      `(${classification.document_type}, confidence=${classification.confidence})`
    );

    if (classification.confidence < 0.3) {
      perDocFlags.push([{
        code: "classification_failed",
        severity: "error",
        message: `Document ${i + 1}: Could not identify the issuing registry (confidence: ${Math.round(classification.confidence * 100)}%)`,
      }]);
      continue;
    }

    // Extract
    const extraction = await extractRegDoc(llm, pageImages, classification, models);
    if (!extraction) {
      perDocFlags.push([{
        code: "extraction_failed",
        severity: "error",
        message: `Document ${i + 1}: Classification succeeded (${classification.registry_abbreviation}) but data extraction failed`,
      }]);
      continue;
    }

    extractions.push(extraction);

    // Verify individual document
    const docFlags = verifySingleRegDoc(extraction, i);
    perDocFlags.push(docFlags);
  }

  if (extractions.length === 0) {
    // All documents failed — collect all flags for the response
    const allFlags = perDocFlags.flat();
    return c.json({
      documents: [],
      suggested: {
        registered_name: "",
        date_of_birth: null,
        sex: null,
        color: null,
        microchip_number: null,
        sire_name: null,
        sire_registration_number: null,
        dam_name: null,
        dam_registration_number: null,
        owner_name: null,
        breeder_name: null,
        pedigree: null,
      },
      conflicts: [],
      registrations: [],
      certificate_urls: certificateUrls,
      fallback_to_manual: true,
      fallback_reason: allFlags.length > 0
        ? allFlags.map((f) => f.message).join("; ")
        : "Could not extract data from any of the uploaded documents.",
    } satisfies RegistrationExtractionResponse);
  }

  // ─── Cross-verify across documents ─────────────────────────────
  const crossFlags = crossVerifyRegDocs(extractions);

  // ─── Merge results ─────────────────────────────────────────────
  let response = await mergeRegExtractions(
    extractions,
    perDocFlags,
    crossFlags,
    db,
    clubId,
    certificateUrls
  );

  // ─── Auto-create missing organizations ─────────────────────────
  const updatedRegistrations = await autoCreateMissingOrgs(
    db,
    clubId,
    response.registrations
  );
  response = { ...response, registrations: updatedRegistrations };

  return c.json(response satisfies RegistrationExtractionResponse);
});

export { dogRoutes };
