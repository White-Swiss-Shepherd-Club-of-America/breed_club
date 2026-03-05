# WSSCA Platform Reboot Plan

## Overview

Pivot from Go API + self-hosted K8s to a serverless stack: **Cloudflare Workers** (API) + **Vite React SPA** (app frontend) + **Supabase** (DB + storage) + **Clerk** (auth). Hugo marketing site stays separate.

Three deployments:
- **whiteswissshepherd.org** — Hugo marketing site (existing, stays on S3+CloudFront, possible future CF Pages migration)
- **app.whiteswissshepherd.org** — Vite React SPA on Cloudflare Pages (new)
- **api.whiteswissshepherd.org** — Hono on Cloudflare Workers (new)

Monthly cost: ~$0 on free tiers for 50 members.

---

## Tech Stack

### App Frontend (Vite React SPA → Cloudflare Pages)

| Tech | Purpose |
|------|---------|
| Vite | Build tool |
| React 19 + TypeScript | UI framework |
| React Router v7 | Client-side routing |
| Tailwind CSS 4 | Styling |
| shadcn/ui | Component library (port from existing `wssca/app/`) |
| TanStack Query | Server state management |
| React Hook Form + Zod | Form handling + validation |
| `@clerk/clerk-react` | Auth integration |
| Lucide | Icons |

**Why Vite React SPA**: The app is ~80% interactive authenticated pages (dashboard, registry, forms, admin). A pure React SPA is the simplest, most maintainable choice. The only SSR need is the health stamp page — handled by the API (see below).

### Health Stamp SSR

The health stamp page (`/dogs/{id}/health`) needs server-rendered HTML with OG meta tags for link previews on social media/forums. Instead of adding an SSR framework, the **Hono API itself serves this HTML**:

- `GET /api/public/dogs/:id/health` returns JSON (for the SPA)
- `GET /dogs/:id/health` on the API returns **server-rendered HTML** with OG tags, dog info, and health data

This is ~50-100 lines in a single Hono route. No separate framework needed. The health stamp URL lives on the API domain (`api.whiteswissshepherd.org/dogs/{id}/health`) or is proxied from the app domain via a Cloudflare Pages `_redirects` rule.

### API (Hono → Cloudflare Workers)

| Tech | Purpose |
|------|---------|
| Hono | HTTP framework (Workers-native) |
| TypeScript | Language |
| Drizzle ORM | DB access, type-safe queries, migrations |
| `postgres` (postgres.js) | PostgreSQL driver |
| Supabase PostgreSQL | Managed database |
| Supabase Storage | Object storage (photos, certs) |
| `@clerk/backend` | JWT verification via JWKS |
| Stripe | Payment processing |
| Zod | Request validation |

### Marketing Site (Hugo — existing, unchanged)

Stays at `wssca/web/`. Hugo + wssca-v2 theme + Bootstrap 5. GitLab CI → S3 + CloudFront. Potential future migration to Cloudflare Pages but not in scope now.

Dynamic data (breeder directory, announcements) pulled from app API via nightly CI job.

---

## RBAC Design

**Composable: base `tier` + additive boolean permission flags.**

### Base Tier (single value, represents access/payment level)

```
public        — not logged in (no DB record)
non_member    — Clerk account, no paid tier
certificate   — paid per-dog for health stamps
member        — paid annual membership, full search/research
admin         — full administrative access
```

### Permission Flags (additive, combinable)

```
is_breeder             — can register litters, appear in breeder directory, post to socials
can_approve_members    — can review/approve membership applications
can_approve_clearances — can review/approve dog records and health clearances
```

### Examples

| Person | tier | Flags |
|--------|------|-------|
| Random visitor | public | — |
| Signed up, browsing | non_member | — |
| Bought a health stamp | certificate | — |
| Breeder, not a club member | certificate | is_breeder |
| Full club member | member | — |
| Club member who breeds | member | is_breeder |
| Board member reviewing apps | member | can_approve_members |
| Health committee member | member | can_approve_clearances |
| Board member doing both | member | can_approve_members, can_approve_clearances, is_breeder |
| Club president | admin | is_breeder, can_approve_members, can_approve_clearances |

### Implementation

On the `members` table:
```sql
tier                    VARCHAR(20) DEFAULT 'non_member'
is_breeder              BOOLEAN DEFAULT FALSE
can_approve_members     BOOLEAN DEFAULT FALSE
can_approve_clearances  BOOLEAN DEFAULT FALSE
```

API middleware:
1. `auth.ts` — verify Clerk JWT, extract `clerk_user_id`
2. `rbac.ts` — load member record, check `tier` + flags against route requirements

Approver flags are admin-appointed only (admin flips the boolean via admin panel).

---

## Approval Workflows

**Dog records and health clearances are approved separately.**

### Dog Submission
1. User fills out dog form (name, registration, pedigree, photo)
2. If payment required (certificate tier), Stripe Checkout first
3. Dog created with `status: 'pending'`
4. Appears in clearance approver queue
5. Approver reviews → `approved` or `rejected`
6. If approved, dog is visible in registry (and health stamp works if `is_public=true`)

### Health Clearance Submission
1. User selects a test from the standardized catalog (e.g., "OFA Hips") and enters result, cert number, uploads cert
2. If payment required, Stripe Checkout first
3. `dog_health_clearances` row created with `status: 'pending'`, linked to `health_test_types` record
4. Appears in clearance approver queue (separate from dog queue, same approver role)
5. Approver verifies against OFA/PennHIP database → `approved` or `rejected`
6. If approved, appears on public health stamp page
7. Health stamp page shows ALL test types from the catalog — approved results display results, unanswered tests show as "Not tested"

### Litter Registration
1. Breeder registers a litter (sire, dam, whelp date, pup count)
2. If breeder has `verified_breeder = true`, auto-approved
3. If first-time breeder, litter enters clearance approver queue
4. Approved litter: breeder can add pups (call name, sex, color)
5. When pup is sold: breeder enters buyer email → app creates a `contacts` record → sends invitation email → creates a `dogs` record (with sire/dam from litter) → dog enters normal approval queue
6. No separate puppies lifecycle — pups become dogs on sale

### Member Application
1. User submits application form
2. Application created with `status: 'submitted'`
3. Appears in member approver queue
4. Member approver reviews → `approved` / `rejected` / `needs_revision`
5. If approved, member record created/upgraded

---

## Data Model

All IDs are UUIDs. All multi-tenant tables have `club_id` FK + index.

### clubs
Multi-tenant root. `id, name, slug, breed_name, logo_url, colors, settings (JSONB)`.
Settings stores: membership_types, registration_orgs, fee structure, etc.
Note: `breed_name` on the club — individual dogs don't carry a breed field.

### contacts
**Central people table.** Tracks all people (breeders, owners, co-owners) whether or not they're system members. When a contact signs up as a member, `member_id` links them.

```
id, club_id, full_name, kennel_name, email, phone,
city, state, country,
member_id (nullable FK → members, linked when they join),
created_at, updated_at
```

- Dogs reference `contacts` for breeder + owner, not `members` directly
- Enables pedigree research across non-member breeders
- Pup sale flow: create contact for buyer → send invite → if they sign up, link contact.member_id
- UX: typeahead/autocomplete when selecting breeder or owner on dog form

### members
System users with Clerk accounts. Linked to a contact record.

```
id, club_id, clerk_user_id, contact_id (FK → contacts),
tier (non_member | certificate | member | admin),
membership_status (pending | active | expired | suspended),
membership_type, membership_expires,
is_breeder, can_approve_members, can_approve_clearances,
show_in_directory, verified_breeder (bool, for auto-approve litters),
created_at, updated_at
```

Note: personal info (name, email, phone, address) lives on the `contacts` record, not duplicated here.

### membership_applications
`id, club_id, applicant fields, membership_type, status (approval_status enum), review_notes, reviewed_by, member_id (linked after approval)`

### dogs
No `breed` field (club defines the breed). No direct member FK — uses `contacts` for breeder/owner.

```
id, club_id, registered_name, call_name,
microchip_number, sex, date_of_birth, date_of_death,
color, coat_type,
sire_id (FK → dogs), dam_id (FK → dogs),
owner_id (FK → contacts), breeder_id (FK → contacts),
photo_url, is_public,
status (pending | approved | rejected),
submitted_by (FK → members), approved_by (FK → members), approved_at,
created_at, updated_at
```

### organizations
**Centralized registry of external bodies** — kennel clubs, health testing organizations, grading bodies, FCI member clubs, etc. Referenced by dog registrations, health test types, and health clearances.

```
id, club_id,
name (varchar — e.g., "OFA", "AKC", "UKC", "FCI", "PennHIP", "VetScoring.com", "INOC"),
type (varchar — "kennel_club", "health_testing", "grading_body", "pedigree_database"),
country (varchar, nullable — e.g., "US", "DE", "FR"),
website_url (varchar, nullable),
description (text, nullable),
is_active (boolean, default true),
sort_order (integer),
created_at
```

Admin-managed. Seeded with common orgs on setup. Admin can add new ones as needed.

### dog_registrations
**A dog's registrations with external organizations.** A dog can be registered with multiple orgs (OFA, AKC, UKC, FCI member clubs, pedigree databases, etc.)

```
id, dog_id (FK → dogs),
organization_id (FK → organizations),
registration_number (varchar),
registration_url (varchar, optional — link to external record),
created_at
```

Unique constraint on `(dog_id, organization_id)` — one registration per org per dog.

### health_test_types
**Admin-managed catalog of standardized health tests.** Defines what tests exist for the breed. Every dog shows the same set. Admin can add new tests as breed testing evolves.

```
id, club_id,
name (varchar — e.g., "Hip Dysplasia", "Degenerative Myelopathy", "MDR1"),
short_name (varchar — e.g., "Hips", "DM", "MDR1" — for display),
category (varchar — "orthopedic", "cardiac", "genetic", "vision", "thyroid", "dental"),
result_options (JSONB array — e.g., ["Excellent","Good","Fair","Borderline","Mild","Moderate","Severe"]),
is_required (boolean),
rating_category (varchar — finer category for rating weights, e.g., "hips", "elbows", "genetics"),
description (text — what the test is, why it matters),
sort_order (integer),
is_active (boolean, default true),
created_at
```

### health_test_type_orgs
**Join table: which organizations can grade/certify each test.** E.g., Hip Dysplasia can be graded by OFA, PennHIP, VetScoring.com, INOC, etc.

```
health_test_type_id (FK → health_test_types),
organization_id (FK → organizations),
PRIMARY KEY (health_test_type_id, organization_id)
```

### dog_health_clearances
**Lookup table linking dogs to standardized tests.** Each row is one test result for one dog. References the test catalog and the grading organization.

```
id, dog_id (FK → dogs),
health_test_type_id (FK → health_test_types),
organization_id (FK → organizations — who graded/certified this test),
result (varchar — must match one of the test type's result_options),
result_detail (text — free-form notes, e.g., PennHIP laxity percentages),
test_date (date),
expiration_date (date, nullable — some tests expire),
certificate_number (varchar),
certificate_url (varchar — Supabase Storage link),
status (pending | approved | rejected),
submitted_by (FK → members),
verified_by (FK → members),
verified_at (timestamptz),
notes (text),
created_at
```

Unique constraint on `(dog_id, health_test_type_id)` — one result per test type per dog (latest result wins; history could be a future feature).

The `organization_id` must be one of the orgs linked to the test type via `health_test_type_orgs` (validated at API level). So if a user submits a Hip result, they pick from OFA, PennHIP, VetScoring, etc. — only the orgs configured for that test type.

### health_conditions
Illness/injury tracking — separate from clearances. Free-form, not tied to test catalog.

```
id, dog_id, condition_name, category,
diagnosis_date, resolved_date, severity (mild | moderate | severe),
notes, reported_by (FK → members), created_at
```

### litters
Registered by breeders. **Auto-approved if breeder is verified** (`members.verified_breeder = true`). First-time breeders' litters go through clearance approver queue.

When a pup is sold: app creates a `contacts` record for the buyer (with email), sends an invitation, and creates a `dogs` record for the pup (linking to the litter's sire/dam). The pup enters the normal dog approval queue. **No separate puppies table** — pups become dogs immediately on sale.

```
id, club_id,
sire_id (FK → dogs), dam_id (FK → dogs),
breeder_id (FK → contacts),
whelp_date, expected_date,
num_puppies_born, num_puppies_survived,
status (planned | expected | born | weaned | closed),
approved (boolean, default false — auto-set true for verified breeders),
approved_by (FK → members), approved_at,
notes, created_at, updated_at
```

### litter_pups
**Lightweight tracking of pups within a litter before they become dogs.** Not a full entity — just enough to track who gets which pup. When sold, a `dogs` record is created and `dog_id` is set.

```
id, litter_id (FK → litters),
call_name (varchar, temporary/working name),
sex, color, coat_type,
status (available | reserved | sold | retained | deceased),
dog_id (FK → dogs, nullable — set when pup becomes a dog record),
buyer_contact_id (FK → contacts, nullable — set when sold),
notes, created_at
```

### payments
`id, club_id, member_id, stripe_payment_intent_id, amount_cents, currency, description, status, metadata (JSONB)`

---

## Repository Structure

New repo: `breed-club-manager` (public, open source)

```
breed-club-manager/
├── app/                           # Vite React SPA
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                # Router setup
│   │   ├── pages/
│   │   │   ├── HomePage.tsx
│   │   │   ├── SignInPage.tsx
│   │   │   ├── ApplyPage.tsx           # Membership application
│   │   │   ├── DirectoryPage.tsx       # Breeder directory (public)
│   │   │   ├── AnnouncementsPage.tsx   # Litter announcements (public)
│   │   │   ├── DashboardPage.tsx       # Member dashboard
│   │   │   ├── RegistryPage.tsx        # Dog list
│   │   │   ├── DogDetailPage.tsx       # Dog detail + health records
│   │   │   ├── DogCreatePage.tsx       # Register new dog
│   │   │   ├── HealthPage.tsx          # Health record management
│   │   │   ├── LittersPage.tsx         # Litter list
│   │   │   ├── LitterDetailPage.tsx    # Litter detail + puppies
│   │   │   ├── ProfilePage.tsx         # User profile
│   │   │   ├── SearchPage.tsx          # Full DB search (member+)
│   │   │   └── admin/
│   │   │       ├── AdminDashboard.tsx
│   │   │       ├── MembersPage.tsx
│   │   │       ├── ApplicationsPage.tsx
│   │   │       ├── DogQueuePage.tsx         # Pending dogs
│   │   │       ├── HealthQueuePage.tsx      # Pending clearances
│   │   │       └── SettingsPage.tsx
│   │   ├── components/
│   │   │   ├── ui/                # shadcn/ui
│   │   │   ├── Layout.tsx         # Main layout (nav, sidebar)
│   │   │   ├── ProtectedRoute.tsx # Auth + RBAC guard
│   │   │   ├── DogCard.tsx
│   │   │   ├── HealthRecordForm.tsx
│   │   │   ├── PedigreeTree.tsx
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── api.ts             # API client
│   │   │   ├── types.ts
│   │   │   └── utils.ts
│   │   ├── hooks/
│   │   │   ├── useCurrentMember.ts
│   │   │   ├── useDogs.ts
│   │   │   ├── useHealth.ts
│   │   │   └── useLitters.ts
│   │   └── styles/
│   │       └── globals.css        # Tailwind
│   ├── public/
│   │   └── stamp/                 # Badge SVG assets
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── api/                           # Cloudflare Workers API (Hono)
│   ├── src/
│   │   ├── index.ts               # Hono entry point
│   │   ├── routes/
│   │   │   ├── public.ts          # Breeders, announcements, health stats
│   │   │   ├── health-stamp.ts    # SSR HTML page for /dogs/:id/health
│   │   │   ├── members.ts
│   │   │   ├── contacts.ts        # Contact CRUD + typeahead search
│   │   │   ├── dogs.ts            # Dogs + registrations
│   │   │   ├── health.ts          # Clearances + conditions
│   │   │   ├── litters.ts         # Litters + pup tracking + sale/invite flow
│   │   │   ├── admin.ts           # Member mgmt, test type catalog, settings
│   │   │   └── payments.ts        # Stripe checkout + webhooks
│   │   ├── db/
│   │   │   ├── schema.ts          # Drizzle schema
│   │   │   ├── migrations/
│   │   │   └── client.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts            # Clerk JWT verification
│   │   │   ├── rbac.ts            # Tier + flag checks
│   │   │   ├── cors.ts
│   │   │   └── club-context.ts    # Multi-club resolution
│   │   └── lib/
│   │       ├── types.ts
│   │       ├── errors.ts
│   │       ├── storage.ts         # Supabase Storage helpers
│   │       └── stripe.ts
│   ├── wrangler.toml
│   ├── drizzle.config.ts
│   └── package.json
│
├── shared/                        # Shared types + validation
│   ├── types.ts
│   ├── validation.ts              # Zod schemas
│   └── roles.ts                   # Tier + permission definitions
│
├── package.json                   # npm workspaces root
├── docker-compose.yml             # Local dev (Postgres)
├── README.md
└── LICENSE
```

Hugo marketing site stays in its own repo (`wssca/web`).

---

## Payment Integration (Stripe)

**Per-action fees via Stripe Checkout Sessions.**

Fee structure stored in `clubs.settings` JSONB:
```json
{
  "fees": {
    "create_dog": { "certificate": 1500, "member": 500 },
    "add_clearance": { "certificate": 500, "member": 0 }
  }
}
```

Flow:
1. User fills form → API creates Stripe Checkout Session with amount based on user's tier
2. If $0 (member with free clearances), skip Stripe, create record directly
3. Stripe redirects back on success → webhook fires → API creates record in `pending` status
4. Record enters approval queue

Each club deploys with their own Stripe API keys (env vars).

---

## Deployment

```
git push to main
  ├─→ Cloudflare Pages (static build) → app.whiteswissshepherd.org
  │   Build command: cd app && npm run build
  │   Output: app/dist/
  │   _redirects file for SPA fallback + health stamp proxy
  │
  └─→ GitHub Actions
       ├─ deploy-api: cd api && wrangler deploy → api.whiteswissshepherd.org
       └─ migrate-db: cd api && drizzle-kit migrate (if migrations/ changed)
```

DNS (all on Cloudflare):
- `whiteswissshepherd.org` → CloudFront (Hugo/S3) — existing
- `app.whiteswissshepherd.org` → Cloudflare Pages (static SPA)
- `api.whiteswissshepherd.org` → Cloudflare Workers (Hono API + health stamp SSR)

Health stamp URL options:
- **Option A**: `api.whiteswissshepherd.org/dogs/{id}/health` — simplest, no proxy needed
- **Option B**: `app.whiteswissshepherd.org/dogs/{id}/health` — nicer URL, uses CF Pages `_redirects` to proxy to the API

---

## Implementation Phases

### Segment 0: Scaffolding (current task)
- Create `~/src/breed_club/` directory
- Init git repo
- Set up npm workspaces monorepo (root + app/ + api/ + shared/)
- Scaffold Vite React app skeleton
- Scaffold Hono Workers API skeleton
- Write README with full Cloudflare + Clerk + Supabase setup guide
- Write segmented build plan in docs/
- Copy architecture plan into docs/

### Segment 1: Database + API Foundation
- Drizzle schema for ALL tables (clubs, contacts, members, organizations, dogs, dog_registrations, health_test_types, health_test_type_orgs, dog_health_clearances, health_conditions, litters, litter_pups, membership_applications, payments)
- Supabase project setup + initial migration
- Seed data script (organizations, health_test_types, default club)
- Hono API skeleton with CORS, error handling, health check
- Clerk JWT auth middleware
- RBAC middleware (tier + flags)
- Club context middleware

### Segment 2: Member System
- Member application form (frontend + API)
- Application approval workflow (member_approver queue)
- Member dashboard
- Profile management (via contacts record)
- Admin: member list, role/flag assignment

### Segment 3: Dog Registry
- Contacts typeahead/CRUD
- Dog creation form (with breeder/owner as contacts, registrations)
- Dog approval workflow (clearance_approver queue)
- Dog detail page
- Dog list (own dogs for non-members, full registry for members)

### Segment 4: Health Clearances + Stamp
- Health clearance submission form (select test type → select grading org → enter result)
- Clearance approval workflow
- Health stamp SSR page (API serves HTML with OG tags)
- Health stamp badge SVG assets
- Dog detail page: show all test types from catalog with results

### Segment 5: Payments
- Stripe Checkout integration for dog creation + clearance fees
- Stripe webhook handler
- Payment records
- Fee configuration in club settings

### Segment 6: Litters
- Litter registration (auto-approve for verified breeders)
- Litter pup tracking
- Pup sale flow: create contact → create dog → send invite
- Breeder directory page

### Segment 7: Search + Research
- Full DB search for members (dogs, pedigrees, health data)
- Mate finding tool
- Health statistics + aggregate reporting
- CSV export
- Pedigree tree view

### Segment 8: Polish + Open Source
- Club settings UI (branding, test types, orgs, fees)
- Announcements page
- Nightly Hugo data sync CI job
- Open source: setup wizard, contributing guide, seed data
- Social posting features

### Future
- Morphology + behavioral trait tracking
- Advanced research queries (cross-pedigree, lineage analysis)
- Email notifications
- Mobile optimization

---

## Migration from Existing Code

### What ports
- **React components** from `wssca/app/src/` (~1500 lines, 9 pages) → direct port to new Vite app. Same libs (shadcn/ui, TanStack Query, RHF+Zod, Clerk React).
- **API endpoint patterns** from `wssca/docs/revised/03-api-endpoints.md` → Hono routes implement these.
- **Data model** from `wssca/docs/revised/02-app-architecture.md` → Drizzle schema with RBAC changes above.

### What's retired
- `wssca/app/` (existing React/Vite SPA) — replaced by new app in monorepo
- `wssca/api/` (Go microservices) — replaced by Hono Workers
- `wssca/backend/` (Django) — already dead

### What stays
- `wssca/web/` (Hugo) — marketing site, unchanged
- `wssca/research/` — reference pedigree data
- `wssca/docs/revised/` — reference for implementation

### Key files to reference during implementation
- `wssca/app/src/lib/api.ts` — existing API client with TS interfaces
- `wssca/app/src/pages/ApplyPage.tsx` — representative RHF+Zod form pattern
- `wssca/app/src/hooks/useCurrentMember.ts` — TanStack Query hook pattern
- `wssca/docs/revised/03-api-endpoints.md` — full API endpoint spec
- `wssca/docs/revised/04-data-flow.md` — data flow diagrams
- `wssca/web/config.yaml` — Hugo nav structure (for nightly sync integration)

---

## Verification Plan

1. **Local dev**: `wrangler dev` for API, `vite dev` for frontend, Supabase local or free project
2. **Health stamp test**: Create a dog via API, visit the health stamp URL, verify HTML + OG tags render correctly (`curl -s URL | grep og:title`)
3. **RBAC test**: Create members with different tiers + flags, verify API returns 403 for unauthorized routes
4. **Approval flow test**: Submit dog as certificate user → verify it appears in clearance approver queue → approve → verify it's visible in registry
5. **Clerk auth test**: Sign in via Clerk, verify JWT flows through to API, member record created/loaded
6. **Stripe test**: Use Stripe test mode, create checkout session, complete payment, verify webhook creates record in pending status
7. **Deploy test**: Push to GitHub, verify CF Pages builds SPA, verify GH Action deploys Worker
8. **Hugo sync test**: Run nightly job script locally, verify it fetches from API and writes JSON data files
