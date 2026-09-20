# Breed Club Manager

Open source breed club management platform — dog registry, health clearances, membership management, and research tools.

Built for the [White Swiss Shepherd Club of America](https://whiteswissshepherd.org), designed to be deployable by any breed club.

## Tech Stack

| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | React 19 + Vite + TypeScript + Tailwind + shadcn/ui | Cloudflare Pages |
| API | Hono + TypeScript + Drizzle ORM | Cloudflare Workers |
| Database | PostgreSQL (any provider) | Neon, or any managed PostgreSQL |
| Storage | Cloudflare R2 | Cloudflare |
| Auth | Clerk | Clerk |
| Payments | Stripe | Stripe |

**Monthly cost**: ~$0 on free tiers for clubs with < 200 members.

## Features

- Dog registry with pedigree tracking (sire/dam lineage)
- Standardized health clearance catalog (OFA, PennHIP, DNA tests, etc.)
- Health stamp — embeddable badge for breeder websites with verified health data
- Membership management with application/approval workflow
- Approval queues for dog submissions and health clearances
- Litter tracking with buyer invitation flow
- Breeder directory
- Organizations registry (AKC, UKC, FCI, OFA, PennHIP, etc.)
- Role-based access: public, non-member, certificate holder, member, admin + permission flags
- Multi-club support (one deployment can serve multiple clubs)

---

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- npm >= 10
- A free [Cloudflare](https://dash.cloudflare.com/sign-up) account
- An account with a managed PostgreSQL provider (e.g. [Neon](https://neon.tech) — free tier)
- A free [Clerk](https://clerk.com) account
- A [Stripe](https://stripe.com) account (for payments — can be deferred)

---

## Setup Guide

### 1. Clone and Install

```bash
git clone https://github.com/your-org/breed-club-manager.git
cd breed-club-manager
npm install
```

This installs all dependencies across the monorepo (app, api, shared).

### 2. Set Up the Database

The API needs PostgreSQL 14+ and nothing else — no vendor SDK, no provider-specific
features. Use any managed PostgreSQL provider you like; all the application needs is a
connection string. [Neon](https://neon.tech) is used as the worked example below because
it has a free tier and a serverless driver the API can opt into.

> For local development you don't need a hosted database at all: `make up` starts
> PostgreSQL in Docker on port 5433.

#### Create a Database

1. Create a project/database with your provider (Neon: [console.neon.tech](https://console.neon.tech) → **New Project**)
2. Name it `breed-club` (or your club name) and pick the region closest to your users
3. Save the generated database password — most providers display it only once

#### Get Your Connection String

1. Copy the connection string from your provider's dashboard. It looks like:
   ```
   postgresql://user:password@host/dbname?sslmode=require
   ```
2. **Use the pooled / transaction-mode endpoint if your provider offers one.** Cloudflare
   Workers open a connection per request, so a direct session endpoint will exhaust the
   connection limit.
3. This string is the `DATABASE_URL` used everywhere below.

#### Optional: Neon Serverless Driver

On Neon you can set `USE_NEON_DRIVER = "true"` (a `[vars]` entry in `api/wrangler.toml`)
to use `@neondatabase/serverless` instead of `postgres.js`. Leave it unset on every other
provider.

### 3. Set Up Clerk (Authentication)

#### Create a Clerk Application

1. Go to [clerk.com](https://clerk.com) and sign in
2. Click **Create application**
3. Fill in:
   - **Application name**: `Breed Club Manager` (or your club name)
   - **Sign-in methods**: Enable **Email** and optionally **Google**, **Apple**
4. Click **Create application**

#### Configure Clerk

1. In the Clerk dashboard, go to **Configure** → **Email, phone, username**
   - Enable **Email addresses** as identifier
   - Enable **Name** (so users provide their full name on signup)

2. Go to **Configure** → **Paths**
   - Set **Sign-in URL**: `/sign-in`
   - Set **After sign-in URL**: `/app/dashboard`
   - Set **After sign-up URL**: `/app/apply`

3. Go to **Configure** → **Domains**
   - For development: `localhost:5173` is automatically allowed
   - For production: add your app domain (e.g., `app.whiteswissshepherd.org`)

#### Get Your Clerk Keys

1. Go to **Configure** → **API Keys**
2. Note the following:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - **Secret key** (starts with `sk_test_` or `sk_live_`)

3. Get the JWKS URL:
   - Go to **Configure** → **API Keys** → **Advanced**
   - The JWKS URL is: `https://[your-clerk-instance].clerk.accounts.dev/.well-known/jwks.json`
   - You can also find it from your Clerk Frontend API URL: check **Configure** → **API Keys** for the Frontend API URL, then append `/.well-known/jwks.json`

### 4. Set Up Cloudflare (Hosting)

#### Create a Cloudflare Account

1. Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) and create an account
2. If you have a custom domain, add it to Cloudflare:
   - Click **Add a site** → enter your domain
   - Follow the steps to update your domain's nameservers to Cloudflare
   - Wait for DNS propagation (can take up to 24 hours)

#### Install Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

This opens a browser window to authenticate with your Cloudflare account.

#### Create the R2 Bucket (Uploads)

Health certificates and uploaded documents are stored in Cloudflare R2, bound to the
Worker as `CERTIFICATES_BUCKET`.

1. In the Cloudflare dashboard, go to **R2** → **Create bucket**
2. Name it `breed-club-certificates`, or edit `bucket_name` under `[[r2_buckets]]` in `api/wrangler.toml` to match the name you chose
3. Leave public access off — the API serves files through authenticated routes

#### Set Up Cloudflare Pages (Frontend)

Option A — Connect to GitHub (recommended for auto-deploys):

1. In the Cloudflare dashboard, go to **Workers & Pages** → **Create application** → **Pages**
2. Connect your GitHub account and select the `breed-club-manager` repository
3. Configure build settings:
   - **Framework preset**: None
   - **Build command**: `cd app && npm run build`
   - **Build output directory**: `app/dist`
   - **Root directory**: `/`
4. Add environment variable:
   - `VITE_CLERK_PUBLISHABLE_KEY` = your Clerk publishable key
5. Click **Save and Deploy**

Option B — Manual deploy (for testing):

```bash
cd app
npm run build
npx wrangler pages deploy dist --project-name=breed-club-app
```

#### Set Up Cloudflare Workers (API)

1. Set your Worker secrets:

```bash
cd api

# Database
wrangler secret put DATABASE_URL
# Paste your database connection string (pooled endpoint)

# Clerk
wrangler secret put CLERK_SECRET_KEY
# Paste your Clerk secret key

wrangler secret put CLERK_PUBLISHABLE_KEY
# Paste your Clerk publishable key

wrangler secret put CLERK_JWKS_URL
# Paste your Clerk JWKS URL

# Stripe (can be deferred until Segment 5)
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
```

2. Deploy the Worker:

```bash
wrangler deploy
```

3. Note the Worker URL (e.g., `https://breed-club-api.your-account.workers.dev`)

#### Configure DNS (Production)

If using a custom domain, add these DNS records in Cloudflare:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `app` | `breed-club-app.pages.dev` | Proxied |
| CNAME | `api` | `breed-club-api.your-account.workers.dev` | Proxied |

Or configure custom domains directly:
- **Workers**: Go to your Worker → **Settings** → **Domains & Routes** → Add custom domain
- **Pages**: Go to your Pages project → **Custom domains** → Add domain

### 5. Configure Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Clerk
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_key_here
CLERK_JWKS_URL=https://your-instance.clerk.accounts.dev/.well-known/jwks.json

# Database
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Stripe (optional for initial development)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App
ENVIRONMENT=development
CLUB_SLUG=wssca
```

For the Vite frontend, also create `app/.env.local`:
```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
VITE_API_URL=http://localhost:8787/api
```

### 6. Set Up the Database

Run the Drizzle migrations to create all tables:

```bash
npm run db:migrate
```

Seed the database with default data (organizations, health test types):

```bash
npm run db:seed
```

### 7. Run Locally

Start both the frontend and API in development mode:

```bash
npm run dev
```

This runs concurrently:
- **Frontend**: http://localhost:5173 (Vite dev server)
- **API**: http://localhost:8787 (Wrangler dev server)

The Vite dev server proxies `/api/*` requests to the Wrangler dev server automatically.

### 8. Verify Everything Works

1. Open http://localhost:5173 — you should see the app home page
2. Click Sign In — Clerk auth flow should work
3. Hit http://localhost:8787/health — should return `{"status":"ok"}`
4. Connect to your database (`psql "$DATABASE_URL" -c '\dt'` or your provider's SQL console) — the tables should be created

---

## Project Structure

```
breed-club-manager/
├── app/          # Vite React SPA (Cloudflare Pages)
├── api/          # Hono API (Cloudflare Workers)
├── shared/       # Shared types, validation schemas, role definitions
├── docs/         # Architecture docs + segmented build plan
└── scripts/      # Setup and migration scripts
```

See `docs/architecture.md` for the full architecture plan and `docs/segments.md` for the build-by-segment implementation plan.

## Development

```bash
npm run dev          # Start frontend + API
npm run dev:app      # Frontend only
npm run dev:api      # API only
npm run build        # Build both
npm run lint         # Lint both
npm run typecheck    # Type check both
npm run db:migrate   # Run database migrations
npm run db:seed      # Seed default data
npm run db:studio    # Open Drizzle Studio (DB browser)
```

## Deployment

Push to `main` → Cloudflare Pages auto-builds the frontend. API deploys via GitHub Actions or manual `wrangler deploy`.

See `docs/architecture.md` for full deployment details.

## License

MIT
