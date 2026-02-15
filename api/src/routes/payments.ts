import { Hono } from "hono";
import Stripe from "stripe";
import { eq, and } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { ApiError } from "../lib/errors.js";
import { payments, dogs, dogHealthClearances, clubs, dogRegistrations } from "../db/schema.js";
import { createPaymentSessionSchema } from "@breed-club/shared";
import { requireAuth } from "../middleware/auth.js";

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
    throw new ApiError("UNAUTHORIZED", "Authentication required", 401);
  }

  const body = await c.req.json();
  const validatedBody = createPaymentSessionSchema.parse(body);
  const { resource_type, metadata, success_url, cancel_url } = validatedBody;

  // Get club to read fee configuration
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!club) {
    throw new ApiError("NOT_FOUND", "Club not found", 404);
  }

  const feeConfig = club.settings as any;
  const fees = feeConfig?.fees || {};

  // Determine fee based on resource type and member tier
  let amountCents = 0;
  let description = "";

  if (resource_type === "dog_create") {
    const tierFees = fees.create_dog || { certificate: 1500, member: 500 };
    // Check for fee bypass
    amountCents = auth.member?.skip_fees
      ? 0
      : auth.tier === "member" || auth.tier === "admin"
      ? tierFees.member || 500
      : tierFees.certificate || 1500;
    description = "Dog Registration Fee";
  } else if (resource_type === "clearance_submit") {
    const tierFees = fees.add_clearance || { certificate: 500, member: 0 };
    // Check for fee bypass
    amountCents = auth.member?.skip_fees
      ? 0
      : auth.tier === "member" || auth.tier === "admin"
      ? tierFees.member || 0
      : tierFees.certificate || 500;
    description = "Health Clearance Submission Fee";
  } else {
    throw new ApiError("VALIDATION_ERROR", "Invalid resource type", 422);
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
    throw new ApiError("DATABASE_ERROR", "Failed to create payment record", 500);
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
    metadata: {
      payment_id: payment.id,
      club_id: clubId,
      member_id: auth.memberId,
      resource_type,
      ...metadata,
    },
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
    throw new ApiError("VALIDATION_ERROR", "Missing Stripe signature", 400);
  }

  const body = await c.req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, c.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    throw new ApiError("VALIDATION_ERROR", `Webhook error: ${err.message}`, 400);
  }

  // Handle checkout.session.completed
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = session.client_reference_id || session.metadata?.payment_id;

    if (!paymentId) {
      console.error("No payment_id in webhook session:", session.id);
      return c.json({ received: true });
    }

    // Find payment record
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!payment) {
      console.error("Payment not found:", paymentId);
      return c.json({ received: true });
    }

    // Mark payment as completed
    await db
      .update(payments)
      .set({
        status: "completed",
        stripe_payment_intent_id: session.payment_intent as string,
      })
      .where(eq(payments.id, payment.id));

    const resourceType = session.metadata?.resource_type;

    // Create the resource based on type
    if (resourceType === "dog_create") {
      // Dog creation metadata should include dog fields
      const dogData = payment.metadata as any;

      const [dog] = await db
        .insert(dogs)
        .values({
          club_id: payment.club_id,
          registered_name: dogData.registered_name,
          call_name: dogData.call_name || null,
          sex: dogData.sex || null,
          date_of_birth: dogData.date_of_birth || null,
          microchip_number: dogData.microchip_number || null,
          color: dogData.color || null,
          coat_type: dogData.coat_type || null,
          sire_id: dogData.sire_id || null,
          dam_id: dogData.dam_id || null,
          owner_id: dogData.owner_id || null,
          breeder_id: dogData.breeder_id || null,
          photo_url: dogData.photo_url || null,
          is_public: dogData.is_public || false,
          status: "pending", // Still requires approval
          submitted_by: payment.member_id,
        })
        .returning();

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
    } else if (resourceType === "clearance_submit") {
      // Clearance submission metadata should include clearance fields
      const clearanceData = payment.metadata as any;

      await db.insert(dogHealthClearances).values({
        dog_id: clearanceData.dog_id,
        health_test_type_id: clearanceData.health_test_type_id,
        organization_id: clearanceData.organization_id,
        result: clearanceData.result,
        result_detail: clearanceData.result_detail || null,
        test_date: clearanceData.test_date || null,
        expiration_date: clearanceData.expiration_date || null,
        certificate_number: clearanceData.certificate_number || null,
        certificate_url: clearanceData.certificate_url || null,
        status: "pending", // Still requires verification
        submitted_by: payment.member_id,
        notes: clearanceData.notes || null,
      });

      console.log(`Health clearance created after payment for dog: ${clearanceData.dog_id}`);
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
    throw new ApiError("UNAUTHORIZED", "Authentication required", 401);
  }

  const paymentId = c.req.param("payment_id");

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.club_id, clubId)))
    .limit(1);

  if (!payment) {
    throw new ApiError("NOT_FOUND", "Payment not found", 404);
  }

  // Only allow member to view their own payment
  if (payment.member_id !== auth.memberId && auth.tier !== "admin") {
    throw new ApiError("FORBIDDEN", "Access denied", 403);
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
