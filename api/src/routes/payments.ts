import { Hono } from "hono";
import Stripe from "stripe";
import { eq, and, ne, ilike } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { ApiError } from "../lib/errors.js";
import { payments, dogs, dogMicrochips, dogHealthClearances, clubs, dogRegistrations, members } from "../db/schema.js";
import { createPaymentSessionSchema, paymentMetadataSchema } from "@breed-club/shared";
import { requireAuth } from "../middleware/auth.js";
import { scheduleBackground } from "../lib/background.js";
import { buildClearanceRow } from "../lib/clearances.js";
import { memberOwnsDog } from "../lib/ownership.js";
import { recomputeHealthRating } from "../lib/rating.js";

type Variables = {
  clubId: string;
  db: Database;
  clerkUserId: string | null;
  auth: AuthContext | null;
};

const paymentRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * POST /api/payments/create-session
 * Create a Stripe Checkout Session for a payment.
 *
 * Flow:
 * 1. Frontend submits resource type (dog_create or clearance_submit) + resource metadata
 * 2. Backend checks club fee config
 * 3. If fee is $0 for user's tier, returns { skipPayment: true }
 * 4. If fee > $0, creates payment record + Stripe Checkout Session, returns URL
 * 5. Frontend redirects to Stripe
 * 6. After payment, Stripe webhook completes the flow
 */
paymentRoutes.post("/create-session", requireAuth, async (c) => {
  const db = c.get("db");
  const auth = c.get("auth");
  const clubId = c.get("clubId");

  if (!auth) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
  }

  const body = await c.req.json();
  const { metadata, success_url, cancel_url } = createPaymentSessionSchema.parse(body);
  // The discriminant comes from the parsed, closed metadata — never from a
  // free-form client field, and never from Stripe's echo of one.
  const resource_type = metadata.resource_type;

  // Get club to read fee configuration
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!club) {
    throw new ApiError(404, "NOT_FOUND", "Club not found");
  }

  const feeConfig = club.settings as any;
  const fees = feeConfig?.fees || {};

  // Determine fee based on resource type and member tier
  let amountCents = 0;
  let description = "";

  if (resource_type === "dog_create") {
    const tierFees = fees.create_dog || { non_member: 1500, member: 500 };
    amountCents = auth.member?.skip_fees
      ? 0
      : auth.tierLevel >= 20
      ? tierFees.member || 500
      : tierFees.non_member || 1500;
    description = "Dog Registration Fee";
  } else if (resource_type === "clearance_submit") {
    const tierFees = fees.add_clearance || { non_member: 500, member: 0 };
    amountCents = auth.member?.skip_fees
      ? 0
      : auth.tierLevel >= 20
      ? tierFees.member || 0
      : tierFees.non_member || 500;
    description = "Health Clearance Submission Fee";
  } else if (resource_type === "clearance_batch_submit") {
    const tierFees = fees.add_clearance || { non_member: 500, member: 0 };
    const perClearance = auth.member?.skip_fees
      ? 0
      : auth.tierLevel >= 20
      ? tierFees.member || 0
      : tierFees.non_member || 500;
    const count = metadata.resource_type === "clearance_batch_submit" ? metadata.clearances.length : 1;
    amountCents = perClearance * count;
    description = `Health Clearance Submission Fee (${count} test${count > 1 ? "s" : ""})`;
  } else {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid resource type");
  }

  // If fee is $0, skip Stripe
  if (amountCents === 0) {
    return c.json({ skipPayment: true, amountCents: 0 });
  }

  // Create payment record in pending state
  const [payment] = await db
    .insert(payments)
    .values({
      club_id: clubId,
      member_id: auth.memberId,
      amount_cents: amountCents,
      currency: "usd",
      description,
      status: "pending",
      metadata,
    })
    .returning();

  if (!payment) {
    throw new ApiError(500, "DATABASE_ERROR", "Failed to create payment record");
  }

  // Create Stripe Checkout Session
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-02-24.acacia",
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: description,
            description: `${club.name} - ${description}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${success_url}?session_id={CHECKOUT_SESSION_ID}&payment_id=${payment.id}`,
    cancel_url: cancel_url,
    client_reference_id: payment.id, // Link back to our payment record
    // Stripe metadata carries the DB key and nothing else. Everything the
    // webhook acts on is re-read from the `payments` row, so a tampered
    // Checkout Session cannot change what gets created.
    metadata: { payment_id: payment.id },
  });

  // Update payment record with Stripe session ID
  await db
    .update(payments)
    .set({ stripe_payment_intent_id: session.id })
    .where(eq(payments.id, payment.id));

  return c.json({
    skipPayment: false,
    sessionUrl: session.url,
    sessionId: session.id,
    paymentId: payment.id,
    amountCents,
  });
});

/**
 * POST /api/payments/webhook
 * Stripe webhook handler.
 *
 * Processes checkout.session.completed events.
 * On success: marks payment as completed, creates the resource (dog or clearance).
 */
paymentRoutes.post("/webhook", async (c) => {
  const db = c.get("db");
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-02-24.acacia",
  });

  const signature = c.req.header("stripe-signature");
  if (!signature) {
    throw new ApiError(400, "VALIDATION_ERROR", "Missing Stripe signature");
  }

  const body = await c.req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, c.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    throw new ApiError(400, "VALIDATION_ERROR", `Webhook error: ${err.message}`);
  }

  // Handle checkout.session.completed
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = session.client_reference_id || session.metadata?.payment_id;

    if (!paymentId) {
      console.error("No payment_id in webhook session:", session.id);
      return c.json({ received: true });
    }

    // Claim the payment atomically. Stripe delivers at-least-once, so this
    // conditional UPDATE is the only thing preventing a retry from creating a
    // second dog or a duplicate set of clearances.
    const [payment] = await db
      .update(payments)
      .set({
        status: "completed",
        stripe_payment_intent_id: session.payment_intent as string,
      })
      .where(and(eq(payments.id, paymentId), ne(payments.status, "completed")))
      .returning();

    if (!payment) {
      // Either no such payment, or it was already processed by an earlier
      // delivery of this same event. Both are no-ops.
      console.log("Webhook ignored — payment missing or already completed:", paymentId);
      return c.json({ received: true });
    }

    // Re-validate what we stored. `resource_type` comes from OUR row, never
    // from `session.metadata`, which the client controls end to end.
    const parsedMetadata = paymentMetadataSchema.safeParse(payment.metadata);
    if (!parsedMetadata.success) {
      console.error("Payment metadata failed validation:", payment.id, parsedMetadata.error.issues);
      return c.json({ received: true });
    }
    const meta = parsedMetadata.data;

    if (meta.resource_type === "dog_create") {
      const dogData = meta;

      // Auto-fill color/coat_type from breed settings if single option configured
      const [club] = await db.select().from(clubs).where(eq(clubs.id, payment.club_id)).limit(1);
      const clubSettings = (club?.settings ?? {}) as Record<string, unknown>;
      const breedColors: string[] = (clubSettings.breed_colors as string[]) || [];
      const breedCoatTypes: string[] = (clubSettings.breed_coat_types as string[]) || [];

      let color = dogData.color || null;
      let coat_type = dogData.coat_type || null;
      if (breedColors.length === 1 && !color) color = breedColors[0];
      if (breedCoatTypes.length === 1 && !coat_type) coat_type = breedCoatTypes[0];

      // Skip creation if a dog with the same name already exists (e.g. user submitted via form AND paid)
      const existingDog = await db.query.dogs.findFirst({
        where: and(
          eq(dogs.club_id, payment.club_id),
          ilike(dogs.registered_name, dogData.registered_name),
        ),
        columns: { id: true },
      });

      if (existingDog) {
        console.log(`Dog "${dogData.registered_name}" already exists (${existingDog.id}), skipping creation from payment`);
      } else {

      const [dog] = await db
        .insert(dogs)
        .values({
          club_id: payment.club_id,
          registered_name: dogData.registered_name,
          call_name: dogData.call_name || null,
          sex: dogData.sex || null,
          date_of_birth: dogData.date_of_birth || null,
          color,
          coat_type,
          // `parentRefSchema` also permits `{ registered_name }`, which this
          // path cannot resolve to an id (the unpaid path uses resolveRef).
          // Only a real UUID may reach a uuid column.
          sire_id: typeof dogData.sire_id === "string" ? dogData.sire_id : null,
          dam_id: typeof dogData.dam_id === "string" ? dogData.dam_id : null,
          owner_id: dogData.owner_id || null,
          breeder_id: dogData.breeder_id || null,
          photo_url: dogData.photo_url || null,
          is_public: dogData.is_public || false,
          status: "pending", // Still requires approval
          submitted_by: payment.member_id,
        })
        .returning();

      // Create inline microchips if provided
      if (dogData.microchips && dogData.microchips.length > 0) {
        await db.insert(dogMicrochips).values(
          dogData.microchips.map((chip) => ({
            dog_id: dog!.id,
            microchip_number: chip,
          }))
        );
      }

      // Create inline registrations if provided
      if (dogData.registrations && dogData.registrations.length > 0) {
        await db.insert(dogRegistrations).values(
          dogData.registrations.map((reg: any) => ({
            dog_id: dog!.id,
            organization_id: reg.organization_id,
            registration_number: reg.registration_number,
            registration_url: reg.registration_url || null,
          }))
        );
      }

      console.log(`Dog created after payment: ${dogData.registered_name}`);
      } // end else (no existing dog)
    } else if (meta.resource_type === "clearance_submit" || meta.resource_type === "clearance_batch_submit") {
      // Ownership is re-checked HERE, not just at the 402 that produced this
      // metadata. The client relays that metadata back to /create-session and
      // could name any dog in any club, so the direct path's checks
      // (health.ts) must be repeated against the payment's own club/member.
      const [dog] = await db
        .select({ id: dogs.id, owner_id: dogs.owner_id, submitted_by: dogs.submitted_by })
        .from(dogs)
        .where(and(eq(dogs.id, meta.dog_id), eq(dogs.club_id, payment.club_id)))
        .limit(1);

      const [member] = await db
        .select({
          contact_id: members.contact_id,
          is_admin: members.is_admin,
          can_approve_clearances: members.can_approve_clearances,
        })
        .from(members)
        .where(eq(members.id, payment.member_id))
        .limit(1);

      const [club] = await db.select().from(clubs).where(eq(clubs.id, payment.club_id)).limit(1);

      if (!dog || !member || !memberOwnsDog(member, dog, (club?.settings ?? {}) as Record<string, unknown>)) {
        // Paid for something they may not attach. Do not create it, and do not
        // 500 at Stripe — a retry storm cannot fix an authorization failure.
        console.error(
          `Clearance payment ${payment.id} rejected: member ${payment.member_id} may not attach to dog ${meta.dog_id}`
        );
        return c.json({ received: true });
      }

      const items =
        meta.resource_type === "clearance_batch_submit"
          ? meta.clearances
          : [meta];
      const sharedCertUrl = meta.certificate_url ?? null;

      for (const item of items) {
        await db.insert(dogHealthClearances).values(
          await buildClearanceRow(db, {
            dogId: meta.dog_id,
            item,
            certificateUrl: sharedCertUrl,
            submittedBy: payment.member_id,
          })
        );
      }

      scheduleBackground(c, recomputeHealthRating(db, meta.dog_id), "recomputeHealthRating");
    }

    console.log(`Payment completed: ${payment.id}, amount: ${payment.amount_cents}¢`);
  }

  return c.json({ received: true });
});

/**
 * GET /api/payments/verify/:payment_id
 * Verify payment status after redirect from Stripe.
 * This allows the frontend to confirm payment succeeded before proceeding.
 */
paymentRoutes.get("/verify/:payment_id", requireAuth, async (c) => {
  const db = c.get("db");
  const auth = c.get("auth");
  const clubId = c.get("clubId");

  if (!auth) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
  }

  const paymentId = c.req.param("payment_id");

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.club_id, clubId)))
    .limit(1);

  if (!payment) {
    throw new ApiError(404, "NOT_FOUND", "Payment not found");
  }

  // Only allow member to view their own payment
  if (payment.member_id !== auth.memberId && auth.tierLevel < 100) {
    throw new ApiError(403, "FORBIDDEN", "Access denied");
  }

  return c.json({
    id: payment.id,
    status: payment.status,
    amount_cents: payment.amount_cents,
    currency: payment.currency,
    description: payment.description,
    created_at: payment.created_at,
  });
});

export { paymentRoutes };
