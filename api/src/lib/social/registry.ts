/**
 * Social platform registry.
 *
 * To add a new platform:
 *   1. Create api/src/lib/social/your-platform.ts implementing SocialPlatformAdapter
 *   2. Import and add it to ALL_PLATFORMS below
 *   3. Add its credentials to Env (lib/types.ts) as wrangler secrets
 *   4. Add its enable/config to clubs.settings.social_integrations
 */

import type { SocialPlatformAdapter, SocialPostResult } from "./types.js";
import type { PublicLitterAd } from "@breed-club/shared";
import { facebookAdapter } from "./facebook.js";
import { instagramAdapter } from "./instagram.js";
import { twitterAdapter } from "./twitter.js";

const ALL_PLATFORMS: SocialPlatformAdapter[] = [
  facebookAdapter,
  instagramAdapter,
  twitterAdapter,
];

type SocialSettings = {
  facebook?: { enabled: boolean };
  instagram?: { enabled: boolean };
  twitter?: { enabled: boolean };
  [key: string]: { enabled: boolean } | undefined;
};

/**
 * Return adapters that are both enabled in club settings AND have credentials.
 */
export function getAvailablePlatforms(
  socialSettings: SocialSettings,
  env: Record<string, string | undefined>
): SocialPlatformAdapter[] {
  return ALL_PLATFORMS.filter((adapter) => {
    const cfg = socialSettings[adapter.name];
    return cfg?.enabled === true && adapter.isConfigured(env);
  });
}

/**
 * Post an ad to all configured and enabled platforms.
 * Never throws — failures are captured per-platform.
 */
export async function postToAllPlatforms(
  ad: PublicLitterAd,
  socialSettings: SocialSettings,
  env: Record<string, string | undefined>
): Promise<SocialPostResult[]> {
  const platforms = getAvailablePlatforms(socialSettings, env);
  return Promise.all(platforms.map((p) => p.post(ad, env)));
}
