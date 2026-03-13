import type { Context } from "hono";
import type { AuthContext } from "@breed-club/shared";
import type { Database } from "../db/client.js";
import type { clubs } from "../db/schema.js";

/**
 * Cloudflare Workers environment bindings.
 * These are set in wrangler.toml and available on c.env in Hono handlers.
 */
export interface Env {
  DATABASE_URL: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_JWKS_URL: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RECAPTCHA_SECRET_KEY: string;
  ENVIRONMENT: "development" | "staging" | "production";
  CLUB_SLUG: string; // For single-club deployments, identifies which club
  BUILD_VERSION?: string; // Injected at deploy time via --var; shows git tag/hash
  CERTIFICATES_BUCKET: R2Bucket;
}

/**
 * Hono context type for API route handlers.
 * Includes variables set by clubContext, auth, and loadMember middleware.
 */
export type ApiContext = Context<{
  Bindings: Env;
  Variables: {
    clubId: string;
    club: typeof clubs.$inferSelect;
    db: Database;
    clerkUserId: string | null;
    auth: AuthContext | null;
  };
}>;
