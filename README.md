# Breed Club Manager

Open source breed club management platform — dog registry, health clearances, membership management, and research tools.

Built for the [White Swiss Shepherd Club of America](https://whiteswissshepherd.org), designed to be deployable by any breed club.

## Tech Stack

| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | React 19 + Vite + TypeScript + Tailwind + shadcn/ui | Cloudflare Pages |
| API | Hono + TypeScript + Drizzle ORM | Cloudflare Workers |
| Database | PostgreSQL | Supabase |
| Storage | S3-compatible object storage | Supabase Storage |
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
- A free [Supabase](https://supabase.com) account
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

### 2. Set Up Supabase (Database + Storage)

#### Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Fill in:
   - **Name**: `breed-club` (or your club name)
   - **Database Password**: generate a strong password and **save it**
   - **Region**: choose the closest to your users
   - **Plan**: Free (500MB database, 1GB storage)
4. Click **Create new project** — wait for provisioning (~2 minutes)

#### Get Your Connection String

1. In the Supabase dashboard, go to **Project Settings** → **Database**
2. Under **Connection string**, select **URI** tab
3. Copy the connection string. It looks like:
   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
4. **Important**: Use the **Transaction (port 6543)** connection string, not the Session one. This is required for serverless/edge runtimes like Cloudflare Workers.

#### Set Up Storage Buckets

1. In the Supabase dashboard, go to **Storage**
2. Click **New bucket**, create two buckets:
   - `public` — toggle **Public bucket** ON (for dog photos, club logo, stamp assets)
   - `private` — leave Public OFF (for health certificates, uploaded documents)

#### Get Your Supabase Keys

1. Go to **Project Settings** → **API**
2. Note the following:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **service_role key** (under **Project API keys** → `service_role` — this is a secret, never expose it to the frontend)

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
# Paste your Supabase connection string (transaction mode, port 6543)

# Clerk
wrangler secret put CLERK_SECRET_KEY
# Paste your Clerk secret key

wrangler secret put CLERK_PUBLISHABLE_KEY
# Paste your Clerk publishable key

wrangler secret put CLERK_JWKS_URL
# Paste your Clerk JWKS URL

# Supabase
wrangler secret put SUPABASE_URL
# Paste your Supabase project URL

wrangler secret put SUPABASE_SERVICE_KEY
# Paste your Supabase service_role key

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

# Supabase
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...your_service_role_key

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
4. Check the Supabase dashboard → Table Editor — tables should be created

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
