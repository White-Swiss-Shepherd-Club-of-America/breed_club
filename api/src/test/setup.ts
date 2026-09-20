import { afterAll } from "vitest";
import postgres from "postgres";
import { TEST_DATABASE_URL, closeTestDb } from "./db.js";

/**
 * Probe the configured database once, at setup time, so integration specs can
 * `describe.skipIf(!hasDb)` instead of failing when no Postgres is running
 * (CI stages the service container; a laptop may not have `make up` running).
 */
async function probe(): Promise<boolean> {
  let client: postgres.Sql | null = null;
  try {
    client = postgres(TEST_DATABASE_URL, {
      max: 1,
      connect_timeout: 3,
      idle_timeout: 1,
    });
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client?.end({ timeout: 3 }).catch(() => {});
  }
}

export const hasDb: boolean = await probe();

if (!hasDb) {
  console.warn(
    `[integration] no database at ${TEST_DATABASE_URL} — integration specs will be skipped`
  );
}

afterAll(async () => {
  await closeTestDb();
});
