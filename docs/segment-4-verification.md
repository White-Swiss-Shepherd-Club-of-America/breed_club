# Segment 4: Health Clearances + Stamp — Verification Guide

## Implementation Summary

Segment 4 has been successfully implemented with the following components:

### Backend (API)

#### Routes Created

1. **`api/src/routes/health.ts`** — Health clearance management
   - `GET /api/health/test-types` — Fetch test catalog with grading orgs
   - `POST /api/dogs/:id/clearances` — Submit new clearance
   - `GET /api/dogs/:id/clearances` — List clearances for a dog
   - `PATCH /api/dogs/:dog_id/clearances/:id` — Update clearance
   - `POST /api/dogs/:id/conditions` — Report health condition
   - `GET /api/dogs/:id/conditions` — List conditions

2. **`api/src/routes/health-stamp.ts`** — SSR health stamp page
   - `GET /dogs/:id/health` — HTML page with OG meta tags
   - Displays all test types from catalog
   - Shows "Not tested" for missing clearances
   - Includes dog photo, verified status, club branding

3. **`api/src/routes/admin.ts`** (additions) — Admin clearance approval
   - `GET /admin/clearances/pending` — List pending clearances
   - `POST /admin/clearances/:id/approve` — Verify clearance
   - `POST /admin/clearances/:id/reject` — Reject clearance

4. **`api/src/routes/public.ts`** (additions) — Public JSON endpoint
   - `GET /api/public/dogs/:id/health` — JSON version for SPA consumption

### Frontend (App)

#### Pages Created

1. **`app/src/pages/HealthPage.tsx`** — Submit clearances
   - Cascading dropdowns: Test Type → Organization → Result
   - Result options dynamically loaded from test type
   - Organizations filtered by selected test type
   - Optional fields: test date, certificate number, URL, notes
   - Displays existing clearances grouped by category

2. **`app/src/pages/admin/HealthQueuePage.tsx`** — Clearance verification
   - Paginated list of pending clearances
   - Displays dog info, test details, submitter
   - Approve/Reject actions
   - Links to dog profiles

#### Updates

1. **`app/src/pages/DogDetailPage.tsx`**
   - Added health clearances section
   - Link to manage clearances
   - Link to public health stamp
   - Displays verified status

2. **`app/src/pages/admin/AdminDashboard.tsx`**
   - Added "Health Clearances" approval queue card
   - Added "Pending Dogs" approval queue card

3. **`app/src/App.tsx`**
   - Added `/health/:dogId` route
   - Added `/admin/health/pending` route

### Database Relations

Updated `api/src/db/relations.ts` to use `healthTestType` instead of `testType` for consistency in query results.

## Verification Steps

### 1. API Health Check

```bash
cd api
npm run dev
```

Open `http://localhost:8787/health` — should return `{"status":"ok","timestamp":"..."}`

### 2. Test Types Catalog Endpoint

```bash
curl http://localhost:8787/api/health/test-types \
  -H "Authorization: Bearer YOUR_CLERK_JWT"
```

Should return array of test types with linked organizations.

### 3. Submit Clearance

```bash
curl -X POST http://localhost:8787/api/health/dogs/DOG_ID/clearances \
  -H "Authorization: Bearer YOUR_CLERK_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "health_test_type_id": "TEST_TYPE_UUID",
    "organization_id": "ORG_UUID",
    "result": "Excellent",
    "test_date": "2024-01-15",
    "certificate_number": "OFA123456"
  }'
```

Should return `201` with created clearance (status: "pending").

### 4. View Pending Clearances (Admin)

```bash
curl http://localhost:8787/admin/clearances/pending \
  -H "Authorization: Bearer ADMIN_JWT"
```

Should return paginated list of pending clearances.

### 5. Approve Clearance

```bash
curl -X POST http://localhost:8787/admin/clearances/CLEARANCE_ID/approve \
  -H "Authorization: Bearer ADMIN_JWT"
```

Should return `200` with updated clearance (status: "approved").

### 6. Health Stamp SSR Page

Visit: `http://localhost:8787/dogs/DOG_ID/health`

**Expected:**
- HTML page renders with dog name, photo, and clearances
- OG meta tags present in `<head>`:
  - `og:title` — Dog name + "Health Clearances | Club Name"
  - `og:description` — Description text
  - `og:image` — Dog photo URL
  - `twitter:card` — "summary_large_image"
- All test types display (even those "Not tested")
- Verified clearances show green checkmark
- Club branding colors applied

Verify OG tags:

```bash
curl -s http://localhost:8787/dogs/DOG_ID/health | grep "og:title"
curl -s http://localhost:8787/dogs/DOG_ID/health | grep "og:image"
```

### 7. Public JSON Endpoint

```bash
curl http://localhost:8787/api/public/dogs/DOG_ID/health
```

Should return JSON with dog info, clearances array, and summary stats.

### 8. Frontend Testing

```bash
cd app
npm run dev
```

1. **Submit Clearance Flow:**
   - Navigate to dog detail page
   - Click "Manage Clearances"
   - Select test type (e.g., "Hip Dysplasia")
   - Observe organization dropdown filters to only show orgs linked to that test type
   - Select organization (e.g., "OFA")
   - Observe result dropdown populates with test type's result options
   - Select result (e.g., "Excellent")
   - Fill optional fields
   - Submit → should appear in "Pending" status

2. **Admin Approval Flow:**
   - Log in as admin with `can_approve_clearances` flag
   - Navigate to Admin Dashboard
   - Click "Health Clearances" card
   - Verify clearance displays with dog info, test details
   - Click "Approve"
   - Clearance should disappear from queue

3. **View Health Stamp:**
   - From dog detail page, click "View Public Health Stamp"
   - Verify SSR page renders correctly
   - Copy URL and paste into Slack/Discord — verify OG image preview appears

4. **Cascading Dropdowns:**
   - On HealthPage, change test type selection
   - Verify organization dropdown resets and repopulates
   - Verify result dropdown resets and repopulates

## Expected Test Type Coverage

The seed data should include these test types (minimum 12):

1. Hip Dysplasia (OFA, PennHIP, FCI)
2. Elbow Dysplasia (OFA, FCI)
3. Patellar Luxation (OFA)
4. Cardiac (OFA)
5. Eyes (CAER, OFA)
6. Thyroid (OFA)
7. MDR1 (WSU, VetGen)
8. Degenerative Myelopathy (OFA)
9. von Willebrand Disease (OFA, VetGen)
10. Hemophilia A (OFA)
11. Leukocyte Adhesion Deficiency (OFA)
12. Dentition (Vet Scoring)

All test types should display on the health stamp, even if "Not tested".

## Known Issues / TODO

- [ ] Add certificate file upload support (currently URL-only)
- [ ] Email notifications on approval/rejection
- [ ] Expiration date handling for tests that expire
- [ ] Bulk approval for clearances from trusted sources
- [ ] OG image generation for dogs without photos

## Success Criteria

✅ All API endpoints functional
✅ Admin can verify clearances
✅ Cascading dropdowns work correctly
✅ Health stamp SSR renders with OG tags
✅ `curl -s /dogs/{id}/health | grep og:title` returns dog name
✅ All 12+ test types display on health stamp
✅ "Not tested" appears for unanswered tests
✅ Frontend routes integrated into App.tsx
✅ Admin dashboard links to health queue
