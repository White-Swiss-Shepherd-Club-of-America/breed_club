import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";
import type { Env } from "../lib/types.js";

/**
 * Clerk JWT verification middleware.
 *
 * Extracts the Bearer token from the Authorization header,
 * verifies it against Clerk's JWKS endpoint, and attaches
 * the clerk_user_id to the Hono context.
 *
 * Use `optionalAuth` for routes that work with or without auth.
 * Use `requireAuth` for routes that require a valid JWT.
 */

type AuthVariables = {
  clerkUserId: string | null;
};

/**
 * Optional auth: sets clerkUserId if token is present, null otherwise.
 * Does not reject unauthenticated requests.
 */
export const optionalAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    c.set("clerkUserId", null);
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyToken(token, {
      secretKey: c.env.CLERK_SECRET_KEY,
    });
    c.set("clerkUserId", payload.sub);
  } catch (err) {
    console.warn("JWT verification failed:", err);
    c.set("clerkUserId", null);
  }

  return next();
});

/**
 * Required auth: rejects with 401 if no valid token.
 */
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyToken(token, {
      secretKey: c.env.CLERK_SECRET_KEY,
    });
    c.set("clerkUserId", payload.sub);
  } catch (err) {
    console.warn("JWT verification failed:", err);
    return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } }, 401);
  }

  return next();
});
