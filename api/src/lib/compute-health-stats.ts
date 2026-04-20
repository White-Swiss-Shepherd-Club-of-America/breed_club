import { eq, and, count, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  healthTestTypes,
  healthTestTypeOrgs,
  organizations,
  dogHealthClearances,
  dogs,
  healthStatisticsCache,
  healthConditions,
} from "../db/schema.js";

// ─── Condition Stats Types ───────────────────────────────────────────────────

export interface ConditionSeverityDist {
  mild: number;
  moderate: number;
  severe: number;
}

export interface ConditionBreedingDist {
  informational: number;
  advisory: number;
  disqualifying: number;
}

export interface ConditionStats {
  condition_name: string;
  condition_type_id: string | null;
  total_dogs: number; // distinct dogs with this condition
  medical_severity_dist: ConditionSeverityDist;
  breeding_impact_dist: ConditionBreedingDist;
}

export interface ConditionCategoryStats {
  category: string;
  total_reports: number;
  conditions: ConditionStats[];
}

export interface ConditionStatistics {
  by_category: ConditionCategoryStats[];
  total_conditions: number;
}

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

  // Overall statistics — exclude historical pedigree stubs from the count
  const totalDogs = await db
    .select({ count: count() })
    .from(dogs)
    .where(and(eq(dogs.club_id, clubId), eq(dogs.status, "approved"), eq(dogs.is_historical, false)));

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

// ─── Condition Statistics ────────────────────────────────────────────────────

/**
 * Aggregate approved health condition reports for a club, grouped by category.
 * Only approved conditions for approved, non-historical dogs are counted.
 */
export async function computeConditionStatistics(
  db: Database,
  clubId: string,
  dogIdFilter?: string[]
): Promise<ConditionStatistics> {
  // Build base where clause — approved conditions for club dogs
  const baseWhere = and(
    eq(healthConditions.status, "approved"),
    eq(dogs.club_id, clubId),
    eq(dogs.status, "approved"),
    eq(dogs.is_historical, false)
  );

  const whereClause =
    dogIdFilter && dogIdFilter.length > 0
      ? and(baseWhere, inArray(healthConditions.dog_id, dogIdFilter))
      : baseWhere;

  // Single query: all approved conditions with category + name + severities
  const rows = await db
    .select({
      condition_type_id: healthConditions.condition_type_id,
      condition_name: healthConditions.condition_name,
      category: healthConditions.category,
      medical_severity: healthConditions.medical_severity,
      breeding_impact: healthConditions.breeding_impact,
      dog_id: healthConditions.dog_id,
    })
    .from(healthConditions)
    .innerJoin(dogs, eq(healthConditions.dog_id, dogs.id))
    .where(whereClause);

  // Aggregate in memory — group by category → condition_name
  type ConditionKey = string; // category|condition_name
  const map = new Map<
    ConditionKey,
    {
      condition_name: string;
      condition_type_id: string | null;
      category: string;
      dog_ids: Set<string>;
      medical: ConditionSeverityDist;
      breeding: ConditionBreedingDist;
    }
  >();

  for (const row of rows) {
    const cat = row.category || "other";
    const name = row.condition_name;
    const key = `${cat}|${name}`;

    let entry = map.get(key);
    if (!entry) {
      entry = {
        condition_name: name,
        condition_type_id: row.condition_type_id,
        category: cat,
        dog_ids: new Set(),
        medical: { mild: 0, moderate: 0, severe: 0 },
        breeding: { informational: 0, advisory: 0, disqualifying: 0 },
      };
      map.set(key, entry);
    }

    entry.dog_ids.add(row.dog_id);

    const ms = row.medical_severity as keyof ConditionSeverityDist | null;
    if (ms && ms in entry.medical) entry.medical[ms]++;

    const bi = row.breeding_impact as keyof ConditionBreedingDist | null;
    if (bi && bi in entry.breeding) entry.breeding[bi]++;
  }

  // Group by category
  const categoryMap = new Map<string, ConditionCategoryStats>();
  for (const entry of map.values()) {
    let catStats = categoryMap.get(entry.category);
    if (!catStats) {
      catStats = { category: entry.category, total_reports: 0, conditions: [] };
      categoryMap.set(entry.category, catStats);
    }
    catStats.conditions.push({
      condition_name: entry.condition_name,
      condition_type_id: entry.condition_type_id,
      total_dogs: entry.dog_ids.size,
      medical_severity_dist: entry.medical,
      breeding_impact_dist: entry.breeding,
    });
    catStats.total_reports += entry.dog_ids.size;
  }

  // Sort: categories alphabetically, conditions within each by total_dogs desc
  const byCategory = Array.from(categoryMap.values())
    .sort((a, b) => a.category.localeCompare(b.category))
    .map((cat) => ({
      ...cat,
      conditions: cat.conditions.sort((a, b) => b.total_dogs - a.total_dogs),
    }));

  const totalConditions = rows.length;

  return { by_category: byCategory, total_conditions: totalConditions };
}

/**
 * Compute condition statistics scoped to a specific owner's dogs.
 */
export async function computeMyConditionStatistics(
  db: Database,
  clubId: string,
  contactId: string
): Promise<ConditionStatistics> {
  const ownedDogs = await db
    .select({ id: dogs.id })
    .from(dogs)
    .where(and(eq(dogs.club_id, clubId), eq(dogs.owner_id, contactId), eq(dogs.status, "approved")));

  if (ownedDogs.length === 0) return { by_category: [], total_conditions: 0 };

  return computeConditionStatistics(
    db,
    clubId,
    ownedDogs.map((d) => d.id)
  );
}

// ─── Combined Stats (clearances + conditions) ────────────────────────────────

/**
 * Compute full health statistics: clearances + conditions.
 */
export async function computeFullHealthStatistics(db: Database, clubId: string) {
  const [clearanceStats, conditionStats] = await Promise.all([
    computeHealthStatistics(db, clubId),
    computeConditionStatistics(db, clubId),
  ]);
  return { ...clearanceStats, condition_statistics: conditionStats };
}

/**
 * Recompute health statistics and upsert into the cache table.
 */
export async function refreshHealthStatisticsCache(db: Database, clubId: string) {
  const data = await computeFullHealthStatistics(db, clubId);
  await db
    .insert(healthStatisticsCache)
    .values({ id: 1, data, computed_at: new Date() })
    .onConflictDoUpdate({
      target: healthStatisticsCache.id,
      set: { data, computed_at: new Date() },
    });
}
