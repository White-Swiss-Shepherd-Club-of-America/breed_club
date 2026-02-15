# Payment Flow Documentation

This document explains how the Stripe payment integration works for dog registration and health clearance submission fees.

## Overview

The payment system supports two types of transactions:
1. **Dog Registration** (`dog_create`) - Fee when creating a new dog record
2. **Health Clearance Submission** (`clearance_submit`) - Fee when submitting a health clearance

Fees are configurable per club and vary by member tier.

## Fee Configuration

Fees are stored in the `clubs.settings` JSONB field:

```json
{
  "fees": {
    "create_dog": {
      "certificate": 1500,  // $15.00 in cents
      "member": 500         // $5.00 in cents
    },
    "add_clearance": {
      "certificate": 500,   // $5.00 in cents
      "member": 0           // Free for members
    }
  }
}
```

- **certificate tier**: Non-members or certificate holders pay higher fees
- **member/admin tier**: Full members pay reduced or zero fees

## Payment Flow

### 1. Dog Registration Flow

**Frontend submits dog creation request:**
```
POST /api/dogs
{
  "registered_name": "Alpine's White Knight",
  "call_name": "Knight",
  "sex": "male",
  ...
}
```

**Backend checks fee and responds:**

- **If fee = $0**: Creates dog immediately, returns `201 Created` with dog object
- **If fee > $0**: Returns `402 Payment Required` with:
  ```json
  {
    "requiresPayment": true,
    "amountCents": 1500,
    "description": "Dog Registration Fee",
    "metadata": {
      "resource_type": "dog_create",
      "registered_name": "Alpine's White Knight",
      ...
    }
  }
  ```

**Frontend handles payment requirement:**

If `requiresPayment: true`, frontend calls:
```
POST /api/payments/create-session
{
  "resource_type": "dog_create",
  "metadata": { ...dog data from previous response },
  "success_url": "https://app.example.com/dogs?payment_success=true",
  "cancel_url": "https://app.example.com/dogs/create"
}
```

**Backend creates payment session:**

1. Creates payment record in database with `status: "pending"`
2. Creates Stripe Checkout Session
3. Returns `sessionUrl` for redirect:
   ```json
   {
     "skipPayment": false,
     "sessionUrl": "https://checkout.stripe.com/c/pay/cs_...",
     "sessionId": "cs_...",
     "paymentId": "uuid",
     "amountCents": 1500
   }
   ```

**Frontend redirects to Stripe:**

User completes payment on Stripe Checkout page.

**Stripe sends webhook:**

After successful payment, Stripe sends `checkout.session.completed` event to:
```
POST /api/payments/webhook
```

**Webhook handler:**

1. Verifies webhook signature
2. Marks payment as `completed`
3. Creates the dog record with `status: "pending"` (still requires approval)
4. Creates any inline registrations

**User redirected back:**

Stripe redirects to `success_url?session_id=...&payment_id=...`

Frontend can verify payment status:
```
GET /api/payments/verify/{payment_id}
```

### 2. Health Clearance Flow

**Frontend submits clearance:**
```
POST /api/dogs/{dog_id}/clearances
{
  "health_test_type_id": "uuid",
  "organization_id": "uuid",
  "result": "Excellent",
  ...
}
```

**Backend checks fee and responds:**

Same pattern as dog registration:
- **If fee = $0**: Creates clearance immediately
- **If fee > $0**: Returns `402 Payment Required` with metadata

**Payment flow continues identically**, except:
- `resource_type: "clearance_submit"`
- Webhook creates clearance record instead of dog

## API Endpoints

### POST /api/payments/create-session

Creates a Stripe Checkout Session.

**Request:**
```json
{
  "resource_type": "dog_create" | "clearance_submit",
  "metadata": { ...resource data },
  "success_url": "string",
  "cancel_url": "string"
}
```

**Response (fee required):**
```json
{
  "skipPayment": false,
  "sessionUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_...",
  "paymentId": "uuid",
  "amountCents": 1500
}
```

**Response (no fee):**
```json
{
  "skipPayment": true,
  "amountCents": 0
}
```

### POST /api/payments/webhook

Stripe webhook endpoint. Handles `checkout.session.completed` events.

**Security:**
- Validates webhook signature using `STRIPE_WEBHOOK_SECRET`
- Rejects unsigned requests

**Actions:**
1. Marks payment as completed
2. Creates dog or clearance based on `resource_type`

### GET /api/payments/verify/:payment_id

Verify payment status after redirect.

**Response:**
```json
{
  "id": "uuid",
  "status": "pending" | "completed" | "failed",
  "amount_cents": 1500,
  "currency": "usd",
  "description": "Dog Registration Fee",
  "created_at": "2025-01-15T12:00:00Z"
}
```

## Environment Variables

Required for payment processing:

```bash
# Stripe (get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

For local development, use Stripe CLI to forward webhooks:

```bash
stripe listen --forward-to localhost:8787/api/payments/webhook
```

This will output a webhook secret like `whsec_...` - use it for `STRIPE_WEBHOOK_SECRET`.

## Testing

### Test Mode (Stripe Test Keys)

Use test card: `4242 4242 4242 4242`
- Expiry: Any future date
- CVC: Any 3 digits
- ZIP: Any 5 digits

### Test Flow

1. Create dog/clearance as certificate-tier user
2. Should receive `402 Payment Required`
3. Call `/api/payments/create-session` with metadata
4. Redirect to `sessionUrl`
5. Complete payment with test card
6. Stripe webhook creates resource
7. User redirected to `success_url`
8. Verify payment with `/api/payments/verify/:id`

## Production Checklist

- [ ] Replace test Stripe keys with live keys
- [ ] Configure webhook endpoint in Stripe Dashboard
- [ ] Set webhook secret in production environment
- [ ] Test end-to-end with real payment (then refund)
- [ ] Monitor Stripe Dashboard for successful webhooks
- [ ] Set up Stripe alerts for failed payments

## Troubleshooting

**Payment created but resource not appearing:**
- Check webhook logs in Stripe Dashboard
- Verify webhook signature is correct
- Check server logs for webhook handler errors

**"Missing Stripe signature" error:**
- Verify `STRIPE_WEBHOOK_SECRET` is set correctly
- Use Stripe CLI for local testing

**Fee showing as $0 when it should charge:**
- Check club settings in database: `SELECT settings FROM clubs WHERE slug = 'your-slug'`
- Verify tier is correctly set on member record

## Database Schema

### payments table

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  member_id UUID NOT NULL REFERENCES members(id),
  stripe_payment_intent_id VARCHAR(255),
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  description VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Status values:**
- `pending`: Payment created, awaiting completion
- `completed`: Payment successful, resource created
- `failed`: Payment failed or cancelled
