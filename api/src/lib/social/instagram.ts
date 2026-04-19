import type { SocialPlatformAdapter, SocialPostResult } from "./types.js";
import type { PublicLitterAd } from "@breed-club/shared";

function buildCaption(ad: PublicLitterAd): string {
  const lines: string[] = [ad.title];
  if (ad.description) lines.push(ad.description);
  lines.push(`\nContact: ${ad.contact_url}`);
  return lines.join("\n");
}

export const instagramAdapter: SocialPlatformAdapter = {
  name: "instagram",

  isConfigured(env) {
    // Instagram Graph API requires a media URL to create a container post
    return !!(env.INSTAGRAM_ACCESS_TOKEN && env.INSTAGRAM_USER_ID);
  },

  async post(ad: PublicLitterAd, env): Promise<SocialPostResult> {
    const token = env.INSTAGRAM_ACCESS_TOKEN!;
    const userId = env.INSTAGRAM_USER_ID!;
    const now = new Date().toISOString();
    const base = `https://graph.facebook.com/v19.0/${userId}`;

    try {
      // Step 1: create media container (image_url is required for Instagram)
      if (!ad.image_url) {
        return {
          platform: "instagram",
          external_post_id: null,
          status: "failed",
          error_message: "Instagram posts require an image",
          posted_at: null,
        };
      }

      const containerRes = await fetch(`${base}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: ad.image_url,
          caption: buildCaption(ad),
          access_token: token,
        }),
      });

      const container = await containerRes.json() as { id?: string; error?: { message: string } };
      if (!containerRes.ok || container.error) {
        return {
          platform: "instagram",
          external_post_id: null,
          status: "failed",
          error_message: container.error?.message ?? `HTTP ${containerRes.status}`,
          posted_at: null,
        };
      }

      // Step 2: publish the container
      const publishRes = await fetch(`${base}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: container.id, access_token: token }),
      });

      const published = await publishRes.json() as { id?: string; error?: { message: string } };
      if (!publishRes.ok || published.error) {
        return {
          platform: "instagram",
          external_post_id: null,
          status: "failed",
          error_message: published.error?.message ?? `HTTP ${publishRes.status}`,
          posted_at: null,
        };
      }

      return {
        platform: "instagram",
        external_post_id: published.id ?? null,
        status: "posted",
        error_message: null,
        posted_at: now,
      };
    } catch (err) {
      return {
        platform: "instagram",
        external_post_id: null,
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
        posted_at: null,
      };
    }
  },
};
