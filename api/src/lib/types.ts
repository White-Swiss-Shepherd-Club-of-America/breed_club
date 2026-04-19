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
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RECAPTCHA_SECRET_KEY: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string; // e.g. "Club Name <noreply@mail.example.com>"
  APP_URL: string; // Frontend URL, e.g. https://app.wssca.org (no trailing slash)
  ENVIRONMENT: "development" | "staging" | "production";
  CLUB_SLUG: string; // For single-club deployments, identifies which club
  BUILD_VERSION?: string; // Injected at deploy time via --var; shows git tag/hash
  USE_NEON_DRIVER?: string; // "true" to use neon-http driver instead of postgres.js
  CERTIFICATES_BUCKET: R2Bucket;
  // LLM extraction (optional — feature disabled if LLM_API_KEY is not set)
  LLM_API_KEY?: string; // Secret: API key for the configured LLM provider
  LLM_PROVIDER?: string; // "anthropic" (default) — which LLM provider to use
  LLM_MODEL_FAST?: string; // Cheap model for easy certs (default: claude-haiku-4-5-20250315)
  LLM_MODEL_STRONG?: string; // Expensive model for hard certs (default: claude-sonnet-4-6-20250514)
  // Static site API key — read-only key for public litter ad endpoint
  PUBLIC_API_KEY?: string;
  // Social media credentials (wrangler secrets — disabled if not set)
  FACEBOOK_PAGE_TOKEN?: string;   // Facebook Graph API page access token
  FACEBOOK_PAGE_ID?: string;      // Facebook Page ID to post to
  INSTAGRAM_ACCESS_TOKEN?: string; // Instagram Graph API access token
  INSTAGRAM_USER_ID?: string;     // Instagram business account user ID
  TWITTER_API_KEY?: string;       // X/Twitter OAuth 1.0a API key
  TWITTER_API_SECRET?: string;
  TWITTER_ACCESS_TOKEN?: string;
  TWITTER_ACCESS_SECRET?: string;
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
