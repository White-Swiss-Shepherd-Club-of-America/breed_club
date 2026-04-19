/**
 * Litter Advertisement routes
 *
 * Breeder routes (require is_breeder flag):
 *   POST   /api/ads               — create ad (draft)
 *   GET    /api/ads               — list own ads
 *   GET    /api/ads/:id           — get own ad
 *   PATCH  /api/ads/:id           — update draft/revision_requested ad
 *   POST   /api/ads/:id/submit    — submit draft for review
 *   DELETE /api/ads/:id           — delete draft or archived ad
 *
 * Admin routes (require can_approve_ads flag):
 *   GET    /api/ads/admin         — list all ads (filterable by status)
 *   POST   /api/ads/:id/review    — approve / reject / request_revision
 *
 * Public route (API-key protected, for static site):
 *   GET    /api/public/ads        — active, non-expired ads
 *   POST   /api/public/ads/:id/impression — record impression
 *   POST   /api/public/ads/:id/click      — record click + redirect
 */

import { Hono } from "hono";
import { eq, and, desc, lt, gt, sql } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import {
  litterAds,
  litterAdEvents,
  socialPostLog,
  members,
  clubs,
} from "../db/schema.js";
import {
  createLitterAdSchema,
  updateLitterAdSchema,
  reviewLitterAdSchema,
} from "@breed-club/shared/validation.js";
import { badRequest, forbidden, notFound, conflict } from "../lib/errors.js";
import { postToAllPlatforms } from "../lib/social/registry.js";
import type { PublicLitterAd } from "@breed-club/shared";

type Variables = {
  clubId: string;
  db: Database;
  clerkUserId: string | null;
  auth: AuthContext | null;
};

const adsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Settings helpers ─────────────────────────────────────────────────────

type LitterAdSettings = {
  enabled?: boolean;
  max_active_per_member?: number;
  posting_cooldown_days?: number;
  expiration_days?: number;
  require_approval?: boolean;
  fee_cents?: number;
  max_images?: number;
  ad_image_width?: number;
  ad_image_height?: number;
  sort_order?: "newest" | "oldest" | "priority";
};

function getAdSettings(clubSettings: Record<string, unknown>): LitterAdSettings {
  return (clubSettings?.litter_ads as LitterAdSettings) ?? {};
}

function getSocialSettings(clubSettings: Record<string, unknown>) {
  return (clubSettings?.social_integrations as Record<string, { enabled: boolean }>) ?? {};
}

// ─── Auth guards ──────────────────────────────────────────────────────────

function requireBreeder(auth: AuthContext | null) {
  if (!auth) throw forbidden("Authentication required");
  if (!auth.isAdmin && !auth.flags.is_breeder) throw forbidden("Breeder account required");
  return auth;
}

function requireAdApprover(auth: AuthContext | null) {
  if (!auth) throw forbidden("Authentication required");
  if (!auth.isAdmin && !auth.flags.can_approve_ads) throw forbidden("Ad approval permission required");
  return auth;
}

// ─── Breeder: create ad ───────────────────────────────────────────────────

adsRoutes.post("/", async (c) => {
  const auth = requireBreeder(c.get("auth"));
  const db = c.get("db");
  const clubId = c.get("clubId");

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.id, clubId),
    columns: { settings: true },
  });
  const settings = getAdSettings((club?.settings ?? {}) as Record<string, unknown>);

  if (settings.enabled === false) throw badRequest("Litter ads are not enabled for this club");

  // Enforce max active ads per member
  const maxActive = settings.max_active_per_member ?? 2;
  const activeCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(litterAds)
    .where(
      and(
        eq(litterAds.club_id, clubId),
        eq(litterAds.member_id, auth.memberId),
        sql`${litterAds.status} IN ('submitted','approved','active')`
      )
    );
  if (Number(activeCount[0]?.count ?? 0) >= maxActive) {
    throw conflict(`You may only have ${maxActive} active ads at a time`);
  }

  // Enforce posting cooldown
  const cooldownDays = settings.posting_cooldown_days ?? 30;
  if (cooldownDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cooldownDays);
    const recent = await db.query.litterAds.findFirst({
      where: and(
        eq(litterAds.club_id, clubId),
        eq(litterAds.member_id, auth.memberId),
        gt(litterAds.created_at, cutoff)
      ),
      columns: { id: true, created_at: true },
    });
    if (recent) {
      throw conflict(
        `You may only post a new ad every ${cooldownDays} days. Your last ad was created on ${recent.created_at.toISOString().slice(0, 10)}.`
      );
    }
  }

  const body = await c.req.json();
  const data = createLitterAdSchema.parse(body);

  const [ad] = await db
    .insert(litterAds)
    .values({
      club_id: clubId,
      member_id: auth.memberId,
      ...data,
      status: "draft",
    })
    .returning();

  return c.json({ data: ad }, 201);
});

// ─── Breeder: list own ads ────────────────────────────────────────────────

adsRoutes.get("/", async (c) => {
  const auth = requireBreeder(c.get("auth"));
  const db = c.get("db");
  const clubId = c.get("clubId");

  const data = await db.query.litterAds.findMany({
    where: and(eq(litterAds.club_id, clubId), eq(litterAds.member_id, auth.memberId)),
    orderBy: [desc(litterAds.created_at)],
  });

  return c.json({ data });
});

// ─── Breeder: get own ad ──────────────────────────────────────────────────

adsRoutes.get("/:id", async (c) => {
  const auth = requireBreeder(c.get("auth"));
  const db = c.get("db");
  const clubId = c.get("clubId");
  const adId = c.req.param("id");

  const ad = await db.query.litterAds.findFirst({
    where: and(eq(litterAds.id, adId), eq(litterAds.club_id, clubId)),
  });

  if (!ad) throw notFound("Ad");
  if (!auth.isAdmin && ad.member_id !== auth.memberId) throw forbidden();

  return c.json({ data: ad });
});

// ─── Breeder: update draft / revision_requested ───────────────────────────

adsRoutes.patch("/:id", async (c) => {
  const auth = requireBreeder(c.get("auth"));
  const db = c.get("db");
  const clubId = c.get("clubId");
  const adId = c.req.param("id");

  const ad = await db.query.litterAds.findFirst({
    where: and(eq(litterAds.id, adId), eq(litterAds.club_id, clubId)),
  });

  if (!ad) throw notFound("Ad");
  if (!auth.isAdmin && ad.member_id !== auth.memberId) throw forbidden();
  if (!["draft", "revision_requested"].includes(ad.status)) {
    throw badRequest("Only draft or revision_requested ads can be edited");
  }

  const body = await c.req.json();
  const data = updateLitterAdSchema.parse(body);

  const [updated] = await db
    .update(litterAds)
    .set({ ...data, updated_at: new Date() })
    .where(eq(litterAds.id, adId))
    .returning();

  return c.json({ data: updated });
});

// ─── Breeder: submit for review ───────────────────────────────────────────

adsRoutes.post("/:id/submit", async (c) => {
  const auth = requireBreeder(c.get("auth"));
  const db = c.get("db");
  const clubId = c.get("clubId");
  const adId = c.req.param("id");

  const ad = await db.query.litterAds.findFirst({
    where: and(eq(litterAds.id, adId), eq(litterAds.club_id, clubId)),
  });

  if (!ad) throw notFound("Ad");
  if (!auth.isAdmin && ad.member_id !== auth.memberId) throw forbidden();
  if (!["draft", "revision_requested"].includes(ad.status)) {
    throw badRequest("Only draft or revision_requested ads can be submitted");
  }

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.id, clubId),
    columns: { settings: true },
  });
  const settings = getAdSettings((club?.settings ?? {}) as Record<string, unknown>);
  const requireApproval = settings.require_approval !== false; // default: true

  const now = new Date();

  if (!requireApproval) {
    // Auto-approve: publish immediately
    const expirationDays = settings.expiration_days ?? 90;
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    const [updated] = await db
      .update(litterAds)
      .set({
        status: "active",
        published_at: now,
        expires_at: expiresAt,
        updated_at: now,
      })
      .where(eq(litterAds.id, adId))
      .returning();

    return c.json({ data: updated });
  }

  const [updated] = await db
    .update(litterAds)
    .set({ status: "submitted", updated_at: now })
    .where(eq(litterAds.id, adId))
    .returning();

  return c.json({ data: updated });
});

// ─── Breeder: delete draft or archived ───────────────────────────────────

adsRoutes.delete("/:id", async (c) => {
  const auth = requireBreeder(c.get("auth"));
  const db = c.get("db");
  const clubId = c.get("clubId");
  const adId = c.req.param("id");

  const ad = await db.query.litterAds.findFirst({
    where: and(eq(litterAds.id, adId), eq(litterAds.club_id, clubId)),
  });

  if (!ad) throw notFound("Ad");
  if (!auth.isAdmin && ad.member_id !== auth.memberId) throw forbidden();
  if (!["draft", "archived", "revision_requested"].includes(ad.status) && !auth.isAdmin) {
    throw badRequest("Only draft or archived ads can be deleted");
  }

  await db.delete(litterAds).where(eq(litterAds.id, adId));

  return c.json({ ok: true });
});

// ─── Admin: list all ads ──────────────────────────────────────────────────

adsRoutes.get("/admin/all", async (c) => {
  requireAdApprover(c.get("auth"));
  const db = c.get("db");
  const clubId = c.get("clubId");

  const statusFilter = c.req.query("status");

  const data = await db.query.litterAds.findMany({
    where: and(
      eq(litterAds.club_id, clubId),
      statusFilter ? eq(litterAds.status, statusFilter) : undefined
    ),
    with: {
      member: {
        columns: { id: true, tier: true },
        with: {
          contact: {
            columns: { full_name: true, kennel_name: true, state: true, country: true },
          },
        },
      },
    },
    orderBy: [desc(litterAds.created_at)],
  });

  return c.json({ data });
});

// ─── Admin: review (approve / reject / revision_requested) ────────────────

adsRoutes.post("/:id/review", async (c) => {
  const auth = requireAdApprover(c.get("auth"));
  const db = c.get("db");
  const clubId = c.get("clubId");
  const adId = c.req.param("id");

  const ad = await db.query.litterAds.findFirst({
    where: and(eq(litterAds.id, adId), eq(litterAds.club_id, clubId)),
    with: {
      member: {
        columns: { id: true },
        with: {
          contact: {
            columns: { full_name: true, kennel_name: true, state: true, country: true, website_url: true },
          },
        },
      },
    },
  });

  if (!ad) throw notFound("Ad");
  if (ad.status !== "submitted") throw badRequest("Only submitted ads can be reviewed");

  const body = await c.req.json();
  const { action, revision_notes } = reviewLitterAdSchema.parse(body);

  const now = new Date();

  if (action === "request_revision") {
    const [updated] = await db
      .update(litterAds)
      .set({ status: "revision_requested", revision_notes: revision_notes ?? null, updated_at: now })
      .where(eq(litterAds.id, adId))
      .returning();

    return c.json({ data: updated });
  }

  if (action === "reject") {
    const [updated] = await db
      .update(litterAds)
      .set({
        status: "archived",
        revision_notes: revision_notes ?? null,
        updated_at: now,
      })
      .where(eq(litterAds.id, adId))
      .returning();

    return c.json({ data: updated });
  }

  // approve → active
  const club = await db.query.clubs.findFirst({
    where: eq(clubs.id, clubId),
    columns: { settings: true },
  });
  const settings = getAdSettings((club?.settings ?? {}) as Record<string, unknown>);
  const expirationDays = settings.expiration_days ?? 90;
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + expirationDays);

  const [updated] = await db
    .update(litterAds)
    .set({
      status: "active",
      approved_by: auth.memberId,
      approved_at: now,
      published_at: now,
      expires_at: expiresAt,
      revision_notes: null,
      updated_at: now,
    })
    .where(eq(litterAds.id, adId))
    .returning();

  // Build PublicLitterAd for social posting
  const contact = ad.member?.contact;
  const publicAd: PublicLitterAd = {
    id: updated.id,
    title: updated.title,
    description: updated.description ?? null,
    image_url: updated.image_url ?? null,
    contact_url: updated.contact_url ?? contact?.website_url ?? "",
    kennel_name: contact?.kennel_name ?? null,
    breeder_name: contact?.full_name ?? null,
    state: contact?.state ?? null,
    country: contact?.country ?? null,
    published_at: updated.published_at!.toISOString(),
    expires_at: updated.expires_at!.toISOString(),
  };

  // Social cross-posting (fire-and-forget; log results)
  const socialSettings = getSocialSettings((club?.settings ?? {}) as Record<string, unknown>);
  const envAsRecord = c.env as unknown as Record<string, string | undefined>;
  const postResults = await postToAllPlatforms(publicAd, socialSettings, envAsRecord);

  // Persist social post log entries
  if (postResults.length > 0) {
    await db.insert(socialPostLog).values(
      postResults.map((r) => ({
        club_id: clubId,
        ad_id: updated.id,
        platform: r.platform,
        external_post_id: r.external_post_id,
        status: r.status,
        error_message: r.error_message,
        posted_at: r.posted_at ? new Date(r.posted_at) : null,
      }))
    );
  }

  return c.json({ data: updated, social_posts: postResults });
});

export { adsRoutes };
