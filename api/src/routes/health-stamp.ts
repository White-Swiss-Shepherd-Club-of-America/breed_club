/**
 * Health Stamp SSR Routes
 *
 * Server-side rendered HTML pages for dog health stamps with OG meta tags.
 * These pages are shareable links that display a dog's health clearances.
 */

import { Hono } from "hono";
import { html } from "hono/html";
import { eq, and } from "drizzle-orm";
import type { Env, ApiContext } from "../lib/types.js";
import { badRequest, notFound } from "../lib/errors.js";
import { getDb } from "../db/client.js";
import {
  dogs,
  clubs,
  dogHealthClearances,
  healthTestTypes,
  organizations,
  healthTestTypeOrgs,
} from "../db/schema.js";

const healthStampRoutes = new Hono<{ Bindings: Env }>();

// ─── GET /dogs/:id/health — SSR health stamp page with OG tags ─────────────

healthStampRoutes.get("/dogs/:dog_id/health", async (c: ApiContext) => {
  const club = c.get("club");
  if (!club) throw badRequest("Club context required");

  const dogId = c.req.param("dog_id");
  const db = getDb(c.env);

  // Fetch dog
  const [dog] = await db
    .select({
      id: dogs.id,
      registered_name: dogs.registered_name,
      call_name: dogs.call_name,
      photo_url: dogs.photo_url,
      sex: dogs.sex,
      date_of_birth: dogs.date_of_birth,
      status: dogs.status,
    })
    .from(dogs)
    .where(and(eq(dogs.id, dogId), eq(dogs.club_id, club.id)))
    .limit(1);

  if (!dog) {
    throw notFound("Dog");
  }

  // Fetch all test types for this club
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

  // Build clearance map by test type
  const clearanceMap = new Map(
    clearances.map((c) => [c.health_test_type_id, c])
  );

  // Build test results array (all test types, with results or "Not tested")
  const testResults = allTestTypes.map((testType) => {
    const clearance = clearanceMap.get(testType.id);
    return {
      test_type: testType.name,
      short_name: testType.short_name,
      category: testType.category,
      result: clearance?.result || "Not tested",
      test_date: clearance?.test_date || null,
      organization: clearance?.organization_name || null,
      verified: !!clearance?.verified_at,
      certificate_url: clearance?.certificate_url || null,
    };
  });

  // Generate OG image URL (if dog has photo)
  const ogImageUrl = dog.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(dog.registered_name)}&size=1200&background=655e7a&color=fff`;

  // Build page metadata
  const pageTitle = `${dog.registered_name} - Health Clearances | ${club.name}`;
  const pageDescription = `View verified health clearances for ${dog.registered_name}, a ${club.breed_name} registered with ${club.name}.`;
  const pageUrl = `${c.env.APP_URL}/dogs/${dogId}/health`;

  // Count verified clearances
  const verifiedCount = testResults.filter((t) => t.verified).length;
  const totalTests = allTestTypes.length;

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
      line-height: 1.6;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    .header {
      background: ${club.primary_color || "#655e7a"};
      color: white;
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      display: flex;
      align-items: center;
      gap: 2rem;
    }
    .dog-photo {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      object-fit: cover;
      border: 4px solid rgba(255,255,255,0.3);
    }
    .dog-info h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }
    .dog-info p {
      opacity: 0.9;
      font-size: 1.1rem;
    }
    .badge {
      display: inline-block;
      background: rgba(255,255,255,0.2);
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }
    .summary {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      margin-bottom: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .summary h2 {
      font-size: 1.25rem;
      margin-bottom: 1rem;
      color: ${club.primary_color || "#655e7a"};
    }
    .progress {
      background: #e9ecef;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 0.5rem;
    }
    .progress-bar {
      background: ${club.primary_color || "#655e7a"};
      height: 100%;
      transition: width 0.3s ease;
    }
    .test-grid {
      display: grid;
      gap: 1rem;
    }
    .test-item {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      border-left: 4px solid #dee2e6;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .test-item.verified {
      border-left-color: #28a745;
    }
    .test-item.not-tested {
      border-left-color: #6c757d;
      opacity: 0.7;
    }
    .test-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
    }
    .test-name {
      font-weight: 600;
      font-size: 1.1rem;
      color: #212529;
    }
    .test-result {
      font-weight: 700;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.875rem;
    }
    .test-result.verified {
      background: #d4edda;
      color: #155724;
    }
    .test-result.not-tested {
      background: #e2e3e5;
      color: #6c757d;
    }
    .test-meta {
      font-size: 0.875rem;
      color: #6c757d;
      margin-top: 0.5rem;
    }
    .footer {
      text-align: center;
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid #dee2e6;
      color: #6c757d;
      font-size: 0.875rem;
    }
    .category-header {
      font-size: 1rem;
      font-weight: 600;
      color: #495057;
      margin: 2rem 0 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #dee2e6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${dog.photo_url || ogImageUrl}" alt="${dog.registered_name}" class="dog-photo">
      <div class="dog-info">
        <h1>${dog.registered_name}</h1>
        <p>${dog.call_name ? `"${dog.call_name}" • ` : ""}${dog.sex || "Unknown sex"}${dog.date_of_birth ? ` • Born ${new Date(dog.date_of_birth).toLocaleDateString()}` : ""}</p>
        <span class="badge">${club.breed_name}</span>
      </div>
    </div>

    <div class="summary">
      <h2>Health Clearances Summary</h2>
      <p>${verifiedCount} of ${totalTests} tests completed and verified</p>
      <div class="progress">
        <div class="progress-bar" style="width: ${(verifiedCount / totalTests) * 100}%"></div>
      </div>
    </div>

    <div class="test-grid">
      ${testResults
        .reduce((acc, test, idx, arr) => {
          // Group by category
          const prevTest = idx > 0 ? arr[idx - 1] : null;
          if (!prevTest || prevTest.category !== test.category) {
            acc.push(html`<div class="category-header">${test.category || "Other Tests"}</div>`);
          }

          const isVerified = test.verified;
          const isNotTested = test.result === "Not tested";

          acc.push(html`
            <div class="test-item ${isVerified ? "verified" : ""} ${isNotTested ? "not-tested" : ""}">
              <div class="test-header">
                <span class="test-name">${test.test_type}</span>
                <span class="test-result ${isVerified ? "verified" : "not-tested"}">
                  ${test.result}
                </span>
              </div>
              ${
                !isNotTested
                  ? html`
                      <div class="test-meta">
                        ${test.organization ? `Graded by ${test.organization}` : ""}
                        ${test.test_date ? ` • ${new Date(test.test_date).toLocaleDateString()}` : ""}
                        ${
                          test.certificate_url
                            ? html` • <a href="${test.certificate_url}" target="_blank">View Certificate</a>`
                            : ""
                        }
                        ${isVerified ? " • ✓ Verified" : ""}
                      </div>
                    `
                  : ""
              }
            </div>
          `);
          return acc;
        }, [] as any[])
        .join("")}
    </div>

    <div class="footer">
      <p>Health clearances verified by ${club.name}</p>
      <p style="margin-top: 0.5rem;">
        <a href="${c.env.APP_URL}" style="color: ${club.primary_color || "#655e7a"};">View full registry</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  return c.html(pageHtml);
});

export { healthStampRoutes };
