import type { SocialPlatformAdapter, SocialPostResult } from "./types.js";
import type { PublicLitterAd } from "@breed-club/shared";

function buildMessage(ad: PublicLitterAd): string {
  const lines: string[] = [ad.title];
  if (ad.description) lines.push(ad.description);
  lines.push(`\nContact: ${ad.contact_url}`);
  return lines.join("\n");
}

export const facebookAdapter: SocialPlatformAdapter = {
  name: "facebook",

  isConfigured(env) {
    return !!(env.FACEBOOK_PAGE_TOKEN && env.FACEBOOK_PAGE_ID);
  },

  async post(ad: PublicLitterAd, env): Promise<SocialPostResult> {
    const token = env.FACEBOOK_PAGE_TOKEN!;
    const pageId = env.FACEBOOK_PAGE_ID!;
    const now = new Date().toISOString();

    try {
      const body: Record<string, string> = {
        message: buildMessage(ad),
        access_token: token,
      };
      if (ad.image_url) body.link = ad.image_url;

      const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json() as { id?: string; error?: { message: string } };

      if (!res.ok || data.error) {
        return {
          platform: "facebook",
          external_post_id: null,
          status: "failed",
          error_message: data.error?.message ?? `HTTP ${res.status}`,
          posted_at: null,
        };
      }

      return {
        platform: "facebook",
        external_post_id: data.id ?? null,
        status: "posted",
        error_message: null,
        posted_at: now,
      };
    } catch (err) {
      return {
        platform: "facebook",
        external_post_id: null,
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
        posted_at: null,
      };
    }
  },
};
