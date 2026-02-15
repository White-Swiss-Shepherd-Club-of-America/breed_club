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
  ENVIRONMENT: "development" | "staging" | "production";
  CLUB_SLUG: string; // For single-club deployments, identifies which club
}
