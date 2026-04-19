import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./lib/types.js";
import pkg from "../package.json";
import { clubContext } from "./middleware/club-context.js";
import { optionalAuth } from "./middleware/auth.js";
import { loadMember } from "./middleware/rbac.js";
import { ApiError } from "./lib/errors.js";
import { FormDataValidationError } from "./lib/form-data.js";
import { publicRoutes } from "./routes/public.js";
import { memberRoutes } from "./routes/members.js";
import { applicationRoutes } from "./routes/applications.js";
import { contactRoutes } from "./routes/contacts.js";
import { dogRoutes } from "./routes/dogs.js";
import { adminRoutes } from "./routes/admin.js";
import { healthRoutes } from "./routes/health.js";
import { healthStampRoutes } from "./routes/health-stamp.js";
import { paymentRoutes } from "./routes/payments.js";
import { litterRoutes } from "./routes/litters.js";
import { uploadRoutes } from "./routes/uploads.js";
import { formFieldRoutes } from "./routes/form-fields.js";
import { invitationRoutes } from "./routes/invitations.js";
import { votingRoutes } from "./routes/voting.js";
import { adsRoutes } from "./routes/ads.js";
import { createDb } from "./db/client.js";
import { clubs } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { refreshHealthStatisticsCache } from "./lib/compute-health-stats.js";

const app = new Hono<{ Bindings: Env }>();

// ─── Global middleware ──────────────────────────────────────────────────────

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => origin, // TODO: restrict to app domain in production
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Health check (no DB, no auth — just a ping)
app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString(), version: c.env.BUILD_VERSION ?? pkg.version })
);

// Version endpoint — registered before /api/* middleware so it needs no DB/club context
app.get("/api/version", (c) =>
  c.json({ version: c.env.BUILD_VERSION ?? pkg.version })
);

// All /api/* routes get club context, optional auth, and member loading
app.use("/api/*", clubContext, optionalAuth, loadMember);

// Health stamp SSR pages also need club context (no auth required)
app.use("/dogs/*", clubContext);

// ─── Routes ─────────────────────────────────────────────────────────────────

// Public endpoints (no auth required)
app.route("/api/public", publicRoutes);

// Member self-service
app.route("/api/members", memberRoutes);

// Membership applications
app.route("/api/applications", applicationRoutes);

// Contact management
app.route("/api/contacts", contactRoutes);

// Dog registry
app.route("/api/dogs", dogRoutes);

// Admin panel
app.route("/api/admin", adminRoutes);

// Health clearances
app.route("/api/health", healthRoutes);

// Payments
app.route("/api/payments", paymentRoutes);

// Litters
app.route("/api/litters", litterRoutes);

// File uploads
app.route("/api/uploads", uploadRoutes);

// Membership form fields (admin)
app.route("/api/admin/form-fields", formFieldRoutes);

// Member invitations
app.route("/api/invitations", invitationRoutes);

// Voting / Elections
app.route("/api/voting", votingRoutes);

// Litter Ads
app.route("/api/ads", adsRoutes);

// Health stamp SSR pages (no /api prefix)
app.route("/", healthStampRoutes);

// ─── Error handling ─────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json(err.toJSON(), err.statusCode as any);
  }

  // Handle form data validation errors
  if (err instanceof FormDataValidationError) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: err.message,
        },
      },
      422
    );
  }

  // Handle Zod validation errors
  if (err.name === "ZodError") {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: { errors: (err as any).errors },
        },
      },
      422
    );
  }

  console.error("Unhandled error:", err);
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
    500
  );
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const db = await createDb(env.DATABASE_URL, env.USE_NEON_DRIVER === "true");
    const [club] = await db
      .select({ id: clubs.id })
      .from(clubs)
      .where(eq(clubs.slug, env.CLUB_SLUG))
      .limit(1);

    if (club) {
      ctx.waitUntil(refreshHealthStatisticsCache(db, club.id));
    }
  },
};
