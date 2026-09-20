import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import app from "../index.js";
import {
  clubs,
  contacts,
  dogs,
  healthConditions,
  members,
  membershipApplications,
} from "../db/schema.js";
import { getTestDb, TEST_DATABASE_URL } from "../test/db.js";
import { hasDb } from "../test/setup.js";

/**
 * Regression tests for the three PII IDOR holes (plan §5, T5):
 *
 *  - `GET /api/applications/:id`        — any signed-in user read any applicant's PII
 *  - `GET /api/health/dogs/:id/conditions` — no auth at all; leaked unapproved diagnoses
 *  - `GET /api/members/directory`       — returned whole member rows (auth internals)
 *
 * These run through the real Hono app, because the defect is in the
 * middleware/handler wiring and only a real request exercises it. That rules
 * out `withRollback`: `clubContext` opens its own connection, so nothing an
 * outer transaction wrote is visible to the handler (same constraint as
 * `payments.int.test.ts`). Fixtures are therefore committed and torn down
 * explicitly.
 *
 * Auth is real too: Clerk verifies RS256 tokens offline when `CLERK_JWT_KEY`
 * holds the PEM public key, so the suite mints its own keypair and signs
 * session tokens locally. No network, no Clerk account.
 */

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const env = {
  DATABASE_URL: TEST_DATABASE_URL,
  CLUB_SLUG: "",
  CLERK_SECRET_KEY: "sk_test_offline",
  CLERK_JWT_KEY: publicKey,
};

/** Signs a Clerk-shaped session token for `clerkUserId`. */
function token(clerkUserId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: "local" })
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: clerkUserId, iat: now - 5, nbf: now - 5, exp: now + 300 })
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
}

function get(path: string, clerkUserId?: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: clerkUserId ? { Authorization: `Bearer ${token(clerkUserId)}` } : {},
  });
}

describe.skipIf(!hasDb)("PII IDOR guards", () => {
  const db = getTestDb();
  const nonce = randomUUID().slice(0, 8);
  const slug = `idor-${nonce}`;

  const ownerUser = `user_owner_${nonce}`;
  const strangerUser = `user_stranger_${nonce}`;
  const approverUser = `user_approver_${nonce}`;

  let clubId: string;
  let dogId: string;
  let applicationId: string;
  const applicantEmail = `applicant-${nonce}@example.test`;

  beforeAll(async () => {
    env.CLUB_SLUG = slug;

    const [club] = await db
      .insert(clubs)
      .values({ name: `IDOR Club ${nonce}`, slug, breed_name: "Test Breed" })
      .returning();
    clubId = club.id;

    const [ownerContact, strangerContact, approverContact] = await db
      .insert(contacts)
      .values([
        {
          club_id: clubId,
          full_name: `Breeder Owner ${nonce}`,
          kennel_name: `Kennel ${nonce}`,
          email: `owner-${nonce}@example.test`,
          phone: "555-0100",
          city: "Testville",
          state: "TS",
          country: "US",
          website_url: "https://kennel.example.test",
        },
        { club_id: clubId, full_name: `Stranger ${nonce}` },
        { club_id: clubId, full_name: `Approver ${nonce}` },
      ])
      .returning();

    await db.insert(members).values([
      {
        // Every auth-internal flag is deliberately true: if /directory ever
        // stops projecting columns, the leak is loud rather than subtle.
        club_id: clubId,
        clerk_user_id: ownerUser,
        contact_id: ownerContact.id,
        tier: "member",
        membership_status: "active",
        is_breeder: true,
        show_in_directory: true,
        skip_fees: true,
        can_approve_members: true,
        can_approve_clearances: false,
        can_manage_registry: true,
        can_approve_ads: true,
        logo_url: "logos/owner.png",
        primary_color: "#123456",
        accent_color: "#654321",
        pup_status: "available",
      },
      {
        club_id: clubId,
        clerk_user_id: strangerUser,
        contact_id: strangerContact.id,
        tier: "member",
        membership_status: "active",
      },
      {
        club_id: clubId,
        clerk_user_id: approverUser,
        contact_id: approverContact.id,
        tier: "admin",
        membership_status: "active",
        is_admin: true,
        can_approve_members: true,
        can_approve_clearances: true,
      },
    ]);

    const [dog] = await db
      .insert(dogs)
      .values({
        club_id: clubId,
        registered_name: `IDOR Dog ${nonce}`,
        owner_id: ownerContact.id,
        status: "approved",
      })
      .returning();
    dogId = dog.id;

    await db.insert(healthConditions).values([
      {
        dog_id: dogId,
        condition_name: "Approved Condition",
        status: "approved",
        notes: "public-note",
      },
      {
        dog_id: dogId,
        condition_name: "Pending Condition",
        status: "pending",
        medical_severity: "severe",
        breeding_impact: "disqualifying",
        notes: "unverified-private-note",
      },
    ]);

    const [application] = await db
      .insert(membershipApplications)
      .values({
        club_id: clubId,
        applicant_email: applicantEmail,
        applicant_name: `Applicant ${nonce}`,
        applicant_phone: "555-0199",
        applicant_address: "1 Secret Lane",
        membership_type: "individual",
        status: "submitted",
      })
      .returning();
    applicationId = application.id;
  });

  afterAll(async () => {
    if (!clubId) return;
    await db.delete(healthConditions).where(eq(healthConditions.dog_id, dogId));
    await db.delete(membershipApplications).where(eq(membershipApplications.club_id, clubId));
    await db.delete(dogs).where(eq(dogs.club_id, clubId));
    await db.delete(members).where(eq(members.club_id, clubId));
    await db.delete(contacts).where(eq(contacts.club_id, clubId));
    await db.delete(clubs).where(eq(clubs.id, clubId));
  });

  describe("GET /api/applications/:id", () => {
    it("refuses an anonymous caller", async () => {
      const res = await app.fetch(get(`/api/applications/${applicationId}`), env);
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain(applicantEmail);
    });

    it("refuses a signed-in member who cannot approve members", async () => {
      // The whole point of the finding: self-registration is open, so "signed
      // in" is not an authorization signal.
      const res = await app.fetch(get(`/api/applications/${applicationId}`, strangerUser), env);
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain(applicantEmail);
    });

    it("still serves the reviewer who actually uses the endpoint", async () => {
      const res = await app.fetch(get(`/api/applications/${applicationId}`, approverUser), env);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { application: { applicant_email: string } };
      expect(body.application.applicant_email).toBe(applicantEmail);
    });
  });

  describe("GET /api/health/dogs/:dog_id/conditions", () => {
    it("refuses an anonymous caller", async () => {
      const res = await app.fetch(get(`/api/health/dogs/${dogId}/conditions`), env);
      expect(res.status).toBe(401);
      expect(await res.text()).not.toContain("unverified-private-note");
    });

    it("hides unapproved conditions from a member who does not own the dog", async () => {
      const res = await app.fetch(
        get(`/api/health/dogs/${dogId}/conditions`, strangerUser),
        env
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { conditions: { condition_name: string; status: string }[] };
      expect(body.conditions.map((row) => row.condition_name)).toEqual(["Approved Condition"]);
      expect(body.conditions.every((row) => row.status === "approved")).toBe(true);
    });

    it("shows unapproved conditions to the dog's owner", async () => {
      const res = await app.fetch(get(`/api/health/dogs/${dogId}/conditions`, ownerUser), env);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { conditions: { condition_name: string }[] };
      expect(body.conditions.map((row) => row.condition_name).sort()).toEqual([
        "Approved Condition",
        "Pending Condition",
      ]);
    });

    it("shows unapproved conditions to a clearance approver", async () => {
      const res = await app.fetch(get(`/api/health/dogs/${dogId}/conditions`, approverUser), env);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { conditions: unknown[] };
      expect(body.conditions).toHaveLength(2);
    });
  });

  describe("GET /api/members/directory", () => {
    const FORBIDDEN_KEYS = [
      "clerk_user_id",
      "is_admin",
      "skip_fees",
      "can_approve_members",
      "can_approve_clearances",
      "can_manage_registry",
      "can_approve_ads",
    ];

    it("stays public but never ships auth internals", async () => {
      const res = await app.fetch(get("/api/members/directory"), env);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        data: Record<string, unknown>[];
      };
      expect(body.data).toHaveLength(1);

      const [row] = body.data;
      for (const key of FORBIDDEN_KEYS) {
        expect(Object.keys(row)).not.toContain(key);
      }
      // The nested relation is projected too — no whole `contacts` row.
      expect(Object.keys(row.contact as Record<string, unknown>)).not.toContain("member_id");

      // The fields the directory UI renders survive the allow-list.
      expect(row).toMatchObject({
        logo_url: "logos/owner.png",
        primary_color: "#123456",
        accent_color: "#654321",
        pup_status: "available",
        contact: {
          kennel_name: `Kennel ${nonce}`,
          city: "Testville",
          state: "TS",
          website_url: "https://kennel.example.test",
        },
      });
    });
  });
});
