/**
 * Member invitation routes.
 *
 * - POST /send          — send an invitation for an approved application (admin/approver)
 * - GET  /:token        — preview an invitation (public, no auth)
 * - POST /accept        — accept an invitation (requireAuth, no member record needed)
 * - GET  /              — list all invitations for this club (admin)
 * - DELETE /:id         — revoke a pending invitation (admin)
 */

import { Hono } from "hono";
import { eq, and, gt } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { requireAuth } from "../middleware/auth.js";
import { requireLevel, requirePermission } from "../middleware/rbac.js";
import { memberInvitations, membershipApplications, members, contacts, membershipTiers } from "../db/schema.js";
import { notFound, badRequest, conflict } from "../lib/errors.js";
import { sendEmail, invitationEmail, welcomeEmail } from "../lib/email.js";
import { z } from "zod";

type Variables = {
  clubId: string;
  club: { id: string; name: string; settings: Record<string, unknown> | null };
  db: Database;
  clerkUserId: string | null;
  auth: AuthContext | null;
};

const invitationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const sendInviteSchema = z.object({
  application_id: z.string().uuid(),
});

const directInviteSchema = z.object({
  email: z.string().email(),
  name: z.string().max(255).optional(),
  tier: z.enum(["non_member", "certificate", "member"]).default("member"),
});

/** Generate a URL-safe random token */
function generateToken(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
    .slice(0, 64);
}

/**
 * POST /send — send invitation from an approved/submitted application.
 * Requires member-approver permission.
 */
invitationRoutes.post("/send", requirePermission("members:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth")!;

  const body = await c.req.json();
  const { application_id } = sendInviteSchema.parse(body);

  // Look up application
  const application = await db.query.membershipApplications.findFirst({
    where: and(
      eq(membershipApplications.id, application_id),
      eq(membershipApplications.club_id, clubId)
    ),
  });

  if (!application) {
    throw notFound("Application");
  }

  if (application.status !== "submitted" && application.status !== "under_review") {
    throw badRequest(`Cannot invite for application with status "${application.status}"`);
  }

  const email = application.applicant_email;
  const now = new Date();

  // Check for existing active invitation
  const existingInvite = await db.query.memberInvitations.findFirst({
    where: and(
      eq(memberInvitations.club_id, clubId),
      eq(memberInvitations.email, email),
      eq(memberInvitations.status, "pending")
    ),
  });

  if (existingInvite && existingInvite.expires_at > now) {
    throw conflict("An active invitation already exists for this email");
  }

  const token = generateToken();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [invitation] = await db
    .insert(memberInvitations)
    .values({
      club_id: clubId,
      token,
      email,
      tier: "member",
      invited_by: auth.memberId,
      application_id,
      status: "pending",
      expires_at: expiresAt,
    })
    .returning();

  const appUrl = c.env.APP_URL;
  const inviteUrl = `${appUrl}/accept-invitation?token=${token}`;

  // Get club info for the email
  const club = c.get("club");
  const clubName = club.name;

  // Send branded invitation email via Resend
  c.executionCtx.waitUntil(
    sendEmail(
      {
        to: email,
        subject: `You're invited to join ${clubName}`,
        html: invitationEmail({
          inviteeName: application.applicant_name,
          inviteUrl,
          clubName,
          tier: "member",
        }),
      },
      c.env.RESEND_API_KEY,
      c.env.EMAIL_FROM
    ).catch((err) => console.warn("Resend invitation email error:", err))
  );

  return c.json({ invitation }, 201);
});

/**
 * POST /direct — send a direct invitation by email (no application required).
 * Admin only.
 */
invitationRoutes.post("/direct", requirePermission("members:approve"), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const auth = c.get("auth")!;

  const body = await c.req.json();
  const { email, name, tier } = directInviteSchema.parse(body);

  const now = new Date();

  // Check for existing active invitation
  const existingInvite = await db.query.memberInvitations.findFirst({
    where: and(
      eq(memberInvitations.club_id, clubId),
      eq(memberInvitations.email, email),
      eq(memberInvitations.status, "pending"),
      gt(memberInvitations.expires_at, now)
    ),
  });

  if (existingInvite) {
    throw conflict("An active invitation already exists for this email");
  }

  const token = generateToken();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [invitation] = await db
    .insert(memberInvitations)
    .values({
      club_id: clubId,
      token,
      email,
      tier,
      invited_by: auth.memberId,
      status: "pending",
      expires_at: expiresAt,
    })
    .returning();

  const appUrl = c.env.APP_URL;
  const inviteUrl = `${appUrl}/accept-invitation?token=${token}`;
  const club = c.get("club");

  c.executionCtx.waitUntil(
    sendEmail(
      {
        to: email,
        subject: `You're invited to join ${club.name}`,
        html: invitationEmail({
          inviteeName: name,
          inviteUrl,
          clubName: club.name,
          tier,
        }),
      },
      c.env.RESEND_API_KEY,
      c.env.EMAIL_FROM
    ).catch((err) => console.warn("Resend invitation email error:", err))
  );

  return c.json({ invitation }, 201);
});

/**
 * GET /:token — public preview of an invitation.
 * Used by the landing page to show invite details before sign-in.
 */
invitationRoutes.get("/:token", async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const token = c.req.param("token");

  const invitation = await db.query.memberInvitations.findFirst({
    where: and(
      eq(memberInvitations.token, token),
      eq(memberInvitations.club_id, clubId)
    ),
    with: { club: true },
  });

  if (!invitation) {
    throw notFound("Invitation");
  }

  return c.json({
    invitation: {
      email: invitation.email,
      tier: invitation.tier,
      expires_at: invitation.expires_at,
      status: invitation.status,
      club_name: invitation.club?.name ?? "",
    },
  });
});

/**
 * POST /accept — accept an invitation.
 * Requires Clerk auth but NOT an existing member record.
 */
invitationRoutes.post("/accept", requireAuth, async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const clerkUserId = c.get("clerkUserId")!;

  const body = await c.req.json();
  const { token } = z.object({ token: z.string().min(1) }).parse(body);

  const now = new Date();

  const invitation = await db.query.memberInvitations.findFirst({
    where: and(
      eq(memberInvitations.token, token),
      eq(memberInvitations.club_id, clubId)
    ),
    with: { club: true },
  });

  if (!invitation) {
    throw notFound("Invitation");
  }

  if (invitation.status !== "pending") {
    throw badRequest(`This invitation has already been ${invitation.status}`);
  }

  if (invitation.expires_at <= now) {
    throw badRequest("This invitation has expired");
  }

  // Fetch Clerk user profile to get name/email
  const clerkRes = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
    headers: { Authorization: `Bearer ${c.env.CLERK_SECRET_KEY}` },
  });

  let clerkName = "";
  let clerkEmail = invitation.email;

  if (clerkRes.ok) {
    const clerkUser = await clerkRes.json() as {
      first_name?: string;
      last_name?: string;
      email_addresses?: { email_address: string }[];
    };
    const parts = [clerkUser.first_name, clerkUser.last_name].filter(Boolean);
    clerkName = parts.join(" ");
    clerkEmail = clerkUser.email_addresses?.[0]?.email_address ?? invitation.email;
  }

  // Check if member record already exists for this Clerk user
  const existingMember = await db.query.members.findFirst({
    where: and(eq(members.club_id, clubId), eq(members.clerk_user_id, clerkUserId)),
    with: { contact: true },
  });

  let memberId: string;

  if (existingMember) {
    // Upgrade tier if invitation tier is higher — look up levels from membership_tiers table
    const tierRows = await db.query.membershipTiers.findMany({
      where: eq(membershipTiers.club_id, clubId),
      columns: { slug: true, level: true },
    });
    const tierLevelMap = new Map(tierRows.map((t) => [t.slug, t.level]));

    const currentLevel = tierLevelMap.get(existingMember.tier) ?? 0;
    const inviteLevel = tierLevelMap.get(invitation.tier) ?? 0;

    if (inviteLevel > currentLevel) {
      await db
        .update(members)
        .set({ tier: invitation.tier, membership_status: "active", updated_at: new Date() })
        .where(eq(members.id, existingMember.id));
    }

    memberId = existingMember.id;
  } else {
    // Check for existing contact by email that isn't linked to a member yet
    let contact;
    const existingContact = await db.query.contacts.findFirst({
      where: and(eq(contacts.club_id, clubId), eq(contacts.email, clerkEmail)),
    });

    if (existingContact && !existingContact.member_id) {
      // Reuse existing unlinked contact (e.g. created via sell-pup)
      contact = existingContact;
      const displayName = clerkName || clerkEmail;
      if (displayName !== existingContact.full_name) {
        await db
          .update(contacts)
          .set({ full_name: displayName, updated_at: new Date() })
          .where(eq(contacts.id, existingContact.id));
      }
    } else {
      // Create new contact
      [contact] = await db
        .insert(contacts)
        .values({
          club_id: clubId,
          full_name: clerkName || clerkEmail,
          email: clerkEmail,
        })
        .returning();
    }

    const [member] = await db
      .insert(members)
      .values({
        club_id: clubId,
        clerk_user_id: clerkUserId,
        contact_id: contact!.id,
        tier: invitation.tier,
        membership_status: "active",
      })
      .returning();

    await db
      .update(contacts)
      .set({ member_id: member!.id, updated_at: new Date() })
      .where(eq(contacts.id, contact!.id));

    memberId = member!.id;
  }

  // Mark invitation accepted
  await db
    .update(memberInvitations)
    .set({ status: "accepted", accepted_at: now, accepted_by: memberId })
    .where(eq(memberInvitations.id, invitation.id));

  // Send welcome email
  const clubName = invitation.club?.name ?? "the club";
  const appUrl = c.env.APP_URL;
  c.executionCtx.waitUntil(
    sendEmail(
      {
        to: clerkEmail,
        subject: `Welcome to ${clubName}!`,
        html: welcomeEmail({
          memberName: clerkName || clerkEmail,
          tier: invitation.tier,
          dashboardUrl: `${appUrl}/dashboard`,
          clubName,
      }),
    },
    c.env.RESEND_API_KEY,
    c.env.EMAIL_FROM
  ).catch((err) => console.warn("Resend welcome email error:", err))
  );

  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
    with: { contact: true },
  });

  return c.json({ member });
});

/**
 * GET / — list all invitations for this club (admin only).
 */
invitationRoutes.get("/", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");

  const data = await db.query.memberInvitations.findMany({
    where: eq(memberInvitations.club_id, clubId),
    orderBy: (t, { desc }) => [desc(t.created_at)],
  });

  return c.json({ data });
});

/**
 * DELETE /:id — revoke a pending invitation (admin only).
 */
invitationRoutes.delete("/:id", requireLevel(100), async (c) => {
  const db = c.get("db");
  const clubId = c.get("clubId");
  const id = c.req.param("id");

  const invitation = await db.query.memberInvitations.findFirst({
    where: and(eq(memberInvitations.id, id), eq(memberInvitations.club_id, clubId)),
  });

  if (!invitation) {
    throw notFound("Invitation");
  }

  if (invitation.status !== "pending") {
    throw badRequest("Only pending invitations can be revoked");
  }

  await db
    .update(memberInvitations)
    .set({ status: "revoked" })
    .where(eq(memberInvitations.id, id));

  return c.json({ success: true });
});

export { invitationRoutes };
