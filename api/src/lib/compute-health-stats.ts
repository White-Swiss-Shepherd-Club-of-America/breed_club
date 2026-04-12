import { eq, and, count, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  healthTestTypes,
  healthTestTypeOrgs,
  organizations,
  dogHealthClearances,
  dogs,
  healthStatisticsCache,
} from "../db/schema.js";

/**
 * Compute aggregate health statistics for a club.
 * This is the expensive operation (20-100+ queries) that we cache.
 */
export async function computeHealthStatistics(db: Database, clubId: string) {
  // Get all test type + org combinations for this club
  const testTypeOrgs = await db
    .select({
      test_type_id: healthTestTypes.id,
      test_type_name: healthTestTypes.name,
      test_type_short_name: healthTestTypes.short_name,
      test_type_category: healthTestTypes.category,
      org_id: organizations.id,
      org_name: organizations.name,
    })
    .from(healthTestTypeOrgs)
    .innerJoin(healthTestTypes, eq(healthTestTypeOrgs.health_test_type_id, healthTestTypes.id))
    .innerJoin(organizations, eq(healthTestTypeOrgs.organization_id, organizations.id))
    .where(and(eq(healthTestTypes.club_id, clubId), eq(healthTestTypes.is_active, true)))
    .orderBy(healthTestTypes.sort_order, healthTestTypes.name, organizations.sort_order);

  // For each test type + org, get result distribution
  const perOrgStats = await Promise.all(
    testTypeOrgs.map(async (row) => {
      const totalTested = await db
        .select({ count: count() })
        .from(dogHealthClearances)
        .innerJoin(dogs, eq(dogHealthClearances.dog_id, dogs.id))
        .where(
          and(
            eq(dogHealthClearances.health_test_type_id, row.test_type_id),
            eq(dogHealthClearances.organization_id, row.org_id),
            eq(dogHealthClearances.status, "approved"),
            eq(dogHealthClearances.is_preliminary, false),
            eq(dogs.club_id, clubId),
            eq(dogs.status, "approved")
          )
        );

      const resultDistribution = await db
        .select({
          result: dogHealthClearances.result,
          count: count(),
        })
        .from(dogHealthClearances)
        .innerJoin(dogs, eq(dogHealthClearances.dog_id, dogs.id))
        .where(
          and(
            eq(dogHealthClearances.health_test_type_id, row.test_type_id),
            eq(dogHealthClearances.organization_id, row.org_id),
            eq(dogHealthClearances.status, "approved"),
            eq(dogHealthClearances.is_preliminary, false),
            eq(dogs.club_id, clubId),
            eq(dogs.status, "approved")
          )
        )
        .groupBy(dogHealthClearances.result);

      return { row, totalTested: totalTested[0]?.count || 0, resultDistribution };
    })
  );

  // Group by test type, nesting org results inside each
  const testTypeMap = new Map<string, {
    test_type: { id: string; name: string; short_name: string | null; category: string };
    total_tested: number;
    by_org: { organization: { id: string; name: string }; total_tested: number; result_distribution: { result: string; count: number }[] }[];
  }>();

  for (const { row, totalTested, resultDistribution } of perOrgStats) {
    let entry = testTypeMap.get(row.test_type_id);
    if (!entry) {
      entry = {
        test_type: {
          id: row.test_type_id,
          name: row.test_type_name,
          short_name: row.test_type_short_name,
          category: row.test_type_category,
        },
        total_tested: 0,
        by_org: [],
      };
      testTypeMap.set(row.test_type_id, entry);
    }
    entry.total_tested += totalTested;
    entry.by_org.push({
      organization: { id: row.org_id, name: row.org_name },
      total_tested: totalTested,
      result_distribution: resultDistribution.map((r) => ({
        result: r.result,
        count: Number(r.count),
      })),
    });
  }

  const statistics = Array.from(testTypeMap.values());

  // Overall statistics
  const totalDogs = await db
    .select({ count: count() })
    .from(dogs)
    .where(and(eq(dogs.club_id, clubId), eq(dogs.status, "approved")));

  const totalClearances = await db
    .select({ count: count() })
    .from(dogHealthClearances)
    .innerJoin(dogs, eq(dogHealthClearances.dog_id, dogs.id))
    .where(
      and(
        eq(dogHealthClearances.status, "approved"),
        eq(dogHealthClearances.is_preliminary, false),
        eq(dogs.club_id, clubId),
        eq(dogs.status, "approved")
      )
    );

  return {
    overview: {
      total_dogs: totalDogs[0]?.count || 0,
      total_clearances: totalClearances[0]?.count || 0,
    },
    by_test_type: statistics,
  };
}

/**
 * Compute health statistics scoped to a specific owner's dogs.
 * Returns the same shape as computeHealthStatistics but filtered to
 * dogs owned by the given contactId.
 */
export async function computeMyHealthStatistics(db: Database, clubId: string, contactId: string) {
  // Get the IDs of approved dogs owned by this contact
  const ownedDogs = await db
    .select({ id: dogs.id })
    .from(dogs)
    .where(and(eq(dogs.club_id, clubId), eq(dogs.owner_id, contactId), eq(dogs.status, "approved")));

  const ownedDogIds = ownedDogs.map((d) => d.id);

  // Get all test type + org combinations for this club
  const testTypeOrgs = await db
    .select({
      test_type_id: healthTestTypes.id,
      test_type_name: healthTestTypes.name,
      test_type_short_name: healthTestTypes.short_name,
      test_type_category: healthTestTypes.category,
      org_id: organizations.id,
      org_name: organizations.name,
    })
    .from(healthTestTypeOrgs)
    .innerJoin(healthTestTypes, eq(healthTestTypeOrgs.health_test_type_id, healthTestTypes.id))
    .innerJoin(organizations, eq(healthTestTypeOrgs.organization_id, organizations.id))
    .where(and(eq(healthTestTypes.club_id, clubId), eq(healthTestTypes.is_active, true)))
    .orderBy(healthTestTypes.sort_order, healthTestTypes.name, organizations.sort_order);

  if (ownedDogIds.length === 0) {
    // No dogs — return empty stats with the full test type structure (zero counts)
    const testTypeMap = new Map<string, {
      test_type: { id: string; name: string; short_name: string | null; category: string };
      total_tested: number;
      by_org: { organization: { id: string; name: string }; total_tested: number; result_distribution: { result: string; count: number }[] }[];
    }>();

    for (const row of testTypeOrgs) {
      let entry = testTypeMap.get(row.test_type_id);
      if (!entry) {
        entry = {
          test_type: {
            id: row.test_type_id,
            name: row.test_type_name,
            short_name: row.test_type_short_name,
            category: row.test_type_category,
          },
          total_tested: 0,
          by_org: [],
        };
        testTypeMap.set(row.test_type_id, entry);
      }
      entry.by_org.push({
        organization: { id: row.org_id, name: row.org_name },
        total_tested: 0,
        result_distribution: [],
      });
    }

    return {
      overview: { total_dogs: 0, total_clearances: 0 },
      by_test_type: Array.from(testTypeMap.values()),
    };
  }

  // For each test type + org, get result distribution scoped to owned dogs
  const perOrgStats = await Promise.all(
    testTypeOrgs.map(async (row) => {
      const totalTested = await db
        .select({ count: count() })
        .from(dogHealthClearances)
        .where(
          and(
            eq(dogHealthClearances.health_test_type_id, row.test_type_id),
            eq(dogHealthClearances.organization_id, row.org_id),
            eq(dogHealthClearances.status, "approved"),
            eq(dogHealthClearances.is_preliminary, false),
            inArray(dogHealthClearances.dog_id, ownedDogIds)
          )
        );

      const resultDistribution = await db
        .select({
          result: dogHealthClearances.result,
          count: count(),
        })
        .from(dogHealthClearances)
        .where(
          and(
            eq(dogHealthClearances.health_test_type_id, row.test_type_id),
            eq(dogHealthClearances.organization_id, row.org_id),
            eq(dogHealthClearances.status, "approved"),
            eq(dogHealthClearances.is_preliminary, false),
            inArray(dogHealthClearances.dog_id, ownedDogIds)
          )
        )
        .groupBy(dogHealthClearances.result);

      return { row, totalTested: totalTested[0]?.count || 0, resultDistribution };
    })
  );

  // Group by test type
  const testTypeMap = new Map<string, {
    test_type: { id: string; name: string; short_name: string | null; category: string };
    total_tested: number;
    by_org: { organization: { id: string; name: string }; total_tested: number; result_distribution: { result: string; count: number }[] }[];
  }>();

  for (const { row, totalTested, resultDistribution } of perOrgStats) {
    let entry = testTypeMap.get(row.test_type_id);
    if (!entry) {
      entry = {
        test_type: {
          id: row.test_type_id,
          name: row.test_type_name,
          short_name: row.test_type_short_name,
          category: row.test_type_category,
        },
        total_tested: 0,
        by_org: [],
      };
      testTypeMap.set(row.test_type_id, entry);
    }
    entry.total_tested += totalTested;
    entry.by_org.push({
      organization: { id: row.org_id, name: row.org_name },
      total_tested: totalTested,
      result_distribution: resultDistribution.map((r) => ({
        result: r.result,
        count: Number(r.count),
      })),
    });
  }

  const totalClearances = await db
    .select({ count: count() })
    .from(dogHealthClearances)
    .where(
      and(
        eq(dogHealthClearances.status, "approved"),
        eq(dogHealthClearances.is_preliminary, false),
        inArray(dogHealthClearances.dog_id, ownedDogIds)
      )
    );

  return {
    overview: {
      total_dogs: ownedDogIds.length,
      total_clearances: totalClearances[0]?.count || 0,
    },
    by_test_type: Array.from(testTypeMap.values()),
  };
}

/**
 * Recompute health statistics and upsert into the cache table.
 */
export async function refreshHealthStatisticsCache(db: Database, clubId: string) {
  const data = await computeHealthStatistics(db, clubId);
  await db
    .insert(healthStatisticsCache)
    .values({ id: 1, data, computed_at: new Date() })
    .onConflictDoUpdate({
      target: healthStatisticsCache.id,
      set: { data, computed_at: new Date() },
    });
}
