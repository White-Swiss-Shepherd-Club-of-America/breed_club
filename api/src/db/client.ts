import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";
import * as relations from "./relations.js";

const schemaObj = { ...schema, ...relations };

// Module-scope cache for the neon-http client only. neon-http is stateless
// (each query is an independent HTTP call), so the client is safe to reuse
// across requests. The postgres.js client (local dev) holds a persistent TCP
// connection bound to the request that created it and must NOT be cached —
// Cloudflare Workers forbid reusing such I/O objects across requests.
let cachedNeon: { connectionString: string; db: Database } | null = null;

async function createNeonDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzleNeon(sql, { schema: schemaObj });
}

async function createPostgresDb(connectionString: string) {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(connectionString, {
    idle_timeout: 20,
    max_lifetime: 60 * 5,
  });
  return drizzle(client, { schema: schemaObj });
}

export async function createDb(connectionString: string, useNeon = false): Promise<Database> {
  if (useNeon) {
    if (cachedNeon && cachedNeon.connectionString === connectionString) {
      return cachedNeon.db;
    }
    const db = (await createNeonDb(connectionString)) as unknown as Database;
    cachedNeon = { connectionString, db };
    return db;
  }
  // Local dev (postgres.js): always create a fresh per-request client.
  return await createPostgresDb(connectionString);
}

export type Database = Awaited<ReturnType<typeof createPostgresDb>>;

export async function getDb(envOrDb: any): Promise<Database> {
  if (envOrDb && typeof envOrDb.select === "function") {
    return envOrDb;
  }
  return createDb(envOrDb.DATABASE_URL, envOrDb.USE_NEON_DRIVER === "true");
}
