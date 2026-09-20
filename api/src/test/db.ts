import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Sql } from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";

const schemaObj = { ...schema, ...relations };

/**
 * Connection string for the integration suite. Defaults to the local
 * `make up` compose stack; CI overrides it with DATABASE_URL.
 */
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/breed_club";

/** Schema object handed to drizzle — tables plus relational metadata. */
export type TestSchema = typeof schemaObj;

/** postgres.js-backed drizzle handle used by the integration suite. */
export type TestDb = PostgresJsDatabase<TestSchema> & { $client: Sql };

/** Transaction handle passed to `withRollback` / `withClub` callbacks. */
export type TestTx = PgTransaction<
  PostgresJsQueryResultHKT,
  TestSchema,
  ExtractTablesWithRelations<TestSchema>
>;

function createTestDb(connectionString: string): TestDb {
  const client = postgres(connectionString, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 5,
  });
  return drizzle(client, { schema: schemaObj });
}

let cached: TestDb | null = null;

/** Lazily-created drizzle handle over the local Postgres instance. */
export function getTestDb(): TestDb {
  cached ??= createTestDb(TEST_DATABASE_URL);
  return cached;
}

/** Closes the pooled connection so the vitest worker can exit. */
export async function closeTestDb(): Promise<void> {
  if (!cached) return;
  const db = cached;
  cached = null;
  await db.$client.end({ timeout: 5 });
}

/** Thrown at the end of every `withRollback` body to abort the transaction. */
class RollbackSentinel extends Error {
  constructor() {
    super("withRollback: forced rollback");
    this.name = "RollbackSentinel";
  }
}

/**
 * Runs `fn` inside a transaction that is *always* rolled back, so a test
 * leaves no rows behind. Only the sentinel is swallowed — a genuine failure
 * inside `fn` still propagates (after rolling back).
 */
export async function withRollback<T>(fn: (tx: TestTx) => Promise<T>): Promise<T> {
  const db = getTestDb();
  let result: T;
  let settled = false;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx);
      settled = true;
      throw new RollbackSentinel();
    });
  } catch (err) {
    if (!(err instanceof RollbackSentinel)) throw err;
  }
  if (!settled) {
    throw new Error("withRollback: transaction body did not complete");
  }
  return result!;
}

export interface SeededClubs {
  clubAId: string;
  clubBId: string;
  contactAId: string;
  contactBId: string;
  memberAId: string;
  memberBId: string;
}

let seedCounter = 0;

/**
 * Seeds two clubs, each with one contact and one member, so cross-tenant
 * assertions ("club B must not see club A's row") are expressible.
 */
export async function withClub(tx: TestTx): Promise<SeededClubs> {
  const nonce = `${Date.now().toString(36)}-${(seedCounter += 1)}`;

  const [clubA, clubB] = await tx
    .insert(schema.clubs)
    .values([
      { name: `Test Club A ${nonce}`, slug: `test-a-${nonce}`, breed_name: "Test Breed A" },
      { name: `Test Club B ${nonce}`, slug: `test-b-${nonce}`, breed_name: "Test Breed B" },
    ])
    .returning({ id: schema.clubs.id });

  const [contactA, contactB] = await tx
    .insert(schema.contacts)
    .values([
      { club_id: clubA.id, full_name: `Member A ${nonce}`, email: `a-${nonce}@example.test` },
      { club_id: clubB.id, full_name: `Member B ${nonce}`, email: `b-${nonce}@example.test` },
    ])
    .returning({ id: schema.contacts.id });

  const [memberA, memberB] = await tx
    .insert(schema.members)
    .values([
      {
        club_id: clubA.id,
        contact_id: contactA.id,
        clerk_user_id: `user_test_a_${nonce}`,
        tier: "member",
        membership_status: "active",
      },
      {
        club_id: clubB.id,
        contact_id: contactB.id,
        clerk_user_id: `user_test_b_${nonce}`,
        tier: "member",
        membership_status: "active",
      },
    ])
    .returning({ id: schema.members.id });

  return {
    clubAId: clubA.id,
    clubBId: clubB.id,
    contactAId: contactA.id,
    contactBId: contactB.id,
    memberAId: memberA.id,
    memberBId: memberB.id,
  };
}
