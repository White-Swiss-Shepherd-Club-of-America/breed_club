import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../index.js";
import {
  clubs,
  contacts,
  dogHealthClearances,
  dogs,
  healthTestTypes,
  members,
  organizations,
  payments,
} from "../db/schema.js";
import { getTestDb, TEST_DATABASE_URL } from "../test/db.js";
import { hasDb } from "../test/setup.js";

/**
 * End-to-end webhook tests.
 *
 * These cannot use `withRollback`: the handler runs inside the real Hono app,
 * whose `clubContext` middleware opens its own connection, so nothing the
 * request writes is visible to an outer transaction. Fixtures are therefore
 * committed and torn down explicitly.
 */

const WEBHOOK_SECRET = "whsec_test_secret";

const env = {
  DATABASE_URL: TEST_DATABASE_URL,
  CLUB_SLUG: "",
  STRIPE_SECRET_KEY: "sk_test_not_used_offline",
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  CLERK_SECRET_KEY: "sk_test_clerk",
};

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" });

/** Signs a `checkout.session.completed` event the way Stripe would. */
function signedRequest(paymentId: string) {
  const payload = JSON.stringify({
    id: `evt_${randomUUID()}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_${randomUUID()}`,
        object: "checkout.session",
        client_reference_id: paymentId,
        payment_intent: `pi_test_${randomUUID()}`,
        // Deliberately hostile: the client controls Checkout metadata, so the
        // handler must ignore every field here except nothing at all.
        metadata: { payment_id: paymentId, resource_type: "dog_create" },
      },
    },
  });

  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });

  return new Request("http://localhost/api/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
}

describe.skipIf(!hasDb)("POST /api/payments/webhook", () => {
  const db = getTestDb();
  const nonce = randomUUID().slice(0, 8);
  const slug = `wh-${nonce}`;

  let clubId: string;
  let ownerMemberId: string;
  let strangerMemberId: string;
  let dogId: string;
  let testTypeId: string;
  let orgId: string;
  const paymentIds: string[] = [];

  beforeAll(async () => {
    env.CLUB_SLUG = slug;

    const [club] = await db
      .insert(clubs)
      .values({ name: `Webhook Club ${nonce}`, slug, breed_name: "Test Breed" })
      .returning();
    clubId = club.id;

    const [ownerContact, strangerContact] = await db
      .insert(contacts)
      .values([
        { club_id: clubId, full_name: `Owner ${nonce}` },
        { club_id: clubId, full_name: `Stranger ${nonce}` },
      ])
      .returning();

    const [owner, stranger] = await db
      .insert(members)
      .values([
        { club_id: clubId, clerk_user_id: `user_owner_${nonce}`, contact_id: ownerContact.id },
        { club_id: clubId, clerk_user_id: `user_stranger_${nonce}`, contact_id: strangerContact.id },
      ])
      .returning();
    ownerMemberId = owner.id;
    strangerMemberId = stranger.id;

    const [dog] = await db
      .insert(dogs)
      .values({
        club_id: clubId,
        registered_name: `Webhook Dog ${nonce}`,
        owner_id: ownerContact.id,
        status: "approved",
      })
      .returning();
    dogId = dog.id;

    const [org] = await db
      .insert(organizations)
      .values({ club_id: clubId, name: `Org ${nonce}`, type: "registry" })
      .returning();
    orgId = org.id;

    const [testType] = await db
      .insert(healthTestTypes)
      .values({
        club_id: clubId,
        name: `Test ${nonce}`,
        short_name: `T${nonce.slice(0, 4)}`,
        category: "orthopedic",
        result_options: ["Good", "Fair"],
      })
      .returning();
    testTypeId = testType.id;
  });

  afterAll(async () => {
    if (!clubId) return;
    await db.delete(dogHealthClearances).where(eq(dogHealthClearances.dog_id, dogId));
    if (paymentIds.length > 0) {
      await db.delete(payments).where(inArray(payments.id, paymentIds));
    }
    await db.delete(dogs).where(eq(dogs.club_id, clubId));
    await db.delete(healthTestTypes).where(eq(healthTestTypes.id, testTypeId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(members).where(eq(members.club_id, clubId));
    await db.delete(contacts).where(eq(contacts.club_id, clubId));
    await db.delete(clubs).where(eq(clubs.id, clubId));
  });

  // `idx_clearances_dog_test_org_date` makes (dog, type, org, date, prelim)
  // unique, so each scenario needs its own date to stay independent.
  async function seedClearancePayment(memberId: string, testDate: string) {
    const [payment] = await db
      .insert(payments)
      .values({
        club_id: clubId,
        member_id: memberId,
        amount_cents: 500,
        description: "Health Clearance Submission Fee",
        status: "pending",
        metadata: {
          resource_type: "clearance_submit",
          dog_id: dogId,
          health_test_type_id: testTypeId,
          organization_id: orgId,
          result: "Good",
          test_date: testDate,
        },
      })
      .returning();
    paymentIds.push(payment.id);
    return payment.id;
  }

  function clearancesFor(paymentMemberId: string) {
    return db
      .select()
      .from(dogHealthClearances)
      .where(
        and(
          eq(dogHealthClearances.dog_id, dogId),
          eq(dogHealthClearances.submitted_by, paymentMemberId)
        )
      );
  }

  it("creates the clearance exactly once when Stripe redelivers the same event", async () => {
    const paymentId = await seedClearancePayment(ownerMemberId, "2026-01-15");

    const first = await app.fetch(signedRequest(paymentId), env);
    expect(first.status).toBe(200);
    expect(await clearancesFor(ownerMemberId)).toHaveLength(1);

    // Stripe guarantees at-least-once delivery; a replay must be a no-op.
    const replay = await app.fetch(signedRequest(paymentId), env);
    expect(replay.status).toBe(200);
    expect(await clearancesFor(ownerMemberId)).toHaveLength(1);
  });

  it("ignores the resource_type the client put in Stripe metadata", async () => {
    // The signed session claims `resource_type: "dog_create"`, but the payment
    // row says `clearance_submit`. No dog may be created from a 500¢ clearance
    // payment — that was the fee bypass.
    const dogsBefore = await db.select().from(dogs).where(eq(dogs.club_id, clubId));
    const paymentId = await seedClearancePayment(ownerMemberId, "2026-02-15");

    const res = await app.fetch(signedRequest(paymentId), env);
    expect(res.status).toBe(200);

    const dogsAfter = await db.select().from(dogs).where(eq(dogs.club_id, clubId));
    expect(dogsAfter).toHaveLength(dogsBefore.length);
  });

  it("refuses to attach a clearance to a dog the payer does not own", async () => {
    const paymentId = await seedClearancePayment(strangerMemberId, "2026-03-15");

    const res = await app.fetch(signedRequest(paymentId), env);
    // Never 5xx at Stripe — a retry storm cannot fix an authorization failure.
    expect(res.status).toBe(200);
    expect(await clearancesFor(strangerMemberId)).toHaveLength(0);
  });
});
