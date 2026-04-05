import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import * as relations from "./relations.js";

/**
 * Create a Drizzle database client from a connection string.
 *
 * In Cloudflare Workers, we create a new connection per request.
 */
export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    idle_timeout: 20,
    max_lifetime: 60 * 5,
  });

  return drizzle(client, { schema: { ...schema, ...relations } });
}

export type Database = ReturnType<typeof createDb>;

/**
 * Helper to get DB from context (when using clubContext middleware)
 * or create a new connection from env (for one-off scripts/routes).
 */
export function getDb(envOrDb: any): Database {
  // If it's already a db instance (from context), return it
  if (envOrDb && typeof envOrDb.select === 'function') {
    return envOrDb;
  }
  // Otherwise create from DATABASE_URL
  return createDb(envOrDb.DATABASE_URL);
}
