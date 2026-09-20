import { describe, it, expect } from "vitest";
import {
  renderHealthStampPage,
  renderHealthBadgeSvg,
  type HealthStampPageInput,
  type HealthStampTestRow,
} from "./health-stamp.js";
import type { HealthRating } from "../db/schema.js";

const rating: HealthRating = {
  color: "green",
  score: 82,
  saturation: 75,
  computed_at: "2026-01-01T00:00:00.000Z",
  required_complete: true,
  auto_dq: false,
  category_scores: {},
  cert_version_id: null,
  cert_version_name: null,
};

function testRow(overrides: Partial<HealthStampTestRow> = {}): HealthStampTestRow {
  return {
    test_type: "Hips",
    short_name: "Hips",
    category: "Orthopedic",
    result: "Good",
    test_date: "2025-06-01",
    organization: "OFA",
    verified: true,
    is_preliminary: false,
    ...overrides,
  };
}

function pageInput(overrides: Partial<HealthStampPageInput> = {}): HealthStampPageInput {
  return {
    club: { name: "Example Breed Club", breed_name: "Example Breed", primary_color: "#655e7a" },
    dog: {
      id: "11111111-1111-1111-1111-111111111111",
      registered_name: "Example Dog",
      call_name: "Rex",
      photo_url: null,
      sex: "male",
      date_of_birth: "2020-01-01",
    },
    rating,
    testResults: [testRow()],
    verifiedCount: 1,
    totalTests: 1,
    appUrl: "https://example.test",
    ...overrides,
  };
}

async function renderPage(overrides: Partial<HealthStampPageInput> = {}): Promise<string> {
  return String(await renderHealthStampPage(pageInput(overrides)));
}

describe("renderHealthStampPage", () => {
  it("escapes a clearance result that tries to break out of its table cell", async () => {
    const body = await renderPage({
      testResults: [testRow({ result: "</td><script>alert(1)</script>" })],
    });

    expect(body).not.toContain("<script");
    expect(body).not.toContain("</td><script>");
    expect(body).toContain("&lt;/td&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes attacker-controlled test names and categories", async () => {
    const body = await renderPage({
      testResults: [
        testRow({ short_name: "<img src=x onerror=alert(1)>", category: "<b>Ortho</b>" }),
      ],
    });

    expect(body).not.toContain("<img src=x");
    expect(body).not.toContain("<b>Ortho</b>");
    expect(body).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(body).toContain("&lt;b&gt;Ortho&lt;/b&gt;");
  });

  it("escapes the cert version name in the rating badge", async () => {
    const body = await renderPage({
      rating: { ...rating, cert_version_name: '"><script>alert(1)</script>' },
    });

    expect(body).not.toContain("<script");
    expect(body).toContain("Cert: &quot;&gt;&lt;script&gt;");
  });

  it("escapes the dog name in both the page body and the OG meta tags", async () => {
    const body = await renderPage({
      dog: { ...pageInput().dog, registered_name: '"><script>x</script>' },
    });

    expect(body).not.toContain("<script");
    expect(body).toContain("&quot;&gt;&lt;script&gt;x&lt;/script&gt;");
  });

  it("still renders the real content it is supposed to show", async () => {
    const body = await renderPage({ testResults: [testRow({ result: "Good", short_name: "Hips" })] });

    expect(body).toContain("<title>Example Dog - Health Clearances | Example Breed Club</title>");
    expect(body).toContain('<td class="test-name">Hips</td>');
    expect(body).toContain(">Good</span>");
    expect(body).toContain("Orthopedic");
  });
});

describe("renderHealthBadgeSvg", () => {
  const badgeInput = { registeredName: "Example Dog", clubName: "Example Breed Club", rating };

  it("escapes a registered name that tries to close an attribute and inject script", () => {
    const svg = renderHealthBadgeSvg({ ...badgeInput, registeredName: '"><script>x</script>' });
    const benign = renderHealthBadgeSvg({ ...badgeInput, registeredName: "Benign Dog" });

    expect(svg).not.toContain("<script");
    expect(svg).toContain("&quot;&gt;&lt;script&gt;x&lt;/script&gt;");
    // A surviving `"` would open or close an attribute: the quote count must be
    // identical to the benign render.
    expect((svg.match(/"/g) ?? []).length).toBe((benign.match(/"/g) ?? []).length);
    expect((svg.match(/</g) ?? []).length).toBe((benign.match(/</g) ?? []).length);
  });

  it("escapes the club name and the cert version name", () => {
    const svg = renderHealthBadgeSvg({
      ...badgeInput,
      clubName: "<club & co>",
      rating: { ...rating, cert_version_name: "<v2 & 'final'>" },
    });

    expect(svg).toContain("&lt;club &amp; co&gt;");
    expect(svg).toContain("&lt;v2 &amp; &#39;final&#39;&gt;");
    expect(svg).not.toContain("<club");
  });

  it("truncates before escaping so no entity is severed", () => {
    // 30 chars: truncation lands inside the run of ampersands, which must still
    // come out as whole `&amp;` entities.
    const svg = renderHealthBadgeSvg({ ...badgeInput, registeredName: `${"A".repeat(26)}&&&&` });

    expect(svg).toContain(`${"A".repeat(26)}&amp;\u2026`);
    // Every `&` in the document opens a complete entity.
    expect(svg).not.toMatch(/&(?!(amp|lt|gt|quot|#39);)/);
  });

  it("renders the score and label for a rated dog", () => {
    const svg = renderHealthBadgeSvg(badgeInput);

    expect(svg).toContain(">82</text>");
    expect(svg).toContain(">Good</text>");
    expect(svg).toContain(">Example Dog</text>");
  });
});
