import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.js";
import * as relations from "./relations.js";

const schemaObj = { ...schema, ...relations };
type Schema = typeof schemaObj;

/**
 * Driver-agnostic database handle.
 *
 * Both drivers below are structurally assignable to this common `PgDatabase`
 * base, and both support `.transaction()`. Typing the application against the
 * base is what removes the need for a cast at the creation site — the previous
 * `as unknown as Database` silently claimed the neon-http driver had the same
 * capabilities as postgres.js, which hid the fact that neon-http throws
 * "No transactions support in neon-http driver" at runtime.
 */
export type Database = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

/** A database handle plus the teardown for the connection backing it. */
export interface DbHandle {
  db: Database;
  /** Releases the underlying socket. Call once, after the response is sent. */
  close(): Promise<void>;
}

/**
 * Neon over a WebSocket pool.
 *
 * Unlike neon-http this supports transactions, and unlike neon-http it owns a
 * live socket — so it must NOT be cached across requests. Cloudflare Workers
 * forbid reusing an I/O object created by a different request.
 */
function createNeonDb(connectionString: string): DbHandle {
  const pool = new Pool({ connectionString });
  return {
    db: drizzleNeon(pool, { schema: schemaObj }),
    close: () => pool.end(),
  };
}

/**
 * postgres.js over TCP — local development and tests.
 *
 * Imported dynamically on purpose: postgres.js is only reachable on the dev
 * path, and a static import would pull its Node socket machinery into every
 * production Worker bundle. The specifier is literal but the *need* is
 * runtime-selected by `USE_NEON_DRIVER`.
 */
async function createPostgresDb(connectionString: string): Promise<DbHandle> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(connectionString, {
    idle_timeout: 20,
    max_lifetime: 60 * 5,
  });
  return {
    db: drizzle(client, { schema: schemaObj }),
    close: () => client.end(),
  };
}

export async function createDb(connectionString: string, useNeon = false): Promise<DbHandle> {
  return useNeon ? createNeonDb(connectionString) : createPostgresDb(connectionString);
}
