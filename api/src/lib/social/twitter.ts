import type { SocialPlatformAdapter, SocialPostResult } from "./types.js";
import type { PublicLitterAd } from "@breed-club/shared";

function buildTweet(ad: PublicLitterAd): string {
  // Twitter/X limit: 280 characters
  const full = `${ad.title}\n${ad.contact_url}`;
  return full.length <= 280 ? full : full.slice(0, 277) + "...";
}

/** Minimal OAuth 1.0a signature for X API v2 */
async function buildOauthHeader(
  method: string,
  url: string,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessSecret: string
): Promise<string> {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  const paramString = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(paramString),
  ].join("&");

  const signingKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(baseString));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

  const headerParams = { ...oauthParams, oauth_signature: signature };
  const header = Object.entries(headerParams)
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(", ");

  return `OAuth ${header}`;
}

export const twitterAdapter: SocialPlatformAdapter = {
  name: "twitter",

  isConfigured(env) {
    return !!(
      env.TWITTER_API_KEY &&
      env.TWITTER_API_SECRET &&
      env.TWITTER_ACCESS_TOKEN &&
      env.TWITTER_ACCESS_SECRET
    );
  },

  async post(ad: PublicLitterAd, env): Promise<SocialPostResult> {
    const url = "https://api.twitter.com/2/tweets";
    const now = new Date().toISOString();

    try {
      const authHeader = await buildOauthHeader(
        "POST",
        url,
        env.TWITTER_API_KEY!,
        env.TWITTER_API_SECRET!,
        env.TWITTER_ACCESS_TOKEN!,
        env.TWITTER_ACCESS_SECRET!
      );

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ text: buildTweet(ad) }),
      });

      const data = await res.json() as { data?: { id: string }; errors?: { message: string }[] };

      if (!res.ok || data.errors?.length) {
        return {
          platform: "twitter",
          external_post_id: null,
          status: "failed",
          error_message: data.errors?.[0]?.message ?? `HTTP ${res.status}`,
          posted_at: null,
        };
      }

      return {
        platform: "twitter",
        external_post_id: data.data?.id ?? null,
        status: "posted",
        error_message: null,
        posted_at: now,
      };
    } catch (err) {
      return {
        platform: "twitter",
        external_post_id: null,
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
        posted_at: null,
      };
    }
  },
};
