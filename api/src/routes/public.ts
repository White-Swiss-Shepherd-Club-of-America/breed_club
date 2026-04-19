/**
 * Public routes — no auth required.
 *
 * - GET /club          — club info (name, branding)
 * - GET /organizations — list organizations
 * - GET /test-types    — list health test types
 * - GET /breeders      — breeder directory (alias for member directory)
 */

import { Hono } from "hono";
import { eq, and, gt, desc, sql } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import {
  clubs,
  organizations,
  healthTestTypes,
  members,
  dogs,
  dogHealthClearances,
  litters,
  membershipApplications,
  membershipFormFields,
  membershipTiers,
  litterAds,
  litterAdEvents,
} from "../db/schema.js";
import { publicApplicationSchema } from "@breed-club/shared/validation.js";
import { conflict, badRequest, notFound, forbidden } from "../lib/errors.js";
import { verifyRecaptcha } from "../lib/recaptcha.js";
import { validateFormData } from "../lib/form-data.js";

type Variables = {
  clubId: string;
  db: Database;
  clerkUserId: string | null;
  auth: AuthContext | null;
};

const publicRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET /club — basic club info for display.
 */
publicRoutes.get("/club", async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.id, clubId),
  });

  if (!club) {
    return c.json({ error: { code: "NOT_FOUND", message: "Club not found" } }, 404);
  }

  // Fetch membership tiers for this club
  const tiers = await db.query.membershipTiers.findMany({
    where: eq(membershipTiers.club_id, clubId),
    orderBy: (t, { asc }) => [asc(t.level)],
  });

  // Return only public-safe fields
  const settings = (club.settings ?? {}) as Record<string, unknown>;

  return c.json({
    club: {
      id: club.id,
      name: club.name,
      slug: club.slug,
      breed_name: club.breed_name,
      logo_url: club.logo_url,
      primary_color: club.primary_color,
      secondary_color: club.secondary_color,
      banner_width: (settings.banner_width as number) || 390,
      banner_height: (settings.banner_height as number) || 219,
      breed_colors: (settings.breed_colors as string[]) || [],
      breed_coat_types: (settings.breed_coat_types as string[]) || [],
      membership_tiers: tiers,
    },
  });
});

/**
 * GET /organizations — list all active organizations.
 */
publicRoutes.get("/organizations", async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const data = await db.query.organizations.findMany({
    where: and(eq(organizations.club_id, clubId), eq(organizations.is_active, true)),
    orderBy: (orgs, { asc }) => [asc(orgs.sort_order)],
  });

  return c.json({ data });
});

/**
 * GET /test-types — list all active health test types with grading orgs.
 */
publicRoutes.get("/test-types", async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const data = await db.query.healthTestTypes.findMany({
    where: and(eq(healthTestTypes.club_id, clubId), eq(healthTestTypes.is_active, true)),
    with: {
      orgLinks: {
        with: { organization: true },
      },
    },
    orderBy: (tt, { asc }) => [asc(tt.sort_order)],
  });

  const result = data.map((tt) => ({
    ...tt,
    grading_orgs: tt.orgLinks.map((link) => link.organization),
    orgLinks: undefined,
  }));

  return c.json({ data: result });
});

/**
 * GET /breeders — public breeder directory.
 */
publicRoutes.get("/breeders", async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const data = await db.query.members.findMany({
    where: and(
      eq(members.club_id, clubId),
      eq(members.show_in_directory, true),
      eq(members.is_breeder, true),
      eq(members.membership_status, "active")
    ),
    with: {
      contact: true,
    },
  });

  // Build base URL for image keys so external consumers (Hugo) get full URLs
  const origin = new URL(c.req.url).origin;
  const imageUrl = (key: string | null) =>
    key ? `${origin}/api/uploads/${key.startsWith("logos/") ? "logo" : key.startsWith("banners/") ? "banner" : "photo"}/${key}` : null;

  // Only expose directory-safe fields
  const breeders = data.map((m) => ({
    id: m.id,
    kennel_name: m.contact?.kennel_name,
    full_name: m.contact?.full_name,
    city: m.contact?.city,
    state: m.contact?.state,
    country: m.contact?.country,
    email: m.contact?.email,
    phone: m.contact?.phone,
    website_url: m.contact?.website_url,
    logo_url: imageUrl(m.logo_url),
    banner_url: imageUrl(m.banner_url),
    primary_color: m.primary_color,
    accent_color: m.accent_color,
    pup_status: m.pup_status,
    pup_expected_date: m.pup_expected_date,
  }));

  return c.json({ data: breeders });
});

/**
 * GET /announcements — public litter announcements.
 * Shows approved litters with available pups.
 */
publicRoutes.get("/announcements", async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const data = await db.query.litters.findMany({
    where: and(
      eq(litters.club_id, clubId),
      eq(litters.approved, true)
    ),
    with: {
      sire: {
        columns: {
          id: true,
          registered_name: true,
          call_name: true,
          photo_url: true,
        },
      },
      dam: {
        columns: {
          id: true,
          registered_name: true,
          call_name: true,
          photo_url: true,
        },
      },
      breeder: {
        columns: {
          id: true,
          full_name: true,
          kennel_name: true,
          city: true,
          state: true,
          country: true,
          email: true,
          phone: true,
        },
      },
      pups: {
        columns: {
          id: true,
          call_name: true,
          sex: true,
          color: true,
          status: true,
        },
      },
    },
    orderBy: (l, { desc }) => [desc(l.whelp_date), desc(l.created_at)],
  });

  // Only show litters with available or expected pups
  const announcements = data.map((litter) => ({
    ...litter,
    available_count: litter.pups?.filter((p) => p.status === "available").length || 0,
  }));

  return c.json({ data: announcements });
});

/**
 * GET /dogs/:id/health — JSON version of health stamp (for SPA consumption).
 */
publicRoutes.get("/dogs/:dog_id/health", async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const dogId = c.req.param("dog_id");

  // Fetch dog
  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, dogId), eq(dogs.club_id, clubId)),
    columns: {
      id: true,
      registered_name: true,
      call_name: true,
      photo_url: true,
      sex: true,
      date_of_birth: true,
      status: true,
      health_rating: true,
    },
  });

  if (!dog) {
    return c.json({ error: { code: "NOT_FOUND", message: "Dog not found" } }, 404);
  }

  // Fetch all test types for this club
  const allTestTypes = await db.query.healthTestTypes.findMany({
    where: and(eq(healthTestTypes.club_id, clubId), eq(healthTestTypes.is_active, true)),
    columns: {
      id: true,
      name: true,
      short_name: true,
      category: true,
      sort_order: true,
    },
    orderBy: (tt, { asc }) => [asc(tt.sort_order), asc(tt.name)],
  });

  // Fetch approved clearances
  const clearances = await db.query.dogHealthClearances.findMany({
    where: and(eq(dogHealthClearances.dog_id, dogId), eq(dogHealthClearances.status, "approved")),
    with: {
      organization: {
        columns: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  });

  // Build clearance map
  const clearanceMap = new Map(
    clearances.map((c) => [c.health_test_type_id, c])
  );

  // Build test results
  const testResults = allTestTypes.map((testType) => {
    const clearance = clearanceMap.get(testType.id);
    return {
      test_type_id: testType.id,
      test_type: testType.name,
      short_name: testType.short_name,
      category: testType.category,
      result: clearance?.result || "Not tested",
      test_date: clearance?.test_date || null,
      organization: clearance?.organization || null,
      verified_at: clearance?.verified_at || null,
      certificate_number: clearance?.certificate_number || null,
      certificate_url: null,
    };
  });

  return c.json({
    dog,
    health_rating: dog.health_rating ?? null,
    clearances: testResults,
    summary: {
      total_tests: allTestTypes.length,
      verified_count: testResults.filter((t) => t.verified_at).length,
    },
  });
});

/**
 * GET /membership-form — return active form fields for the membership application.
 */
publicRoutes.get("/membership-form", async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const fields = await db.query.membershipFormFields.findMany({
    where: and(
      eq(membershipFormFields.club_id, clubId),
      eq(membershipFormFields.is_active, true)
    ),
    orderBy: (f, { asc }) => [asc(f.sort_order)],
    columns: {
      id: true,
      field_key: true,
      label: true,
      description: true,
      field_type: true,
      options: true,
      required: true,
      sort_order: true,
    },
  });

  return c.json({ data: fields });
});

/**
 * POST /applications — submit a membership application (no auth required).
 * Accepts optional reCAPTCHA token for spam protection.
 */
publicRoutes.post("/applications", async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const body = await c.req.json();
  const { recaptcha_token, form_data: rawFormData, ...data } =
    publicApplicationSchema.parse(body);

  // Verify reCAPTCHA (skip in development if no key configured)
  const secretKey = c.env.RECAPTCHA_SECRET_KEY;
  if (secretKey) {
    if (!recaptcha_token) {
      throw badRequest("reCAPTCHA verification required.");
    }
    const valid = await verifyRecaptcha(recaptcha_token, secretKey);
    if (!valid) {
      throw badRequest("reCAPTCHA verification failed. Please try again.");
    }
  }

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
    throw conflict("An application with this email is already pending");
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
 * GET /ads — active litter ads for the static site.
 *
 * Protected by a simple API key (PUBLIC_API_KEY wrangler secret).
 * Pass as: Authorization: ApiKey <key>
 *
 * Sort order is configurable in clubs.settings.litter_ads.sort_order:
 *   "newest" (default) | "oldest" | "priority"
 */
publicRoutes.get("/ads", async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  // API key check
  const expectedKey = c.env.PUBLIC_API_KEY;
  if (expectedKey) {
    const authHeader = c.req.header("Authorization") ?? "";
    const providedKey = authHeader.startsWith("ApiKey ") ? authHeader.slice(7) : null;
    if (providedKey !== expectedKey) {
      throw forbidden("Invalid or missing API key");
    }
  }

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.id, clubId),
    columns: { settings: true },
  });
  const settings = (club?.settings as Record<string, unknown>) ?? {};
  const adSettings = (settings.litter_ads as { sort_order?: string } | undefined) ?? {};
  const sortOrder = adSettings.sort_order ?? "newest";

  const now = new Date();

  const data = await db.query.litterAds.findMany({
    where: and(
      eq(litterAds.club_id, clubId),
      eq(litterAds.status, "active"),
      gt(litterAds.expires_at, now)
    ),
    with: {
      member: {
        columns: { id: true },
        with: {
          contact: {
            columns: {
              full_name: true,
              kennel_name: true,
              state: true,
              country: true,
              website_url: true,
            },
          },
        },
      },
    },
    orderBy:
      sortOrder === "oldest"
        ? [litterAds.published_at]
        : sortOrder === "priority"
          ? [litterAds.priority, litterAds.published_at]
          : [desc(litterAds.published_at)],
  });

  // Increment impression counter (fire and forget)
  if (data.length > 0) {
    const adIds = data.map((a) => a.id);
    // Batch-insert one impression event per ad returned
    c.executionCtx?.waitUntil(
      db.insert(litterAdEvents).values(
        adIds.map((adId) => ({
          ad_id: adId,
          event_type: "impression" as const,
          metadata: { source: "public_api" },
        }))
      ).then(() =>
        // Update denormalized counter per ad
        Promise.all(
          adIds.map((adId) =>
            db
              .update(litterAds)
              .set({ impression_count: sql`${litterAds.impression_count} + 1` })
              .where(eq(litterAds.id, adId))
          )
        )
      )
    );
  }

  // Shape response — only expose public-safe fields
  const ads = data.map((ad) => ({
    id: ad.id,
    title: ad.title,
    description: ad.description,
    image_url: ad.image_url,
    contact_url: ad.contact_url ?? ad.member?.contact?.website_url ?? null,
    kennel_name: ad.member?.contact?.kennel_name ?? null,
    breeder_name: ad.member?.contact?.full_name ?? null,
    state: ad.member?.contact?.state ?? null,
    country: ad.member?.contact?.country ?? null,
    published_at: ad.published_at?.toISOString() ?? null,
    expires_at: ad.expires_at?.toISOString() ?? null,
  }));

  return c.json({ data: ads });
});

/**
 * POST /ads/:id/click — record a click event and return the destination URL.
 * The static site calls this then redirects to the returned url.
 */
publicRoutes.post("/ads/:id/click", async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const adId = c.req.param("id");

  const ad = await db.query.litterAds.findFirst({
    where: and(eq(litterAds.id, adId), eq(litterAds.club_id, clubId), eq(litterAds.status, "active")),
    with: {
      member: {
        columns: { id: true },
        with: { contact: { columns: { website_url: true } } },
      },
    },
  });

  if (!ad) throw notFound("Ad");

  const destination = ad.contact_url ?? ad.member?.contact?.website_url ?? null;

  // Record click (fire and forget)
  const referer = c.req.header("Referer") ?? null;
  c.executionCtx?.waitUntil(
    db.insert(litterAdEvents).values({
      ad_id: adId,
      event_type: "click",
      metadata: referer ? { referer } : undefined,
    }).then(() =>
      db
        .update(litterAds)
        .set({ click_count: sql`${litterAds.click_count} + 1` })
        .where(eq(litterAds.id, adId))
    )
  );

  return c.json({ destination });
});

export { publicRoutes };
