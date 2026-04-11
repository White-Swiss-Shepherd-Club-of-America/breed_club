/**
 * Load the club's (healthTestType, organization) catalog for the classifier.
 */

import { eq, and } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import {
  healthTestTypes,
  healthTestTypeOrgs,
  organizations,
} from "../../db/schema.js";
import type { ResultSchema } from "../../db/schema.js";
import type { TestOrgCatalog, CatalogPair } from "./types.js";

/**
 * Query all active (test_type, organization) pairs for a club.
 * Returns the catalog in the format the classifier prompt expects.
 */
export async function loadTestOrgCatalog(
  db: Database,
  clubId: string
): Promise<TestOrgCatalog> {
  const rows = await db
    .select({
      health_test_type_id: healthTestTypes.id,
      test_name: healthTestTypes.name,
      test_short_name: healthTestTypes.short_name,
      category: healthTestTypes.category,
      organization_id: organizations.id,
      org_name: organizations.name,
      org_type: organizations.type,
      result_schema: healthTestTypeOrgs.result_schema,
    })
    .from(healthTestTypeOrgs)
    .innerJoin(
      healthTestTypes,
      and(
        eq(healthTestTypeOrgs.health_test_type_id, healthTestTypes.id),
        eq(healthTestTypes.club_id, clubId),
        eq(healthTestTypes.is_active, true)
      )
    )
    .innerJoin(
      organizations,
      and(
        eq(healthTestTypeOrgs.organization_id, organizations.id),
        eq(organizations.is_active, true)
      )
    );

  const pairs: CatalogPair[] = rows.map((row) => ({
    id: `${row.health_test_type_id}:${row.organization_id}`,
    health_test_type_id: row.health_test_type_id,
    organization_id: row.organization_id,
    test_name: row.test_name,
    test_short_name: row.test_short_name,
    org_name: row.org_name,
    org_type: row.org_type,
    category: row.category,
    result_schema: row.result_schema as ResultSchema | null,
  }));

  return { pairs };
}

/**
 * Look up a specific catalog pair by its composite ID.
 */
export function findCatalogPair(
  catalog: TestOrgCatalog,
  pairId: string
): CatalogPair | undefined {
  return catalog.pairs.find((p) => p.id === pairId);
}

/**
 * Format the catalog for inclusion in the classifier prompt.
 * Strips result_schema (not needed by classifier) and returns compact JSON.
 */
export function formatCatalogForPrompt(catalog: TestOrgCatalog): string {
  const pairs = catalog.pairs.map((p) => ({
    id: p.id,
    test: `${p.test_name} (${p.test_short_name})`,
    org: p.org_name,
    org_type: p.org_type,
    category: p.category,
  }));
  return JSON.stringify({ pairs }, null, 2);
}
