/**
 * Health Stamp SSR Routes
 *
 * Server-side rendered HTML pages for dog health stamps with OG meta tags.
 * These pages are shareable links that display a dog's health clearances.
 * Also serves embeddable SVG health badges.
 */

import { Hono } from "hono";
import { html, raw } from "hono/html";
import { eq, and } from "drizzle-orm";
import type { Env, ApiContext } from "../lib/types.js";
import { badRequest, notFound } from "../lib/errors.js";
import { getDb } from "../db/client.js";
import {
  dogs,
  clubs,
  dogHealthClearances,
  healthTestTypes,
  healthCertVersions,
  organizations,
  healthTestTypeOrgs,
} from "../db/schema.js";
import type { HealthRating, HealthRatingColor } from "../db/schema.js";

const healthStampRoutes = new Hono<{ Bindings: Env }>();

// ─── Color helpers ──────────────────────────────────────────────────────────

const RATING_COLORS: Record<HealthRatingColor | "gray", string> = {
  red: "#dc3545",
  orange: "#fd7e14",
  yellow: "#ffc107",
  green: "#28a745",
  blue: "#0d6efd",
  gray: "#6c757d",
};

const RATING_LABELS: Record<HealthRatingColor, string> = {
  red: "Incomplete",
  orange: "Below Standard",
  yellow: "Developing",
  green: "Good",
  blue: "Excellent",
};

function ratingTextColor(color: HealthRatingColor | "gray"): string {
  return color === "yellow" ? "#212529" : "#ffffff";
}

// ─── GET /dogs/:id/health — SSR health stamp page with OG tags ─────────────

healthStampRoutes.get("/dogs/:dog_id/health", async (c: ApiContext) => {
  const club = c.get("club");
  if (!club) throw badRequest("Club context required");

  const dogId = c.req.param("dog_id");
  const db = getDb(c.env);

  // Fetch dog (including health_rating)
  const [dog] = await db
    .select({
      id: dogs.id,
      registered_name: dogs.registered_name,
      call_name: dogs.call_name,
      photo_url: dogs.photo_url,
      sex: dogs.sex,
      date_of_birth: dogs.date_of_birth,
      status: dogs.status,
      health_rating: dogs.health_rating,
    })
    .from(dogs)
    .where(and(eq(dogs.id, dogId), eq(dogs.club_id, club.id)))
    .limit(1);

  if (!dog) {
    throw notFound("Dog");
  }

  // If the dog was evaluated under a cert version, scope displayed tests to that version
  let certVersionTestIds: Set<string> | null = null;
  const certVersionId = (dog.health_rating as { cert_version_id?: string } | null)?.cert_version_id;
  if (certVersionId) {
    const certVersion = await db.query.healthCertVersions.findFirst({
      where: eq(healthCertVersions.id, certVersionId),
      columns: { required_test_type_ids: true },
    });
    if (certVersion) {
      certVersionTestIds = new Set(certVersion.required_test_type_ids);
    }
  }

  // Fetch all active test types for this club, then filter to cert version if applicable
  const allTestTypes = await db
    .select({
      id: healthTestTypes.id,
      name: healthTestTypes.name,
      short_name: healthTestTypes.short_name,
      category: healthTestTypes.category,
      sort_order: healthTestTypes.sort_order,
    })
    .from(healthTestTypes)
    .where(and(eq(healthTestTypes.club_id, club.id), eq(healthTestTypes.is_active, true)))
    .orderBy(healthTestTypes.sort_order, healthTestTypes.name);

  const displayTestTypes = certVersionTestIds
    ? allTestTypes.filter((tt) => certVersionTestIds!.has(tt.id))
    : allTestTypes;

  // Fetch approved clearances for this dog
  const clearances = await db
    .select({
      id: dogHealthClearances.id,
      health_test_type_id: dogHealthClearances.health_test_type_id,
      result: dogHealthClearances.result,
      test_date: dogHealthClearances.test_date,
      certificate_number: dogHealthClearances.certificate_number,
      certificate_url: dogHealthClearances.certificate_url,
      verified_at: dogHealthClearances.verified_at,
      organization_name: organizations.name,
      organization_type: organizations.type,
    })
    .from(dogHealthClearances)
    .innerJoin(organizations, eq(dogHealthClearances.organization_id, organizations.id))
    .where(and(eq(dogHealthClearances.dog_id, dogId), eq(dogHealthClearances.status, "approved")));

  // Build clearance map by test type (grouping multiple clearances per type)
  const clearanceMap = new Map<string, typeof clearances>();
  for (const c of clearances) {
    const arr = clearanceMap.get(c.health_test_type_id) || [];
    arr.push(c);
    clearanceMap.set(c.health_test_type_id, arr);
  }

  // Build test results array scoped to the cert version (or all tests if no cert version)
  // A test type with multiple clearances (e.g., Hips via PennHIP and OFA) produces multiple rows
  const testResults = displayTestTypes.flatMap((testType) => {
    const typeClearances = clearanceMap.get(testType.id);
    if (!typeClearances || typeClearances.length === 0) {
      return [{
        test_type: testType.name,
        short_name: testType.short_name,
        category: testType.category,
        result: "Not tested",
        test_date: null,
        organization: null,
        verified: false,
        certificate_url: null,
      }];
    }
    return typeClearances.map((c) => ({
      test_type: testType.name,
      short_name: testType.short_name,
      category: testType.category,
      result: c.result || "Not tested",
      test_date: c.test_date || null,
      organization: c.organization_name || null,
      verified: !!c.verified_at,
      certificate_url: c.certificate_url || null,
    }));
  });

  // Generate OG image URL (if dog has photo)
  const ogImageUrl = dog.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(dog.registered_name)}&size=1200&background=655e7a&color=fff`;

  // Build page metadata
  const pageTitle = `${dog.registered_name} - Health Clearances | ${club.name}`;
  const pageDescription = `View verified health clearances for ${dog.registered_name}, a ${club.breed_name} registered with ${club.name}.`;
  const pageUrl = `${c.env.APP_URL}/dogs/${dogId}/health`;

  // Count verified test types (a test type is verified if ANY clearance for it has verified_at)
  const verifiedTestTypes = new Set(
    clearances
      .filter((c) => c.verified_at && (!certVersionTestIds || certVersionTestIds.has(c.health_test_type_id)))
      .map((c) => c.health_test_type_id)
  );
  const verifiedCount = verifiedTestTypes.size;
  const totalTests = displayTestTypes.length;

  // Health rating data
  const rating = dog.health_rating as HealthRating | null;
  const ratingColor = rating?.color ?? "gray";
  const ratingHex = RATING_COLORS[ratingColor as keyof typeof RATING_COLORS] ?? RATING_COLORS.gray;
  const ratingLabel = rating ? RATING_LABELS[rating.color] : "Not Rated";
  const ratingScore = rating?.score ?? 0;
  const ratingSaturation = rating?.saturation ?? 0;

  // Render HTML page
  const pageHtml = html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <meta name="description" content="${pageDescription}">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${pageDescription}">
  <meta property="og:image" content="${ogImageUrl}">

  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:url" content="${pageUrl}">
  <meta property="twitter:title" content="${pageTitle}">
  <meta property="twitter:description" content="${pageDescription}">
  <meta property="twitter:image" content="${ogImageUrl}">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8f9fa;
      color: #212529;
      line-height: 1.4;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
      padding: 0.75rem 1rem;
    }
    .header {
      background: ${club.primary_color || "#655e7a"};
      color: white;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .dog-photo {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid rgba(255,255,255,0.3);
      flex-shrink: 0;
    }
    .dog-info h1 {
      font-size: 1.25rem;
      font-weight: 700;
      line-height: 1.2;
    }
    .dog-info p {
      opacity: 0.85;
      font-size: 0.85rem;
      margin-top: 0.1rem;
    }
    .breed-badge {
      display: inline-block;
      background: rgba(255,255,255,0.2);
      padding: 0.1rem 0.5rem;
      border-radius: 999px;
      font-size: 0.75rem;
      margin-top: 0.25rem;
    }

    /* ── Composite Score Row ── */
    .rating-section {
      background: white;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-bottom: 0.75rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .rating-circle {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .rating-score {
      font-size: 1.5rem;
      font-weight: 800;
      line-height: 1;
    }
    .rating-label {
      font-size: 0.6rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 1px;
    }
    .rating-details { flex: 1; }
    .rating-details h2 {
      font-size: 0.95rem;
      font-weight: 600;
      color: ${club.primary_color || "#655e7a"};
    }
    .rating-meta {
      font-size: 0.8rem;
      color: #6c757d;
    }
    .progress {
      background: #e9ecef;
      height: 5px;
      border-radius: 3px;
      overflow: hidden;
      margin: 0.25rem 0;
    }
    .progress-bar { height: 100%; }
    .rating-warning {
      display: inline-block;
      background: #fff3cd;
      color: #856404;
      padding: 0.1rem 0.5rem;
      border-radius: 3px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-top: 0.25rem;
    }
    .rating-warning.error { background: #f8d7da; color: #721c24; }
    .cert-version-badge {
      display: inline-block;
      background: #e9ecef;
      color: #495057;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      font-size: 0.7rem;
      font-weight: 500;
      margin-top: 0.2rem;
    }

    /* ── Compact Test Table ── */
    .test-table-wrap {
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .test-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    .test-table thead th {
      padding: 0.4rem 0.75rem;
      text-align: left;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #6c757d;
      border-bottom: 1px solid #dee2e6;
      background: #f8f9fa;
    }
    .test-table .cat-row td {
      padding: 0.3rem 0.75rem 0.1rem;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #6c757d;
      background: #f8f9fa;
      border-top: 1px solid #e9ecef;
    }
    .test-table .test-row td {
      padding: 0.35rem 0.75rem;
      border-top: 1px solid #f0f0f0;
      vertical-align: middle;
    }
    .test-row.not-tested { opacity: 0.55; }
    .test-name { font-weight: 500; color: #212529; }
    .result-badge {
      display: inline-block;
      padding: 0.1rem 0.5rem;
      border-radius: 3px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .result-badge.verified { background: #d4edda; color: #155724; }
    .result-badge.not-tested { background: #e2e3e5; color: #6c757d; }
    .meta { font-size: 0.8rem; color: #6c757d; }
    .cert-link { font-size: 0.8rem; color: ${club.primary_color || "#655e7a"}; text-decoration: none; }
    .cert-link:hover { text-decoration: underline; }
    .verified-check { color: #28a745; font-size: 0.75rem; }

    .footer {
      text-align: center;
      margin-top: 0.75rem;
      padding-top: 0.5rem;
      border-top: 1px solid #dee2e6;
      color: #6c757d;
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${dog.photo_url || ogImageUrl}" alt="${dog.registered_name}" class="dog-photo">
      <div class="dog-info">
        <h1>${dog.registered_name}</h1>
        <p>${dog.call_name ? `"${dog.call_name}" · ` : ""}${dog.sex || ""}${dog.date_of_birth ? ` · Born ${new Date(dog.date_of_birth).toLocaleDateString()}` : ""}</p>
        <span class="breed-badge">${club.breed_name}</span>
      </div>
    </div>

    <div class="rating-section">
      <div class="rating-circle" style="background: ${ratingHex}; color: ${ratingTextColor(ratingColor as HealthRatingColor)}">
        <span class="rating-score">${rating ? ratingScore : "—"}</span>
        <span class="rating-label">${ratingLabel}</span>
      </div>
      <div class="rating-details">
        <h2>Health Rating</h2>
        <p class="rating-meta">${verifiedCount} of ${totalTests} tests verified</p>
        <div class="progress">
          <div class="progress-bar" style="width: ${ratingSaturation}%; background: ${ratingHex};"></div>
        </div>
        <p class="rating-meta">${ratingSaturation}% of categories tested</p>
        ${raw(rating?.auto_dq ? '<span class="rating-warning error">Disqualifying result</span>' : "")}
        ${raw(rating && !rating.required_complete && !rating.auto_dq ? '<span class="rating-warning">Missing required tests</span>' : "")}
        ${raw(rating?.cert_version_name ? `<span class="cert-version-badge">Cert: ${rating.cert_version_name}</span>` : "")}
      </div>
    </div>

    <div class="test-table-wrap">
      <table class="test-table">
        <thead>
          <tr>
            <th>Test</th>
            <th>Result</th>
            <th>Org</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${raw(testResults
            .reduce((acc, test, idx, arr) => {
              const prevTest = idx > 0 ? arr[idx - 1] : null;
              if (!prevTest || prevTest.category !== test.category) {
                acc.push(`<tr class="cat-row"><td colspan="5">${test.category || "Other"}</td></tr>`);
              }
              const isVerified = test.verified;
              const isNotTested = test.result === "Not tested";
              const certHref = test.certificate_url
                ? test.certificate_url.startsWith("http")
                  ? test.certificate_url
                  : `/api/uploads/certificate/${test.certificate_url}`
                : null;
              const certLink = certHref
                ? `<a href="${certHref}" target="_blank" class="cert-link">View</a>`
                : isVerified ? '<span class="verified-check">✓</span>' : "";
              acc.push(
                `<tr class="test-row${isNotTested ? " not-tested" : ""}">` +
                `<td class="test-name">${test.short_name}</td>` +
                `<td><span class="result-badge ${isVerified ? "verified" : "not-tested"}">${test.result}</span></td>` +
                `<td class="meta">${test.organization || ""}</td>` +
                `<td class="meta">${test.test_date ? new Date(test.test_date).toLocaleDateString() : ""}</td>` +
                `<td>${certLink}</td>` +
                `</tr>`
              );
              return acc;
            }, [] as string[])
            .join(""))}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <p>Verified by ${club.name} · <a href="${c.env.APP_URL}" style="color: ${club.primary_color || "#655e7a"};">View registry</a></p>
    </div>
  </div>
</body>
</html>`;

  return c.html(pageHtml);
});

// ─── GET /dogs/:id/badge.svg — Embeddable SVG health badge ─────────────────

healthStampRoutes.get("/dogs/:dog_id/badge.svg", async (c: ApiContext) => {
  const club = c.get("club");
  if (!club) throw badRequest("Club context required");

  const dogId = c.req.param("dog_id");
  const db = getDb(c.env);

  // Fetch dog with health rating
  const [dog] = await db
    .select({
      id: dogs.id,
      registered_name: dogs.registered_name,
      health_rating: dogs.health_rating,
    })
    .from(dogs)
    .where(and(eq(dogs.id, dogId), eq(dogs.club_id, club.id)))
    .limit(1);

  if (!dog) {
    throw notFound("Dog");
  }

  const rating = dog.health_rating as HealthRating | null;
  const color = rating?.color ?? "gray";
  const fillColor = RATING_COLORS[color as keyof typeof RATING_COLORS] ?? RATING_COLORS.gray;
  const textColor = ratingTextColor(color as HealthRatingColor);
  const score = rating ? String(rating.score) : "N/A";
  const label = rating ? RATING_LABELS[rating.color] : "Not Rated";

  // Truncate dog name for badge display
  const maxNameLen = 28;
  const displayName = dog.registered_name.length > maxNameLen
    ? dog.registered_name.slice(0, maxNameLen - 1) + "…"
    : dog.registered_name;

  const clubName = club.name.length > 32
    ? club.name.slice(0, 31) + "…"
    : club.name;

  // Shield-shaped SVG badge
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240" viewBox="0 0 200 240">
  <defs>
    <clipPath id="shield">
      <path d="M100,8 L185,40 C185,40 188,140 100,228 C12,140 15,40 15,40 Z"/>
    </clipPath>
  </defs>

  <!-- Shield background -->
  <path d="M100,8 L185,40 C185,40 188,140 100,228 C12,140 15,40 15,40 Z"
        fill="${fillColor}" stroke="${fillColor}" stroke-width="2"/>

  <!-- Inner shield highlight -->
  <path d="M100,18 L175,46 C175,46 178,135 100,216 C22,135 25,46 25,46 Z"
        fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>

  <!-- Score number -->
  <text x="100" y="${rating ? '105' : '110'}" text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="${rating ? '52' : '32'}" font-weight="800"
        fill="${textColor}">${score}</text>

  <!-- Rating label -->
  <text x="100" y="135" text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="13" font-weight="600"
        fill="${textColor}" opacity="0.9">${label}</text>

  <!-- Club name at top -->
  <text x="100" y="65" text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="9" font-weight="600" letter-spacing="0.5"
        fill="${textColor}" opacity="0.7"
        text-transform="uppercase">${clubName}</text>

  <!-- Dog name at bottom -->
  <text x="100" y="175" text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="10" font-weight="500"
        fill="${textColor}" opacity="0.8">${displayName}</text>

  <!-- Version badge (if applicable) -->
  ${rating?.cert_version_name ? `
  <text x="100" y="195" text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="8" font-weight="400"
        fill="${textColor}" opacity="0.6">${rating.cert_version_name}</text>
  ` : ""}
</svg>`;

  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(svg);
});

export { healthStampRoutes };
