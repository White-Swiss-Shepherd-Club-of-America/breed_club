import { eq, and, sql, count, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  dogs,
  dogHealthClearances,
  memberHealthStatsCache,
} from "../db/schema.js";

export interface MemberHealthStats {
  own_dogs: {
    total: number;
    tested: number;
    clearances: number;
    dogs: Array<{
      id: string;
      name: string;
      call_name: string | null;
      clearance_count: number;
      health_score: number | null;
      health_color: string | null;
    }>;
  };
  progeny?: {
    total: number;
    tested: number;
    clearances: number;
    avg_score: number | null;
  };
}

export async function computeMemberHealthStats(
  db: Database,
  clubId: string,
  memberId: string,
  contactId: string,
  isBreeder: boolean
): Promise<MemberHealthStats> {
  // Own dogs: dogs where owner_id matches the member's contact_id
  const ownDogs = await db
    .select({
      id: dogs.id,
      registered_name: dogs.registered_name,
      call_name: dogs.call_name,
      health_rating: dogs.health_rating,
    })
    .from(dogs)
    .where(
      and(
        eq(dogs.club_id, clubId),
        eq(dogs.owner_id, contactId),
        eq(dogs.status, "approved")
      )
    );

  const ownDogIds = ownDogs.map((d) => d.id);

  let ownClearancesByDog: Record<string, number> = {};
  let totalOwnClearances = 0;

  if (ownDogIds.length > 0) {
    const clearanceCounts = await db
      .select({
        dog_id: dogHealthClearances.dog_id,
        count: count(),
      })
      .from(dogHealthClearances)
      .where(
        and(
          inArray(dogHealthClearances.dog_id, ownDogIds),
          eq(dogHealthClearances.status, "approved")
        )
      )
      .groupBy(dogHealthClearances.dog_id);

    for (const row of clearanceCounts) {
      ownClearancesByDog[row.dog_id] = Number(row.count);
      totalOwnClearances += Number(row.count);
    }
  }

  const ownDogsData = ownDogs.map((d) => {
    const hr = d.health_rating as { score?: number; color?: string } | null;
    return {
      id: d.id,
      name: d.registered_name,
      call_name: d.call_name,
      clearance_count: ownClearancesByDog[d.id] || 0,
      health_score: hr?.score ?? null,
      health_color: hr?.color ?? null,
    };
  });

  const testedOwn = ownDogsData.filter((d) => d.clearance_count > 0).length;

  const result: MemberHealthStats = {
    own_dogs: {
      total: ownDogs.length,
      tested: testedOwn,
      clearances: totalOwnClearances,
      dogs: ownDogsData,
    },
  };

  if (isBreeder) {
    // Progeny: dogs bred by this contact (via litters where breeder_id = contactId)
    const progenyStats = await db
      .select({
        total: count(),
        tested: sql<number>`count(CASE WHEN ${dogs.health_rating} IS NOT NULL THEN 1 END)::int`,
        score_sum: sql<number>`coalesce(sum((${dogs.health_rating}->>'score')::numeric), 0)`,
        score_count: sql<number>`count(CASE WHEN ${dogs.health_rating}->>'score' IS NOT NULL THEN 1 END)::int`,
      })
      .from(dogs)
      .where(
        and(
          eq(dogs.club_id, clubId),
          eq(dogs.breeder_id, contactId),
          eq(dogs.status, "approved")
        )
      );

    const progenyClearances = await db
      .select({ count: count() })
      .from(dogHealthClearances)
      .innerJoin(dogs, eq(dogHealthClearances.dog_id, dogs.id))
      .where(
        and(
          eq(dogs.club_id, clubId),
          eq(dogs.breeder_id, contactId),
          eq(dogs.status, "approved"),
          eq(dogHealthClearances.status, "approved")
        )
      );

    const ps = progenyStats[0];
    const avgScore = ps && Number(ps.score_count) > 0
      ? Math.round((Number(ps.score_sum) / Number(ps.score_count)) * 10) / 10
      : null;

    result.progeny = {
      total: Number(ps?.total ?? 0),
      tested: Number(ps?.tested ?? 0),
      clearances: Number(progenyClearances[0]?.count ?? 0),
      avg_score: avgScore,
    };
  }

  return result;
}

export async function refreshMemberHealthStatsCache(
  db: Database,
  memberId: string,
  clubId: string,
  contactId: string,
  isBreeder: boolean
) {
  const data = await computeMemberHealthStats(db, clubId, memberId, contactId, isBreeder);
  await db
    .insert(memberHealthStatsCache)
    .values({ member_id: memberId, data, computed_at: new Date() })
    .onConflictDoUpdate({
      target: memberHealthStatsCache.member_id,
      set: { data, computed_at: new Date() },
    });
}
