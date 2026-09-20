# Build Segments

Each segment is a self-contained chunk of work. Complete one before starting the next. Each segment produces something testable.

---

## Segment 0: Scaffolding [DONE]

**What was built**: Monorepo structure, package.json files, TypeScript configs, shared types/roles/validation schemas, API skeleton (Hono entry point, error helpers, env types), app skeleton (Vite + React + Clerk + TanStack Query), README with full setup guide.

**Files created**:
- `package.json` (root, app, api, shared)
- `tsconfig.json` (root, app, api, shared)
- `shared/src/` — types.ts, roles.ts, validation.ts
- `api/src/` — index.ts, lib/types.ts, lib/errors.ts
- `api/wrangler.toml`, `api/drizzle.config.ts`
- `app/src/` — main.tsx, App.tsx, lib/api.ts, styles/globals.css
- `app/vite.config.ts`, `app/index.html`
- `.env.example`, `.gitignore`, `README.md`

---

## Segment 1: Database + API Foundation [DONE]

**Goal**: All tables exist in the managed Postgres database. API boots, authenticates via Clerk, and enforces RBAC. Seed data loaded.

**Tasks**:
1. Write complete Drizzle schema (`api/src/db/schema.ts`) for ALL tables:
   - clubs, contacts, members, membership_applications
   - organizations, dogs, dog_registrations
   - health_test_types, health_test_type_orgs, dog_health_clearances, health_conditions
   - litters, litter_pups, payments
2. Generate and run initial migration (`npm run db:generate && npm run db:migrate`)
3. Write seed script (`api/src/db/seed.ts`):
   - Default club record
   - Organizations: OFA, PennHIP, AKC, UKC, FCI, VetScoring, CAER, plus major FCI member clubs
   - Health test types: Hips, Elbows, Patellas, Cardiac, Eyes, Thyroid, MDR1, DM, vWD, Hemophilia A, LAD, Dentition
   - health_test_type_orgs join records (e.g., Hips → OFA + PennHIP + VetScoring)
4. Write `api/src/db/client.ts` — Drizzle + postgres.js connection factory
5. Write `api/src/middleware/auth.ts` — Clerk JWT verification
6. Write `api/src/middleware/rbac.ts` — tier + flag checker using `hasPermission()` from shared
7. Write `api/src/middleware/club-context.ts` — resolve club_id from CLUB_SLUG env var

**Verification**:
- `npm run db:migrate` succeeds
- `npm run db:seed` populates tables (verify with `psql` or your provider's SQL console)
- `wrangler dev` → `GET /health` returns 200
- API rejects requests without valid Clerk JWT on protected routes

---

## Segment 2: Member System [DONE]

**Goal**: Users can sign up, apply for membership, and get approved. Admins can manage members.

**API routes** (`api/src/routes/members.ts`):
- `POST /api/members/apply` — submit application (public, requires Clerk JWT)
- `GET /api/members/me` — current member profile
- `PATCH /api/members/me` — update own profile (via contact record)
- `GET /api/members/me/application` — own application status

**API routes** (`api/src/routes/admin.ts` — member section):
- `GET /api/admin/members` — list all members (paginated)
- `GET /api/admin/members/:id` — member detail
- `PATCH /api/admin/members/:id` — update tier, flags, status
- `GET /api/admin/applications` — list applications
- `POST /api/admin/applications/:id/approve` — approve (creates/upgrades member)
- `POST /api/admin/applications/:id/reject` — reject
- `POST /api/admin/applications/:id/revision` — request changes

**Frontend pages**:
- `ApplyPage.tsx` — membership application form
- `DashboardPage.tsx` — member dashboard (basic)
- `ProfilePage.tsx` — edit profile
- `admin/MembersPage.tsx` — member list + role management
- `admin/ApplicationsPage.tsx` — approval queue

**Components**:
- `Layout.tsx` — nav bar with auth-aware menu
- `ProtectedRoute.tsx` — RBAC guard (checks tier + flags, redirects)

**Verification**:
- Sign up via Clerk → redirected to /app/apply
- Submit application → appears in admin queue
- Admin approves → user tier upgraded, can access dashboard
- Admin sets `can_approve_members` flag → user can access approval queue

---

## Segment 3: Dog Registry [DONE]

**Goal**: Users can register dogs with breeder/owner contacts and external registrations. Dogs go through approval.

**API routes** (`api/src/routes/contacts.ts`):
- `GET /api/contacts?search=` — typeahead search (name, kennel, email)
- `POST /api/contacts` — create contact
- `PATCH /api/contacts/:id` — update contact

**API routes** (`api/src/routes/dogs.ts`):
- `POST /api/dogs` — register new dog (pending approval)
- `GET /api/dogs` — list own dogs (certificate+) or all dogs (member+)
- `GET /api/dogs/:id` — dog detail with registrations, clearances, pedigree
- `PATCH /api/dogs/:id` — update own dog
- `POST /api/dogs/:id/registrations` — add external registration
- `GET /api/dogs/:id/pedigree` — ancestry tree

**API routes** (admin):
- `GET /api/admin/dogs/pending` — dogs awaiting approval
- `POST /api/admin/dogs/:id/approve` — approve dog
- `POST /api/admin/dogs/:id/reject` — reject dog

**Frontend pages**:
- `DogCreatePage.tsx` — register dog form (with contact typeahead for breeder/owner, registration fields)
- `RegistryPage.tsx` — dog list (own dogs vs full registry based on tier)
- `DogDetailPage.tsx` — dog detail with registrations, pedigree links
- `admin/DogQueuePage.tsx` — pending dogs queue

**Verification**:
- Create a dog as certificate user → status is "pending"
- Dog appears in clearance approver queue
- Approve → dog visible in registry
- Contact typeahead searches across existing contacts
- Dog shows registrations (OFA #, AKC #, etc.)

---

## Segment 4: Health Clearances + Stamp [DONE]

**Goal**: Users can submit health clearances against the standardized test catalog. Health stamp page renders with OG tags.

**API routes** (`api/src/routes/health.ts`):
- `GET /api/health/test-types` — list test catalog (with grading orgs)
- `POST /api/dogs/:id/clearances` — submit clearance (select test type → org → result)
- `GET /api/dogs/:id/clearances` — list clearances for a dog
- `PATCH /api/dogs/:id/clearances/:cid` — update clearance
- `POST /api/dogs/:id/conditions` — report health condition
- `GET /api/dogs/:id/conditions` — list conditions

**API routes** (admin):
- `GET /api/admin/clearances/pending` — clearances awaiting verification
- `POST /api/admin/clearances/:id/approve` — verify clearance
- `POST /api/admin/clearances/:id/reject` — reject clearance

**API routes** — health stamp SSR (`api/src/routes/health-stamp.ts`):
- `GET /dogs/:id/health` — returns **HTML page** with:
  - OG meta tags (og:title, og:description, og:image)
  - Dog name, photo
  - All test types from catalog: approved results shown, unanswered = "Not tested"
  - Verification status
  - Club branding

**API routes** — public JSON:
- `GET /api/public/dogs/:id/health` — JSON version for SPA consumption

**Frontend pages**:
- `HealthPage.tsx` — submit clearance form (dynamic: select test type → filtered org dropdown → result dropdown from test type options)
- Dog detail page updated to show clearances grid
- `admin/HealthQueuePage.tsx` — pending clearances queue

**Frontend components**:
- `HealthClearanceForm.tsx` — cascading dropdowns (test type → org → result)

**API routes** (admin — test type management):
- `GET /api/admin/test-types` — list all
- `POST /api/admin/test-types` — create new test type
- `PATCH /api/admin/test-types/:id` — update
- `POST /api/admin/test-types/:id/orgs` — link grading orgs
- `GET /api/admin/organizations` — list all
- `POST /api/admin/organizations` — create new org

**Verification**:
- Submit hip clearance: select "Hip Dysplasia" → select "OFA" → select "Excellent" → pending
- Approver verifies → approved
- Visit `/dogs/{id}/health` → SSR HTML with OG tags
- `curl -s /dogs/{id}/health | grep og:title` → shows dog name
- All 12+ test types display on health page (most showing "Not tested")

---

## Segment 5: Payments [DONE]

**Goal**: Stripe Checkout for dog creation and clearance submission fees.

**API routes** (`api/src/routes/payments.ts`):
- `POST /api/payments/create-session` — create Stripe Checkout Session
- `POST /api/payments/webhook` — Stripe webhook handler

**Tasks**:
1. Stripe account setup + API keys
2. Payment flow: form submission → check fee → if $0, skip Stripe; if > $0, create checkout session → redirect → webhook → create record in pending
3. Fee configuration in `clubs.settings` JSONB
4. Payment records table
5. Receipt/confirmation page

**Verification**:
- Certificate-tier user creates dog → redirected to Stripe Checkout (test mode)
- Complete payment → dog created with pending status
- Member with $0 clearance fee → skips Stripe, record created directly

---

## Segment 6: Litters [DONE]

**Goal**: Breeders can register litters, track pups, and sell pups (creating dog records for buyers).

**API routes** (`api/src/routes/litters.ts`):
- `POST /api/litters` — register litter (requires is_breeder)
- `GET /api/litters` — list own litters
- `GET /api/litters/:id` — litter detail with pups
- `PATCH /api/litters/:id` — update litter
- `POST /api/litters/:id/pups` — add pup to litter
- `PATCH /api/litters/:id/pups/:pid` — update pup
- `POST /api/litters/:id/pups/:pid/sell` — sell pup (creates contact + dog + sends invite)

**Frontend pages**:
- `LittersPage.tsx` — litter list
- `LitterDetailPage.tsx` — litter detail with pup management
- Sell pup modal: buyer name + email → creates contact, creates dog, sends invitation email

**API routes** (public):
- `GET /api/public/breeders` — breeder directory
- `GET /api/public/announcements` — available litters

**Frontend pages**:
- `DirectoryPage.tsx` — breeder directory
- `AnnouncementsPage.tsx` — litter announcements

**Verification**:
- Verified breeder creates litter → auto-approved
- New breeder creates litter → goes to approval queue
- Add pups to approved litter → sell pup → dog record created, contact created
- Breeder directory shows members with is_breeder + show_in_directory

---

## Segment 7: Search + Research [DONE]

**Goal**: Members can search the full registry, find mates, research pedigrees, view health statistics.

**API routes**:
- `GET /api/dogs/search` — full-text search (member+ only) with filters (sex, health status, lineage)
- `GET /api/dogs/:id/pedigree?depth=N` — multi-generation pedigree tree
- `GET /api/health/statistics` — aggregate health stats (test counts, result distributions)
- `GET /api/admin/export/dogs?format=csv` — CSV export
- `GET /api/admin/export/health?format=csv` — CSV export

**Frontend pages**:
- `SearchPage.tsx` — full DB search with filters
- `PedigreeTree.tsx` component — visual pedigree display
- Health statistics dashboard

**Verification**:
- Member searches "Alpine" → finds matching dogs
- Pedigree tree renders 3+ generations
- Health stats page shows test distribution charts
- CSV export downloads valid file

---

## Segment 8: Polish + Open Source []

**Goal**: Club settings UI, Hugo integration, open source readiness.

**Tasks**:
- Club settings page (admin): branding, test types, orgs, fee config
- Nightly Hugo data sync CI job (GitHub Actions)
- Announcements page
- Social posting features for members
- Open source: setup wizard, LICENSE, CONTRIBUTING.md, seed data
- Email notifications (approval status changes)
- Mobile responsiveness pass

**Verification**:
- Admin changes club colors → reflected across app
- Hugo nightly job fetches from API → rebuilds site
- README setup guide works end-to-end for a fresh deploy
