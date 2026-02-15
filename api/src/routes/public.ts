/**
 * Public routes — no auth required.
 *
 * - GET /club          — club info (name, branding)
 * - GET /organizations — list organizations
 * - GET /test-types    — list health test types
 * - GET /breeders      — breeder directory (alias for member directory)
 */

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
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
} from "../db/schema.js";

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

  // Return only public-safe fields
  return c.json({
    club: {
      id: club.id,
      name: club.name,
      slug: club.slug,
      breed_name: club.breed_name,
      logo_url: club.logo_url,
      primary_color: club.primary_color,
      secondary_color: club.secondary_color,
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
    orderBy: (l, { desc }) => [desc(l.whelp_date), desc(l.expected_date)],
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
      certificate_url: clearance?.certificate_url || null,
    };
  });

  return c.json({
    dog,
    clearances: testResults,
    summary: {
      total_tests: allTestTypes.length,
      verified_count: testResults.filter((t) => t.verified_at).length,
    },
  });
});

export { publicRoutes };
